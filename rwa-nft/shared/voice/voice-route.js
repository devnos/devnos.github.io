/*
 * Bounded, verified discovery of the active narration target.
 *
 * The top window owns Audio. A nested slide (the real FinFlow route lives in
 * the hub's math modal, one iframe below the deck slide) may be followed only
 * when it is same-origin, inspectable, visible and inside the bounded iframe
 * tree. Every decision is made from the live window, never from a claimed URL.
 */
(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.VoiceRoute = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const MAX_NESTED_DEPTH = 2;
  const MAX_FRAMES = 32;
  const ORIGIN_RE = /^https?:\/\/[^/]+$/;

  function isRealOrigin(origin) {
    return typeof origin === 'string' && ORIGIN_RE.test(origin);
  }

  function isActuallyVisible(frame, win) {
    if (!frame) return false;
    try {
      if (typeof frame.isConnected === 'boolean' && !frame.isConnected) return false;
      if (typeof frame.getClientRects === 'function' && frame.getClientRects().length === 0) return false;
      const rect = frame.getBoundingClientRect();
      if (!rect || rect.width <= 0 || rect.height <= 0) return false;

      /*
       * The iframe element belongs to the PARENT document. The school deck
       * preloads six frames and hides five with `.on`/opacity on the element;
       * reading style from the child window would miss that and treat every
       * preloaded frame as visible.
       */
      const ownerWin = (frame.ownerDocument && frame.ownerDocument.defaultView) || win;
      let node = frame;
      while (node && node.nodeType === 1) {
        const style = ownerWin.getComputedStyle(node);
        if (!style) break;
        if (style.display === 'none' || style.visibility === 'hidden' || style.visibility === 'collapse') return false;
        if (parseFloat(style.opacity) === 0) return false;
        node = node.parentElement;
      }
      return true;
    } catch (e) {
      return false;
    }
  }

  /*
   * A declared screen inside an OPEN overlay/modal is the active target even
   * when its host slide is itself narrated. Without this the hub (depth 0)
   * would always win over slide_04/slide_08 opened in its math modal.
   */
  function isInsideOpenOverlay(frame, ownerWin) {
    try {
      let node = frame && frame.parentElement;
      while (node && node.nodeType === 1 && node.tagName !== 'BODY') {
        const cls = typeof node.className === 'string' ? node.className : '';
        const isOverlay = /\bopen\b/.test(cls) || node.getAttribute('role') === 'dialog' ||
          node.getAttribute('aria-modal') === 'true';
        if (isOverlay) {
          const style = ownerWin.getComputedStyle(node);
          if (style && style.display !== 'none' && style.visibility !== 'hidden' && parseFloat(style.opacity) !== 0) return true;
        }
        node = node.parentElement;
      }
    } catch (e) {}
    return false;
  }

  /*
   * Walk a frame and its same-origin descendants. Returns plain candidates;
   * no message from the tree is trusted until selectVoiceTarget picks one.
   */
  function collectFrameCandidates(rootFrame, options) {
    const opts = options || {};
    const getConfig = opts.getConfig || function () { return null; };
    const maxDepth = Number.isInteger(opts.maxDepth) ? opts.maxDepth : MAX_NESTED_DEPTH;
    const maxFrames = Number.isInteger(opts.maxFrames) ? opts.maxFrames : MAX_FRAMES;
    const out = [];
    let order = 0;

    function visit(frame, depth) {
      if (!frame || depth > maxDepth || out.length >= maxFrames) return;
      let win = null;
      let doc = null;
      let path = '';
      let origin = '';
      let accessible = false;
      try {
        win = frame.contentWindow;
        doc = frame.contentDocument;
        if (win && doc) {
          path = win.location.pathname;
          origin = win.location.origin;
          accessible = true;
        }
      } catch (e) {
        accessible = false;
      }

      const visible = accessible && isActuallyVisible(frame, doc && doc.defaultView);
      const ownerWin = (frame.ownerDocument && frame.ownerDocument.defaultView) || (doc && doc.defaultView);
      out.push({
        frame: frame,
        win: win,
        doc: doc,
        path: path,
        origin: origin,
        accessible: accessible,
        visible: visible,
        overlay: visible && isInsideOpenOverlay(frame, ownerWin),
        depth: depth,
        order: order++,
        config: accessible ? getConfig(path) : null,
      });

      if (!accessible || !doc || depth >= maxDepth) return;
      let kids = [];
      try { kids = Array.prototype.slice.call(doc.querySelectorAll('iframe')); } catch (e) {}
      for (const kid of kids) visit(kid, depth + 1);
    }

    visit(rootFrame, 0);
    return out;
  }

  /*
   * Pick exactly one target: declared schema, same origin, reachable, visible,
   * within the depth budget. Shallowest wins so a deeper decoy cannot hijack.
   */
  function selectVoiceTarget(candidates, options) {
    const opts = options || {};
    const origin = opts.origin;
    if (!isRealOrigin(origin)) return null;
    const maxDepth = Number.isInteger(opts.maxDepth) ? opts.maxDepth : MAX_NESTED_DEPTH;

    const usable = (candidates || []).filter(function (candidate) {
      return !!candidate &&
        !!candidate.config &&
        !!candidate.win &&
        candidate.accessible === true &&
        candidate.visible === true &&
        candidate.origin === origin &&
        Number.isInteger(candidate.depth) &&
        candidate.depth >= 0 &&
        candidate.depth <= maxDepth;
    });

    usable.sort(function (a, b) {
      /* Open overlay content beats its narrated host; otherwise shallowest. */
      if (!!a.overlay !== !!b.overlay) return a.overlay ? -1 : 1;
      if (a.overlay && a.depth !== b.depth) return b.depth - a.depth;
      if (a.depth !== b.depth) return a.depth - b.depth;
      return (a.order || 0) - (b.order || 0);
    });
    return usable[0] || null;
  }

  return {
    MAX_NESTED_DEPTH,
    MAX_FRAMES,
    isRealOrigin,
    isActuallyVisible,
    collectFrameCandidates,
    selectVoiceTarget,
  };
});
