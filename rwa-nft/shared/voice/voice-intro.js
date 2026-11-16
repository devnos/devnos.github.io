/*
 * Voice welcome + first-slide dynamic segment (pure data helpers).
 *
 * The parent generates four real MP3 files (RU/EN welcome + RU/EN dynamic
 * first-slide speech) and publishes them next to one optional manifest:
 *
 *   shared/voice/onboarding-audio.json
 *   {
 *     "schemaVersion": 1,
 *     "records": [
 *       { "id": "onboarding.voice-intro", "kind": "container",
 *         "slideId": "onboarding", "stepIds": [],
 *         "display": { "ru": "...", "en": "..." },
 *         "tts": { "ru": "...", "en": "..." },
 *         "assets": { "ru": { path, sha256, durationMs, approved, status,
 *                             model, voice, params }, "en": { ... } } },
 *       { "id": "s01.imagine.dynamic", "kind": "step",
 *         "slideId": "s01.imagine", "stepIds": ["s01.imagine.s03"],
 *         display, tts, assets }
 *     ]
 *   }
 *
 * This module never creates Audio, never fetches and never synthesises speech.
 * It adapts those records to the exact segment shape VoiceCore already plays,
 * so the intro and the first content step share the deck's ONE native Audio.
 * Missing or malformed data is a valid state: the main 86 segments keep
 * playing, the welcome is reported unavailable, and the deck skips straight to
 * the first title step instead of locking or substituting an old recording.
 *
 * `s01.imagine.s02` keeps its historical meaning forever; the new combined
 * speech has its own stable ID `s01.imagine.dynamic`. VoiceSlides keeps the old
 * visual step ID `s01.imagine.s03` and the boot resolves it explicitly through
 * `resolveStepOverride`, only when the new asset is really ready.
 *
 * The plate timeline is pure so the cinematic text is adaptive to the real
 * MP3 duration (durationMs) with no 4.5s empty windows and no invented facts.
 */
(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.VoiceIntro = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const INTRO_ID = 'onboarding.voice-intro';
  const DYNAMIC_ID = 's01.imagine.dynamic';
  const DYNAMIC_STEP_ID = 's01.imagine.s03';
  const ACTIVATE_ID = 's14.choose.activate';
  const ACTIVATE_STEP_ID = 's14.choose.s03';
  const DEFAULT_DYNAMIC_MS = 18200;
  const LANGS = ['ru', 'en'];
  const PLATE_KEYS = ['plate1', 'plate2', 'plate3', 'plate4'];
  const PLATE_WEIGHTS = [0.22, 0.28, 0.22, 0.28];

  /*
   * Only approved wording from the confirmed speech. No sums, percentages,
   * dates or yield promises: the plates describe the idea, they do not sell a
   * number.
   */
  const PLATES = {
    ru: [
      ['Несколько владельцев', 'Актив может принадлежать нескольким людям'],
      ['Каждый получает', 'свою долю дохода'],
      ['Одна из долей', 'принадлежит вам'],
      ['Цифровая доля в реальном активе', 'Вы совладелец и получаете доход'],
    ],
    en: [
      ['Several owners', 'An asset can belong to several people'],
      ['Each one receives', 'a share of the income'],
      ['One of those shares', 'belongs to you'],
      ['A digital share in a real asset', 'You become a co-owner and receive your share'],
    ],
  };

  function isObject(value) {
    return !!value && typeof value === 'object' && !Array.isArray(value);
  }

  function text(value) {
    return typeof value === 'string' ? value : '';
  }

  function nonEmpty(value) {
    return typeof value === 'string' && value.trim().length > 0;
  }

  /*
   * canPlay is stricter than "a path exists": a record may only be treated as
   * real audio when it is approved, marked ready AND carries the hash of the
   * generated file. A half-finished generation can never masquerade as ready.
   */
  function canPlay(asset) {
    if (!isObject(asset)) return { playable: false, reason: 'missing' };
    if (!nonEmpty(asset.path)) return { playable: false, reason: 'missing' };
    if (asset.status === 'missing') return { playable: false, reason: 'missing' };
    if (asset.approved !== true) return { playable: false, reason: 'unapproved' };
    if (asset.status !== 'ready') return { playable: false, reason: 'not-ready' };
    if (!nonEmpty(asset.sha256)) return { playable: false, reason: 'unhashed' };
    return { playable: true, reason: null };
  }

  function resolveAssetPath(path, baseUrl) {
    if (!nonEmpty(path) || !nonEmpty(baseUrl)) return path || null;
    try {
      return new URL(path, baseUrl).href;
    } catch (e) {
      return path;
    }
  }

  function emptyResult(reason) {
    return {
      ok: false,
      reason: reason || 'no-data',
      segments: [],
      records: {},
      skipped: [],
      intro: {
        present: false, record: null,
        playable: { ru: false, en: false },
        reasons: { ru: 'no-data', en: 'no-data' },
        display: { ru: '', en: '' }, tts: { ru: '', en: '' },
      },
      dynamic: {
        present: false, record: null,
        playable: { ru: false, en: false },
        reasons: { ru: 'no-data', en: 'no-data' },
        durationMs: { ru: null, en: null },
        stepIds: [],
      },
      activate: {
        present: false, record: null,
        playable: { ru: false, en: false },
        reasons: { ru: 'no-data', en: 'no-data' },
        durationMs: { ru: null, en: null },
        stepIds: [],
      },
    };
  }

  function adaptAsset(asset, baseUrl) {
    if (!isObject(asset)) return null;
    return {
      path: resolveAssetPath(asset.path, baseUrl),
      sourcePath: nonEmpty(asset.path) ? asset.path : null,
      status: typeof asset.status === 'string' ? asset.status : 'missing',
      approved: asset.approved === true,
      sha256: nonEmpty(asset.sha256) ? asset.sha256 : null,
      durationMs: typeof asset.durationMs === 'number' && isFinite(asset.durationMs) ? asset.durationMs : null,
      duration: typeof asset.durationMs === 'number' && isFinite(asset.durationMs) ? asset.durationMs / 1000 : null,
      model: asset.model || null,
      voice: asset.voice || null,
      params: isObject(asset.params) ? asset.params : null,
    };
  }

  function adaptRecord(record, baseUrl) {
    if (!isObject(record)) return { error: 'record must be an object' };
    if (!nonEmpty(record.id)) return { error: 'record.id is required' };
    if (!nonEmpty(record.slideId)) return { error: 'record.slideId is required' };
    if (!isObject(record.display) || !isObject(record.tts)) return { error: 'display/tts are required' };
    for (const lang of LANGS) {
      if (!nonEmpty(record.display[lang])) return { error: 'display.' + lang + ' is required' };
      if (!nonEmpty(record.tts[lang])) return { error: 'tts.' + lang + ' is required' };
    }
    if (!Array.isArray(record.stepIds)) return { error: 'stepIds[] is required' };
    const stepIds = record.stepIds.filter(nonEmpty);
    if (record.kind !== 'container' && stepIds.length === 0) return { error: 'a step record needs stepIds' };
    if (!isObject(record.assets)) return { error: 'assets are required' };

    const kind = record.kind === 'container' ? 'container' : 'step';
    const assets = {};
    const texts = {};
    const playable = {};
    const reasons = {};
    const durations = {};
    for (const lang of LANGS) {
      const asset = adaptAsset(record.assets[lang], baseUrl);
      assets[lang] = asset;
      const state = canPlay(asset);
      playable[lang] = state.playable;
      reasons[lang] = state.reason;
      durations[lang] = asset && typeof asset.durationMs === 'number' ? asset.durationMs : null;
      texts[lang] = { display: record.display[lang], speech: record.tts[lang] };
    }

    const segment = {
      id: record.id,
      kind,
      slideId: record.slideId,
      sourceSlideId: record.slideId,
      stepIds: stepIds.slice(),
      stepId: stepIds[0] || null,
      actionId: null,
      stepIndex: 0,
      trigger: { type: kind, actionId: null },
      texts,
      assets,
      playable,
      unplayableReason: reasons,
      manifestStatus: {
        ru: assets.ru ? assets.ru.status : 'missing',
        en: assets.en ? assets.en.status : 'missing',
      },
    };

    return {
      segment,
      meta: {
        present: true,
        record: segment,
        playable,
        reasons,
        display: { ru: record.display.ru, en: record.display.en },
        tts: { ru: record.tts.ru, en: record.tts.en },
        durationMs: durations,
        stepIds: stepIds.slice(),
      },
    };
  }

  /*
   * Accepts the published object (or null after a failed optional fetch) and
   * returns the extra segments plus per-record readiness. One malformed row is
   * skipped and counted; it never throws away the rest of the file.
   */
  function adaptOnboarding(data, options) {
    const opts = options || {};
    if (!isObject(data) || data.schemaVersion !== 1 || !Array.isArray(data.records)) {
      return emptyResult('invalid-schema');
    }
    const baseUrl = nonEmpty(opts.assetBaseUrl) ? opts.assetBaseUrl : null;
    const result = emptyResult(null);
    result.ok = true;
    result.reason = null;
    result.skipped = [];

    const seen = new Set();
    for (const record of data.records) {
      const adapted = adaptRecord(record, baseUrl);
      if (adapted.error) {
        result.skipped.push({
          id: isObject(record) && nonEmpty(record.id) ? record.id : null,
          reason: adapted.error,
        });
        continue;
      }
      if (seen.has(adapted.segment.id)) {
        result.skipped.push({ id: adapted.segment.id, reason: 'duplicate-id' });
        continue;
      }
      seen.add(adapted.segment.id);
      result.segments.push(adapted.segment);
      result.records[adapted.segment.id] = adapted.segment;
      if (adapted.segment.id === INTRO_ID) result.intro = adapted.meta;
      if (adapted.segment.id === DYNAMIC_ID) result.dynamic = adapted.meta;
      if (adapted.segment.id === ACTIVATE_ID) result.activate = adapted.meta;
    }
    return result;
  }

  /*
   * The only bridge between an old visual step ID and a new generated speech
   * record. Generic over every extra record: an override is returned only for
   * the exact slideId/stepId pair declared by that record and only when its
   * asset is approved, ready and hashed in the current language. Returning
   * null keeps the old approved recording in place; it is never relabelled as
   * the new asset.
   */
  function resolveStepOverride(extra, slideId, stepId, lang) {
    if (!extra || extra.ok !== true || !Array.isArray(extra.segments)) return null;
    const code = lang === 'en' ? 'en' : 'ru';
    for (const segment of extra.segments) {
      if (!segment || segment.id === INTRO_ID) continue;
      if (segment.slideId !== slideId) continue;
      if (!Array.isArray(segment.stepIds) || segment.stepIds.indexOf(stepId) < 0) continue;
      if (segment.playable && segment.playable[code] === true) return segment.id;
    }
    return null;
  }

  function plateTexts(lang) {
    const dict = PLATES[lang === 'ru' ? 'ru' : 'en'] || PLATES.en;
    return dict.map(function (lines) { return lines.slice(); });
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function plateHtml(key, lang) {
    const index = PLATE_KEYS.indexOf(key);
    if (index < 0) return '';
    const lines = plateTexts(lang)[index];
    if (!lines || !lines.length) return '';
    const first = '<span>' + escapeHtml(lines[0]) + '</span>';
    const second = lines[1] ? '<br><em>' + escapeHtml(lines[1]) + '</em>' : '';
    return first + second;
  }

  /*
   * Sequential, contiguous slots covering the whole dynamic speech. The first
   * plate is visible at 0ms (no dead intro), the last ends exactly when the MP3
   * ends (plus the caller's own short fade-out), so no plate window is empty.
   */
  function buildPlateTimeline(durationMs) {
    let duration = DEFAULT_DYNAMIC_MS;
    if (typeof durationMs === 'number' && isFinite(durationMs) && durationMs > 0) {
      duration = Math.max(4000, Math.round(durationMs));
    }
    const out = [];
    let cursor = 0;
    for (let i = 0; i < PLATE_KEYS.length; i += 1) {
      let end;
      if (i === PLATE_KEYS.length - 1) end = duration;
      else end = Math.round(duration * (function () {
        let sum = 0;
        for (let j = 0; j <= i; j += 1) sum += PLATE_WEIGHTS[j];
        return sum;
      })());
      if (end <= cursor) end = cursor + 1;
      out.push({ key: PLATE_KEYS[i], start: cursor, end: end });
      cursor = end;
    }
    /* Rounding must never leave the last slot short of the real duration. */
    out[out.length - 1].end = Math.max(out[out.length - 1].end, duration);
    return out;
  }

  /*
   * One page-lifetime state machine. It never plays audio itself: `select`
   * forwards to the ONE live controller, so the welcome and the first content
   * step use the same native Audio element. It exposes no timer and no lock:
   * `ended` advances, `paused` (help) waits, any failure skips.
   */
  function createIntroFlow(options) {
    const opts = options || {};
    const introId = nonEmpty(opts.introId) ? opts.introId : INTRO_ID;
    const getFirstStepId = typeof opts.getFirstStepId === 'function'
      ? opts.getFirstStepId
      : function () { return null; };
    const select = typeof opts.select === 'function' ? opts.select : null;
    const onAdvance = typeof opts.onAdvance === 'function' ? opts.onAdvance : function () {};
    const hasIntro = opts.hasIntro === true;

    let phase = 'idle';
    let begun = false;

    function advance() {
      if (phase !== 'intro') return false;
      phase = 'advancing';
      try { onAdvance(); } catch (e) {}
      return true;
    }

    function begin() {
      if (begun || phase !== 'idle') return { started: false, reason: 'already-begun' };
      if (!hasIntro || !select) {
        phase = 'done';
        return { started: false, reason: 'no-intro' };
      }
      begun = true;
      phase = 'intro';
      try {
        const result = select(introId, { autoplay: true });
        /* An asynchronous select failure must skip, never strand the page. */
        if (result && typeof result.catch === 'function') {
          result.catch(function () { advance(); });
        }
      } catch (e) {
        advance();
      }
      return { started: true };
    }

    function onSnapshot(snapshot) {
      if (!snapshot || typeof snapshot !== 'object') return null;
      const currentId = snapshot.currentId || null;
      const status = snapshot.status || null;

      if (phase === 'intro') {
        if (!currentId) return null;
        if (currentId === introId) {
          /* Only a real finish/failure moves on. Paused is help, not an end. */
          if (status === 'ended' || status === 'error' ||
              status === 'unavailable' || status === 'blocked') {
            advance();
            return 'advance';
          }
          return null;
        }
        /* Someone else already owns the narration; never hijack navigation. */
        phase = 'done';
        return null;
      }

      if (phase === 'advancing') {
        if (currentId === getFirstStepId()) phase = 'done';
        return null;
      }
      return null;
    }

    return {
      begin,
      onSnapshot,
      advance,
      phase: function () { return phase; },
      isActive: function () { return phase === 'intro' || phase === 'advancing'; },
      blocksSelection: function () { return phase === 'intro'; },
    };
  }

  return {
    INTRO_ID,
    DYNAMIC_ID,
    DYNAMIC_STEP_ID,
    ACTIVATE_ID,
    ACTIVATE_STEP_ID,
    DEFAULT_DYNAMIC_MS,
    PLATE_KEYS,
    canPlay,
    adaptOnboarding,
    resolveStepOverride,
    buildPlateTimeline,
    plateTexts,
    plateHtml,
    createIntroFlow,
  };
});
