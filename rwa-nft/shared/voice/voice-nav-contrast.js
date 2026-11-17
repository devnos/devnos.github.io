/*
 * voice-nav-contrast — one solid colour for a whole navigation chevron.
 *
 * The previous adaptive glyph used `backdrop-filter` through an SVG mask, so
 * every pixel of one stroke took the tone of the background pixel under it.
 * Over a photo or a half-light field a single arrow came out multi-coloured and
 * unreadable. Here the whole SVG keeps one stroke and one flat colour; only the
 * choice between the warm light gold and the graphite palette changes, and that
 * choice is made from the average of nine points spread over the whole tap
 * target, independently for the left and the right arrow.
 *
 * Contract:
 *   window.VoiceNavContrast.createContrastSampler({doc, win, ...}) ->
 *     { update(buttons) -> diagnostics, toneOf(button), destroy() }
 *
 *   update(buttons):
 *     - `buttons` is an array/NodeList of elements (or one element); omitted
 *       means `doc.querySelectorAll('[data-voice-listening-nav]')`. Zero-size
 *       or invisible buttons are skipped.
 *     - synchronous, never returns a promise, never starts a timer.
 *     - per button: nine points over the glyph box (30/50/70% x, 20/50/80% y),
 *       each sampled with
 *       the real hit stack (`doc.elementsFromPoint`); our own nav root and its
 *       descendants are skipped. The first foreign element is resolved by
 *       walking up its own ancestor chain, so a background belonging to an
 *       element that merely paints *under* a photo/video cannot win over the
 *       photo. Translucent CSS layers are composited over the first opaque one.
 *     - same-origin iframes are entered recursively (bounded depth) with the
 *       coordinate conversion of their real layout box, including a CSS
 *       transform scale; an unavailable or cross-origin frame is skipped
 *       without throwing.
 *     - video/img/canvas are read with one small 8x8 crop per media element per
 *       button (object-fit cover/contain/none maths), budgeted per update.
 *     - applies `button.style.color` = palette hex, `data-voice-tone`
 *       ('light'|'dark'), `data-voice-contrast` = 'sampled-solid' and one thin
 *       drop-shadow on the SVG. No backdrop-filter, no mask, no blend mode, no
 *       plate, no disc.
 *     - hysteresis: the previous tone survives unless the rival's contrast
 *       ratio leads by `switchMargin` (default 0.35), so a playing video does
 *       not make the glyph flicker.
 *     - every failure (no elementsFromPoint, missing 2D context, tainted
 *       canvas, throwing drawImage, cross-origin frame) is swallowed and
 *       yields `fallbackTone` (default 'light') for that button.
 *     - diagnostics: {buttons:[{direction,tone,ratio,reason,source,samples}],
 *       samples, mediaSamples, fallbacks, errors}. Plain data, no clock.
 *   destroy(): restores the inline colour/filter it replaced and removes the
 *     attributes it added. No storage, no speech, no network.
 *
 * Exported for tests: PALETTE, OUTLINE, chooseTone, averageSamples, luminance,
 * contrastRatio, createContrastSampler.
 *
 * LIMIT: this is deliberately not a CSS compositor. Gradients, background
 * images, box-shadow colour, blend modes and stacking contexts are
 * approximated by the ancestor/hit stack; a media element whose pixels cannot
 * be read (cross-origin, not yet decoded) falls through to the CSS layer
 * behind it. Live video is read only when the same-origin frame allows
 * drawImage.
 */
(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.VoiceNavContrast = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const PALETTE = {light: '#f2e6b8', dark: '#242128'};
  const OUTLINE = {light: 'rgba(20,16,22,0.5)', dark: 'rgba(244,227,178,0.4)'};
  const MEDIA_TAGS = new Set(['VIDEO', 'IMG', 'CANVAS']);
  /* The nine points sit on the glyph's own box (the chevron spans roughly
     33..67% of the width and 19..81% of the height), so the average follows
     the surface the stroke is actually drawn on, not the empty corners. */
  const POINTS_X = [0.3, 0.5, 0.7];
  const POINTS_Y = [0.2, 0.5, 0.8];
  const SWITCH_MARGIN = 0.35;
  const OPAQUE = 0.9;
  const LAYER_MIN_ALPHA = 0.08;
  const MAX_MEDIA = 4;
  const CROP = 8;
  const MAX_DEPTH = 4;
  const MAX_ANCESTORS = 40;

  function channelLuminance(value) {
    const c = value / 255;
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  }

  function luminance(color) {
    if (typeof color === 'string') {
      const rgb = parseColor(color);
      if (!rgb) return 0;
      color = rgb;
    }
    if (!color) return 0;
    return 0.2126 * channelLuminance(color.r === undefined ? color[0] : color.r) +
      0.7152 * channelLuminance(color.g === undefined ? color[1] : color.g) +
      0.0722 * channelLuminance(color.b === undefined ? color[2] : color.b);
  }

  function contrastRatio(a, b) {
    const hi = Math.max(a, b);
    const lo = Math.min(a, b);
    return (hi + 0.05) / (lo + 0.05);
  }

  const PALETTE_LUMINANCE = {light: luminance(PALETTE.light), dark: luminance(PALETTE.dark)};

  function parseColor(value) {
    if (!value) return null;
    const text = String(value).trim().toLowerCase();
    if (text === 'transparent' || text === 'none' || text === 'initial' || text === 'inherit') return null;
    let match = /^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,\s/]+([\d.]+%?))?\s*\)$/.exec(text);
    if (match) {
      let alpha = match[4] === undefined ? 1 : parseFloat(match[4]);
      if (match[4] && match[4].indexOf('%') !== -1) alpha /= 100;
      return {r: +match[1], g: +match[2], b: +match[3], a: isNaN(alpha) ? 1 : alpha};
    }
    match = /^#([0-9a-f]{3,8})$/.exec(text);
    if (!match) return null;
    let hex = match[1];
    if (hex.length === 3 || hex.length === 4) hex = hex.split('').map(c => c + c).join('');
    if (hex.length !== 6 && hex.length !== 8) return null;
    const n = i => parseInt(hex.slice(i, i + 2), 16);
    return {r: n(0), g: n(2), b: n(4), a: hex.length === 8 ? n(6) / 255 : 1};
  }

  /* Weighted arithmetic mean; `weight` defaults to 1. */
  function averageSamples(samples) {
    if (!samples || !samples.length) return null;
    let r = 0; let g = 0; let b = 0; let total = 0;
    for (const sample of samples) {
      const rgb = sample && (sample.rgb || sample);
      if (!rgb) continue;
      const weight = typeof sample === 'object' && typeof sample.weight === 'number' ? sample.weight : 1;
      if (!(weight > 0)) continue;
      r += rgb[0] * weight; g += rgb[1] * weight; b += rgb[2] * weight; total += weight;
    }
    if (!total) return null;
    return {r: Math.round(r / total), g: Math.round(g / total), b: Math.round(b / total)};
  }

  /* Pure: pick ONE tone for the whole glyph from one average background. */
  function chooseTone(average, options) {
    const opts = options || {};
    const margin = typeof opts.switchMargin === 'number' ? opts.switchMargin : SWITCH_MARGIN;
    const previous = opts.previousTone;
    if (!average) {
      return {tone: opts.fallbackTone === 'dark' ? 'dark' : 'light', ratio: null, reason: 'fallback'};
    }
    const background = luminance(average);
    const ratios = {
      light: contrastRatio(PALETTE_LUMINANCE.light, background),
      dark: contrastRatio(PALETTE_LUMINANCE.dark, background),
    };
    const preferred = ratios.light >= ratios.dark ? 'light' : 'dark';
    let tone = preferred;
    let reason = 'contrast';
    if ((previous === 'light' || previous === 'dark') && previous !== preferred &&
        ratios[preferred] - ratios[previous] < margin) {
      tone = previous;
      reason = 'hysteresis';
    }
    return {
      tone,
      reason,
      ratio: Math.round(ratios[tone] * 100) / 100,
      lightRatio: Math.round(ratios.light * 100) / 100,
      darkRatio: Math.round(ratios.dark * 100) / 100,
      average: {r: Math.round(average.r), g: Math.round(average.g), b: Math.round(average.b)},
    };
  }

  function createContrastSampler(config) {
    const opts = config || {};
    const doc = opts.doc || opts.document;
    const win = opts.win || (doc && doc.defaultView) || {};
    const margin = typeof opts.switchMargin === 'number' ? opts.switchMargin : SWITCH_MARGIN;
    const maxMedia = typeof opts.maxMedia === 'number' ? opts.maxMedia : MAX_MEDIA;
    const fallbackTone = opts.fallbackTone === 'dark' ? 'dark' : 'light';
    const outline = opts.outline !== false;
    let tones = new WeakMap();
    const applied = new Map();
    let destroyed = false;
    let mediaCache = new Map();
    let mediaLeft = maxMedia;

    function styleOf(node) {
      try {
        if (win.getComputedStyle) return win.getComputedStyle(node) || null;
        if (node && node.currentStyle) return node.currentStyle;
      } catch (e) {}
      return null;
    }

    function tagOf(node) {
      return String((node && node.tagName) || '').toUpperCase();
    }

    function isVisible(node) {
      if (!node) return false;
      if (node.hidden) return false;
      let value = 1;
      let current = node;
      for (let depth = 0; current && depth < 4; depth += 1) {
        const style = styleOf(current);
        if (!style) break;
        if (style.display === 'none' || style.visibility === 'hidden') return false;
        const parsed = parseFloat(style.opacity);
        if (!isNaN(parsed)) value *= parsed;
        current = current.parentElement || null;
      }
      return value > 0.08;
    }

    function isOwn(node) {
      if (!node) return false;
      try {
        if (node.hasAttribute && node.hasAttribute('data-voice-listening-nav-root')) return true;
        if (node.closest && node.closest('[data-voice-listening-nav-root]')) return true;
      } catch (e) {}
      return false;
    }

    function rectOf(node) {
      try {
        const rect = node.getBoundingClientRect();
        if (!rect) return null;
        const left = +rect.left || 0;
        const top = +rect.top || 0;
        const width = +(rect.width === undefined ? rect.right - rect.left : rect.width) || 0;
        const height = +(rect.height === undefined ? rect.bottom - rect.top : rect.height) || 0;
        return {left, top, width, height, right: left + width, bottom: top + height};
      } catch (e) {
        return null;
      }
    }

    function fitOf(node) {
      const style = styleOf(node);
      const fit = style && style.objectFit;
      return fit === 'cover' || fit === 'contain' || fit === 'none' || fit === 'scale-down' ? fit : 'fill';
    }

    /* One 8x8 average crop per media element *and* button rect. The rect is part
       of the key: the left and the right arrow sit over different pixels of the
       same full-bleed image and must never share an average. */
    function mediaAverage(node, rect) {
      if (!node || !rect) return null;
      const key = [rect.left, rect.top, rect.width, rect.height].map(n => Math.round(n)).join(',');
      let perNode = mediaCache.get(node);
      if (!perNode) { perNode = new Map(); mediaCache.set(node, perNode); }
      if (perNode.has(key)) return perNode.get(key);
      if (mediaLeft <= 0) return null;
      mediaLeft -= 1;
      const average = computeMediaAverage(node, rect);
      perNode.set(key, average);
      return average;
    }

    function computeMediaAverage(node, rect) {
      try {
        const tag = tagOf(node);
        if (!MEDIA_TAGS.has(tag) || !isVisible(node)) return null;
        if (tag === 'VIDEO' && ((node.readyState || 0) < 2 || !node.videoWidth)) return null;
        if (tag === 'IMG' && (node.complete === false || !node.naturalWidth)) return null;
        const sourceWidth = node.videoWidth || node.naturalWidth || node.width;
        const sourceHeight = node.videoHeight || node.naturalHeight || node.height;
        const box = rectOf(node);
        if (!sourceWidth || !sourceHeight || !box || !box.width || !box.height) return null;

        let content = box;
        let scaleX = box.width / sourceWidth;
        let scaleY = box.height / sourceHeight;
        const fit = fitOf(node);
        if (fit === 'cover' || fit === 'contain' || fit === 'scale-down') {
          const scale = fit === 'cover'
            ? Math.max(box.width / sourceWidth, box.height / sourceHeight)
            : Math.min(box.width / sourceWidth, box.height / sourceHeight);
          const width = sourceWidth * scale;
          const height = sourceHeight * scale;
          content = {left: box.left + (box.width - width) / 2, top: box.top + (box.height - height) / 2, width, height};
          scaleX = scaleY = scale;
        }
        const left = Math.max(rect.left, content.left);
        const top = Math.max(rect.top, content.top);
        const right = Math.min(rect.right, content.left + content.width);
        const bottom = Math.min(rect.bottom, content.top + content.height);
        if (right - left < 1 || bottom - top < 1) return null;

        const sx = Math.max(0, (left - content.left) / scaleX);
        const sy = Math.max(0, (top - content.top) / scaleY);
        const sw = Math.max(1, Math.min((right - left) / scaleX, sourceWidth - sx));
        const sh = Math.max(1, Math.min((bottom - top) / scaleY, sourceHeight - sy));

        if (typeof doc.createElement !== 'function') return null;
        const canvas = doc.createElement('canvas');
        if (!canvas) return null;
        canvas.width = CROP; canvas.height = CROP;
        if (typeof canvas.getContext !== 'function') return null;
        const ctx = canvas.getContext('2d', {willReadFrequently: true});
        if (!ctx || typeof ctx.drawImage !== 'function' || typeof ctx.getImageData !== 'function') return null;
        ctx.drawImage(node, sx, sy, sw, sh, 0, 0, CROP, CROP);
        const data = ctx.getImageData(0, 0, CROP, CROP).data;
        let r = 0; let g = 0; let b = 0; let count = 0;
        for (let i = 0; i < data.length; i += 4) {
          if (data[i + 3] === 0) continue;
          r += data[i]; g += data[i + 1]; b += data[i + 2]; count += 1;
        }
        if (!count) return null;
        return [Math.round(r / count), Math.round(g / count), Math.round(b / count)];
      } catch (e) {
        return null; /* tainted canvas, CORS, detached or not-yet-decoded media */
      }
    }

    /* Any painted video/img/canvas that hit testing skipped (pointer-events: none
       decor, pseudo layers) can still be the visible background. Later DOM order
       is the best available approximation of paint order. */
    function findDecorativeMedia(targetDoc, pointX, pointY, rect) {
      if (!targetDoc || typeof targetDoc.querySelectorAll !== 'function') return null;
      let nodes = [];
      try { nodes = targetDoc.querySelectorAll('video,img,canvas'); } catch (e) { return null; }
      let hit = null;
      for (const node of Array.from(nodes || [])) {
        if (!node || isOwn(node) || !isVisible(node)) continue;
        const box = rectOf(node);
        if (!box || box.width < 1 || box.height < 1) continue;
        if (pointX < box.left || pointY < box.top || pointX > box.right || pointY > box.bottom) continue;
        hit = node;
      }
      if (!hit) return null;
      const rgb = mediaAverage(hit, rect);
      return rgb ? {rgb, source: tagOf(hit).toLowerCase()} : null;
    }

    /* Overlays drawn above the surface with `pointer-events: none` (the deck's
       intro darkening and grain layers) never appear in elementsFromPoint, yet
       they decide what the user sees. Walk the later siblings of the media and
       of its ancestors, bounded, and collect their translucent paint. */
    function overlayOf(node, x, y) {
      if (!node || isOwn(node)) return null;
      const box = rectOf(node);
      if (!box || box.width < 1 || box.height < 1) return null;
      if (x < box.left || y < box.top || x > box.right || y > box.bottom) return null;
      const style = styleOf(node);
      if (!style) return null;
      if (style.display === 'none' || style.visibility === 'hidden') return null;
      let opacity = 1;
      let current = node;
      for (let step = 0; current && step < 4; step += 1) {
        const own = styleOf(current);
        if (!own) break;
        const parsed = parseFloat(own.opacity);
        if (!isNaN(parsed)) opacity *= parsed;
        current = current.parentElement || null;
      }
      if (opacity <= 0.02) return null;
      const color = parseColor(style.backgroundColor);
      if (!color) return null;
      const alpha = color.a * opacity;
      if (alpha <= LAYER_MIN_ALPHA) return null;
      return {rgb: [color.r, color.g, color.b], a: alpha};
    }

    function overlayLayers(node, x, y) {
      const layers = [];
      let current = node;
      for (let hop = 0; current && current.parentElement && hop < 6; hop += 1) {
        const parent = current.parentElement;
        let after = false;
        const kids = parent.children || [];
        for (let i = 0; i < kids.length && layers.length < 8; i += 1) {
          const sibling = kids[i];
          if (sibling === current) { after = true; continue; }
          if (!after) continue;
          const layer = overlayOf(sibling, x, y);
          if (layer) layers.push(layer);
        }
        current = parent;
      }
      return layers;
    }

    function paintOver(hit, layers) {
      let out = hit.rgb;
      for (const layer of layers) {
        out = [0, 1, 2].map(k => Math.round(layer.rgb[k] * layer.a + out[k] * (1 - layer.a)));
      }
      return {rgb: out, source: hit.source};
    }

    function applyLayers(hit, layers) {
      let out = hit.rgb;
      for (let i = layers.length - 1; i >= 0; i -= 1) {
        const layer = layers[i];
        out = [0, 1, 2].map(k => Math.round(layer.rgb[k] * layer.a + out[k] * (1 - layer.a)));
      }
      return {rgb: out, source: hit.source};
    }

    /* What one element paints at this point: a readable media crop, the
       nested document of a frame, or its own CSS colour with real alpha. */
    function paintedSurface(node, targetDoc, x, y, depth, rect) {
      const tag = tagOf(node);
      if (tag === 'IFRAME') {
        const nested = descend(node, x, y, depth, rect);
        return nested ? {rgb: nested.rgb, source: nested.source, alpha: 1} : null;
      }
      if (MEDIA_TAGS.has(tag)) {
        const rgb = mediaAverage(node, rect);
        if (!rgb) return null;
        const over = paintOver({rgb, source: tag.toLowerCase()}, overlayLayers(node, x, y));
        return {rgb: over.rgb, source: over.source, alpha: 1};
      }
      const style = styleOf(node);
      if (!style) return null;
      if (style.display === 'none' || style.visibility === 'hidden') return null;
      let opacity = 1;
      let current = node;
      for (let step = 0; current && step < 4; step += 1) {
        const own = styleOf(current);
        if (!own) break;
        const parsed = parseFloat(own.opacity);
        if (!isNaN(parsed)) opacity *= parsed;
        current = current.parentElement || null;
      }
      if (opacity <= 0.02) return null;
      const color = parseColor(style.backgroundColor);
      if (!color) return null;
      const alpha = color.a * opacity;
      if (alpha <= LAYER_MIN_ALPHA) return null;
      if (alpha >= OPAQUE) {
        const over = paintOver({rgb: [color.r, color.g, color.b], source: 'css'}, overlayLayers(node, x, y));
        return {rgb: over.rgb, source: 'css', alpha: 1};
      }
      return {rgb: [color.r, color.g, color.b], source: 'css', alpha};
    }

    function samplePoint(targetDoc, x, y, depth, rect) {
      let stack = [];
      try {
        if (targetDoc && typeof targetDoc.elementsFromPoint === 'function') {
          stack = Array.from(targetDoc.elementsFromPoint(x, y) || []);
        }
      } catch (e) {
        stack = [];
      }
      /* Composite the real paint stack top-down: translucent veils (grain,
         darkening) are layered over the first opaque surface; a video/image or
         a same-origin frame ends the walk with its own pixels. Own nav layers
         are skipped, and a failing frame falls through to what is under it. */
      const layers = [];
      const seen = new Set();
      let top = null;
      for (const node of stack) {
        if (!node || isOwn(node)) continue;
        if (!top) top = node;
        if (seen.has(node)) continue;
        seen.add(node);
        const surface = paintedSurface(node, targetDoc, x, y, depth, rect);
        if (!surface) continue;
        if (surface.alpha >= OPAQUE) {
          return applyLayers({rgb: surface.rgb, source: surface.source}, layers);
        }
        layers.push({rgb: surface.rgb, a: surface.alpha});
      }
      /* Ancestors of the hit element can be absent from the hit stack (a
         pointer-events:none wrapper). Walk them only after the stack. */
      for (let parent = top && top.parentElement, step = 0; parent && step < MAX_ANCESTORS; parent = parent.parentElement, step += 1) {
        if (seen.has(parent)) continue;
        seen.add(parent);
        const surface = paintedSurface(parent, targetDoc, x, y, depth, rect);
        if (!surface) continue;
        if (surface.alpha >= OPAQUE) {
          return applyLayers({rgb: surface.rgb, source: surface.source}, layers);
        }
        layers.push({rgb: surface.rgb, a: surface.alpha});
      }
      /* Nothing opaque in the hit chain: decorative media that hit testing
         skipped is still the visible surface. */
      const decorative = findDecorativeMedia(targetDoc, x, y, rect);
      if (decorative) return applyLayers(decorative, layers);
      return null;
    }

    /* Convert the point and the button rect into the frame's viewport. The
       layout box (offsetWidth) and the real box (getBoundingClientRect) differ
       when the deck scales a slide iframe with a CSS transform. */
    function descend(frame, x, y, depth, rect) {
      if (depth >= MAX_DEPTH) return null;
      let inner = null;
      try { inner = frame.contentDocument; } catch (e) { return null; }
      if (!inner || typeof inner.elementsFromPoint !== 'function') return null;
      const box = rectOf(frame);
      if (!box || !box.width || !box.height) return null;
      const layoutWidth = frame.offsetWidth || frame.clientWidth || box.width;
      const layoutHeight = frame.offsetHeight || frame.clientHeight || box.height;
      if (!layoutWidth || !layoutHeight) return null;
      const scaleX = box.width / layoutWidth;
      const scaleY = box.height / layoutHeight;
      if (!(scaleX > 0) || !(scaleY > 0)) return null;
      const borderLeft = +(frame.clientLeft || 0);
      const borderTop = +(frame.clientTop || 0);
      const innerX = (x - box.left) / scaleX - borderLeft;
      const innerY = (y - box.top) / scaleY - borderTop;
      const width = frame.clientWidth || layoutWidth;
      const height = frame.clientHeight || layoutHeight;
      if (innerX < 0 || innerY < 0 || innerX > width || innerY > height) return null;
      const innerRect = {
        left: (rect.left - box.left) / scaleX - borderLeft,
        top: (rect.top - box.top) / scaleY - borderTop,
        width: rect.width / scaleX,
        height: rect.height / scaleY,
        right: (rect.right - box.left) / scaleX - borderLeft,
        bottom: (rect.bottom - box.top) / scaleY - borderTop,
      };
      return samplePoint(inner, innerX, innerY, depth + 1, innerRect);
    }

    function collect(rect, diagnostics) {
      const samples = [];
      const sources = [];
      for (const fy of POINTS_Y) {
        for (const fx of POINTS_X) {
          const x = rect.left + rect.width * fx;
          const y = rect.top + rect.height * fy;
          let hit = null;
          try { hit = samplePoint(doc, x, y, 0, rect); } catch (e) { diagnostics.errors += 1; }
          if (hit && hit.rgb) {
            samples.push({rgb: hit.rgb, weight: 1});
            if (sources.indexOf(hit.source) === -1) sources.push(hit.source);
          }
        }
      }
      diagnostics.samples += samples.length;
      const source = sources.length > 1 ? 'mixed' : (sources[0] || 'fallback');
      return {samples, source};
    }

    function toneOf(button) {
      if (button && button.getAttribute) {
        const attr = button.getAttribute('data-voice-tone');
        if (attr === 'light' || attr === 'dark') return attr;
      }
      return null;
    }

    function remember(button) {
      if (applied.has(button)) return applied.get(button);
      let svg = null;
      try { svg = button.querySelector ? button.querySelector('svg') : null; } catch (e) {}
      const record = {
        color: button.style ? button.style.color : '',
        filter: svg && svg.style ? svg.style.filter : '',
        svg,
      };
      applied.set(button, record);
      return record;
    }

    function applyTone(button, tone) {
      remember(button);
      const color = PALETTE[tone] || PALETTE.light;
      try {
        if (button.style) button.style.color = color;
        if (button.setAttribute) {
          button.setAttribute('data-voice-tone', tone);
          button.setAttribute('data-voice-contrast', 'sampled-solid');
        }
        const record = applied.get(button);
        if (outline && record && record.svg && record.svg.style) {
          record.svg.style.filter = 'drop-shadow(0 0 0.75px ' + OUTLINE[tone] + ')';
        }
      } catch (e) {}
    }

    function update(buttons) {
      const diagnostics = {buttons: [], samples: 0, mediaSamples: 0, fallbacks: 0, errors: 0};
      if (destroyed || !doc) return diagnostics;
      mediaCache = new Map();
      mediaLeft = maxMedia;
      let list = [];
      if (buttons && typeof buttons.length === 'number') list = Array.from(buttons);
      else if (buttons && buttons.tagName) list = [buttons];
      else if (typeof doc.querySelectorAll === 'function') {
        try { list = Array.from(doc.querySelectorAll('[data-voice-listening-nav]') || []); } catch (e) { list = []; }
      }

      for (const button of list) {
        try {
          if (!button || !isVisible(button)) continue;
          const rect = rectOf(button);
          if (!rect || rect.width < 2 || rect.height < 2) continue;
          const collected = collect(rect, diagnostics);
          const average = averageSamples(collected.samples);
          const previousTone = tones.get(button) || toneOf(button);
          let picked;
          if (average) {
            picked = chooseTone(average, {previousTone, switchMargin: margin, fallbackTone});
          } else {
            picked = chooseTone(null, {previousTone, switchMargin: margin, fallbackTone});
            diagnostics.fallbacks += 1;
          }
          tones.set(button, picked.tone);
          applyTone(button, picked.tone);
          diagnostics.buttons.push({
            direction: button.getAttribute ? button.getAttribute('data-voice-listening-nav') : null,
            tone: picked.tone,
            ratio: picked.ratio === undefined ? null : picked.ratio,
            reason: picked.reason,
            source: collected.samples.length ? collected.source : 'fallback',
            samples: collected.samples.length,
          });
        } catch (e) {
          diagnostics.errors += 1;
        }
      }
      diagnostics.mediaSamples = maxMedia - mediaLeft;
      return diagnostics;
    }

    function destroy() {
      if (destroyed) return;
      destroyed = true;
      for (const [button, record] of applied) {
        try {
          if (button.style) button.style.color = record.color;
          if (button.removeAttribute) {
            button.removeAttribute('data-voice-tone');
            button.removeAttribute('data-voice-contrast');
          }
          if (record.svg && record.svg.style) record.svg.style.filter = record.filter || '';
        } catch (e) {}
      }
      applied.clear();
      tones = new WeakMap();
      mediaCache = new Map();
    }

    return {update, destroy, toneOf};
  }

  return {PALETTE, OUTLINE, chooseTone, averageSamples, luminance, contrastRatio, createContrastSampler};
});
