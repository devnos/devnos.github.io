/*
 * Slide-side emitter. It never creates Audio, never fetches anything and does
 * not own narration outside a same-origin iframe. It observes the REAL step
 * callback / real control event and announces stable IDs only.
 */
(function () {
  'use strict';

  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  if (!window.VoiceSlides || !window.VoiceProtocol) return;

  const inFrame = window.parent && window.parent !== window;
  const config = window.VoiceSlides.getSlideConfig(window.location.pathname);
  const targetOrigin = window.VoiceProtocol.isVoiceOrigin(window.location.origin)
    ? window.location.origin
    : null;
  const isRankSlide = !!(config && config.slideId === 's09.ranks');

  let currentIndex = 0;
  const lastAction = { id: null, at: 0 };

  function announceTarget() {
    try {
      let win = window;
      while (win.parent && win.parent !== win) {
        const parent = win.parent;
        void parent.document.documentElement;
        win = parent;
      }
      return win;
    } catch (e) {
      return window.parent;
    }
  }

  const target = announceTarget();
  const enabled = !!(inFrame && config && targetOrigin && target);

  function post(message) {
    if (!enabled || !message) return false;
    try {
      target.postMessage(message, targetOrigin);
      return true;
    } catch (e) {
      return false;
    }
  }

  function local(type, detail) {
    try {
      document.dispatchEvent(new CustomEvent(type, { detail }));
    } catch (e) {}
  }

  function step(index) {
    if (!config || !Number.isInteger(index) || index < 0 || index >= config.steps.length) return false;
    /* Slide 09 commits image/prize/conditions 350-400ms after the step call.
       Refuse the step until the slide itself reports exactly this rank. */
    if (isRankSlide) {
      const ranks = window.RwaRanks;
      if (ranks && typeof ranks.committedStep === 'function') {
        let committed = null;
        try { committed = ranks.committedStep(); } catch (e) { committed = null; }
        if (committed !== index) return false;
      }
    }
    currentIndex = index;
    const payload = window.VoiceSlides.buildVoiceStep(config, index);
    local('rwa-voice-step', payload);
    post(payload);
    return true;
  }

  function action(actionId, stepId) {
    if (!config || !config.actions.includes(actionId)) return false;
    const now = Date.now();
    if (lastAction.id === actionId && now - lastAction.at < 300) return false;
    lastAction.id = actionId;
    lastAction.at = now;
    const payload = window.VoiceSlides.buildVoiceAction(config, actionId, stepId || config.steps[currentIndex]);
    local('rwa-voice-action', payload);
    return post(payload);
  }

  /* Observe the slide's existing step state; never re-implement transitions. */
  let lastIndex = null;

  function readIndex() {
    try {
      if (window.SlideEngine && typeof window.SlideEngine.getCurrentStep === 'function') {
        return window.SlideEngine.getCurrentStep();
      }
    } catch (e) {}
    if (Number.isInteger(window._currentStep)) return window._currentStep - 1;
    return null;
  }

  function syncStep() {
    const index = readIndex();
    if (index === null || index === lastIndex) return;
    if (step(index)) lastIndex = index;
  }

  function wrapApplyStep() {
    if (typeof window.applyStep !== 'function' || window.applyStep.__rwaVoiceWrapped) return;
    const original = window.applyStep;
    const wrapped = function (n) {
      const result = original.apply(this, arguments);
      if (Number.isInteger(n) && n !== lastIndex && step(n)) lastIndex = n;
      return result;
    };
    wrapped.__rwaVoiceWrapped = true;
    try { window.applyStep = wrapped; } catch (e) {}
  }

  /* SlideEngine-based screens (06, 09, 10, 04) call a global 1-based step(n). */
  function wrapStepCallback() {
    if (typeof window.step !== 'function' || window.step.__rwaVoiceWrapped) return;
    const original = window.step;
    const wrapped = function (n) {
      const result = original.apply(this, arguments);
      if (Number.isInteger(n) && n - 1 !== lastIndex && step(n - 1)) lastIndex = n - 1;
      return result;
    };
    wrapped.__rwaVoiceWrapped = true;
    try { window.step = wrapped; } catch (e) {}
  }

  function startObservers() {
    wrapStepCallback();
    wrapApplyStep();
    syncStep();
    setInterval(function () {
      syncStep();
      wrapApplyStep();
    }, 150);
  }

  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    setTimeout(startObservers, 0);
  } else {
    window.addEventListener('load', startObservers);
  }

  /* Real controls declare a semantic action; range `input` chatter is ignored. */
  document.addEventListener('click', function (event) {
    const node = event.target && event.target.closest ? event.target.closest('[data-voice-action]') : null;
    if (node) action(node.getAttribute('data-voice-action'), node.getAttribute('data-voice-step') || null);
  }, true);

  document.addEventListener('change', function (event) {
    const node = event.target;
    if (!node || !node.getAttribute) return;
    if (node.type === 'range') return; /* no slider chatter */
    const id = node.getAttribute('data-voice-action');
    if (id) action(id, node.getAttribute('data-voice-step') || null);
  }, true);

  document.addEventListener('rwa-voice-request-action', function (event) {
    const detail = event && event.detail;
    if (detail && typeof detail.actionId === 'string') action(detail.actionId, detail.stepId || null);
  });

  window.VoiceSlide = {
    enabled,
    config,
    step,
    action,
    currentStep() { return config ? config.steps[currentIndex] : null; },
  };
})();
