/*
 * Speaker mode helpers: gesture unlock, the sr-only blocked hint and the
 * centered Play fallback.
 *
 * The page attempts native playback on its own. When the browser rejects that
 * attempt (no prior activation) the controller sits in 'blocked' and one
 * centered Play button appears for the current playable step. Pressing it is
 * the same activation the gesture observer would perform, but the observer
 * skips the button subtree so the audio is never started twice. The button
 * disappears (and releases focus) as soon as playback really starts.
 *
 * The first REAL pointer/touch/key gesture in the top document or in the
 * active same-origin slide document also unlocks it and plays whatever step is
 * current at that moment. Synthetic events never count, and no listener is
 * installed for mousemove/scroll/typing chatter, so normal interaction never
 * restarts speech.
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
  const CENTER_PLAY_SELECTOR = '.voice-play';

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
    const ignoreSelector = typeof opts.ignoreSelector === 'string' ? opts.ignoreSelector : null;
    const bound = new Map();
    let destroyed = false;
    let retryPending = false;

    /* The center Play button owns its own activation; the observer must not
       pre-play it on pointerdown/keydown or the audio would start twice. */
    function insideIgnoredControl(event) {
      if (!ignoreSelector || !event) return false;
      const target = event.target;
      if (!target || typeof target.closest !== 'function') return false;
      try { return !!target.closest(ignoreSelector); } catch (e) { return false; }
    }

    function handle(event) {
      if (destroyed) return false;
      if (trustedOnly && event && event.isTrusted === false) return false;
      if (event && event.type === 'keydown' && MODIFIER_KEYS.has(event.key)) return false;
      if (insideIgnoredControl(event)) return false;
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

  const CENTER_PLAY = {
    ru: 'Включить звук',
    en: 'Turn sound on',
  };

  /*
   * True only for a real, actionable blocked state: a current playable step
   * whose playback the browser refused. Idle/unprepared, unsupported,
   * unavailable, disabled and already-playing states get no button.
   */
  function centerPlayVisible(snap) {
    if (!snap || snap.enabled === false) return false;
    if (!snap.currentId) return false;
    if (snap.canPlay === false) return false;
    return snap.status === 'blocked' || snap.status === 'needs-gesture';
  }

  /*
   * One centered Play button in the existing #voiceRoot. It is a plain
   * <button type="button">, so mouse, touch, Enter and Space all take the same
   * native activation path. Its own press events are contained at the button
   * (no slide navigation behind it); the document-level gesture observer skips
   * this subtree via ignoreSelector. Nothing is shown for states the user
   * cannot act on, and the button leaves the layout and drops focus as soon as
   * playback actually starts.
   */
  function createCenterPlay(doc, root, options) {
    const opts = options || {};
    if (!doc || !root) {
      return { update() { return false; }, element: null, destroy() {} };
    }

    let btn = null;
    try { btn = root.querySelector(CENTER_PLAY_SELECTOR); } catch (e) { btn = null; }
    if (!btn) {
      btn = doc.createElement('button');
      btn.className = 'voice-play';
      btn.setAttribute('type', 'button');
      btn.setAttribute('data-voice-play', '1');
      btn.innerHTML = [
        '<span class="voice-play-icon" aria-hidden="true">',
        '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7z" fill="currentColor"/></svg>',
        '</span>',
        '<span class="voice-play-label"></span>',
      ].join('');
      btn.hidden = true;
      root.appendChild(btn);
    }
    const labelEl = btn.querySelector('.voice-play-label');

    function releaseFocus() {
      try {
        const active = doc.activeElement;
        if (!active) return;
        const inside = active === btn || (typeof btn.contains === 'function' && btn.contains(active));
        if (inside && typeof btn.blur === 'function') btn.blur();
      } catch (e) {}
    }

    function update(snap) {
      const show = centerPlayVisible(snap);
      const lang = snap && snap.lang === 'ru' ? 'ru' : 'en';
      const text = CENTER_PLAY[lang];
      if (labelEl && labelEl.textContent !== text) labelEl.textContent = text;
      if (btn.getAttribute('aria-label') !== text) btn.setAttribute('aria-label', text);
      const nextHidden = !show;
      if (btn.hidden !== nextHidden) {
        btn.hidden = nextHidden;
        if (nextHidden) releaseFocus();
      }
      return show;
    }

    function activate() {
      if (btn.hidden) return;
      /* Hide optimistically so a double press cannot start two segments; a
         rejected play re-notifies the controller and update() shows it again. */
      btn.hidden = true;
      releaseFocus();
      try {
        if (typeof opts.onActivate === 'function') opts.onActivate();
      } catch (e) {
        btn.hidden = false; /* a synchronous failure must stay actionable */
      }
    }

    /* Containment lives on the button itself, so unrelated document events and
       the empty sr-only live region keep their normal behaviour. */
    const OWN_EVENTS = [
      'click', 'dblclick', 'auxclick',
      'pointerdown', 'pointerup',
      'touchstart', 'touchmove', 'touchend',
      'wheel', 'keydown', 'keyup',
    ];
    function contain(event) {
      event.stopPropagation();
    }
    for (const type of OWN_EVENTS) btn.addEventListener(type, contain);
    btn.addEventListener('click', activate);

    return {
      update,
      element: btn,
      destroy() {
        btn.removeEventListener('click', activate);
        for (const type of OWN_EVENTS) btn.removeEventListener(type, contain);
        if (btn.parentNode) btn.parentNode.removeChild(btn);
      },
    };
  }

  return {
    GESTURE_EVENTS,
    HINT,
    CENTER_PLAY,
    needsSound,
    createAutoNarrator,
    createLiveHint,
    createCenterPlay,
    centerPlayVisible,
  };
});
