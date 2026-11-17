/*
 * Deck-level routing between validated slide events and the voice controller.
 * Keeps "follow the slide" behaviour in one place so index.html only wires
 * message validation and UI.
 */
(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.VoiceDeck = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function createDeckVoice(options) {
    const opts = options || {};
    const controller = opts.controller;
    const config = opts.config;
    /*
     * Speaker mode: every visible navigation speaks, even before the first
     * gesture (the browser may reject it; the controller records 'blocked' and
     * the first gesture retries the current step). Legacy callers keep the
     * gesture-armed gate.
     */
    const autoNarrate = opts.autoNarrate === true;
    let lastRoutedStep = null;

    function activeConfig() {
      return typeof opts.getConfig === 'function' ? opts.getConfig() : config;
    }

    function stepTarget(stepId, cfg) {
      if (typeof opts.resolveStep === 'function') {
        const resolved = opts.resolveStep(stepId, cfg);
        return resolved || null;
      }
      return cfg.steps.includes(stepId) ? stepId : null;
    }

    function actionTarget(actionId, stepId, cfg) {
      if (typeof opts.resolveAction === 'function') {
        const resolved = opts.resolveAction(actionId, stepId, cfg);
        if (resolved) return { id: resolved, kind: 'action' };
      } else if (controllerHas(actionId)) {
        /* Legacy flat-id controller: action rows are addressed directly. */
        return { id: actionId, kind: 'action' };
      }
      /* No action-triggered segment: fall back to the current step's narration. */
      const fallback = (stepId && stepTarget(stepId, cfg)) || (cfg.steps.length ? stepTarget(cfg.steps[0], cfg) : null);
      return fallback ? { id: fallback, kind: 'step' } : null;
    }

    function controllerHas(id) {
      try {
        return !!controller.snapshot && id === controller.snapshot().currentId
          ? true
          : typeof opts.hasSegment === 'function'
            ? opts.hasSegment(id)
            : true;
      } catch (e) {
        return false;
      }
    }

    function isActive() {
      const status = controller.snapshot().status;
      return status === 'playing' || status === 'starting';
    }

    function isPaused() {
      return controller.snapshot().status === 'paused';
    }

    /*
     * Once the presenter has explicitly started narration once, paging keeps
     * speaking in the current language even after a pause or a finished
     * paragraph. Before that gesture the deck stays silent: the browser would
     * block it and the bar honestly offers "Start with sound". An explicit
     * mute disarms this, and language switching does not re-arm it.
     */
    function followsNavigation() {
      const snap = controller.snapshot();
      if (snap.enabled === false) return false;
      return autoNarrate === true || snap.armed === true;
    }

    function currentId() {
      try {
        const snap = controller.snapshot();
        return snap ? snap.currentId : null;
      } catch (e) {
        return null;
      }
    }

    /* Grouped steps can share one recording. Selecting it again would seek or
       restart the same file, so keep playback and position untouched. */
    function unchanged() {
      const snap = controller.snapshot();
      return { ok: true, status: snap ? snap.status : null, unchanged: true };
    }

    async function step(stepId, stepIndex) {
      const cfg = activeConfig();
      if (!cfg || !cfg.steps.includes(stepId)) {
        return { ok: false, reason: 'bad-step' };
      }
      const target = stepTarget(stepId, cfg);
      if (!target) return { ok: false, reason: 'no-segment' };
      const stepKey = cfg.slideId + ':' + stepId;
      const previousStep = lastRoutedStep;
      const distinctStep = stepKey !== previousStep;
      lastRoutedStep = stepKey;
      /* An explicit visual continuation keeps the paragraph already heard.
         Match its actual source step, including duplicate notifications; a
         fresh entry or unrelated current recording must still narrate. */
      const continuedFrom = cfg.continueNarrationFrom && cfg.continueNarrationFrom[stepId];
      if (continuedFrom && cfg.steps.includes(continuedFrom) &&
          (previousStep === cfg.slideId + ':' + continuedFrom || previousStep === stepKey) &&
          currentId() === stepTarget(continuedFrom, cfg) &&
          ['playing', 'starting', 'ended', 'paused'].includes(controller.snapshot().status)) {
        return unchanged();
      }
      if (target === currentId()) {
        if (autoNarrate && distinctStep && followsNavigation()) {
          if (controller.snapshot().unlocked && typeof controller.repeat === 'function') {
            return controller.repeat();
          }
          return controller.select(target, { autoplay: true });
        }
        return unchanged();
      }
      return controller.select(target, {
        autoplay: followsNavigation(),
        paused: isPaused(),
      });
    }

    async function action(actionId, stepId) {
      const cfg = activeConfig();
      if (!cfg || !cfg.actions.includes(actionId)) {
        return { ok: false, reason: 'bad-action' };
      }
      const playing = isActive();
      const paused = isPaused();

      /* Closing a nested window is a return to the parent screen, not a new
         narration. Selecting the parent with autoplay would restart a
         paragraph the user has already heard (and, at a fresh route, replay
         the first step). Keep the parent identity but leave it paused: a
         'ready' segment is retried by the gesture narrator on the next
         unrelated tap. Legacy callers keep the old silent-select shape. */
      if (actionId.endsWith('.close')) {
        controller.stop();
        const step = stepId && cfg.steps.includes(stepId) ? stepId : cfg.steps[0];
        if (!autoNarrate) {
          return controller.select(step, { autoplay: false });
        }
        const target = stepTarget(step, cfg);
        if (!target) return { ok: false, reason: 'no-segment' };
        return controller.select(target, { autoplay: false, paused: true });
      }

      const target = actionTarget(actionId, stepId, cfg);
      if (!target) return { ok: false, reason: 'no-segment' };
      /* An action with no narration of its own falls back to the current step.
         That fallback must not rewind the default paragraph already playing;
         a real action segment (kind 'action') still selects and replays. */
      if (target.kind === 'step' && target.id === currentId()) return unchanged();
      return controller.select(target.id, {
        autoplay: autoNarrate ? followsNavigation() : playing,
        paused,
      });
    }

    function navigate() {
      return controller.stop();
    }

    return { step, action, navigate };
  }

  return { createDeckVoice };
});
