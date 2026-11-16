/*
 * Top-level keyboard navigation for the launcher.
 *
 * The slide documents already own step and slide-edge decisions. When focus is
 * on the launcher (language picker, corner controls, narration bar), the key is
 * forwarded into the live slide document as the same ArrowRight/ArrowLeft it
 * would have received there, so there is still exactly one navigation owner.
 *
 * Inputs, textareas, selects, ranges and contenteditable fields keep their
 * arrow keys.
 *
 * Nested screens (desktop modals of a slide, e.g. FinFlow/ranks/calculator)
 * are real iframes with their own step engines. The wheel already reaches them
 * because it goes to whatever is under the pointer; a key goes to whatever
 * holds focus. After opening a modal from a card, focus stays on the card
 * button in the parent slide, so arrows used to page the hidden parent while
 * the wheel moved the visible modal. Two rules close that gap:
 *
 *   - `dispatch()` resolves the deepest VISIBLE same-origin overlay frame and
 *     sends the arrow there, exactly like the wheel;
 *   - inside a slide document a capture bridge does the same for arrows that
 *     start in the parent (focus on a card), so the parent engine does not page
 *     behind the open modal.
 *
 * With no open nested screen both rules are inert: the slide keeps its single
 * navigation owner.
 */
(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.VoiceArrows = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const NEXT_KEYS = new Set(['ArrowRight', 'PageDown']);
  const PREV_KEYS = new Set(['ArrowLeft', 'PageUp']);
  const EDITABLE_SELECTOR = '[contenteditable=""],[contenteditable="true"],#voiceRoot,[data-no-arrows]';
  const MAX_DEPTH = 3;
  /* A nested screen must be a real surface, not a decorative 1px iframe. */
  const MIN_IFRAME_EDGE = 40;
  const MIN_COVERAGE = 0.2;

  function isTypingTarget(target) {
    if (!target) return false;
    const tag = typeof target.tagName === 'string' ? target.tagName.toUpperCase() : '';
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
    if (target.isContentEditable === true) return true;
    if (typeof target.closest === 'function') {
      try {
        if (target.closest(EDITABLE_SELECTOR)) return true;
      } catch (e) {}
    }
    return false;
  }

  /* Engines disagree on what they read: some use e.key, some e.code (slide 06),
     some only the legacy keyCode. Accept all three on the way in. */
  function directionForKey(event) {
    if (!event || event.defaultPrevented) return null;
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return null;
    const key = event.key;
    if (NEXT_KEYS.has(key)) return 'next';
    if (PREV_KEYS.has(key)) return 'prev';
    const code = event.code;
    if (code === 'ArrowRight' || code === 'PageDown') return 'next';
    if (code === 'ArrowLeft' || code === 'PageUp') return 'prev';
    const legacy = typeof event.keyCode === 'number' ? event.keyCode : event.which;
    if (legacy === 39 || legacy === 34) return 'next';
    if (legacy === 37 || legacy === 33) return 'prev';
    return null;
  }

  /* An open overlay owns the screen: the deck's modal convention is a container
     that gets the `open` class (plus aria-modal/role=dialog for a11y builds). */
  function insideOpenOverlay(el) {
    let node = el;
    let depth = 0;
    while (node && node.nodeType === 1 && depth < 16) {
      const cls = typeof node.className === 'string' ? node.className : '';
      if (/(^|\s)open(\s|$)/.test(cls)) return true;
      try {
        if (node.getAttribute && (node.getAttribute('aria-modal') === 'true' ||
            node.getAttribute('role') === 'dialog')) return true;
      } catch (e) {}
      node = node.parentElement;
      depth += 1;
    }
    return false;
  }

  function frameIsVisible(doc, frameEl) {
    let view = null;
    try { view = doc.defaultView; } catch (e) { view = null; }
    if (!view) return false;
    let rect = null;
    try { rect = frameEl.getBoundingClientRect(); } catch (e) { return false; }
    if (!rect || rect.width < MIN_IFRAME_EDGE || rect.height < MIN_IFRAME_EDGE) return false;
    const vw = view.innerWidth || 0;
    const vh = view.innerHeight || 0;
    if (!vw || !vh) return false;
    if ((rect.width * rect.height) < (vw * vh) * MIN_COVERAGE) return false;
    try {
      const cs = view.getComputedStyle(frameEl);
      if (cs) {
        if (cs.display === 'none' || cs.visibility === 'hidden') return false;
        if (parseFloat(cs.opacity) === 0) return false;
      }
    } catch (e) {}
    if (!insideOpenOverlay(frameEl)) return false;
    return true;
  }

  /* Deepest visible same-origin frame mounted inside an open overlay, or the
     starting document when there is none. */
  function resolveTargetDocument(doc, depth) {
    if (!doc || depth >= MAX_DEPTH || typeof doc.querySelectorAll !== 'function') return doc;
    let frames = [];
    try { frames = Array.prototype.slice.call(doc.querySelectorAll('iframe')); } catch (e) { frames = []; }
    let best = null;
    for (const frameEl of frames) {
      let frameDoc = null;
      try { frameDoc = frameEl.contentDocument; } catch (e) { frameDoc = null; }
      if (!frameDoc || !frameDoc.documentElement || !frameDoc.body) continue;
      if (!frameIsVisible(doc, frameEl)) continue;
      const rect = frameEl.getBoundingClientRect();
      const area = rect.width * rect.height;
      if (!best || area > best.area) best = { doc: frameDoc, area };
    }
    if (!best) return doc;
    return resolveTargetDocument(best.doc, depth + 1);
  }

  function createArrowNavigator(options) {
    const opts = options || {};
    const boundDocs = new Set();

    function onEdge(direction) {
      if (typeof opts.onEdge !== 'function') return false;
      try { return !!opts.onEdge(direction); } catch (e) { return false; }
    }

    function readableDocument(frame) {
      if (!frame) return null;
      try {
        return frame.contentDocument || null;
      } catch (e) {
        return null;
      }
    }

    function Ctor() {
      return opts.KeyboardEventCtor ||
        (typeof KeyboardEvent !== 'undefined' ? KeyboardEvent : null);
    }

    function makeKeyEvent(direction, Kb) {
      const key = direction === 'next' ? 'ArrowRight' : 'ArrowLeft';
      const keyCode = direction === 'next' ? 39 : 37;
      return new Kb('keydown', {
        key,
        code: key,
        keyCode,
        which: keyCode,
        bubbles: true,
        cancelable: true,
      });
    }

    function dispatchInto(targetDoc, direction) {
      const Kb = Ctor();
      if (!Kb || !targetDoc || typeof targetDoc.dispatchEvent !== 'function') return false;
      let event;
      try {
        event = makeKeyEvent(direction, Kb);
      } catch (e) {
        return false;
      }
      try {
        targetDoc.dispatchEvent(event);
      } catch (e) {
        return false;
      }
      return true;
    }

    function dispatch(direction) {
      const frame = typeof opts.getFrame === 'function' ? opts.getFrame() : null;
      const doc = readableDocument(frame);
      if (!doc) return onEdge(direction);
      let blank = true;
      try { blank = doc.URL === 'about:blank'; } catch (e) { blank = true; }
      if (blank) return onEdge(direction);

      /* Same target the wheel would pick: the visible nested screen wins over
         the slide that hosts it. */
      const target = resolveTargetDocument(doc, 0);
      return dispatchInto(target, direction) ? true : onEdge(direction);
    }

    /*
     * Bridge for arrows that start inside a slide document (focus on a card or
     * any control of the slide). Only acts when a nested screen is open on top
     * of it; otherwise the slide's own engine stays the single owner.
     */
    function bindDocument(doc) {
      if (!doc || boundDocs.has(doc) || typeof doc.addEventListener !== 'function') return false;
      const handler = (event) => {
        if (!event || event.defaultPrevented) return;
        const direction = directionForKey(event);
        if (!direction) return;
        if (isTypingTarget(event.target)) return;
        const target = resolveTargetDocument(doc, 0);
        if (!target || target === doc) return;
        try {
          if (typeof event.preventDefault === 'function') event.preventDefault();
          if (typeof event.stopImmediatePropagation === 'function') event.stopImmediatePropagation();
          else if (typeof event.stopPropagation === 'function') event.stopPropagation();
        } catch (e) {}
        dispatchInto(target, direction);
      };
      try {
        doc.addEventListener('keydown', handler, true);
      } catch (e) {
        return false;
      }
      boundDocs.add(doc);
      return true;
    }

    function unbindDocument(doc) {
      if (!doc) return false;
      return boundDocs.delete(doc);
    }

    function handle(event, options2) {
      const o = options2 || {};
      if (!event) return false;
      if (typeof opts.isBlocked === 'function' && opts.isBlocked()) return false;
      const direction = directionForKey(event);
      if (!direction) return false;
      if (isTypingTarget(event.target)) return false;

      const prevent = typeof o.preventDefault === 'function'
        ? o.preventDefault.bind(o)
        : (typeof event.preventDefault === 'function' ? event.preventDefault.bind(event) : null);
      if (prevent) prevent();
      dispatch(direction);
      return true;
    }

    return { handle, dispatch, bindDocument, unbindDocument, resolveTargetDocument };
  }

  /*
   * Deck bridge: the frames are created and replaced by the launcher, so the
   * navigator rebinds its capture listener to whichever documents are alive.
   * This is a no-op outside the deck (no #frameA/#frameB) and outside a real
   * browser.
   */
  function bindDeckFrames(navigator, options) {
    const opts = options || {};
    const doc = opts.doc || (typeof document !== 'undefined' ? document : null);
    if (!doc || !navigator || typeof navigator.bindDocument !== 'function') return { scan: function () { return 0; } };
    const seen = typeof WeakSet !== 'undefined' ? new WeakSet() : null;

    function scan() {
      let bound = 0;
      for (const id of ['frameA', 'frameB']) {
        const frame = doc.getElementById(id);
        if (!frame) continue;
        let frameDoc = null;
        try { frameDoc = frame.contentDocument; } catch (e) { frameDoc = null; }
        if (!frameDoc || !frameDoc.documentElement || !frameDoc.body) continue;
        if (seen) {
          if (seen.has(frameDoc)) continue;
          seen.add(frameDoc);
        }
        if (navigator.bindDocument(frameDoc)) bound += 1;
      }
      return bound;
    }

    scan();
    for (const id of ['frameA', 'frameB']) {
      const frame = doc.getElementById(id);
      if (frame && typeof frame.addEventListener === 'function') frame.addEventListener('load', scan);
    }
    return { scan };
  }

  /*
   * The deck cannot call us (its markup is generated elsewhere), so the module
   * installs the frame bridge itself in the real top document of the deck.
   * A standalone slide has no #frameA and skips this entirely.
   */
  function autoBindDeckFrames() {
    if (typeof window === 'undefined' || typeof document === 'undefined') return null;
    try {
      if (window.top !== window) return null;
    } catch (e) {
      return null;
    }
    if (!document.getElementById || !document.getElementById('frameA')) return null;
    const navigator = createArrowNavigator({});
    const bridge = bindDeckFrames(navigator, { doc: document });
    if (typeof window.setInterval === 'function') window.setInterval(bridge.scan, 700);
    return bridge;
  }

  if (typeof document !== 'undefined' && typeof window !== 'undefined') {
    try {
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', autoBindDeckFrames, { once: true });
      } else {
        autoBindDeckFrames();
      }
    } catch (e) {}
  }

  return {
    isTypingTarget,
    directionForKey,
    insideOpenOverlay,
    resolveTargetDocument,
    createArrowNavigator,
    bindDeckFrames,
    autoBindDeckFrames,
  };
});
