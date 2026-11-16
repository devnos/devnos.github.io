/*
 * Top-level keyboard navigation for the launcher.
 *
 * The slide documents already own step and slide-edge decisions. When focus is
 * on the launcher (language picker, corner controls, narration bar), the key is
 * forwarded into the live slide document as the same ArrowRight/ArrowLeft it
 * would have received there, so there is still exactly one navigation owner.
 *
 * Inputs, textareas, selects, ranges and contenteditable fields keep their
 * arrow keys. A full-screen modal blocks paging behind it.
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

  function directionForKey(event) {
    if (!event || event.defaultPrevented) return null;
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return null;
    if (NEXT_KEYS.has(event.key)) return 'next';
    if (PREV_KEYS.has(event.key)) return 'prev';
    return null;
  }

  function createArrowNavigator(options) {
    const opts = options || {};

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

    function dispatch(direction) {
      const frame = typeof opts.getFrame === 'function' ? opts.getFrame() : null;
      const doc = readableDocument(frame);
      if (!doc) return onEdge(direction);
      let blank = true;
      try { blank = doc.URL === 'about:blank'; } catch (e) { blank = true; }
      if (blank) return onEdge(direction);

      const Ctor = opts.KeyboardEventCtor ||
        (typeof KeyboardEvent !== 'undefined' ? KeyboardEvent : null);
      if (!Ctor) return onEdge(direction);

      const key = direction === 'next' ? 'ArrowRight' : 'ArrowLeft';
      let event;
      try {
        event = new Ctor('keydown', {
          key,
          code: key,
          keyCode: direction === 'next' ? 39 : 37,
          which: direction === 'next' ? 39 : 37,
          bubbles: true,
          cancelable: true,
        });
      } catch (e) {
        return onEdge(direction);
      }
      try {
        doc.dispatchEvent(event);
      } catch (e) {
        return onEdge(direction);
      }
      return true;
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

    return { handle, dispatch };
  }

  return { isTypingTarget, directionForKey, createArrowNavigator };
});
