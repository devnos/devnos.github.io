/*
 * Listening lock — keep the deck on the current step until the narration that
 * is actually sounding has ended.
 *
 * The presentation used to break its own speech on a fast wheel/click/swipe:
 * the step changed, the controller selected the next segment and the audio was
 * cut mid-word. This helper guards navigation while, and only while, the live
 * controller reports `playing` or `starting`.
 *
 * Contract:
 *   window.VoiceListeningLock.createListeningLock({
 *     doc, win,
 *     getController: () => state.controller,   // called on every check
 *     isStarted: () => gateStarted(),
 *     isHelpOpen: () => helpState,
 *   }) -> { update(snapshot), bindDocument(doc), unbindDocument(doc),
 *           isLocked(), destroy() }
 *
 *  - `update(snapshot)` is called by the boot render with controller.snapshot()
 *    and is only a hint (hint language); `isLocked()` always asks the live
 *    controller, because it is replaced after scenario.json finishes loading.
 *  - `playing`/`starting` lock. `ended` and every failure/absence of speech
 *    (`error`, `unavailable`, `unsupported`, `disabled`, `idle`, `ready`,
 *    `blocked`, `needs-gesture`, `paused`) unlock. A pause therefore never
 *    becomes an eternal lock with no way to resume; help owns its own inert
 *    background while it is open.
 *  - The guard is capture-phase on the top window and on every reachable
 *    same-origin iframe document (bounded depth, rebound on frame `load`), so
 *    synthetic global keys (VoiceArrows) are guarded exactly like physical
 *    ones. `isTrusted` is deliberately not consulted.
 *  - Startup Play (`.voice-gate-play`), the fallback `.voice-play`, Help
 *    (`[data-voice-help]`, `.voice-help`, `.voice-help-dialog`), the
 *    non-navigation screen close and the language selector (`#langBtn`,
 *    `#langPanel` and their descendants) stay usable. Plain hover
 *    (`mousemove`, `pointermove`) is not intercepted.
 *  - Deliberate UI stays interactive during speech: real controls (button, a,
 *    input, select, textarea, label, [contenteditable], [role=button|tab|...],
 *    `[data-voice-action]`, `[data-voice-interactive]`, `[data-no-click]`, the
 *    `.flip3d`/`.nftflip` cards with `#finproFlip`/`#careerFlip`/... ids) keep
 *    their pointer, click and key events, including their native defaults. A
 *    navigation key on such a control is isolated with `stopPropagation` so a
 *    document-level deck handler cannot flip a step under it. This is not a
 *    blanket unlock: the document/body and every unmarked container still
 *    block taps, and wheel/`touchmove` pass only over a local card surface
 *    (`[data-voice-interactive]` / `[data-no-swipe]`). The startup gate is
 *    untouched — nothing here runs before Play.
 *  - Navigation postMessages from slide frames (`slide-end-*`, `next-slide`,
 *    ...) are dropped in the window capture phase. `open-screen` is an explicit
 *    UI request and passes (the deck keeps its origin/URL allow-list). Service
 *    messages (`step-changed`, `voice-registration`, deck control) pass.
 *  - Blocked input is neither buffered nor replayed after `ended`; the user
 *    must make a fresh gesture.
 *  - The hint is one element with inline, prefixed styles. It is throttled, so
 *    a hundred wheel ticks still schedule one timer. There is no global timer
 *    override and no delay after `ended`.
 *
 * Post-ended navigation:
 *  - Once the live controller reports `ended` (not a timer, not `ready`), the
 *    helper shows two large ghost chevrons pinned to the left and right screen
 *    edges, vertically centred: a still Prev and a slowly breathing Next. No
 *    circle, plate, outline disc or glow. They are hidden for
 *    playing/starting/paused/idle/ready/error, while Help is open, and before
 *    the start gate.
 *  - Each chevron is ONE plain SVG stroke with ONE flat colour, chosen by
 *    `VoiceNavContrast` from the average real background under that button:
 *    graphite over a bright surface, warm light gold over a dark one. The two
 *    arrows are sampled independently. There is no per-pixel backdrop filter
 *    and no mask, so a glyph crossing a light/dark edge never changes colour
 *    inside itself. If that module is absent, the SVG stays visible with one
 *    thin contrast drop-shadow instead.
 *  - The pair is re-sampled (bounded: nine points per arrow) whenever it is
 *    shown, after a frame load, on resize/orientation change and every 1500 ms
 *    while it stays on screen, so a playing video cannot leave the stroke on a
 *    background that has already changed; a hysteresis margin keeps the tone
 *    from flickering.
 *  - `onNavigate('next'|'prev')` is optional; without it no controls are
 *    created. `getNavigationState()` may hide an unavailable direction
 *    (`{hasNext, hasPrevious}`); both missing means one or both ends.
 *  - A click hides the pair synchronously before calling `onNavigate`, so a
 *    fast double click cannot skip a step through the `ready` microtask.
 *    A callback that returns strict `false` (the carousel moved to a neighbour
 *    card without a new narration step) re-arms the pair immediately; any
 *    other return value — `undefined` included — is a real transition.
 *  - The helper never calls nextStep/openScreen itself; the parent dispatches
 *    the real gesture into the live frame.
 *
 * No audio is created or fetched here; the module never talks to a provider.
 */
(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.VoiceListeningLock = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const LOCK_STATUSES = new Set(['playing', 'starting']);
  const MAX_FRAME_DEPTH = 4;
  const MAX_ANCESTOR_DEPTH = 16;
  const HINT_MS = 1600;
  const HINT_GAP_MS = 1200;
  const PULSE_MS = 2800;
  /* A playing background video changes the surface under a visible arrow.
     Re-sampling is bounded (nine points and at most four media crops) and the
     sampler's hysteresis prevents flicker; it stops the moment the pair hides. */
  const CONTRAST_REFRESH_MS = 1500;
  const GHOST_OPACITY = 0.8;
  const PULSE_DIM = 0.72;
  const PULSE_PEAK = 0.94;
  /* Last-resort outline when VoiceNavContrast is unavailable: one thin dark
     shadow so the gold stroke stays visible on a bright photo too. Never a
     plate, ring or glow. */
  const FALLBACK_SHADOW = 'filter:drop-shadow(0 0 1px #171318) drop-shadow(0 1px 1px #171318)';
  const HINT_CLASS = 'voice-listening-lock-hint';
  const NAV_ROOT_CLASS = 'voice-listening-nav';
  const NAV_CLASS = 'voice-listening-nav-btn';
  /* Real language-selector ids from index.html. The startup gate stays in
     charge before Play; this allow-list only matters while speech is locked. */
  const LANGUAGE_IDS = new Set(['langBtn', 'langPanel']);
  const LANGUAGE_CLASSES = ['lang-item', 'lang-panel', 'lang-menu'];
  /* Deliberate UI: a pointer or keyboard gesture on one of these is the user
     operating a control, not a request to change the step. Background taps and
     the global step gestures stay blocked. */
  const UI_TAGS = new Set([
    'BUTTON', 'A', 'INPUT', 'SELECT', 'TEXTAREA', 'LABEL', 'OPTION',
    'SUMMARY', 'DETAILS',
  ]);
  const UI_ROLES = new Set([
    'button', 'tab', 'checkbox', 'radio', 'switch', 'link', 'menuitem',
    'option', 'slider', 'spinbutton', 'textbox', 'combobox', 'dialog',
    'alertdialog', 'toolbar',
  ]);
  const UI_ATTRS = ['data-voice-action', 'data-voice-interactive', 'data-no-click'];
  const UI_CLASSES = ['lang-item', 'lang-panel', 'lang-menu', 'flip3d', 'nftflip'];
  /* Flip cards of the canonical deck (slide_06_system.html). */
  const UI_IDS = new Set(['langBtn', 'langPanel', 'finproFlip', 'careerFlip', 'nftFlip', 'partnerFlip']);
  /* A local card surface keeps its own pointer/touch/wheel gestures. */
  const LOCAL_SURFACE_ATTRS = ['data-voice-interactive', 'data-no-swipe'];
  const HINT_STYLE = [
    'position:fixed',
    'left:50%',
    'bottom:calc(76px + env(safe-area-inset-bottom, 0px))',
    'transform:translateX(-50%)',
    'z-index:10080',
    'max-width:min(92vw, 420px)',
    'padding:10px 14px',
    'border-radius:999px',
    'background:rgba(16,18,24,0.92)',
    'color:#fff',
    'font:600 14px/1.35 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif',
    'text-align:center',
    'pointer-events:none',
    'box-shadow:0 8px 24px rgba(0,0,0,0.28)',
    'white-space:normal',
  ].join(';');
  /* Bottom centre hint, above the existing centered help toggle (14px) and
     below the help overlay (10090). The hint lives at the same anchor as the
     old row but is never shown at `ended`; update() removes it first. */
  /* Full-viewport, click-through layer. The arrows are pinned to the screen
     edges; the layer itself never takes a tap away from the deck. */
  const NAV_ROOT_STYLE = [
    'position:fixed',
    'inset:0',
    'z-index:10075',
    'display:none',
    'pointer-events:none',
    'touch-action:manipulation',
  ].join(';');
  /* Ghost chevron: no disc, no plate, no ring, no shadow. clamp() keeps the
     icon large on desktop and inside the side gutter on a phone, while the
     44px minimum tap target is preserved. */
  const NAV_BUTTON_STYLE = [
    'position:fixed',
    'top:50%',
    'transform:translateY(-50%)',
    'width:clamp(64px, 9vw, 92px)',
    'height:clamp(64px, 9vw, 92px)',
    'min-width:44px',
    'min-height:44px',
    'margin:0',
    'padding:0',
    'border:0',
    'border-radius:0',
    'background:none',
    'box-shadow:none',
    'color:#f0c674',
    'display:inline-flex',
    'align-items:center',
    'justify-content:center',
    'cursor:pointer',
    'pointer-events:auto',
    'touch-action:manipulation',
    '-webkit-tap-highlight-color:transparent',
    '-webkit-appearance:none',
    'appearance:none',
    'user-select:none',
  ].join(';');
  /* Edge anchors keep the chevrons off the central cards and inside notches. */
  const NAV_PREV_STYLE = 'left:calc(env(safe-area-inset-left, 0px) + 6px)';
  const NAV_NEXT_STYLE = 'right:calc(env(safe-area-inset-right, 0px) + 6px)';

  /* Only navigational keys. Letters stay with form fields; Tab, Escape, "?"
     and every Ctrl/Meta/Alt system shortcut are never taken from the browser. */
  const NAV_KEYS = new Set([
    'ArrowRight', 'ArrowLeft', 'ArrowUp', 'ArrowDown',
    'PageDown', 'PageUp', 'Home', 'End', ' ', 'Spacebar', 'Enter',
  ]);

  const NAV_MESSAGE_TYPES = new Set([
    'slide-end-forward', 'slide-end-backward', 'open-screen',
    'next-slide', 'prev-slide', 'goto-slide', 'go-to-slide', 'change-slide',
    'next-step', 'prev-step',
  ]);

  const PLAY_CLASSES = ['voice-gate-play', 'voice-play'];
  const HELP_CLASSES = [
    'voice-help', 'voice-help-dialog', 'voice-help-panel',
    'voice-help-toggle', 'voice-help-close',
  ];

  /* wheel/touch/click/pointer are navigation intents while speech is running.
     mousemove and pointermove are intentionally absent: hover must not stutter. */
  const INPUT_EVENTS = [
    'wheel', 'touchstart', 'touchmove', 'touchend', 'touchcancel',
    'keydown', 'keyup', 'click', 'dblclick',
    'pointerdown', 'pointerup', 'pointercancel',
    'mousedown', 'mouseup',
  ];

  function classNameOf(node) {
    if (!node) return '';
    const value = node.className;
    if (typeof value === 'string') return value;
    if (value && typeof value.baseVal === 'string') return value.baseVal;
    return '';
  }

  function hasClass(node, name) {
    if (!node) return false;
    if (node.classList && typeof node.classList.contains === 'function') {
      try { return node.classList.contains(name); } catch (e) { return false; }
    }
    return new RegExp('(^|\\s)' + name + '(\\s|$)').test(classNameOf(node));
  }

  function attrOf(node, name) {
    if (!node || typeof node.getAttribute !== 'function') return null;
    try { return node.getAttribute(name); } catch (e) { return null; }
  }

  function isPlayNode(node) {
    for (const name of PLAY_CLASSES) if (hasClass(node, name)) return true;
    return false;
  }

  function isHelpNode(node) {
    for (const name of HELP_CLASSES) if (hasClass(node, name)) return true;
    const flag = attrOf(node, 'data-voice-help');
    return flag !== null && flag !== undefined && flag !== false;
  }

  function isLanguageNode(node) {
    if (!node) return false;
    const id = attrOf(node, 'id');
    if (typeof id === 'string' && LANGUAGE_IDS.has(id)) return true;
    for (const name of LANGUAGE_CLASSES) if (hasClass(node, name)) return true;
    return false;
  }

  function isUiNode(node) {
    if (!node) return false;
    const tag = typeof node.tagName === 'string' ? node.tagName.toUpperCase() : '';
    if (UI_TAGS.has(tag)) return true;
    if ((tag === 'VIDEO' || tag === 'AUDIO') &&
        (node.controls === true || attrOf(node, 'controls') !== null)) return true;
    const role = attrOf(node, 'role');
    if (typeof role === 'string' && UI_ROLES.has(role.toLowerCase())) return true;
    for (const name of UI_ATTRS) if (attrOf(node, name) !== null) return true;
    const editable = attrOf(node, 'contenteditable');
    if (editable !== null && String(editable).toLowerCase() !== 'false') return true;
    const id = attrOf(node, 'id');
    if (typeof id === 'string' && UI_IDS.has(id)) return true;
    for (const name of UI_CLASSES) if (hasClass(node, name)) return true;
    return isLanguageNode(node);
  }

  /* Walks up from the event target; the document/body themselves are never UI,
     so a background tap stays a step request. */
  function isUiTarget(target, doc) {
    let node = target || null;
    let depth = 0;
    while (node && depth < MAX_ANCESTOR_DEPTH) {
      if (node === doc) return false;
      if (isUiNode(node)) return true;
      node = node.parentNode || null;
      depth += 1;
    }
    return false;
  }

  /* A card/stage that owns its own drag and wheel (canonical `data-no-click`
     stages plus the [data-voice-interactive] stage the parent adds to a local
     carousel). Only these may receive wheel/touchmove while speech is locked. */
  function isLocalSurface(target, doc) {
    let node = target || null;
    let depth = 0;
    while (node && depth < MAX_ANCESTOR_DEPTH) {
      if (node === doc) return false;
      for (const name of LOCAL_SURFACE_ATTRS) {
        if (attrOf(node, name) !== null) return true;
      }
      node = node.parentNode || null;
      depth += 1;
    }
    return false;
  }

  function isAllowedNode(target, doc, helpOpen) {
    let node = target || null;
    let depth = 0;
    while (node && depth < MAX_ANCESTOR_DEPTH) {
      if (node === doc) return false;
      if (isPlayNode(node) || isHelpNode(node)) return true;
      /* The language selector (index.html #langBtn/#langPanel and their
         descendants) must switch language mid-sentence: a physical click there
         replaces the current segment in the single audio element. The startup
         gate is untouched because this guard only runs once speech started. */
      if (isLanguageNode(node)) return true;
      /* Compatibility fallback: a help implementation may only expose
         isHelpOpen() plus a role="dialog" ancestor, without our classes. */
      if (helpOpen && attrOf(node, 'role') === 'dialog') return true;
      /* Overlay close is not a step/slide change; trapping the user inside a
         full-screen calculator would be worse than one visual change. */
      if (node.id === 'screenClose') return true;
      const screenFlag = attrOf(node, 'data-screen-close');
      if (screenFlag !== null && screenFlag !== undefined && screenFlag !== false) return true;
      node = node.parentNode || null;
      depth += 1;
    }
    return false;
  }

  function keyName(event) {
    if (!event) return '';
    if (typeof event.key === 'string' && event.key) return event.key;
    const code = event.keyCode || event.which;
    switch (code) {
      case 37: return 'ArrowLeft';
      case 38: return 'ArrowUp';
      case 39: return 'ArrowRight';
      case 40: return 'ArrowDown';
      case 33: return 'PageUp';
      case 34: return 'PageDown';
      case 36: return 'Home';
      case 35: return 'End';
      case 32: return ' ';
      case 13: return 'Enter';
      default: return '';
    }
  }

  function isNavigationKey(event) {
    return NAV_KEYS.has(keyName(event));
  }

  /* Browser/global shortcuts and the help-focus path must survive; the help
     node itself is also allowed so Enter/Space on its buttons work. */
  function keyIsExempt(event, target, doc, helpOpen) {
    const key = keyName(event);
    if (key === 'Tab') return true;
    if (key === 'Escape' || key === '?' || key === 'F1') return true;
    if (event && (event.ctrlKey || event.metaKey || event.altKey)) return true;
    return isAllowedNode(target, doc, helpOpen);
  }

  function isNavigationMessage(data) {
    if (!data || typeof data !== 'object') return false;
    if (data.source !== 'slide') return false;
    const type = data.type;
    if (typeof type !== 'string') return false;
    if (NAV_MESSAGE_TYPES.has(type)) return true;
    return type.indexOf('slide-end-') === 0;
  }

  function createListeningLock(options) {
    const opts = options || {};
    const doc = opts.doc || (typeof document !== 'undefined' ? document : null);
    const win = opts.win || (doc && doc.defaultView) || (typeof window !== 'undefined' ? window : null);
    const getController = typeof opts.getController === 'function' ? opts.getController : function () { return null; };
    const isStarted = typeof opts.isStarted === 'function' ? opts.isStarted : function () { return true; };
    const isHelpOpen = typeof opts.isHelpOpen === 'function' ? opts.isHelpOpen : function () { return false; };
    const onNavigate = typeof opts.onNavigate === 'function' ? opts.onNavigate : null;
    const getNavigationState = typeof opts.getNavigationState === 'function' ? opts.getNavigationState : null;
    /*
     * Optional repeat-visit relaxation. The callers supply a boolean snapshot
     * of the CURRENT launch; the lock itself stays strict for every old test
     * and API that does not pass it. The caller is responsible for requiring
     * the startup Play (the boot passes gate-scoped repeatNavigation).
     */
    const canSkipNarration = typeof opts.canSkipNarration === 'function'
      ? opts.canSkipNarration
      : (typeof opts.isReturningVisitor === 'function'
        ? opts.isReturningVisitor
        : function () { return false; });

    const entries = new Map();          /* document -> binding entry */
    const frameBindings = new WeakMap();/* iframe element -> {doc, cleanup} */

    let destroyed = false;
    let lastSnapshot = null;
    let hint = null;
    let hintTimer = null;
    let lastHintAt = 0;
    let navRoot = null;
    let navNext = null;
    let navPrev = null;
    let navPulse = null;      /* the next ghost chevron (SVG), animated itself */
    let navAnimation = null;
    let contrast = null;      /* VoiceNavContrast sampler, created lazily */
    let contrastTried = false;
    let contrastTimer = null;
    let contrastInterval = null;
    let navConsumed = false;
    let navSyncQueued = false;
    const blockedKeys = new Set();

    function nowMs() {
      try {
        if (win && win.performance && typeof win.performance.now === 'function') {
          return win.performance.now();
        }
      } catch (e) {}
      return Date.now();
    }

    function liveSnapshot() {
      try {
        const controller = getController();
        if (!controller || typeof controller.snapshot !== 'function') return null;
        return controller.snapshot();
      } catch (e) {
        return null;
      }
    }

    function startedNow() {
      try {
        return isStarted() !== false;
      } catch (e) {
        return false;
      }
    }

    /* A returning launch may replace the narration without hearing it out. */
    function skipNarrationNow() {
      try {
        return canSkipNarration() === true;
      } catch (e) {
        return false;
      }
    }

    /* The one source of truth. No cached status, no captured controller. */
    function isLocked() {
      if (destroyed) return false;
      if (!startedNow()) return false;
      if (skipNarrationNow()) return false;
      const snap = liveSnapshot();
      return !!(snap && LOCK_STATUSES.has(snap.status));
    }

    function hintLanguage() {
      const snap = liveSnapshot() || lastSnapshot;
      if (snap && snap.lang === 'en') return 'en';
      if (snap && snap.lang === 'ru') return 'ru';
      try {
        const lang = doc && doc.documentElement && attrOf(doc.documentElement, 'lang');
        if (typeof lang === 'string' && lang.toLowerCase().indexOf('en') === 0) return 'en';
      } catch (e) {}
      return 'ru';
    }

    function hintText() {
      return hintLanguage() === 'en' ? 'Please finish listening' : 'Дослушайте объяснение';
    }

    function schedule(fn, delay) {
      if (win && typeof win.setTimeout === 'function') return win.setTimeout(fn, delay);
      if (typeof setTimeout === 'function') return setTimeout(fn, delay);
      return null;
    }

    function unschedule(id) {
      if (id === null || id === undefined) return;
      try {
        if (win && typeof win.clearTimeout === 'function') win.clearTimeout(id);
        else if (typeof clearTimeout === 'function') clearTimeout(id);
      } catch (e) {}
    }

    function ensureHint() {
      if (hint) return hint;
      if (!doc || typeof doc.createElement !== 'function') return null;
      const host = doc.body || doc.documentElement;
      if (!host) return null;
      const el = doc.createElement('div');
      el.className = HINT_CLASS;
      el.setAttribute('role', 'status');
      el.setAttribute('aria-live', 'polite');
      el.setAttribute('data-voice-listening-lock', 'hint');
      el.setAttribute('style', HINT_STYLE);
      el.textContent = hintText();
      el.hidden = true;
      host.appendChild(el);
      hint = el;
      return el;
    }

    function hideHint() {
      if (hintTimer !== null) {
        unschedule(hintTimer);
        hintTimer = null;
      }
      if (hint) {
        try {
          if (hint.parentNode) hint.parentNode.removeChild(hint);
        } catch (e) {}
        hint = null;
      }
      lastHintAt = 0;
    }

    function showHint() {
      if (destroyed) return;
      const at = nowMs();
      if (lastHintAt && at - lastHintAt < HINT_GAP_MS) return;
      lastHintAt = at;
      const el = ensureHint();
      if (!el) return;
      el.textContent = hintText();
      el.hidden = false;
      if (hintTimer !== null) unschedule(hintTimer);
      hintTimer = schedule(function () {
        hintTimer = null;
        if (hint) hint.hidden = true;
      }, HINT_MS);
    }

    function setDisplay(el, visible, displayValue) {
      if (!el) return;
      el.hidden = !visible;
      const value = visible ? (displayValue || 'inline-flex') : 'none';
      try {
        if (el.style) el.style.display = value;
        else el.setAttribute('data-display', value);
      } catch (e) {}
    }

    function setOpacity(el, value) {
      if (!el) return;
      try {
        if (el.style) el.style.opacity = String(value);
        else el.setAttribute('data-opacity', String(value));
      } catch (e) {}
    }

    function prefersReducedMotion() {
      try {
        return !!(win && typeof win.matchMedia === 'function' &&
          win.matchMedia('(prefers-reduced-motion: reduce)').matches);
      } catch (e) {
        return false;
      }
    }

    /* ---- adaptive solid glyph colour -------------------------------------- */

    function contrastFactory() {
      try {
        const api = win && win.VoiceNavContrast;
        return api && typeof api.createContrastSampler === 'function' ? api : null;
      } catch (e) {
        return null;
      }
    }

    function contrastSampler() {
      if (contrastTried) return contrast;
      contrastTried = true;
      const api = contrastFactory();
      if (!api) return null;
      try {
        contrast = api.createContrastSampler({doc: doc, win: win});
      } catch (e) {
        contrast = null;
      }
      return contrast;
    }

    function applyFallbackShadow() {
      for (const button of [navPrev, navNext]) {
        if (!button) continue;
        try {
          const svg = button.querySelector ? button.querySelector('svg') : null;
          if (button.setAttribute) button.setAttribute('data-voice-contrast', 'fallback');
          if (svg) svg.setAttribute('style', FALLBACK_SHADOW);
        } catch (e) {}
      }
    }

    /* One flat colour per whole SVG: the sampler reads the average real
       background under each button and paints `currentColor`. */
    function paintNavigation() {
      if (destroyed || !navRoot || navRoot.hidden) return;
      const sampler = contrastSampler();
      if (!sampler) { applyFallbackShadow(); return; }
      let painted = false;
      try {
        const diag = sampler.update([navPrev, navNext]);
        painted = !diag || !diag.buttons || diag.buttons.length > 0;
      } catch (e) {
        painted = false;
      }
      if (!painted) applyFallbackShadow();
    }

    /* A slide iframe loading, a resize or a rotation changes the surface under
       the arrows. Throttled to one pending refresh. */
    function scheduleContrastRefresh() {
      if (destroyed || !navRoot || navRoot.hidden) return;
      if (contrastTimer !== null) unschedule(contrastTimer);
      contrastTimer = schedule(function () {
        contrastTimer = null;
        paintNavigation();
      }, 140);
    }

    function stopContrastLoop() {
      if (contrastInterval === null) return;
      try {
        if (win && typeof win.clearInterval === 'function') win.clearInterval(contrastInterval);
        else if (typeof clearInterval === 'function') clearInterval(contrastInterval);
      } catch (e) {}
      contrastInterval = null;
    }

    /* Only while the pair is on screen; a hidden control costs nothing. */
    function ensureContrastLoop() {
      if (contrastInterval !== null || destroyed) return;
      if (!win || typeof win.setInterval !== 'function') return;
      try {
        contrastInterval = win.setInterval(function () {
          if (destroyed || !navRoot || navRoot.hidden) { stopContrastLoop(); return; }
          paintNavigation();
        }, CONTRAST_REFRESH_MS);
      } catch (e) {
        contrastInterval = null;
      }
    }

    function navigationLabels() {
      if (hintLanguage() === 'en') {
        return { group: 'Navigation', next: 'Next', prev: 'Back', caption: 'Tap the arrow' };
      }
      return { group: 'Навигация', next: 'Далее', prev: 'Назад', caption: 'Нажмите стрелку' };
    }

    function readNavigationAvailability() {
      if (!getNavigationState) return { hasNext: true, hasPrevious: true };
      try {
        const state = getNavigationState();
        if (!state || typeof state !== 'object') return { hasNext: false, hasPrevious: false };
        return { hasNext: state.hasNext !== false, hasPrevious: state.hasPrevious !== false };
      } catch (e) {
        /* A broken navigation probe must not leave dead controls on screen. */
        return { hasNext: false, hasPrevious: false };
      }
    }

    function containEvent(event) {
      if (!event) return;
      try { if (typeof event.stopPropagation === 'function') event.stopPropagation(); } catch (e) {}
    }

    function containControlKey(event) {
      const target = event && event.target;
      if (!target || typeof target.addEventListener !== 'function') return;
      /* Let the control handle its own key, then contain the bubble. */
      const stop = function (current) {
        if (current !== event) return;
        containEvent(current);
        target.removeEventListener(event.type, stop);
      };
      target.addEventListener(event.type, stop);
      Promise.resolve().then(function () { target.removeEventListener(event.type, stop); });
    }

    function stopPulse() {
      if (navAnimation) {
        try { navAnimation.cancel(); } catch (e) {}
        navAnimation = null;
      }
      if (navPulse) setOpacity(navPulse, GHOST_OPACITY);
    }

    function startPulse() {
      if (!navPulse || !navNext || navNext.hidden) return;
      if (prefersReducedMotion() || typeof navPulse.animate !== 'function') {
        setOpacity(navPulse, GHOST_OPACITY);
        return;
      }
      if (navAnimation) return; /* already breathing */
      try {
        navAnimation = navPulse.animate([
          { opacity: PULSE_DIM, transform: 'scale(1)' },
          { opacity: PULSE_PEAK, transform: 'scale(1.035)' },
          { opacity: PULSE_DIM, transform: 'scale(1)' },
        ], { duration: PULSE_MS, iterations: Infinity, easing: 'ease-in-out' });
      } catch (e) {
        setOpacity(navPulse, GHOST_OPACITY);
      }
    }

    function hideNavigation() {
      if (contrastTimer !== null) {
        unschedule(contrastTimer);
        contrastTimer = null;
      }
      stopContrastLoop();
      if (navNext) setDisplay(navNext, false, 'inline-flex');
      if (navPrev) setDisplay(navPrev, false, 'inline-flex');
      if (navRoot) setDisplay(navRoot, false, 'flex');
      stopPulse();
    }

    function activateNavigation(direction, event) {
      if (event) {
        try {
          if (typeof event.preventDefault === 'function' && event.cancelable !== false) event.preventDefault();
        } catch (e) {}
        try {
          if (typeof event.stopImmediatePropagation === 'function') event.stopImmediatePropagation();
          else if (typeof event.stopPropagation === 'function') event.stopPropagation();
        } catch (e) {}
      }
      if (destroyed || !onNavigate || navConsumed) return;
      /* Hide before the callback: a queued second click must not ride the
         ended -> ready microtask into a second step. */
      navConsumed = true;
      hideNavigation();
      hideHint();
      let result;
      try { result = onNavigate(direction); } catch (e) { result = undefined; }
      /* Strict false means "nothing moved": a carousel stepped onto a
         neighbour card without a new narration step, so the pair must be
         usable again at once — no speech rearm required. undefined and every
         other value are a real transition and stay consumed until new speech
         starts. */
      if (result === false) {
        navConsumed = false;
        syncNavigation();
      }
    }

    function ensureNavigation() {
      if (navRoot) return navRoot;
      if (!doc || typeof doc.createElement !== 'function') return null;
      const host = doc.body || doc.documentElement;
      if (!host) return null;

      const root = doc.createElement('div');
      root.className = NAV_ROOT_CLASS;
      root.setAttribute('role', 'group');
      root.setAttribute('data-voice-listening-nav-root', '1');
      root.setAttribute('data-noswipe', '1');
      root.setAttribute('data-no-swipe', '1');
      root.setAttribute('style', NAV_ROOT_STYLE);

      const makeButton = function (direction, path, extraStyle) {
        const button = doc.createElement('button');
        button.type = 'button';
        button.className = NAV_CLASS + ' ' + NAV_CLASS + '--' + direction;
        button.setAttribute('data-voice-listening-nav', direction);
        button.setAttribute('data-noswipe', '1');
        button.setAttribute('data-no-swipe', '1');
        button.setAttribute('style', NAV_BUTTON_STYLE + (extraStyle ? ';' + extraStyle : ''));
        /* One bold chevron stretched to the full tap target: a single SVG
           stroke in `currentColor`. The colour is applied to the whole glyph
           by VoiceNavContrast below; no disc, plate, ring or mask. */
        button.innerHTML = '<svg viewBox="0 0 24 24" width="100%" height="100%" aria-hidden="true" fill="none" opacity="' + GHOST_OPACITY + '">' +
          '<path d="' + path + '" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
        const svg = button.querySelector('svg');
        const caption = doc.createElement('span');
        caption.className = 'voice-nav-caption';
        caption.setAttribute('aria-hidden', 'true');
        caption.setAttribute('style', [
          'position:absolute', 'top:calc(100% + 6px)', 'left:0', 'width:100%',
          'box-sizing:border-box', 'margin:0', 'padding:0 2px',
          'font:500 12px/1.25 system-ui,-apple-system,"Segoe UI",sans-serif',
          'text-align:center', 'white-space:normal', 'letter-spacing:0',
          'color:inherit', 'opacity:0.9', 'pointer-events:none',
          'text-shadow:0 0 1px var(--voice-arrow-outline, #171318)',
        ].join(';'));
        caption.textContent = navigationLabels().caption;
        button.appendChild(caption);
        /* 'pending' until the first successful sample; 'fallback' only when the
           sampler module is missing or fails, in which case one thin outline
           keeps the gold stroke readable on any surface. */
        button.setAttribute('data-voice-contrast', 'pending');
        if (!contrastFactory()) {
          button.setAttribute('data-voice-contrast', 'fallback');
          svg.setAttribute('style', FALLBACK_SHADOW);
        }
        for (const type of ['pointerdown', 'pointerup', 'mousedown', 'mouseup', 'touchstart', 'touchend', 'keydown', 'keyup', 'keypress']) {
          try { button.addEventListener(type, containEvent); } catch (e) {}
        }
        try {
          button.addEventListener('click', function (event) {
            activateNavigation(direction, event);
          });
        } catch (e) {}
        return button;
      };

      const prev = makeButton('prev', 'M16 4.5 L8 12 L16 19.5', NAV_PREV_STYLE);
      const next = makeButton('next', 'M8 4.5 L16 12 L8 19.5', NAV_NEXT_STYLE);

      root.appendChild(prev);
      root.appendChild(next);
      try { root.addEventListener('click', containEvent); } catch (e) {}
      host.appendChild(root);

      navRoot = root;
      navPrev = prev;
      navNext = next;
      navPulse = next.querySelector ? next.querySelector('svg') : null;
      return root;
    }

    function syncNavigation() {
      if (destroyed) return;
      const snap = liveSnapshot();
      const status = snap && snap.status;
      let started = true;
      try { started = isStarted() !== false; } catch (e) { started = false; }
      let helpOpen = false;
      try { helpOpen = isHelpOpen() === true; } catch (e) { helpOpen = false; }

      /*
       * A returning visitor gets the pair while speech is still running, so a
       * step can be replaced without waiting. The first visit keeps the strict
       * post-ended gate. navConsumed still guards against a double click and is
       * re-armed by update() when the replacement segment starts.
       */
      const skipNarration = skipNarrationNow();
      const eligible = !!(onNavigate && started && !helpOpen && !navConsumed &&
        (skipNarration || status === 'ended'));
      if (!eligible) {
        hideNavigation();
        return;
      }
      const available = readNavigationAvailability();
      if (!available.hasNext && !available.hasPrevious) {
        hideNavigation();
        return;
      }
      if (!ensureNavigation()) return;

      const labels = navigationLabels();
      navRoot.setAttribute('aria-label', labels.group);
      navPrev.setAttribute('aria-label', labels.prev);

      navNext.setAttribute('aria-label', labels.next);
      for (const button of [navPrev, navNext]) {
        const caption = button.querySelector('.voice-nav-caption');
        if (caption && caption.textContent !== labels.caption) caption.textContent = labels.caption;
      }


      setDisplay(navPrev, available.hasPrevious, 'inline-flex');
      setDisplay(navNext, available.hasNext, 'inline-flex');
      setDisplay(navRoot, true, 'flex');
      paintNavigation();
      ensureContrastLoop();
      if (available.hasNext) startPulse();
      else stopPulse();
    }

    function scheduleNavigationSync() {
      if (destroyed || navSyncQueued) return;
      navSyncQueued = true;
      const run = function () {
        navSyncQueued = false;
        syncNavigation();
      };
      try {
        const P = (win && win.Promise) || (typeof Promise !== 'undefined' ? Promise : null);
        if (P && typeof P.resolve === 'function') P.resolve().then(run);
        else run();
      } catch (e) {
        run();
      }
    }

    function block(event, showHintToo) {
      if (!event) return;
      try {
        if (typeof event.preventDefault === 'function' && event.cancelable !== false) {
          event.preventDefault();
        }
      } catch (e) {}
      try {
        if (typeof event.stopImmediatePropagation === 'function') event.stopImmediatePropagation();
        else if (typeof event.stopPropagation === 'function') event.stopPropagation();
      } catch (e) {}
      try { event.returnValue = false; } catch (e) {}
      if (showHintToo !== false) showHint();
    }

    function onInput(event, entry) {
      if (destroyed) return;
      const type = event && event.type;
      const target = (event && (event.target || event.srcElement)) || null;

      /* keyup never navigates by itself. If its keydown was blocked, suppress
         the matching keyup so a card cannot get half a pair; if the keydown
         was allowed (e.g. after ended) always deliver the keyup, even when the
         next segment already started. */
      if (type === 'keyup') {
        const name = keyName(event);
        if (blockedKeys.has(name)) {
          blockedKeys.delete(name);
          block(event, false);
          return;
        }
        if (!isLocked()) scheduleNavigationSync();
        return;
      }

      if (!isLocked()) {
        if (hint) hideHint();
        /* Help open/close is a click/key with no controller transition; syncing
           in a microtask sees the final help state after its handler ran. */
        scheduleNavigationSync();
        return;
      }
      let helpOpen = false;
      try { helpOpen = isHelpOpen() === true; } catch (e) { helpOpen = false; }
      if (type === 'keydown') {
        if (!isNavigationKey(event)) return;
        if (keyIsExempt(event, target, entry.doc, helpOpen)) {
          /* Even a pre-exempt control (play/help/language) must not leak the
             key into a document-level deck handler. */
          if (isUiTarget(target, entry.doc)) {
            containControlKey(event);
          }
          return;
        }
        /* A navigation key on a focused control is the control's own key. Keep
           its native default (button activation, caret, selection) but stop the
           bubble so a document-level deck handler cannot flip a step too. */
        if (isUiTarget(target, entry.doc)) {
          containControlKey(event);
          return;
        }
        blockedKeys.add(keyName(event));
        block(event);
        return;
      }
      if (type === 'keyup') {
        /* Keyup never navigates; a UI target keeps it (and its own focus
           handling) instead of getting a prevented default. */
        if (isUiTarget(target, entry.doc)) { containControlKey(event); return; }
        if (isAllowedNode(target, entry.doc, helpOpen)) return;
        block(event);
        return;
      }
      if (isAllowedNode(target, entry.doc, helpOpen)) return;

      /* Wheel and drag are the deck's step gestures. They stay blocked on the
         background and open only over a local card surface (the flip stages and
         the [data-voice-interactive] carousel), which owns its own gestures. */
      if (type === 'wheel' || type === 'touchmove') {
        if (isLocalSurface(target, entry.doc)) return;
        block(event);
        return;
      }
      if (type === 'touchstart' || type === 'touchend' || type === 'touchcancel') {
        /* A tap on a control still has to produce its synthetic click; a drag
           is caught by touchmove above. */
        if (isUiTarget(target, entry.doc) || isLocalSurface(target, entry.doc)) return;
        block(event);
        return;
      }
      /* click, dblclick and every pointer/mouse press: a deliberate control
         gesture passes, a background tap is still a step request. */
      if (isUiTarget(target, entry.doc) || isLocalSurface(target, entry.doc)) return;
      block(event);
    }

    function onMessage(event) {
      if (destroyed || !isLocked()) return;
      const data = event && event.data;
      if (!isNavigationMessage(data)) return;
      /* `open-screen` is an explicit UI request from the active frame (the
         origin and URL allow-list stay in the deck). Only step/slide advances
         are navigation and stay blocked. */
      if (data.type === 'open-screen') return;
      block(event);
    }

    function scanFrames(entry, depth) {
      let frames = [];
      try {
        /* Real documents expose querySelectorAll; the minimal test document
           only exposes it on documentElement. */
        let root = entry.doc;
        if (!root || typeof root.querySelectorAll !== 'function') {
          root = entry.doc && entry.doc.documentElement;
        }
        if (root && typeof root.querySelectorAll === 'function') {
          frames = root.querySelectorAll('iframe');
        }
      } catch (e) {
        frames = [];
      }
      for (let i = 0; i < frames.length; i += 1) {
        hookFrame(entry, frames[i], depth);
      }
    }

    function hookFrame(parentEntry, frame, depth) {
      if (!frame || parentEntry.frames.has(frame)) return;
      parentEntry.frames.add(frame);
      const onLoad = function () {
        if (destroyed) return;
        const dropDead = function () {
          const dead = frameBindings.get(frame);
          if (!dead) return;
          parentEntry.children.delete(dead.doc);
          try { dead.cleanup(); } catch (err) {}
          frameBindings.delete(frame);
        };
        let nextDoc = null;
        try { nextDoc = frame.contentDocument || null; } catch (e) {
          /* Cross-origin navigation: the old document is gone; drop its
             listeners instead of keeping a dead window bound forever. */
          dropDead();
          return;
        }
        if (!nextDoc) { dropDead(); return; }
        const prev = frameBindings.get(frame);
        if (prev && prev.doc !== nextDoc) {
          parentEntry.children.delete(prev.doc);
          try { prev.cleanup(); } catch (e) {}
        }
        const cleanup = bindDocument(nextDoc, depth + 1);
        frameBindings.set(frame, { doc: nextDoc, cleanup: cleanup });
        parentEntry.children.add(nextDoc);
        /* The new document may change the pixels under a visible arrow. */
        scheduleContrastRefresh();
      };
      parentEntry.hooks.push({ frame: frame, onLoad: onLoad });
      try {
        if (typeof frame.addEventListener === 'function') frame.addEventListener('load', onLoad);
      } catch (e) {}
      onLoad();
    }

    function bindDocument(targetDoc, depth) {
      if (destroyed || !targetDoc) return function () {};
      const level = Number.isInteger(depth) ? depth : 0;
      if (level > MAX_FRAME_DEPTH) return function () {};

      let entry = entries.get(targetDoc);
      if (!entry) {
        const targetWin = targetDoc.defaultView || (targetDoc === doc ? win : null);
        entry = {
          doc: targetDoc,
          win: targetWin,
          frames: new Set(),
          hooks: [],
          children: new Set(),
          added: [],
          cleanup: null,
        };
        entries.set(targetDoc, entry);

        const bindingTarget = (targetWin && typeof targetWin.addEventListener === 'function')
          ? targetWin
          : targetDoc;
        const add = function (type, fn, options) {
          try {
            bindingTarget.addEventListener(type, fn, options);
            entry.added.push({ type: type, fn: fn, options: options });
          } catch (e) {}
        };
        const inputHandler = function (event) { onInput(event, entry); };
        for (const type of INPUT_EVENTS) {
          add(type, inputHandler, { capture: true, passive: false });
        }
        add('message', onMessage, true);

        entry.cleanup = function () {
          if (!entries.has(targetDoc)) return;
          entries.delete(targetDoc);
          for (const item of entry.added.splice(0)) {
            try { bindingTarget.removeEventListener(item.type, item.fn, item.options); } catch (e) {}
          }
          for (const hook of entry.hooks.splice(0)) {
            try { hook.frame.removeEventListener('load', hook.onLoad); } catch (e) {}
          }
          for (const child of Array.from(entry.children)) {
            const childEntry = entries.get(child);
            if (childEntry) childEntry.cleanup();
            entry.children.delete(child);
          }
        };
      }

      scanFrames(entry, level);
      return entry.cleanup;
    }

    function unbindDocument(targetDoc) {
      const entry = entries.get(targetDoc || doc);
      if (entry) entry.cleanup();
    }

    function update(snapshot) {
      if (destroyed) return;
      if (snapshot && typeof snapshot === 'object') lastSnapshot = snapshot;
      else if (snapshot === null) lastSnapshot = null;
      /* A new segment actually started: a later real `ended` may offer the
         navigation pair again. A `ready` microtact does not reset this. */
      if (snapshot && (snapshot.status === 'playing' || snapshot.status === 'starting')) {
        navConsumed = false;
      }
      /* Remove the hint immediately; there is no delay after ended/error. */
      if (!isLocked() && hint) hideHint();
      syncNavigation();
    }

    function destroy() {
      if (destroyed) return;
      destroyed = true;
      hideHint();
      hideNavigation();
      if (contrastTimer !== null) {
        unschedule(contrastTimer);
        contrastTimer = null;
      }
      if (win && typeof win.removeEventListener === 'function') {
        try {
          win.removeEventListener('resize', onViewportChange);
          win.removeEventListener('orientationchange', onViewportChange);
        } catch (e) {}
      }
      stopContrastLoop();
      if (contrast && typeof contrast.destroy === 'function') {
        try { contrast.destroy(); } catch (e) {}
      }
      contrast = null;
      contrastTried = false;
      if (navRoot) {
        try {
          if (navRoot.parentNode) navRoot.parentNode.removeChild(navRoot);
        } catch (e) {}
      }
      navRoot = null;
      navNext = null;
      navPrev = null;
      navPulse = null;
      navAnimation = null;
      blockedKeys.clear();
      for (const entry of Array.from(entries.values())) {
        try { entry.cleanup(); } catch (e) {}
      }
      entries.clear();
      lastSnapshot = null;
    }

    function onViewportChange() {
      scheduleContrastRefresh();
    }

    if (win && typeof win.addEventListener === 'function') {
      try {
        win.addEventListener('resize', onViewportChange, {passive: true});
        win.addEventListener('orientationchange', onViewportChange, {passive: true});
      } catch (e) {}
    }

    return {
      update: update,
      bindDocument: function (targetDoc) { return bindDocument(targetDoc || doc, 0); },
      unbindDocument: unbindDocument,
      isLocked: isLocked,
      destroy: destroy,
    };
  }

  return { createListeningLock: createListeningLock };
});
