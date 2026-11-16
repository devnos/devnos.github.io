/*
 * Top-level deck boot for narration.
 *
 * Only this file creates Audio. The active narration target may be the deck
 * slide itself or a bounded, verified same-origin iframe below it: the real
 * FinFlow route is index -> slide_06_system -> mathFrame(slide_08). Slides
 * announce stable IDs; the top validates origin, the actual sending window,
 * schema and live visibility before routing. No TTS request is made here.
 */
(function () {
  'use strict';

  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  if (!window.VoiceCore || !window.VoiceProtocol || !window.VoiceSlides ||
      !window.VoiceDeck || !window.VoiceUI || !window.VoiceRoute ||
      !window.VoiceScenario || !window.VoiceAutoplay) return;

  const isTop = window.VoiceProtocol.canOwnAudio(window, window.top);
  if (!isTop) {
    /* Inactive, preloaded or nested iframe: no audio owner, no UI. */
    window.RwaVoice = {
      embedded: true,
      stop() {},
      onSlideChanged() {},
      snapshot() { return null; },
    };
    return;
  }

  const state = {
    controller: null,
    ui: null,
    deck: null,
    config: null,
    dataStatus: 'loading',
    stepId: null,
    stepIndex: 0,
    mountedPath: null,
    sourceWindow: null,
    basePath: null,
    scenarioIndex: null,
    mapping: null,
    canonical: null,
    lastEvent: null,
    eventSeq: 0,
    autoNarrate: true,
    narrator: null,
    hint: null,
    centerPlay: null,
    gestureDoc: null,
  };

  const observers = [];
  const hookedFrames = new WeakSet();
  const tabId = 'tab-' + Math.random().toString(36).slice(2) + '-' + Date.now();
  let refreshTimer = null;


  function slidePath() {
    try {
      if (typeof SLIDES !== 'undefined' && typeof currentIndex !== 'undefined') {
        return SLIDES[currentIndex] || null;
      }
    } catch (e) {}
    return state.basePath || window.location.pathname;
  }

  function visibleOwnFrame() {
    try {
      const frames = Array.prototype.slice.call(document.querySelectorAll('iframe'));
      for (const frame of frames) {
        if (window.VoiceRoute.isActuallyVisible(frame, window)) return frame;
      }
    } catch (e) {}
    return null;
  }

  function activeFrame() {
    try {
      if (typeof getActiveFrame === 'function') return getActiveFrame();
    } catch (e) {}
    /* school_deck preloads six frames and shows one with a class; top-level
       content screens have no frames at all. */
    return visibleOwnFrame();
  }

  function screenFrameIfOpen() {
    const modal = document.getElementById('screenModal');
    if (!modal || !modal.classList.contains('open')) return null;
    return document.getElementById('screenFrame');
  }

  /* The top screen modal (mobile) wins over the deck frame while it is open. */
  function routeRoot() {
    const screen = screenFrameIfOpen();
    if (screen) return screen;
    return activeFrame();
  }

  function isTransitioningNow() {
    try {
      return typeof isTransitioning !== 'undefined' && !!isTransitioning;
    } catch (e) {
      return false;
    }
  }

  function currentLang() {
    try {
      return (window.I18N && window.I18N.current) || 'ru';
    } catch (e) {
      return 'ru';
    }
  }

  /*
   * Only the live target may unlock audio. The top document is always bound;
   * a same-origin active slide document is added while it is the target and
   * removed on every route change, so preloaded/hidden frames can never start
   * playback. The gesture itself is observed, never prevented.
   */
  function bindGestureDoc(doc) {
    if (state.gestureDoc === doc) return;
    if (state.gestureDoc && state.narrator) state.narrator.unbind(state.gestureDoc);
    state.gestureDoc = doc || null;
    if (state.gestureDoc && state.narrator) state.narrator.bind(state.gestureDoc);
  }

  /* Duck media in the active tree (hub video + the nested FinFlow frame). */
  function mediaList() {
    const out = [];
    const docs = [];
    function addDoc(doc) {
      if (doc && !docs.includes(doc)) docs.push(doc);
    }
    try { addDoc(document); } catch (e) {}

    const root = routeRoot();
    if (root) {
      try {
        const candidates = window.VoiceRoute.collectFrameCandidates(root, {
          getConfig: window.VoiceSlides.getSlideConfig,
        });
        candidates.forEach(function (candidate) { addDoc(candidate.doc); });
      } catch (e) {}
    }

    docs.forEach(function (doc) {
      try {
        doc.querySelectorAll('video,audio').forEach(function (el) { out.push(el); });
      } catch (e) {}
    });
    return out;
  }

  function makeChannel() {
    try {
      if ('BroadcastChannel' in window) return new BroadcastChannel('rwa-nft-voice');
    } catch (e) {}
    return null;
  }

  function resolveStep(stepId, cfg) {
    if (!state.scenarioIndex || !cfg) return null;
    const segment = state.scenarioIndex.forStep(cfg.slideId, stepId);
    return segment ? segment.id : null;
  }

  function resolveAction(actionId, stepId, cfg) {
    if (!state.scenarioIndex || !cfg) return null;
    const segment = state.scenarioIndex.forAction(cfg.slideId, actionId);
    return segment ? segment.id : null;
  }

  function createController(segments, previous) {
    const before = previous && typeof previous.snapshot === 'function' ? previous.snapshot() : null;
    const controller = window.VoiceCore.createVoiceController({
      segments: segments || [],
      lang: currentLang(),
      /*
       * Speaker mode is always enabled. The legacy `rwa_voice_off` preference
       * is deliberately ignored: a stale mute from an older build must not
       * silence the presentation, and there is no visible off control anymore.
       */
      enabled: true,
      unlocked: before ? before.unlocked === true : false,
      armed: before ? before.armed === true : false,
      autoNarrate: true,
      audioFactory: function () { return new Audio(); },
      mediaProvider: mediaList,
      channel: makeChannel(),
      tabId: tabId,
    });
    controller.subscribe(render);
    return controller;
  }

  function createDeck(controller) {
    return window.VoiceDeck.createDeckVoice({
      controller: controller,
      getConfig: function () { return state.config; },
      resolveStep: resolveStep,
      resolveAction: resolveAction,
      autoNarrate: true,
    });
  }

  function render() {
    if (state.ui) state.ui.render();
    if (!state.controller) return;
    const snap = state.controller.snapshot();
    if (state.hint) state.hint.update(snap);
    if (state.centerPlay) state.centerPlay.update(snap);
  }

  function selectStep(stepId, follow) {
    if (!state.config || !state.controller) return;
    const index = state.config.steps.indexOf(stepId);
    if (index < 0) return;
    state.stepId = stepId;
    state.stepIndex = index;
    const segmentId = resolveStep(stepId, state.config);
    if (!segmentId) return;
    const snap = state.controller.snapshot();
    /* Speaker mode: every visible step transition attempts native playback.
       A blocked browser reply is handled by the controller and retried on the
       first real gesture; it is never a reason to stay silent. */
    const autoplay = follow === true && snap.enabled !== false;
    state.controller.select(segmentId, {
      autoplay,
      paused: !state.autoNarrate && snap.status === 'paused',
    }).then(render).catch(function () {});
  }

  function resetSelection() {
    state.config = null;
    state.stepId = null;
    state.stepIndex = 0;
    state.mountedPath = null;
    state.sourceWindow = null;
    bindGestureDoc(null);
    if (state.ui) state.ui.setConfig(null);
  }

  function clearSelection() {
    if (state.controller) state.controller.stop();
    if (state.config || state.sourceWindow) resetSelection();
    bindGestureDoc(null);
    render();
  }

  function applyTarget(hit) {
    if (!hit) {
      clearSelection();
      return;
    }

    const sameRoute = !!state.config &&
      state.config.slideId === hit.config.slideId &&
      state.mountedPath === hit.path &&
      state.sourceWindow === hit.win;
    if (sameRoute) return;

    state.config = hit.config;
    state.mountedPath = hit.path;
    state.sourceWindow = hit.win;
    bindGestureDoc(hit.doc || null);
    state.stepId = null;
    state.stepIndex = 0;
    if (state.ui) state.ui.setConfig(state.config);

    if (state.dataStatus === 'ready' && state.controller) {
      selectStep(state.config.steps[0], true);
    }
    render();
  }

  function disconnectObservers() {
    while (observers.length) {
      try { observers.pop().disconnect(); } catch (e) {}
    }
  }

  function scheduleRefresh(delay) {
    /* Coalesce, do not reset: an animated hub mutates class/style constantly
       and a debounce timer would starve the refresh indefinitely. */
    if (refreshTimer) return;
    refreshTimer = setTimeout(function () {
      refreshTimer = null;
      refreshRoute();
    }, typeof delay === 'number' ? delay : 80);
  }

  function hookFrame(frame) {
    if (!frame || hookedFrames.has(frame)) return;
    hookedFrames.add(frame);
    try { frame.addEventListener('load', function () { scheduleRefresh(60); }); } catch (e) {}
  }

  function installObservers(candidates) {
    disconnectObservers();
    const watched = new Set();
    function watch(doc) {
      if (!doc || watched.has(doc)) return;
      watched.add(doc);
      try {
        const mo = new MutationObserver(function () { scheduleRefresh(); });
        mo.observe(doc.documentElement || doc, {
          subtree: true,
          childList: true,
          attributes: true,
          attributeFilter: ['src', 'class', 'style', 'hidden'],
        });
        observers.push(mo);
      } catch (e) {}
    }

    (candidates || []).forEach(function (candidate) {
      hookFrame(candidate.frame);
      watch(candidate.doc);
    });

    /* Mobile top-level screen modal: class flips open/closed. */
    const screenModal = document.getElementById('screenModal');
    if (screenModal) {
      try {
        const mo = new MutationObserver(function () { scheduleRefresh(); });
        mo.observe(screenModal, { attributes: true, attributeFilter: ['class', 'style', 'hidden'] });
        observers.push(mo);
      } catch (e) {}
    }
  }

  function collectRouteCandidates() {
    const root = routeRoot();
    if (!root) return null;
    const candidates = window.VoiceRoute.collectFrameCandidates(root, {
      getConfig: window.VoiceSlides.getSlideConfig,
    });
    candidates.forEach(function (candidate) { hookFrame(candidate.frame); });
    return candidates;
  }

  function applyOwnConfig() {
    const cfg = window.VoiceSlides.getSlideConfig(window.location.pathname);
    if (!cfg) {
      clearSelection();
      return;
    }
    if (state.config && state.config.slideId === cfg.slideId &&
        state.mountedPath === null && state.sourceWindow === null) return;
    state.config = cfg;
    state.mountedPath = null;
    state.sourceWindow = null;
    bindGestureDoc(null);
    state.stepId = null;
    state.stepIndex = 0;
    if (state.ui) state.ui.setConfig(cfg);
    if (state.dataStatus === 'ready' && state.controller) selectStep(cfg.steps[0], true);
    render();
  }

  function refreshRoute() {
    const candidates = collectRouteCandidates();
    installObservers(candidates);
    if (!candidates) {
      applyOwnConfig();
      return;
    }
    const hit = window.VoiceRoute.selectVoiceTarget(candidates, {
      origin: window.location.origin,
    });
    if (hit) applyTarget(hit);
    else applyOwnConfig();
  }

  /* Return the currently valid target only if it is still the sending window. */
  function verifiedHitFor(source) {
    const candidates = collectRouteCandidates();
    if (!candidates) return null;
    const hit = window.VoiceRoute.selectVoiceTarget(candidates, {
      origin: window.location.origin,
    });
    if (!hit || !hit.win || hit.win !== source) return null;
    return hit;
  }

  function onSlideChanged(path) {
    state.basePath = path || null;
    if (state.config) resetSelection();
    render();
    scheduleRefresh(0);
  }

  function stop(reason) {
    if (state.controller) state.controller.stop();
    if (reason === 'navigation' || reason === 'screen' || reason === 'modal') {
      resetSelection();
    }
    render();
  }

  function handleMessage(event) {
    const data = event && event.data;
    if (!data || typeof data !== 'object') return;

    /* Mount/unmount is only a hint to rescan; it can never select a target. */
    if (data.source === 'slide' && (data.type === 'voice-mount' || data.type === 'voice-unmount')) {
      if (event.origin !== window.location.origin) return;
      const frame = activeFrame();
      if (!frame || !frame.contentWindow || event.source !== frame.contentWindow) return;
      scheduleRefresh(0);
      return;
    }

    /*
     * During a slide swap the outgoing frame is still reachable but is no
     * longer the active target. Only messages from the frame that just became
     * active are allowed through; stale frames stay rejected by the verified
     * hit check below. This keeps the backward edge's goto-last-step audible.
     */
    if (isTransitioningNow()) {
      const current = activeFrame();
      if (!current || event.source !== current.contentWindow) return;
    }

    const hit = verifiedHitFor(event.source);
    if (!hit) {
      if (state.config) scheduleRefresh(0);
      return;
    }

    const check = window.VoiceProtocol.validateSlideVoiceEvent(event, {
      origin: window.location.origin,
      source: hit.win,
      slideId: hit.config.slideId,
      allowedSteps: new Set(hit.config.steps),
      allowedActions: new Set(hit.config.actions),
    });
    if (!check.ok) return;

    state.lastEvent = Object.assign({ at: Date.now() }, check.data);
    state.eventSeq += 1;

    if (!state.controller || state.mountedPath !== hit.path || state.sourceWindow !== hit.win) {
      applyTarget(hit);
    }
    if (!state.config) return;

    const payload = check.data;
    if (payload.type === 'voice-step') {
      if (state.stepId === payload.stepId) return;
      state.stepId = payload.stepId;
      state.stepIndex = payload.stepIndex;
      state.deck.step(payload.stepId, payload.stepIndex).then(render).catch(function () {});
      return;
    }

    if (payload.stepId) {
      state.stepId = payload.stepId;
      state.stepIndex = state.config.steps.indexOf(payload.stepId);
    }
    state.deck.action(payload.actionId, state.stepId).then(render).catch(function () {});
  }

  function voiceBase() {
    const path = window.location.pathname;
    return /\/slides\/|\/calc\//.test(path) ? '../shared/voice/' : 'shared/voice/';
  }

  function fetchJson(url) {
    return fetch(url, { cache: 'no-store' }).then(function (response) {
      if (!response.ok) throw new Error('HTTP ' + response.status);
      return response.json();
    });
  }

  function fetchFirst(urls) {
    return urls.reduce(function (chain, url) {
      return chain.catch(function () { return fetchJson(url); });
    }, Promise.reject(new Error('no-url')));
  }

  function fetchOptional(urls) {
    return fetchFirst(urls).catch(function () { return null; });
  }

  function loadVoiceData() {
    state.dataStatus = 'loading';
    if (state.ui) state.ui.setDataStatus('loading');
    const base = voiceBase();
    let assetBaseUrl = null;
    try {
      assetBaseUrl = window.VoiceScenario.projectRootUrl(base, window.location.href);
    } catch (e) {
      assetBaseUrl = null;
    }

    return Promise.all([
      fetchFirst([base + 'scenario.json']),
      fetchOptional([base + 'audio-manifest.json', base + 'manifest.json']),
      fetchOptional([base + 'inventory-map.json']),
    ]).then(function (rows) {
      const raw = rows[0];
      const canonical = raw && raw.meta && raw.meta.schemaVersion === 1
        ? window.VoiceScenario.validateCanonical(raw)
        : window.VoiceScenario.fromNarrationDraft(raw);
      const segments = window.VoiceScenario.buildRuntimeSegments(canonical, rows[1], {
        mapping: rows[2] || null,
        assetBaseUrl,
      });
      state.canonical = canonical;
      state.mapping = rows[2] || null;
      state.scenarioIndex = window.VoiceScenario.createScenarioIndex(segments);

      const previous = state.controller;
      const controller = createController(segments, previous);
      state.controller = controller;
      state.deck = createDeck(controller);
      state.dataStatus = 'ready';
      if (state.ui) {
        state.ui.setController(controller);
        state.ui.setDataStatus('ready');
      }
      if (previous) previous.destroy();
      if (state.config) {
        selectStep(state.config.steps[state.stepIndex || 0], true);
      } else {
        refreshRoute();
      }
      render();
    }).catch(function (error) {
      state.dataStatus = 'error';
      if (state.ui) state.ui.setDataStatus('error');
      try { console.warn('[voice] narration data could not be loaded:', error && error.message); } catch (e) {}
    });
  }

  /*
   * A content screen opened directly is its own audio owner; its emitter
   * dispatches a local event because there is no parent frame to message.
   */
  function handleLocal(event, kind) {
    const payload = event && event.detail;
    if (!payload || !state.config || !state.deck) return;
    if (payload.slideId !== state.config.slideId) return;
    state.lastEvent = Object.assign({ at: Date.now() }, payload);
    state.eventSeq += 1;
    if (kind === 'step') {
      if (!state.config.steps.includes(payload.stepId)) return;
      if (state.stepId === payload.stepId) return; /* coalesce duplicate syncs */
      state.stepId = payload.stepId;
      state.stepIndex = payload.stepIndex;
      state.deck.step(payload.stepId, payload.stepIndex).then(render).catch(function () {});
      return;
    }
    if (!state.config.actions.includes(payload.actionId)) return;
    if (payload.stepId) {
      state.stepId = payload.stepId;
      state.stepIndex = state.config.steps.indexOf(payload.stepId);
    }
    state.deck.action(payload.actionId, state.stepId).then(render).catch(function () {});
  }

  document.addEventListener('rwa-voice-step', function (event) { handleLocal(event, 'step'); });
  document.addEventListener('rwa-voice-action', function (event) { handleLocal(event, 'action'); });

  window.addEventListener('message', handleMessage);

  if (window.I18N && typeof window.I18N.onChange === 'function') {
    window.I18N.onChange(function (code) {
      if (!state.controller) return;
      state.controller.setLang(code).then(render).catch(function () {});
    });
  }

  state.controller = createController([]);
  state.deck = createDeck(state.controller);
  state.narrator = window.VoiceAutoplay.createAutoNarrator({
    getController: function () { return state.controller; },
    /* Center Play activates itself; the capture observer must not play twice. */
    ignoreSelector: '.voice-play',
  });
  state.narrator.bind(document);
  const voiceRoot = document.getElementById('voiceRoot') || document.body;
  state.hint = window.VoiceAutoplay.createLiveHint(document, voiceRoot);
  state.centerPlay = window.VoiceAutoplay.createCenterPlay(document, voiceRoot, {
    onActivate: function () {
      if (!state.controller) return;
      state.controller.unlock();
      Promise.resolve(state.controller.play()).catch(function () {}).then(render);
    },
  });

  /*
   * No permanent narration bar. The old renderer stays available only as an
   * explicit opt-in for its own compatibility tests; the presentation itself
   * shows nothing but an sr-only live region while the browser is blocking
   * sound (and even that text disappears once playback starts).
   */
  const legacyUi = window.__RWA_VOICE_LEGACY_UI__ === true;
  state.ui = legacyUi ? window.VoiceUI.mount({
    root: document.getElementById('voiceRoot'),
    controller: state.controller,
    config: state.config,
    dataStatus: state.dataStatus,
  }) : null;

  onSlideChanged(slidePath());
  refreshRoute();
  loadVoiceData();
  /* Cheap bounded reconciliation: animated hosts mutate constantly, and a
     missed class mutation must not leave a closed/open modal mis-routed. */
  setInterval(refreshRoute, 600);

  window.RwaVoice = {
    embedded: false,
    stop: stop,
    onSlideChanged: onSlideChanged,
    snapshot: function () { return state.controller ? state.controller.snapshot() : null; },
    dataStatus: function () { return state.dataStatus; },
    lastEvent: function () { return state.lastEvent; },
    eventSeq: function () { return state.eventSeq; },
    refreshRoute: refreshRoute,
    route: function () {
      return state.config ? {
        slideId: state.config.slideId,
        path: state.mountedPath,
        depth: state.mountedPath ? 1 : 0,
      } : null;
    },
    activeSourceIsFrame: function () {
      if (!state.sourceWindow) return false;
      const hit = verifiedHitFor(state.sourceWindow);
      return !!hit && hit.win === state.sourceWindow;
    },
    get controller() { return state.controller; },
    get ui() { return state.ui; },
    get hint() { return state.hint; },
    autoNarrate: true,
    get deck() { return state.deck; },
    get config() { return state.config; },
    reload: loadVoiceData,
  };
})();
