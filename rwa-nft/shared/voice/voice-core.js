/*
 * Voice narration core.
 *
 * Pure state machine shared by the deck and the tests. It never talks to
 * Kie.ai, never fetches audio and never invents an asset. Browser media is
 * injected so unit tests can use a labelled fake and the real page can use one
 * Audio element owned by the top-level deck.
 */
(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.VoiceCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const LANGS = ['ru', 'en'];
  const SUPPORTED = new Set(LANGS);

  function assetState(asset) {
    if (!asset || !asset.path) return { playable: false, reason: 'missing' };
    if (asset.status === 'missing') return { playable: false, reason: 'missing' };
    if (asset.approved !== true) return { playable: false, reason: 'unapproved' };
    if (asset.status !== 'ready') return { playable: false, reason: asset.status || 'not-ready' };
    return { playable: true, reason: null };
  }

  /* Merge editable scenario text with explicit asset state from the manifest. */
  function resolveSegments(scenario, manifest) {
    if (!scenario || !Array.isArray(scenario.steps) || !Array.isArray(scenario.actions)) {
      throw new Error('scenario must contain steps[] and actions[]');
    }
    if (!manifest || !Array.isArray(manifest.segments)) {
      throw new Error('manifest must contain segments[]');
    }
    const byId = new Map(manifest.segments.map(s => [s.id, s]));
    const rows = [...scenario.steps, ...scenario.actions];

    return rows.map(row => {
      const id = row.stepId || row.actionId;
      if (!id) throw new Error('scenario row has no stepId/actionId');
      const assetRow = byId.get(id);
      if (!assetRow) throw new Error('manifest is missing segment ' + id);

      const texts = {};
      const assets = {};
      const playable = {};
      const unplayableReason = {};
      for (const lang of LANGS) {
        const textRow = row[lang] || {};
        texts[lang] = {
          display: textRow.display || '',
          speech: textRow.speech || textRow.display || '',
        };
        assets[lang] = assetRow[lang] || null;
        const state = assetState(assetRow[lang]);
        playable[lang] = state.playable;
        unplayableReason[lang] = state.reason;
      }

      return {
        id,
        kind: row.kind || (row.actionId ? 'action' : 'step'),
        slideId: scenario.slideId,
        stepId: row.stepId || null,
        actionId: row.actionId || null,
        stepIndex: Number.isInteger(row.stepIndex) ? row.stepIndex : null,
        texts,
        assets,
        playable,
        unplayableReason,
      };
    });
  }

  function failure(reason) {
    return { ok: false, reason };
  }

  function createVoiceController(options) {
    const opts = options || {};
    const segmentMap = new Map();
    for (const segment of opts.segments || []) segmentMap.set(segment.id, segment);

    const audioFactory = opts.audioFactory || (() => new Audio());
    const mediaProvider = opts.mediaProvider || (() => []);
    const channel = opts.channel || null;
    const tabId = opts.tabId || 'tab';
    const now = opts.now || (() => Date.now());
    const unsupportedText = 'Voice narration is available in Russian and English only. Switch the presentation language to RU or EN.';

    let lang = typeof opts.lang === 'string' ? opts.lang : 'ru';
    let enabled = opts.enabled !== false;
    /*
     * Speaker mode: narration is on by default and every selected step is
     * attempted immediately. A rejected native play() is the normal cold-start
     * path, not an error: it becomes 'blocked' and the first real gesture
     * retries the CURRENT step. The legacy gesture-gated mode stays the default
     * for old callers/tests.
     */
    const autoNarrate = opts.autoNarrate === true;
    /* A gesture was already given, so new steps may speak without another one.
       It survives pause/ended/navigation but not an explicit mute. */
    let armed = enabled && opts.armed === true;
    let unlocked = opts.unlocked === true;
    let status = !enabled ? 'disabled' : (SUPPORTED.has(lang) ? 'idle' : 'unsupported');
    let reason = !enabled ? null : (SUPPORTED.has(lang) ? null : 'unsupported-language');
    let currentId = null;
    let token = 0;
    let audio = null;
    let loadedKey = null;
    let ducked = [];
    let destroyed = false;
    const listeners = [];

    function currentSegment() {
      return currentId ? segmentMap.get(currentId) : null;
    }

    function textFor(segment, langCode) {
      if (!segment) return { display: '', speech: '' };
      return segment.texts[langCode] || { display: '', speech: '' };
    }

    function snapshot() {
      const segment = currentSegment();
      const text = textFor(segment, lang);
      return {
        lang,
        enabled,
        unlocked,
        armed,
        autoNarrate,
        status,
        reason,
        currentId,
        stepId: segment ? segment.stepId : null,
        actionId: segment ? segment.actionId : null,
        canPlay: !!(segment && segment.playable[lang]),
        transcript: status === 'unsupported' ? unsupportedText : text.display,
        speech: status === 'unsupported' ? '' : text.speech,
      };
    }

    function ensureAudio() {
      if (audio) return audio;
      audio = audioFactory();
      if (audio && typeof audio.addEventListener === 'function') {
        audio.addEventListener('ended', onEnded);
        audio.addEventListener('error', onError);
      }
      return audio;
    }

    function notify() {
      if (destroyed) return;
      const snap = snapshot();
      for (const fn of listeners.slice()) {
        try { fn(snap); } catch (e) {}
      }
    }

    function finish(result) {
      notify();
      return result;
    }

    function subscribe(fn) {
      if (typeof fn !== 'function') return function () {};
      listeners.push(fn);
      return function () {
        const index = listeners.indexOf(fn);
        if (index >= 0) listeners.splice(index, 1);
      };
    }

    function duckMedia() {
      if (ducked.length) return;
      let list = [];
      try { list = mediaProvider() || []; } catch (e) { list = []; }
      for (const element of list) {
        if (!element || element === audio) continue;
        const before = typeof element.volume === 'number' ? element.volume : 1;
        ducked.push({ element, volume: before });
        element.volume = Math.min(before, 0.2);
      }
    }

    function restoreMedia() {
      for (const entry of ducked) {
        try { entry.element.volume = entry.volume; } catch (e) {}
      }
      ducked = [];
    }

    function claimTab(segment) {
      if (!channel || !segment) return;
      try {
        channel.postMessage({ type: 'voice-claim', tabId, segmentId: segment.id, at: now() });
      } catch (e) {}
    }

    function onEnded() {
      if (destroyed) return;
      if (status !== 'playing' && status !== 'starting') return;
      status = 'ended';
      restoreMedia();
      notify();
    }

    function onError() {
      if (destroyed) return;
      token += 1;
      status = 'error';
      reason = 'media-error';
      restoreMedia();
      notify();
    }

    function unplayableReason(segment) {
      const why = segment.unplayableReason[lang];
      return why === 'unapproved' ? 'audio-unapproved' : 'audio-missing';
    }

    async function play() {
      if (destroyed) return failure('destroyed');
      if (!enabled) {
        reason = 'disabled';
        return finish(failure('disabled'));
      }
      if (!SUPPORTED.has(lang)) {
        status = 'unsupported';
        reason = 'unsupported-language';
        return finish(failure('unsupported-language'));
      }
      if (!unlocked && !autoNarrate) {
        status = 'needs-gesture';
        reason = 'gesture-required';
        return finish(failure('gesture-required'));
      }
      const segment = currentSegment();
      if (!segment) {
        status = 'idle';
        reason = 'no-segment';
        return finish(failure('no-segment'));
      }
      if (!segment.playable[lang]) {
        status = 'unavailable';
        reason = unplayableReason(segment);
        return finish(failure(reason));
      }

      const myToken = ++token;
      const element = ensureAudio();
      const asset = segment.assets[lang];
      const key = segment.id + '|' + lang;
      if (loadedKey !== key) {
        element.src = asset.path;
        loadedKey = key;
      }
      status = 'starting';
      reason = null;
      notify();

      try {
        const result = element.play();
        if (result && typeof result.then === 'function') await result;
        if (myToken !== token) return failure('stale');
        status = 'playing';
        unlocked = true;
        if (autoNarrate && enabled) armed = true;
        duckMedia();
        claimTab(segment);
        return finish({ ok: true, status });
      } catch (error) {
        if (myToken !== token) return failure('stale');
        restoreMedia();
        const name = error && error.name;
        if (name === 'NotAllowedError') {
          status = 'blocked';
          reason = 'blocked-by-browser';
          return finish(failure('blocked-by-browser'));
        }
        status = 'error';
        reason = 'media-error';
        return finish(failure('media-error'));
      }
    }

    async function select(id, selectOptions) {
      const options2 = selectOptions || {};
      const segment = segmentMap.get(id);
      if (!segment) {
        token += 1;
        if (audio) audio.pause();
        restoreMedia();
        currentId = null;
        status = 'idle';
        reason = 'unknown-segment';
        return finish(failure('unknown-segment'));
      }

      if (currentId !== id) {
        token += 1;
        if (audio) {
          audio.pause();
          audio.currentTime = 0;
        }
        restoreMedia();
        currentId = id;
        reason = null;
        if (status !== 'disabled' && status !== 'unsupported') status = 'ready';
      } else if (status === 'idle') {
        status = 'ready';
      }

      if (options2.autoplay) return play();
      if (options2.paused && status !== 'disabled' && status !== 'unsupported') {
        status = segment.playable[lang] ? 'paused' : 'unavailable';
        reason = status === 'unavailable' ? unplayableReason(segment) : null;
      }
      return finish({ ok: true, status });
    }

    function unlock() {
      unlocked = true;
      if (enabled) armed = true;
      if (status === 'needs-gesture') {
        status = currentId ? 'ready' : 'idle';
        reason = null;
      }
      notify();
      return snapshot();
    }

    async function start() {
      unlock();
      return play();
    }

    function pause() {
      token += 1;
      if (status === 'starting' || status === 'playing') status = 'paused';
      if (audio) audio.pause();
      restoreMedia();
      notify();
      return snapshot();
    }

    async function repeat() {
      if (!enabled) {
        reason = 'disabled';
        return finish(failure('disabled'));
      }
      if (!SUPPORTED.has(lang)) {
        status = 'unsupported';
        reason = 'unsupported-language';
        return finish(failure('unsupported-language'));
      }
      if (!unlocked) {
        status = 'needs-gesture';
        reason = 'gesture-required';
        return finish(failure('gesture-required'));
      }
      if (!currentSegment()) {
        status = 'idle';
        reason = 'no-segment';
        return finish(failure('no-segment'));
      }
      token += 1;
      if (audio) {
        audio.pause();
        audio.currentTime = 0;
      }
      restoreMedia();
      status = 'ready';
      return play();
    }

    function disable() {
      token += 1;
      enabled = false;
      armed = false;
      status = 'disabled';
      reason = null;
      if (audio) audio.pause();
      restoreMedia();
      notify();
      return snapshot();
    }

    function enable() {
      enabled = true;
      if (status === 'disabled') {
        status = !SUPPORTED.has(lang) ? 'unsupported' : (currentId ? 'ready' : 'idle');
        if (status === 'unsupported') reason = 'unsupported-language';
      }
      notify();
      return snapshot();
    }

    function stop() {
      token += 1;
      if (audio) {
        audio.pause();
        audio.currentTime = 0;
      }
      restoreMedia();
      if (status === 'playing' || status === 'starting' || status === 'paused') {
        status = currentId ? 'ready' : 'idle';
      }
      reason = null;
      notify();
      return snapshot();
    }

    async function setLang(nextLang) {
      if (nextLang === lang) return { ok: true, status };
      const before = status;
      const segment = currentSegment();
      const wasPlaying = before === 'playing' || before === 'starting';
      const wasPaused = before === 'paused';
      const wasDisabled = !enabled || before === 'disabled';
      const wasUnavailable = before === 'unavailable';

      token += 1;
      if (audio) audio.pause();
      restoreMedia();
      lang = nextLang;

      if (!SUPPORTED.has(nextLang)) {
        status = 'unsupported';
        reason = 'unsupported-language';
        return finish({ ok: false, reason });
      }

      if (!segment) {
        status = 'idle';
        reason = null;
        return finish({ ok: true, status });
      }

      if (audio && segment.assets[nextLang] && segment.assets[nextLang].path) {
        const key = segment.id + '|' + nextLang;
        if (loadedKey !== key) {
          audio.src = segment.assets[nextLang].path;
          loadedKey = key;
        }
        audio.currentTime = 0;
      }

      if (wasDisabled) {
        status = 'disabled';
        reason = null;
        return finish({ ok: true, status });
      }
      /*
       * A visible RU/EN switch is an explicit request to hear the same segment
       * in the new language, including after 'ended', 'blocked' or an
       * unsupported language. An internal test pause stays paused.
       */
      if (autoNarrate && enabled && segment.playable[nextLang] && !wasPaused) {
        status = 'ready';
        reason = null;
        return play();
      }
      if (wasPlaying) {
        status = 'ready';
        reason = null;
        return play();
      }
      if (wasPaused) {
        status = 'paused';
        reason = null;
        return finish({ ok: true, status });
      }
      if (wasUnavailable) {
        status = 'unavailable';
        reason = segment.unplayableReason[nextLang] === 'unapproved' ? 'audio-unapproved' : 'audio-missing';
        return finish({ ok: false, reason });
      }

      status = segment.playable[nextLang] ? 'ready' : 'unavailable';
      reason = status === 'unavailable'
        ? (segment.unplayableReason[nextLang] === 'unapproved' ? 'audio-unapproved' : 'audio-missing')
        : null;
      return finish({ ok: status !== 'unavailable', status });
    }

    function onChannelMessage(event) {
      const data = event && event.data;
      if (!data || data.type !== 'voice-claim') return;
      if (data.tabId === tabId) return;
      if (status !== 'playing' && status !== 'starting') return;
      token += 1;
      status = 'paused';
      reason = 'other-tab';
      if (audio) audio.pause();
      restoreMedia();
      notify();
    }

    function destroy() {
      destroyed = true;
      token += 1;
      if (audio) audio.pause();
      restoreMedia();
      if (channel) {
        try { channel.removeEventListener('message', onChannelMessage); } catch (e) {}
        try { channel.close(); } catch (e) {}
      }
    }

    if (channel && typeof channel.addEventListener === 'function') {
      channel.addEventListener('message', onChannelMessage);
    }

    return {
      snapshot,
      subscribe,
      select,
      start,
      play,
      pause,
      repeat,
      disable,
      enable,
      stop,
      unlock,
      setLang,
      destroy,
    };
  }

  return {
    LANGS,
    resolveSegments,
    createVoiceController,
  };
});
