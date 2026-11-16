/*
 * Canonical narration data for every screen.
 *
 * The planning owner emits `planning/narration-review.json`; the parent then
 * compiles `shared/voice/scenario.json` and `shared/voice/audio-manifest.json`.
 * Until those exist this module adapts the existing draft schema. It never
 * invents audio: an absent manifest row is an explicit `missing` asset.
 *
 * Fixed trigger contract:
 *   trigger: { type: 'step' | 'action' | 'container', actionId?: string }
 * A source `actionId` is metadata. It does NOT mean action-only; only
 * trigger.type === 'action' does.
 */
(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.VoiceScenario = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const CANONICAL_SCHEMA_VERSION = 1;
  const LANGS = ['ru', 'en'];
  const TRIGGER_TYPES = Object.freeze(['step', 'action', 'container']);
  const ID_RE = /^[a-z0-9][a-z0-9-]*(?:\.[a-z0-9][a-z0-9-]*)*$/;
  const SLIDE_RE = /^[a-z0-9][a-z0-9.-]*$/;

  function isObject(value) {
    return !!value && typeof value === 'object' && !Array.isArray(value);
  }

  function requireText(value, label) {
    if (typeof value !== 'string' || !value.trim()) throw new Error(label + ' must be a non-empty string');
    return value;
  }

  function requireId(value, label) {
    if (typeof value !== 'string' || !ID_RE.test(value)) throw new Error(label + ' is not a valid stable ID');
    return value;
  }

  /* Normalize and validate the fixed trigger contract. */
  function normalizeTrigger(segment) {
    const row = segment || {};
    const raw = row.trigger;
    if (raw === undefined || raw === null) {
      return row.actionId ? { type: 'step', actionId: requireId(row.actionId, 'actionId') } : { type: 'step' };
    }
    if (!isObject(raw)) throw new Error('trigger must be an object');
    if (!TRIGGER_TYPES.includes(raw.type)) throw new Error('unsupported trigger type: ' + raw.type);
    if (raw.type === 'action') {
      if (typeof raw.actionId !== 'string') throw new Error('an action trigger requires actionId');
      if (row.actionId && row.actionId !== raw.actionId) throw new Error('trigger actionId mismatch with segment actionId');
      return { type: 'action', actionId: requireId(raw.actionId, 'trigger.actionId') };
    }
    const out = { type: raw.type };
    if (raw.actionId !== undefined) out.actionId = requireId(raw.actionId, 'trigger.actionId');
    else if (row.actionId) out.actionId = requireId(row.actionId, 'actionId');
    return out;
  }

  function normalizeSegment(segment) {
    if (!isObject(segment)) throw new Error('segment must be an object');
    const segmentId = requireId(segment.segmentId, 'segmentId');
    const slideId = segment.slideId;
    if (typeof slideId !== 'string' || !SLIDE_RE.test(slideId)) throw new Error('segment ' + segmentId + ' has an invalid slideId');
    if (!Array.isArray(segment.stepIds) || segment.stepIds.length === 0) {
      throw new Error('segment ' + segmentId + ' must declare stepIds');
    }
    const stepIds = segment.stepIds.map(id => requireId(id, 'stepIds[]'));
    if (!isObject(segment.display) || !isObject(segment.tts)) throw new Error('segment ' + segmentId + ' has no display/tts');
    const display = {};
    const tts = {};
    for (const lang of LANGS) {
      display[lang] = requireText(segment.display[lang], 'display.' + lang + ' of ' + segmentId);
      tts[lang] = requireText(segment.tts[lang], 'tts.' + lang + ' of ' + segmentId);
    }
    const trigger = normalizeTrigger(segment);
    if (trigger.type === 'action' && !trigger.actionId) throw new Error('action trigger without actionId');
    return {
      segmentId,
      slideId,
      stepIds,
      actionId: segment.actionId ? requireId(segment.actionId, 'actionId') : null,
      display,
      tts,
      grounding: typeof segment.grounding === 'string' ? segment.grounding : '',
      flags: Array.isArray(segment.flags) ? segment.flags.slice() : [],
      trigger,
      mode: typeof segment.mode === 'string' ? segment.mode : null,
    };
  }

  /* Adapt planning/narration-draft.json (or narration-review.json once ready). */
  function fromNarrationDraft(draft) {
    if (!isObject(draft) || !Array.isArray(draft.segments)) throw new Error('draft must contain segments[]');
    const segments = draft.segments.map(normalizeSegment);
    return {
      meta: {
        schemaVersion: CANONICAL_SCHEMA_VERSION,
        status: 'draft-adapter',
        source: 'planning/narration-draft.json',
        generated: draft.meta && draft.meta.generated ? draft.meta.generated : null,
        languages: LANGS.slice(),
      },
      segments,
    };
  }

  function validateCanonical(data) {
    if (!isObject(data) || !isObject(data.meta) || data.meta.schemaVersion !== CANONICAL_SCHEMA_VERSION) {
      throw new Error('canonical scenario requires meta.schemaVersion = ' + CANONICAL_SCHEMA_VERSION);
    }
    if (!Array.isArray(data.segments) || data.segments.length === 0) throw new Error('canonical scenario requires segments[]');
    const seen = new Set();
    const segments = data.segments.map(segment => {
      const row = normalizeSegment(segment);
      if (seen.has(row.segmentId)) throw new Error('duplicate segmentId: ' + row.segmentId);
      seen.add(row.segmentId);
      return row;
    });
    return { meta: data.meta, segments };
  }

  /*
   * Accept either the nested legacy manifest ({id,ru,en}) or the generation
   * manifest ({id,lang,text,audio,status,...}); return per-language rows.
   */
  function manifestSegments(manifest) {
    if (!isObject(manifest) || !Array.isArray(manifest.segments)) return [];
    const out = [];
    for (const row of manifest.segments) {
      if (!isObject(row) || typeof row.id !== 'string') continue;
      if (typeof row.lang === 'string') {
        const status = row.status === 'ready' ? 'ready' : (row.status || 'missing');
        out.push({
          id: row.id,
          lang: row.lang,
          path: typeof row.audio === 'string' ? row.audio : null,
          status,
          approved: row.approved === true,
          duration: typeof row.durationMs === 'number' ? row.durationMs / 1000 : null,
          model: row.model || null,
          voice: row.voice || null,
          cacheKey: row.cacheKey || null,
          taskId: row.taskId || null,
          slideId: row.slideId || null,
          stepIds: Array.isArray(row.stepIds) ? row.stepIds.slice() : [],
          actionId: row.actionId || null,
        });
      } else {
        for (const lang of LANGS) {
          const asset = row[lang];
          if (!isObject(asset)) continue;
          out.push({
            id: row.id,
            lang,
            path: typeof asset.path === 'string' ? asset.path : null,
            status: asset.status || 'missing',
            approved: asset.approved === true,
            duration: typeof asset.duration === 'number' ? asset.duration : null,
            model: asset.model || null,
            voice: asset.voice || null,
            cacheKey: asset.cacheKey || null,
            taskId: asset.taskId || null,
            slideId: row.slideId || null,
            stepIds: Array.isArray(row.stepIds) ? row.stepIds.slice() : [],
            actionId: row.actionId || null,
          });
        }
      }
    }
    return out;
  }

  function assetState(asset) {
    if (!asset || !asset.path) return { playable: false, reason: 'missing', status: 'missing' };
    if (asset.status === 'missing') return { playable: false, reason: 'missing', status: 'missing' };
    if (asset.approved !== true) return { playable: false, reason: 'unapproved', status: asset.status };
    if (asset.status !== 'ready') return { playable: false, reason: asset.status || 'not-ready', status: asset.status };
    return { playable: true, reason: null, status: 'ready' };
  }

  function stepIndexMap(mapping) {
    const out = new Map();
    for (const row of (mapping && mapping.steps) || []) out.set(row.inventoryId, row);
    return out;
  }

  function actionIndexMap(mapping) {
    const out = new Map();
    for (const row of (mapping && mapping.actions) || []) out.set(row.inventoryId, row);
    return out;
  }

  /*
   * Saved audio paths are project-root relative (audio/ru/<id>.mp3), exactly
   * like the generator writes them. Resolve them against the project root
   * implied by the shared voice directory so a slide, a standalone deck and the
   * root index all address one same-origin asset, subdirectory deployments
   * included.
   */
  function projectRootUrl(voiceBase, pageHref) {
    const dir = new URL(voiceBase, pageHref);
    return new URL('../../', dir).href;
  }

  function resolveAssetPath(path, baseUrl) {
    if (typeof path !== 'string' || !path || !baseUrl) return path;
    try {
      return new URL(path, baseUrl).href;
    } catch (e) {
      return path;
    }
  }

  /*
   * Convert canonical segments into controller rows keyed by runtime IDs.
   * Only explicit mapping rows (currently FinFlow) rename an ID.
   */
  function buildRuntimeSegments(canonical, manifest, options) {
    const opts = options || {};
    const data = isObject(canonical) && Array.isArray(canonical.segments) ? canonical : validateCanonical(canonical);
    const steps = stepIndexMap(opts.mapping);
    const actions = actionIndexMap(opts.mapping);
    const assetsById = new Map();
    for (const row of manifestSegments(manifest)) {
      if (!assetsById.has(row.id)) assetsById.set(row.id, {});
      assetsById.get(row.id)[row.lang] = row;
    }
    const claimedIds = new Set();
    const slideStepOrder = new Map();

    return data.segments.map((segment, order) => {
      const mappedSteps = segment.stepIds.map(id => {
        const row = steps.get(id);
        return row && row.controllerId ? row.controllerId : id;
      });
      const mappedAction = segment.actionId && actions.get(segment.actionId) && actions.get(segment.actionId).controllerId
        ? actions.get(segment.actionId).controllerId
        : segment.actionId;
      const firstStep = mappedSteps[0];
      const runtimeSlide = segment.slideId === 's08.finflow' ? 'finflow' : segment.slideId;
      const triggerType = segment.trigger.type;
      let id = triggerType === 'action' ? segment.segmentId : firstStep;
      /*
       * Several draft segments may describe one step (FinFlow carries an
       * action-metadata row on step 1; cal.lite has three). The first one keeps
       * the runtime step ID; later rows keep their canonical segmentId so no
       * narration row is silently lost. Action metadata alone never changes the
       * trigger type; the review's explicit trigger does.
       */
      if (claimedIds.has(id)) id = segment.segmentId;
      claimedIds.add(id);
      if (!slideStepOrder.has(runtimeSlide)) slideStepOrder.set(runtimeSlide, new Map());
      const orderMap = slideStepOrder.get(runtimeSlide);
      if (!orderMap.has(firstStep)) orderMap.set(firstStep, orderMap.size);
      const texts = {};
      for (const lang of LANGS) texts[lang] = { display: segment.display[lang], speech: segment.tts[lang] };
      const assets = {};
      const playable = {};
      const unplayableReason = {};
      const manifestStatus = {};
      const rowAssets = assetsById.get(segment.segmentId) || assetsById.get(id) || {};
      for (const lang of LANGS) {
        const asset = rowAssets[lang] || null;
        const state = assetState(asset);
        assets[lang] = asset && asset.path ? {
          path: resolveAssetPath(asset.path, opts.assetBaseUrl),
          sourcePath: asset.path,
          status: asset.status,
          approved: asset.approved === true,
          duration: asset.duration,
          model: asset.model,
          voice: asset.voice,
          cacheKey: asset.cacheKey,
        } : null;
        playable[lang] = state.playable;
        unplayableReason[lang] = state.reason;
        manifestStatus[lang] = state.status;
      }
      return {
        id,
        segmentId: segment.segmentId,
        kind: triggerType === 'action' ? 'action' : (triggerType === 'container' ? 'container' : 'step'),
        slideId: runtimeSlide,
        sourceSlideId: segment.slideId,
        stepIds: mappedSteps,
        stepId: mappedSteps[0],
        actionId: mappedAction,
        stepIndex: orderMap.get(firstStep),
        trigger: {
          type: triggerType,
          actionId: triggerType === 'action' ? mappedAction : (segment.trigger.actionId || null),
        },
        mode: segment.mode,
        texts,
        assets,
        playable,
        unplayableReason,
        manifestStatus,
      };
    });
  }

  function createScenarioIndex(segments) {
    const list = (segments || []).slice();
    const byId = new Map();
    for (const segment of list) byId.set(segment.id, segment);

    function forStep(slideId, stepId) {
      return list.find(segment =>
        segment.slideId === slideId &&
        (segment.trigger.type === 'step' || segment.trigger.type === 'container') &&
        segment.stepIds.includes(stepId)) || null;
    }

    function forAction(slideId, actionId) {
      return list.find(segment =>
        segment.slideId === slideId &&
        segment.trigger.type === 'action' &&
        segment.actionId === actionId) || null;
    }

    function forContainer(slideId) {
      return list.find(segment => segment.slideId === slideId && segment.trigger.type === 'container') ||
        forStep(slideId, slideId + '.s00');
    }

    function stepIds(slideId) {
      const out = [];
      for (const segment of list) {
        if (segment.slideId !== slideId || segment.trigger.type === 'action') continue;
        for (const id of segment.stepIds) if (!out.includes(id)) out.push(id);
      }
      return out;
    }

    return { segments: list, byId, forStep, forAction, forContainer, stepIds };
  }

  return {
    CANONICAL_SCHEMA_VERSION,
    LANGS,
    TRIGGER_TYPES,
    normalizeTrigger,
    normalizeSegment,
    fromNarrationDraft,
    validateCanonical,
    manifestSegments,
    assetState,
    projectRootUrl,
    resolveAssetPath,
    buildRuntimeSegments,
    createScenarioIndex,
  };
});
