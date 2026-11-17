/*
 * Strict start gate for the presentation.
 *
 * The deck must not navigate or play narration until the round Play control
 * is pressed; language selection remains available on the startup screen.
 * This module is loaded early in <head>, before the page's own
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

  const HELP = {
    ru: {
      toggle: 'Как управлять',
      title: 'Как управлять',
      close: 'Закрыть справку',
      arrows: 'Стрелки ← → и колёсико мыши переключают шаги',
      swipe: 'Свайп влево - дальше, вправо - назад',
      click: 'Клик по свободной области продолжает шаг',
      wait: 'Пока звучит объяснение, переходы заблокированы',
      gesture: 'Когда появится стрелка, переходите дальше',
      scroll: 'Свайпы и прокрутка во время озвучки не накапливаются',
      menu: 'Двойная стрелка внизу справа открывает меню разделов',
      home: 'Домик внизу слева возвращает в начало',
      fullscreen: 'Рамка вверху слева включает полный экран',
      lang: 'Флаг переключает язык озвучки: RU или EN',
      langMobile: 'Флаг слева внизу переключает язык озвучки: RU или EN',
      sound: 'Звук объясняет каждый шаг',
    },
    en: {
      toggle: 'How to control',
      title: 'How to control',
      close: 'Close help',
      arrows: 'The ← → arrows and the mouse wheel move between steps',
      swipe: 'Swipe left - next, right - back',
      click: 'Click empty space to continue the step',
      wait: 'While the narration plays, moving to another step is blocked',
      gesture: 'When the arrow appears, move on',
      scroll: 'Swipes and scrolling during narration are not queued',
      menu: 'The double arrow at the bottom right opens the section menu',
      home: 'The home icon at the bottom left returns to the start',
      fullscreen: 'The frame icon at the top left toggles full screen',
      lang: 'The flag switches the narration language: RU or EN',
      langMobile: 'The flag at the bottom left switches the narration language: RU or EN',
      sound: 'The narration explains each step',
    },
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
    let fadeTimer = null;
    const startHandlers = [];
    const guardDocs = new Map();
    const inertDocs = new Map();
    const languageControls = [];

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
      const text = LABELS[lang()] || LABELS.en;
      if (btn && btn.getAttribute('aria-label') !== text) btn.setAttribute('aria-label', text);
      if (overlay && overlay.getAttribute('aria-label') !== text) overlay.setAttribute('aria-label', text);
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
      /* Only language pointer gestures pass before Play; navigation keys and
         every action during the startup fade remain guarded. */
      if (!started && ready && BUTTON_EVENTS.has(type)) {
        let target = event.target;
        while (target && target !== overlay) {
          if (languageControls.some(entry => entry.node === target)) return true;
          target = target.parentNode;
        }
      }

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
        /* Only work queued BEFORE the explicit Play is quarantined. The fade
           timer and every timer created while the presentation starts normally
           must run, so the deck is never silently broken by its own startup. */
        const queuedBeforeStart = !started;
        return nativeSetTimeout.call(win, function () {
          if (queuedBeforeStart && started) {
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
      if (overlay) {
        try { overlay.classList.toggle('voice-gate-ready', ready); } catch (e) {}
      }
      if (ready && locked && !started && typeof btn.focus === 'function') {
        try { btn.focus(); } catch (e) {}
      }
    }

    function syncReady() {
      const voiceStatus = win && win.RwaVoice && typeof win.RwaVoice.dataStatus === 'function'
        ? win.RwaVoice.dataStatus() : 'loading';
      const voiceReady = opts.requireVoiceReady !== true || voiceStatus === 'ready' || voiceStatus === 'error';
      const next = loaderDone(currentLoader()) && voiceReady;
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
        syncReady();
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
      /* Reuse the real controls and their listeners above the scrim, outside
         the inert body. Restore their exact DOM position when the gate exits. */
      for (const id of ['langBtn', 'langPanel']) {
        const node = doc.getElementById(id);
        if (!node || !node.parentNode) continue;
        const parent = node.parentNode;
        languageControls.push({ node, parent, next: node.nextSibling });
        parent.removeChild(node);
        overlay.appendChild(node);
      }
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
      if (fadeTimer !== null && win && typeof win.clearTimeout === 'function') {
        try { win.clearTimeout(fadeTimer); } catch (e) {}
      }
      fadeTimer = null;
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
      for (const entry of languageControls.splice(0).reverse()) {
        if (entry.node.parentNode) entry.node.parentNode.removeChild(entry.node);
        if (entry.next && entry.next.parentNode === entry.parent) {
          entry.parent.insertBefore(entry.node, entry.next);
        } else {
          entry.parent.appendChild(entry.node);
        }
      }
      if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
      overlay = null;
    }

    function fadeDuration() {
      const fallback = typeof opts.fadeMs === 'number' ? opts.fadeMs : 340;
      try {
        if (win && typeof win.matchMedia === 'function') {
          const reduce = win.matchMedia('(prefers-reduced-motion: reduce)');
          if (reduce && reduce.matches === true) return 0;
        }
      } catch (e) {}
      return Math.max(0, fallback);
    }

    /*
     * The Play press does two things in the SAME gesture, in this order:
     *   1. every start handler runs synchronously, so native audio.play() is
     *      still inside the trusted activation (no timer around sound);
     *   2. the scrim and instructions start a short visual fade while the gate
     *      keeps its capture guard and inert body, so a second click/arrow
     *      cannot leak through to the deck while the cover is disappearing.
     * Only after that fade is the DOM removed and input released.
     */
    function activate() {
      if (!isTop || started || !locked) return false;
      if (!ready) return false;
      started = true;
      const handlers = startHandlers.slice();
      for (const fn of handlers) {
        try { fn(); } catch (e) {}
      }
      /* Rehearse removal on the real transitionend when it lands; the timer is
         the bounded fallback for engines that do not fire it (or reduced motion). */
      ready = false;
      if (overlay) {
        try { overlay.classList.add('voice-gate-leaving'); } catch (e) {}
      }
      if (btn) {
        try { btn.setAttribute('aria-disabled', 'true'); } catch (e) {}
      }
      const duration = fadeDuration();
      const finish = function () { finishExit(); };
      try {
        fadeTimer = win && typeof win.setTimeout === 'function'
          ? win.setTimeout(finish, duration)
          : null;
      } catch (e) { fadeTimer = null; }
      if (fadeTimer === null) finish();
      return true;
    }

    function finishExit() {
      fadeTimer = null;
      if (!started || !locked) return;
      locked = false;
      teardown();
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

  /* ------------------------------------------------------------------ */
  /* Repeat help ("?") after the explicit Play                           */

  /*
   * A separate state machine from the start gate: it is mounted only after
   * the deck has started, so reopening help can never re-arm the start gate,
   * wrap timers again or produce a second Play. It pauses narration only when
   * it was genuinely playing and resumes the SAME segment (same native Audio,
   * same currentTime) only when that is still the current step and language.
   */
  function createHelp(options) {
    const opts = options || {};
    const doc = opts.doc;
    const win = opts.win || (doc && doc.defaultView) || null;
    const getController = typeof opts.getController === 'function'
      ? opts.getController
      : function () { return null; };

    const noop = {
      mount() { return false; },
      open() { return false; },
      close() { return false; },
      isOpen() { return false; },
      isMounted() { return false; },
      destroy() {},
      get toggle() { return null; },
      get dialog() { return null; },
    };
    if (!doc || !doc.documentElement) return noop;

    let mounted = false;
    let open = false;
    let toggle = null;
    let root = null;
    let panel = null;
    let titleEl = null;
    let closeBtn = null;
    let itemEls = [];
    let saved = null;
    let previousFocus = null;
    let bodyInertSaved = null;
    let listenersBound = false;
    const i18nUnsubs = [];

    function docLang() {
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

    function phoneLayout() {
      try {
        if (win && typeof win.matchMedia === 'function') {
          const coarse = win.matchMedia('(pointer: coarse)');
          const short = Math.min(win.innerWidth || 0, win.innerHeight || 0);
          if (coarse && coarse.matches === true && short > 0 && short <= 560) return true;
        }
      } catch (e) {}
      const w = win && win.innerWidth ? win.innerWidth : 0;
      const h = win && win.innerHeight ? win.innerHeight : 0;
      return !!(w && h && Math.min(w, h) <= 560 && Math.max(w, h) <= 900);
    }

    function has(id) {
      try { return !!doc.getElementById(id); } catch (e) { return false; }
    }

    function standalone() {
      if (opts.isStandalone === true) return true;
      return !has('navToggle') && !has('homeBtn') && !has('fsToggle') && !has('langBtn');
    }

    function itemText(key, dict) {
      const phone = phoneLayout();
      if (key === 'arrows') return phone ? '' : dict.arrows;
      if (key === 'swipe') return phone ? dict.swipe : '';
      if (key === 'click') return standalone() ? '' : dict.click;
      if (key === 'menu') return has('navToggle') ? dict.menu : '';
      if (key === 'home') return has('homeBtn') ? dict.home : '';
      if (key === 'fullscreen') return has('fsToggle') ? dict.fullscreen : '';
      if (key === 'lang') {
        if (!has('langBtn')) return '';
        return phone ? dict.langMobile : dict.lang;
      }
      if (key === 'sound') return dict.sound;
      if (key === 'wait') return dict.wait;
      if (key === 'gesture') return dict.gesture;
      if (key === 'scroll') return dict.scroll;
      return '';
    }

    function paint() {
      const dict = HELP[docLang()] || HELP.en;
      if (toggle) {
        if (toggle.getAttribute('aria-label') !== dict.toggle) toggle.setAttribute('aria-label', dict.toggle);
        if (toggle.title !== dict.toggle) toggle.title = dict.toggle;
      }
      if (!root) return;
      if (titleEl) titleEl.textContent = dict.title;
      if (closeBtn) {
        closeBtn.setAttribute('aria-label', dict.close);
        closeBtn.title = dict.close;
      }
      for (const entry of itemEls) {
        const text = itemText(entry.key, dict);
        if (entry.el.textContent !== text) entry.el.textContent = text;
        entry.el.hidden = !text;
      }
    }

    function within(node, container) {
      if (!node || !container) return false;
      let current = node;
      while (current) {
        if (current === container) return true;
        current = current.parentNode;
      }
      return false;
    }

    function stop(event, prevent) {
      if (!event) return;
      try {
        if (prevent && event.cancelable !== false && typeof event.preventDefault === 'function') {
          event.preventDefault();
        }
      } catch (e) {}
      try {
        if (typeof event.stopImmediatePropagation === 'function') event.stopImmediatePropagation();
        else if (typeof event.stopPropagation === 'function') event.stopPropagation();
      } catch (e) {}
    }

    function onDocKey(event) {
      if (!open || !event) return;
      if (event.key === 'Escape') {
        stop(event, true);
        close();
        return;
      }
      if (event.key === 'Tab') {
        /* One focusable control (the cross): keep focus there. */
        stop(event, true);
        if (closeBtn && typeof closeBtn.focus === 'function') {
          try { closeBtn.focus(); } catch (e) {}
        }
        return;
      }
      const inside = within(event.target, root);
      if (inside && (event.key === 'Enter' || event.key === ' ' || event.key === 'Spacebar')) {
        return; /* native activation of the close button */
      }
      /* Arrow/Page/Home/End/Space and typing never page the deck behind help. */
      stop(event, true);
    }

    function onDocWheel(event) {
      if (!open) return;
      if (!within(event.target, panel)) stop(event, true);
      else stop(event, false); /* panel keeps its own scroll */
    }

    function onDocTouch(event) {
      if (!open) return;
      /* The panel may still scroll; the deck's swipe handler must not arm. */
      stop(event, false);
    }

    function onRootClick(event) {
      try { if (event && typeof event.stopPropagation === 'function') event.stopPropagation(); } catch (e) {}
    }

    function bindModal() {
      if (listenersBound) return;
      listenersBound = true;
      try { doc.addEventListener('keydown', onDocKey, true); } catch (e) {}
      try { doc.addEventListener('wheel', onDocWheel, { capture: true, passive: false }); } catch (e) {}
      for (const type of ['touchstart', 'touchmove', 'touchend']) {
        try { doc.addEventListener(type, onDocTouch, { capture: true, passive: true }); } catch (e) {}
      }
    }

    function unbindModal() {
      if (!listenersBound) return;
      listenersBound = false;
      try { doc.removeEventListener('keydown', onDocKey, true); } catch (e) {}
      try { doc.removeEventListener('wheel', onDocWheel, { capture: true }); } catch (e) {}
      for (const type of ['touchstart', 'touchmove', 'touchend']) {
        try { doc.removeEventListener(type, onDocTouch, { capture: true }); } catch (e) {}
      }
    }

    function ensureDialog() {
      if (root || !doc.documentElement) return root;
      root = doc.createElement('div');
      root.className = 'voice-help';
      root.id = 'voiceHelp';
      root.hidden = true;
      root.setAttribute('role', 'dialog');
      root.setAttribute('aria-modal', 'true');
      root.setAttribute('aria-labelledby', 'voiceHelpTitle');
      root.setAttribute('data-noswipe', '1');
      root.setAttribute('data-voice-help', '1');

      panel = doc.createElement('div');
      panel.className = 'voice-help-panel';

      closeBtn = doc.createElement('button');
      closeBtn.className = 'voice-help-close';
      closeBtn.setAttribute('type', 'button');
      closeBtn.textContent = '×';
      closeBtn.addEventListener('click', function (event) {
        stop(event, false);
        close();
      });
      panel.appendChild(closeBtn);

      titleEl = doc.createElement('p');
      titleEl.className = 'voice-help-title';
      titleEl.id = 'voiceHelpTitle';
      panel.appendChild(titleEl);

      const list = doc.createElement('ul');
      list.className = 'voice-help-list';
      const order = ['arrows', 'swipe', 'click', 'wait', 'gesture', 'scroll', 'menu', 'home', 'fullscreen', 'lang', 'sound'];
      for (const key of order) {
        const item = doc.createElement('li');
        item.className = 'voice-help-item';
        item.setAttribute('data-help-item', key);
        list.appendChild(item);
        itemEls.push({ key: key, el: item });
      }
      panel.appendChild(list);
      root.appendChild(panel);
      /* Clicks on the backdrop belong to the dialog, never to the slide. */
      for (const type of ['click', 'pointerdown', 'mousedown', 'touchstart']) {
        root.addEventListener(type, onRootClick);
      }
      doc.documentElement.appendChild(root);
      paint();
      return root;
    }

    function hook(name) {
      try {
        if (typeof opts[name] === 'function') opts[name]();
      } catch (e) {}
    }

    function openHelp() {
      if (!mounted || open) return false;
      ensureDialog();
      const controller = getController();
      const snap = controller && typeof controller.snapshot === 'function'
        ? controller.snapshot()
        : null;
      saved = {
        currentId: snap ? snap.currentId : null,
        lang: snap ? snap.lang : null,
        wasPlaying: !!(snap && (snap.status === 'playing' || snap.status === 'starting')),
      };
      if (saved.wasPlaying && controller && typeof controller.pause === 'function') {
        try { controller.pause(); } catch (e) {}
      }
      previousFocus = doc.activeElement || toggle;
      bodyInertSaved = doc.body ? doc.body.inert === true : false;
      if (doc.body) {
        try { doc.body.inert = true; } catch (e) {}
      }
      open = true;
      root.hidden = false;
      if (toggle) toggle.hidden = true;
      bindModal();
      paint();
      if (closeBtn) {
        try { closeBtn.focus(); } catch (e) {}
      }
      hook('onOpen');
      return true;
    }

    function close() {
      if (!open) return false;
      open = false;
      unbindModal();
      if (root) root.hidden = true;
      if (doc.body) {
        try { doc.body.inert = bodyInertSaved === true; } catch (e) {}
      }
      if (toggle) toggle.hidden = false;
      const focusTarget = previousFocus && previousFocus !== doc.body ? previousFocus : toggle;
      previousFocus = null;
      if (focusTarget && typeof focusTarget.focus === 'function') {
        try { focusTarget.focus(); } catch (e) {}
      }
      const controller = getController();
      if (saved && saved.wasPlaying && controller && typeof controller.play === 'function') {
        const now = typeof controller.snapshot === 'function' ? controller.snapshot() : null;
        const same = !!now && now.currentId === saved.currentId && now.lang === saved.lang;
        if (same) {
          try {
            const result = controller.play();
            if (result && typeof result.catch === 'function') result.catch(function () {});
          } catch (e) {}
        }
      }
      saved = null;
      bodyInertSaved = null;
      hook('onClose');
      return true;
    }

    function mount() {
      if (mounted || !doc.documentElement) return false;
      toggle = doc.createElement('button');
      toggle.className = 'voice-help-toggle';
      toggle.id = 'voiceHelpToggle';
      toggle.setAttribute('type', 'button');
      toggle.setAttribute('aria-haspopup', 'dialog');
      toggle.setAttribute('aria-controls', 'voiceHelp');
      toggle.setAttribute('data-voice-help', '1');
      toggle.setAttribute('data-noswipe', '1');
      toggle.textContent = '?';
      toggle.addEventListener('click', function (event) {
        onRootClick(event);
        openHelp();
      });
      doc.documentElement.appendChild(toggle);
      mounted = true;
      if (win && win.I18N && typeof win.I18N.onChange === 'function') {
        try {
          const off = win.I18N.onChange(paint);
          if (typeof off === 'function') i18nUnsubs.push(off);
        } catch (e) {}
      }
      paint();
      return true;
    }

    function destroy() {
      if (open) close();
      unbindModal();
      for (const off of i18nUnsubs.splice(0)) {
        try { off(); } catch (e) {}
      }
      for (const el of [toggle, root]) {
        if (el && el.parentNode) {
          try { el.parentNode.removeChild(el); } catch (e) {}
        }
      }
      toggle = null;
      root = null;
      panel = null;
      closeBtn = null;
      titleEl = null;
      itemEls = [];
      mounted = false;
      open = false;
    }

    return {
      mount,
      open: openHelp,
      close,
      destroy,
      isOpen() { return open; },
      isMounted() { return mounted; },
      get toggle() { return toggle; },
      get dialog() { return root; },
    };
  }

  const api = { createStartGate, createHelp };

  /* Auto-install only in a real browser top document. */
  if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    let instance = null;
    let top = false;
    try { top = window.top === window; } catch (e) { top = false; }
    try {
      instance = createStartGate({ doc: document, win: window, isTop: top, requireVoiceReady: true });
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
