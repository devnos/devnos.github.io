/*
 * Speaker mode helpers: gesture unlock and the sr-only blocked hint.
 *
 * The page attempts native playback on its own. When the browser rejects that
 * attempt (no prior activation) the controller sits in 'blocked'. The first
 * REAL pointer/touch/key gesture in the top document or in the active
 * same-origin slide document unlocks it and plays whatever step is current at
 * that moment. Synthetic events never count, and no listener is installed for
 * mousemove/scroll/typing chatter, so normal interaction never restarts speech.
 *
 * Nothing here prevents default actions: navigation, focus and text input keep
 * working while the gesture is observed.
 */
(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.VoiceAutoplay = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const GESTURE_EVENTS = ['pointerdown', 'touchstart', 'keydown'];
  const MODIFIER_KEYS = new Set([
    'Shift', 'Control', 'Alt', 'Meta', 'CapsLock', 'NumLock', 'ScrollLock', 'Dead', 'Unidentified',
  ]);

  function needsSound(snap) {
    if (!snap || snap.enabled === false) return false;
    if (!snap.currentId) return false;
    if (snap.canPlay === false) return false;
    if (snap.status === 'unsupported' || snap.status === 'unavailable') return false;
    return snap.status === 'blocked' ||
      snap.status === 'needs-gesture' ||
      snap.status === 'idle' ||
      snap.status === 'ready';
  }

  function createAutoNarrator(options) {
    const opts = options || {};
    const getController = typeof opts.getController === 'function'
      ? opts.getController
      : function () { return opts.controller || null; };
    const trustedOnly = opts.trustedOnly !== false;
    const bound = new Map();
    let destroyed = false;
    let retryPending = false;

    function handle(event) {
      if (destroyed) return false;
      if (trustedOnly && event && event.isTrusted === false) return false;
      if (event && event.type === 'keydown' && MODIFIER_KEYS.has(event.key)) return false;
      if (retryPending) return false;

      const controller = getController();
      if (!controller || typeof controller.snapshot !== 'function' || typeof controller.play !== 'function') {
        return false;
      }
      if (!needsSound(controller.snapshot())) return false;

      retryPending = true;
      try {
        if (typeof controller.unlock === 'function') controller.unlock();
        Promise.resolve(controller.play()).catch(function () {}).then(function () {
          retryPending = false;
        });
      } catch (e) {
        retryPending = false;
        return false;
      }
      return true;
    }

    function bind(doc) {
      if (destroyed || !doc || bound.has(doc) || typeof doc.addEventListener !== 'function') return false;
      for (const type of GESTURE_EVENTS) {
        doc.addEventListener(type, handle, { capture: true, passive: true });
      }
      bound.set(doc, handle);
      return true;
    }

    function unbind(doc) {
      const handler = doc && bound.get(doc);
      if (!handler) return false;
      for (const type of GESTURE_EVENTS) {
        try { doc.removeEventListener(type, handler, { capture: true }); } catch (e) {}
      }
      bound.delete(doc);
      return true;
    }

    function destroy() {
      destroyed = true;
      for (const doc of Array.from(bound.keys())) unbind(doc);
    }

    function boundDocuments() {
      return Array.from(bound.keys());
    }

    return { bind, unbind, destroy, handle, boundDocuments, needsSound };
  }

  const HINT = {
    ru: 'Коснитесь экрана, чтобы включить звук',
    en: 'Touch the screen to turn sound on',
  };

  function createLiveHint(doc, root) {
    if (!doc || !root) {
      return { update() {}, element: null };
    }
    let el = null;
    try { el = root.querySelector('.voice-live'); } catch (e) { el = null; }
    if (!el) {
      el = doc.createElement('span');
      el.className = 'voice-live';
      el.setAttribute('aria-live', 'polite');
      el.setAttribute('aria-atomic', 'true');
      el.setAttribute('role', 'status');
      el.textContent = '';
      root.appendChild(el);
    }

    function update(snap) {
      const blocked = !!snap && (snap.status === 'blocked' || snap.status === 'needs-gesture');
      const lang = snap && snap.lang === 'ru' ? 'ru' : 'en';
      const next = blocked ? HINT[lang] : '';
      if (el.textContent !== next) el.textContent = next;
    }

    return { update, element: el };
  }

  return { GESTURE_EVENTS, HINT, needsSound, createAutoNarrator, createLiveHint };
});
