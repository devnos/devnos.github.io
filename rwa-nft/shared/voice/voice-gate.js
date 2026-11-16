/*
 * Strict start gate for the presentation.
 *
 * The deck must not react to ANY user action until the one round Play control
 * is pressed. This module is loaded early in <head>, before the page's own
 * navigation scripts, and installs:
 *
 *   - a transparent fixed shield over the viewport with the Play button on top;
 *   - capture-phase guards on the owning top document (pointer, click, touch,
 *     wheel, keys, contextmenu) and on every reachable same-origin frame;
 *   - inert page content, locked document scroll, and prevention of iframe
 *     navigation messages;
 *   - quarantine of timers scheduled before Play so a queued callback cannot
 *     navigate after the start.
 *
 * The Play button follows the existing loading screen: it is created with the
 * shield but stays hidden until the page's real readiness signal (`#loader`
 * gets its hidden state / is removed / is not present at all). No arbitrary
 * timer decides that. Pressing Play removes the shield, restores the page
 * exactly as it was and calls the registered start handlers synchronously, so
 * the browser still sees a genuine user gesture for the MP3.
 *
 * Frames never get a second gate or a second button. Every page opened on its
 * own is its own top document and therefore gets its own start.
 */
(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.VoiceGate = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const LABELS = {
    ru: 'Включить звук',
    en: 'Turn sound on',
  };

  const GUARD_EVENTS = [
    'pointerdown', 'pointerup', 'mousedown', 'mouseup',
    'click', 'dblclick', 'auxclick',
    'touchstart', 'touchmove', 'touchend',
    'wheel', 'keydown', 'keyup', 'keypress',
    'contextmenu', 'dragstart',
  ];

  /* Events the gate button keeps for its own native activation. */
  const BUTTON_EVENTS = new Set([
    'pointerdown', 'pointerup', 'mousedown', 'mouseup',
    'click', 'dblclick', 'auxclick', 'touchstart', 'touchend',
  ]);
  const BUTTON_KEYS = new Set(['Enter', ' ', 'Spacebar', 'Tab']);
  const BUTTON_KEY_EVENTS = ['keydown', 'keyup', 'keypress'];

  function createStartGate(options) {
    const opts = options || {};
    const doc = opts.doc;
    const win = opts.win || (doc && doc.defaultView) || null;
    const isTop = opts.isTop !== false;
    const loaderSelector = typeof opts.loaderSelector === 'string' ? opts.loaderSelector : 'loader';

    let locked = isTop;
    let started = !isTop;
    let ready = false;
    let installed = false;
    let overlay = null;
    let btn = null;
    let loaderEl = null;
    let loaderObserver = null;
    let frameTimer = null;
    let overflowSaved = null;
    let droppedTimers = 0;
    let nativeSetTimeout = null;
    let wrappedSetTimeout = null;
    const startHandlers = [];
    const guardDocs = new Map();
    const inertDocs = new Map();

    /* ------------------------------------------------------------------ */
    /* Shared helpers                                                      */

    function lang() {
      try {
        if (win && win.I18N && typeof win.I18N.current === 'string' && win.I18N.current) {
          return win.I18N.current === 'ru' ? 'ru' : 'en';
        }
      } catch (e) {}
      try {
        const attr = doc.documentElement && doc.documentElement.getAttribute
          ? doc.documentElement.getAttribute('lang')
          : null;
        if (attr) return String(attr).toLowerCase().indexOf('ru') === 0 ? 'ru' : 'en';
      } catch (e) {}
      return 'ru';
    }

    function applyLabel() {
      if (!btn) return;
      const text = LABELS[lang()] || LABELS.en;
      if (btn.getAttribute('aria-label') !== text) btn.setAttribute('aria-label', text);
    }

    function stop(event) {
      if (!event) return false;
      try {
        if (event.cancelable !== false && typeof event.preventDefault === 'function') event.preventDefault();
      } catch (e) {}
      try {
        if (typeof event.stopImmediatePropagation === 'function') event.stopImmediatePropagation();
        else if (typeof event.stopPropagation === 'function') event.stopPropagation();
      } catch (e) {}
      return false;
    }

    function contain(event) {
      try { if (event && typeof event.stopPropagation === 'function') event.stopPropagation(); } catch (e) {}
    }

    function isButtonTarget(event) {
      const target = event && event.target;
      if (!btn || !target) return false;
      if (target === btn) return true;
      try {
        if (typeof btn.contains === 'function' && btn.contains(target)) return true;
      } catch (e) {}
      try {
        if (typeof target.closest === 'function' && target.closest('.voice-gate-play')) return true;
      } catch (e) {}
      return false;
    }

    /* ------------------------------------------------------------------ */
    /* Capture guards                                                      */

    function guard(event) {
      if (!locked || !event) return true;
      const type = event.type;
      if (type === 'message') return stop(event);

      const onButton = isButtonTarget(event);
      if (onButton) {
        if (BUTTON_EVENTS.has(type)) return true;
        if ((type === 'keydown' || type === 'keyup' || type === 'keypress') && BUTTON_KEYS.has(event.key)) {
          return true;
        }
      }
      /* Tab may leave the gate for browser chrome; page content itself is inert. */
      if (type === 'keydown' && event.key === 'Tab') return true;
      return stop(event);
    }

    function frameGuard(event) {
      if (!locked || !event) return true;
      return stop(event);
    }

    function guardMessage(event) {
      if (!locked || !event) return;
      stop(event);
    }

    function bindDoc(target, handler) {
      if (!target || guardDocs.has(target) || typeof target.addEventListener !== 'function') return false;
      for (const type of GUARD_EVENTS) {
        const options = (type === 'wheel' || type === 'touchstart' || type === 'touchmove')
          ? { capture: true, passive: false }
          : { capture: true };
        try { target.addEventListener(type, handler, options); } catch (e) {}
      }
      guardDocs.set(target, handler);
      return true;
    }

    function unbindDoc(target) {
      const handler = guardDocs.get(target);
      if (!handler) return;
      for (const type of GUARD_EVENTS) {
        try { target.removeEventListener(type, handler, { capture: true }); } catch (e) {}
      }
      guardDocs.delete(target);
    }

    function applyInert(targetDoc) {
      if (!targetDoc || !targetDoc.body) return;
      if (!inertDocs.has(targetDoc)) inertDocs.set(targetDoc, targetDoc.body.inert === true);
      try { targetDoc.body.inert = true; } catch (e) {}
    }

    function releaseInert() {
      for (const entry of Array.from(inertDocs.entries())) {
        const targetDoc = entry[0];
        try { if (targetDoc.body) targetDoc.body.inert = entry[1]; } catch (e) {}
      }
      inertDocs.clear();
    }

    /* ------------------------------------------------------------------ */
    /* Scroll lock                                                         */

    function lockOverflow() {
      const html = doc && doc.documentElement;
      const body = doc && doc.body;
      if (!overflowSaved) {
        overflowSaved = {html: undefined, body: undefined, htmlSeen: false, bodySeen: false};
      }
      if (html && html.style && !overflowSaved.htmlSeen) {
        overflowSaved.html = html.style.overflow;
        overflowSaved.htmlSeen = true;
      }
      if (body && !overflowSaved.bodySeen) {
        if (!body.style) body.style = {};
        overflowSaved.body = body.style.overflow;
        overflowSaved.bodySeen = true;
      }
      if (html && !html.style) html.style = {};
      if (body && !body.style) body.style = {};
      if (html && html.style) html.style.overflow = 'hidden';
      if (body && body.style) body.style.overflow = 'hidden';
    }

    function restoreOverflow() {
      if (!overflowSaved) return;
      const html = doc && doc.documentElement;
      const body = doc && doc.body;
      try {
        if (html && html.style && overflowSaved.htmlSeen) {
          html.style.overflow = overflowSaved.html === undefined ? '' : overflowSaved.html;
        }
      } catch (e) {}
      try {
        if (body && body.style && overflowSaved.bodySeen) {
          body.style.overflow = overflowSaved.body === undefined ? '' : overflowSaved.body;
        }
      } catch (e) {}
      overflowSaved = null;
    }

    /* ------------------------------------------------------------------ */
    /* Timer quarantine                                                    */

    function wrapTimers() {
      if (!win || typeof win.setTimeout !== 'function' || win.__voiceGateTimerWrapped) return;
      nativeSetTimeout = win.setTimeout;
      wrappedSetTimeout = function (fn, delay) {
        if (typeof fn !== 'function') return nativeSetTimeout.apply(win, arguments);
        const args = Array.prototype.slice.call(arguments, 2);
        const scheduledWhileLocked = locked;
        return nativeSetTimeout.call(win, function () {
          if (scheduledWhileLocked && !locked) {
            droppedTimers += 1;
            return undefined;
          }
          return fn.apply(this, args);
        }, delay);
      };
      win.setTimeout = wrappedSetTimeout;
      win.__voiceGateTimerWrapped = true;
    }

    function restoreTimers() {
      if (!win) return;
      if (nativeSetTimeout && win.setTimeout === wrappedSetTimeout) win.setTimeout = nativeSetTimeout;
      try { delete win.__voiceGateTimerWrapped; } catch (e) {}
    }

    /* ------------------------------------------------------------------ */
    /* Frames                                                              */

    function bindFrame(frameDoc) {
      if (!isTop || !locked || !frameDoc || frameDoc === doc) return false;
      let bound = false;
      if (!guardDocs.has(frameDoc)) bound = bindDoc(frameDoc, frameGuard);
      /* Re-apply every scan: a frame may finish loading after the first bind,
         and a replaced document/body must not silently regain focus. */
      applyInert(frameDoc);
      return bound;
    }

    function scanDocument(targetDoc, depth) {
      if (!targetDoc || depth > 4 || !targetDoc.querySelectorAll) return;
      let frames = [];
      try { frames = Array.prototype.slice.call(targetDoc.querySelectorAll('iframe')); } catch (e) { frames = []; }
      for (const frame of frames) {
        let frameDoc = null;
        try { frameDoc = frame.contentDocument; } catch (e) { frameDoc = null; }
        if (!frameDoc) continue;
        bindFrame(frameDoc);
        scanDocument(frameDoc, depth + 1);
      }
    }

    function scanFrames() {
      if (locked && isTop && doc) scanDocument(doc, 0);
    }

    function onFrameLoad(event) {
      if (!locked) return;
      const target = event && event.target;
      if (!target || String(target.tagName || '').toUpperCase() !== 'IFRAME') return;
      let frameDoc = null;
      try { frameDoc = target.contentDocument; } catch (e) { frameDoc = null; }
      if (frameDoc) {
        bindFrame(frameDoc);
        scanDocument(frameDoc, 1);
      }
    }

    /* ------------------------------------------------------------------ */
    /* Loading screen sequencing                                           */

    function loaderDone(el) {
      if (!el) return true;
      if (!el.parentNode) return true;
      if (el.hidden === true) return true;
      // A hidden class can begin a fade while the loader is still painted.
      if (win && typeof win.getComputedStyle === 'function') {
        try {
          const cs = win.getComputedStyle(el);
          if (cs) return cs.display === 'none' || cs.visibility === 'hidden' || parseFloat(cs.opacity) <= 0.001;
        } catch (e) {}
      }
      try { if (el.classList && el.classList.contains('hidden')) return true; } catch (e) {}
      try {
        const aria = el.getAttribute && el.getAttribute('aria-hidden');
        if (aria === 'true') return true;
      } catch (e) {}
      const style = el.style || null;
      if (style) {
        if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return true;
      }
      return false;
    }

    function currentLoader() {
      if (!doc) return null;
      try { return doc.getElementById(loaderSelector); } catch (e) { return null; }
    }

    function paintReady() {
      if (!btn) return;
      const nextHidden = !ready;
      if (btn.hidden !== nextHidden) btn.hidden = nextHidden;
      if (ready && locked && !started && typeof btn.focus === 'function') {
        try { btn.focus(); } catch (e) {}
      }
    }

    function syncReady() {
      const next = loaderDone(currentLoader());
      const changed = next !== ready;
      ready = next;
      if (changed) paintReady();
      if (ready && loaderObserver) {
        try { loaderObserver.disconnect(); } catch (e) {}
        loaderObserver = null;
      }
      return ready;
    }

    function watchLoader() {
      const el = currentLoader();
      loaderEl = el;
      if (!el) {
        ready = true;
        paintReady();
        return;
      }
      el.addEventListener('transitionend', syncReady);
      el.addEventListener('transitioncancel', syncReady);
      const Ctor = (win && win.MutationObserver) ||
        (typeof MutationObserver !== 'undefined' ? MutationObserver : null);
      if (!Ctor) {
        syncReady();
        return;
      }
      try {
        loaderObserver = new Ctor(function () { syncReady(); });
        loaderObserver.observe(el, { attributes: true, attributeFilter: ['class', 'style', 'hidden', 'aria-hidden'] });
        if (el.parentNode) loaderObserver.observe(el.parentNode, { childList: true });
      } catch (e) {
        loaderObserver = null;
      }
      syncReady();
    }

    /* ------------------------------------------------------------------ */
    /* Overlay + button                                                    */

    function mount() {
      if (overlay || !doc || !doc.documentElement) return false;
      overlay = doc.createElement('div');
      overlay.className = 'voice-gate';
      overlay.setAttribute('data-voice-gate', '1');
      overlay.setAttribute('role', 'dialog');
      overlay.setAttribute('aria-modal', 'true');

      btn = doc.createElement('button');
      btn.className = 'voice-play voice-gate-play';
      btn.setAttribute('type', 'button');
      btn.setAttribute('data-voice-start', '1');
      btn.innerHTML = [
        '<span class="voice-play-icon" aria-hidden="true">',
        '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7z" fill="currentColor"/></svg>',
        '</span>',
      ].join('');
      btn.hidden = true;
      applyLabel();
      /* The activating press must not reach the slide's own click/step
         handlers in a standalone page after the shield is removed. */
      for (const type of BUTTON_EVENTS) btn.addEventListener(type, contain);
      for (const type of BUTTON_KEY_EVENTS) btn.addEventListener(type, contain);
      btn.addEventListener('click', activate);

      overlay.appendChild(btn);
      doc.documentElement.appendChild(overlay);
      return true;
    }

    /* ------------------------------------------------------------------ */
    /* Lifecycle                                                           */

    function install() {
      if (installed) return api;
      installed = true;
      if (!isTop || !doc) {
        started = true;
        locked = false;
        return api;
      }
      bindDoc(doc, guard);
      try {
        if (doc.documentElement && doc.documentElement.classList) {
          doc.documentElement.classList.add('voice-gate-locked');
        }
      } catch (e) {}
      if (win && typeof win.addEventListener === 'function') {
        try { win.addEventListener('message', guardMessage, true); } catch (e) {}
      }
      try { doc.addEventListener('load', onFrameLoad, true); } catch (e) {}
      lockOverflow();
      applyInert(doc);
      wrapTimers();
      if (win && win.I18N && typeof win.I18N.onChange === 'function') {
        try { win.I18N.onChange(applyLabel); } catch (e) {}
      }

      if (doc.body) {
        mount();
        watchLoader();
      } else {
        doc.addEventListener('DOMContentLoaded', function () {
          if (!doc.body) return;
          lockOverflow();
          applyInert(doc);
          mount();
          watchLoader();
          scanFrames();
        }, { once: true });
      }

      scanFrames();
      if (win && typeof win.setInterval === 'function') {
        frameTimer = win.setInterval(scanFrames, 700);
      }
      return api;
    }

    function teardown() {
      try {
        if (doc && doc.documentElement && doc.documentElement.classList) {
          doc.documentElement.classList.remove('voice-gate-locked');
        }
      } catch (e) {}
      for (const target of Array.from(guardDocs.keys())) unbindDoc(target);
      if (win && typeof win.removeEventListener === 'function') {
        try { win.removeEventListener('message', guardMessage, true); } catch (e) {}
      }
      if (doc) {
        try { doc.removeEventListener('load', onFrameLoad, true); } catch (e) {}
      }
      if (frameTimer !== null && win && typeof win.clearInterval === 'function') {
        try { win.clearInterval(frameTimer); } catch (e) {}
      }
      frameTimer = null;
      if (loaderObserver) {
        try { loaderObserver.disconnect(); } catch (e) {}
        loaderObserver = null;
      }
      releaseInert();
      if (loaderEl) {
        loaderEl.removeEventListener('transitionend', syncReady);
        loaderEl.removeEventListener('transitioncancel', syncReady);
      }
      restoreOverflow();
      restoreTimers();
      if (btn && typeof btn.removeEventListener === 'function') {
        try { btn.removeEventListener('click', activate); } catch (e) {}
        for (const type of BUTTON_EVENTS) {
          try { btn.removeEventListener(type, contain); } catch (e) {}
        }
        for (const type of BUTTON_KEY_EVENTS) {
          try { btn.removeEventListener(type, contain); } catch (e) {}
        }
      }
      if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
      overlay = null;
    }

    function activate() {
      if (!isTop || started || !locked) return false;
      if (!ready) return false;
      started = true;
      locked = false;
      const handlers = startHandlers.slice();
      teardown();
      ready = false;
      for (const fn of handlers) {
        try { fn(); } catch (e) {}
      }
      return true;
    }

    function onStart(fn) {
      if (typeof fn !== 'function') return function () {};
      if (started) {
        try { fn(); } catch (e) {}
        return function () {};
      }
      startHandlers.push(fn);
      return function () {
        const index = startHandlers.indexOf(fn);
        if (index >= 0) startHandlers.splice(index, 1);
      };
    }

    const api = {
      install,
      activate,
      syncReady,
      bindFrame,
      scanFrames,
      guard,
      onStart,
      started: function () { return started; },
      locked: function () { return locked; },
      ready: function () { return ready; },
      droppedTimers: function () { return droppedTimers; },
      get button() { return btn; },
      get overlay() { return overlay; },
      get loader() { return loaderEl; },
    };

    if (isTop) install();
    return api;
  }

  const api = { createStartGate };

  /* Auto-install only in a real browser top document. */
  if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    let instance = null;
    let top = false;
    try { top = window.top === window; } catch (e) { top = false; }
    try {
      instance = createStartGate({ doc: document, win: window, isTop: top });
    } catch (e) {
      instance = null;
    }
    api.instance = instance;
    api.started = function () { return instance ? instance.started() : true; };
    api.locked = function () { return instance ? instance.locked() : false; };
    api.ready = function () { return instance ? instance.ready() : true; };
    api.onStart = function (fn) { return instance ? instance.onStart(fn) : (typeof fn === 'function' ? (fn(), function () {}) : function () {}); };
    api.activate = function () { return instance ? instance.activate() : false; };
    api.syncReady = function () { return instance ? instance.syncReady() : true; };
    api.droppedTimers = function () { return instance ? instance.droppedTimers() : 0; };
    api.bindFrame = function (frameDoc) { return instance ? instance.bindFrame(frameDoc) : false; };
  }

  return api;
});
