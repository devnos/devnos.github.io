/*
 * Human-readable exit for the nested windows of the RWA NFT deck.
 *
 * Every nested screen (the launcher's full-screen modal, the six calculator
 * shells of slide_06, the formulas window of slide_08, the portrait rotate
 * overlay) answers the same question for the viewer: "how do I get back?".
 * A bare ✕ is not an answer — people stay inside the section and the
 * presentation stops. This module therefore adds, per window:
 *
 *   - a permanent text label on the close control («К презентации»,
 *     «К FinFlow» for the formulas window) plus an explicit aria-label;
 *   - one compact context block in the top-right corner, next to the cross:
 *     the local title, honest local progress, a one-time explanation and,
 *     at the end of the section, a visible return CTA;
 *   - nothing else. No timers that close anything, no slide navigation, no
 *     postMessage traffic, no audio or paid calls.
 *
 * The existing close handlers stay the only owners of visibility: the CTA and
 * the label simply call `closeControl.click()`, so whatever the slide already
 * did on ✕ happens exactly once. Progress is read from the live nested
 * document (window._currentStep / VoiceSlides config / #fcCount) and never
 * waits for narration to finish. Polling is a single bounded interval that
 * only exists while relevant hosts are present; no MutationObserver touches
 * the animated carousel DOM.
 *
 * Everything is hidden until top.VoiceGate.started() and while the help
 * overlay is open, so nothing lands on top of Play or Help.
 *
 * UMD: window.RwaInteractionWindows in the browser, CommonJS in tests.
 */
(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    root.RwaInteractionWindows = api;
  }

  /* Browser auto-init, once. The parent deck loads this file on every
     voice-boot page; pages without nested windows simply find no hosts. */
  if (root && root.document && root.document.body) {
    const boot = function () {
      if (root.rwaInteractionWindows) return;
      root.rwaInteractionWindows = api.create({doc: root.document, win: root});
    };
    if (root.document.readyState === 'loading') {
      root.document.addEventListener('DOMContentLoaded', boot);
    } else {
      boot();
    }
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const POLL_MS = 250;
  const CLUSTER = 'rwa-iw-cluster';
  const CLOSE_CLASS = 'rwa-iw-close';
  const HINT_SEEN_ONCE = true;
  /* On phones the launcher fits a virtual 1600px canvas into ~844px, and the
     calculator shells scale their frames again. A label authored in CSS px
     would then be ~0.5 of its intended size, so the block is inverse-scaled
     by the measured frame chain — bounded, because past ~2.4x it would eat
     the window it belongs to. */
  const MAX_INVERSE_SCALE = 2.4;
  const MIN_USABLE_SCALE = 0.98;

  const STRINGS = {
    ru: {
      backToDeck: 'К презентации',
      backToFinflow: 'К FinFlow',
      hintDeck: 'После просмотра нажмите «К презентации», чтобы продолжить',
      hintFinflow: 'После просмотра нажмите «К FinFlow», чтобы вернуться к карточкам',
      continueDeck: 'Продолжить презентацию',
      continueFinflow: 'Вернуться к FinFlow',
      ariaDeck: 'Закрыть окно и вернуться к презентации',
      ariaFinflow: 'Закрыть формулы и вернуться к FinFlow',
      ariaRotate: 'Закрыть подсказку и вернуться к презентации',
      of: 'из',
    },
    en: {
      backToDeck: 'Back to presentation',
      backToFinflow: 'Back to FinFlow',
      hintDeck: 'When you are done, press “Back to presentation” to continue',
      hintFinflow: 'When you are done, press “Back to FinFlow” to return to the cards',
      continueDeck: 'Continue presentation',
      continueFinflow: 'Back to FinFlow',
      ariaDeck: 'Close this window and return to the presentation',
      ariaFinflow: 'Close the formulas and return to FinFlow',
      ariaRotate: 'Close this hint and return to the presentation',
      of: 'of',
    },
  };

  /* Slide titles are used for the local header, keyed by the frame document. */
  const TITLES = {
    slide_09_ranks: {ru: 'Карьерные ранги', en: 'Career ranks'},
    slide_04_inside: {ru: 'Что внутри NFT', en: 'Inside the NFT'},
    slide_10_vip: {ru: 'NFT Limited Edition', en: 'NFT Limited Edition'},
    slide_08_finflow: {ru: 'Математика FinFlow', en: 'FinFlow math'},
    slide_07c_simple_calc: {ru: 'Калькулятор партнёрской программы', en: 'Partner programme calculator'},
    finflow_calculator_lite: {ru: 'Калькулятор FinFlow', en: 'FinFlow calculator'},
    slide_06_system: {ru: 'Экосистема FinFlow', en: 'FinFlow ecosystem'},
    formulas: {ru: 'Формулы FinFlow', en: 'FinFlow formulas'},
    window: {ru: 'Раздел', en: 'Section'},
  };

  /* The six shells of slide_06 carry meaningful iframe titles already. */
  const HOST_TITLES = {
    nftModal: {ru: 'Что внутри ключа', en: 'Inside the key'},
    mathModal: {ru: 'Математика FinFlow', en: 'FinFlow math'},
    calcModal: {ru: 'Калькулятор FinFlow', en: 'FinFlow calculator'},
    partnerModal: {ru: 'Партнёрская программа', en: 'Partner programme'},
    careerModal: {ru: 'Карьерные ранги', en: 'Career ranks'},
    vipModal: {ru: 'NFT Limited Edition', en: 'NFT Limited Edition'},
  };

  const FALLBACK_STEPS = {
    slide_04_inside: 7,
    slide_10_vip: 4,
    slide_08_finflow: 5,
    slide_09_ranks: 9,
  };

  const RANKS_TOTAL = 8;

  function create(options) {
    const doc = options && options.doc;
    const win = options && options.win;
    if (!doc || !win) throw new TypeError('create({doc, win}) is required');

    /* A live instance already decorating this document is replaced, never
       stacked: labels and blocks must not double up. */
    if (win.rwaInteractionWindows && typeof win.rwaInteractionWindows.destroy === 'function') {
      win.rwaInteractionWindows.destroy();
    }

    const hosts = [];
    const bindings = [];   /* {target, type, fn, capture} for destroy()      */
    const frames = [];     /* contentDocument listeners, re-bound on reload  */
    let timer = null;
    let dead = false;
    let instance = null;

    const state = {
      started: false,
      helpOpen: false,
      lang: 'en',
      hosts: Object.create(null),
      rotateHint: {closeLabel: null},
    };
    /* Last strings written to the rotate cross: polling must not churn ARIA. */
    const rotate = {label: null, aria: null};

    /* ------------------------------------------------------------ helpers */

    function bind(target, type, fn, capture) {
      if (!target || typeof target.addEventListener !== 'function') return;
      target.addEventListener(type, fn, capture === true);
      bindings.push({target, type, fn, capture: capture === true});
    }

    function unbindAll() {
      for (const item of bindings) {
        try { item.target.removeEventListener(item.type, item.fn, item.capture); } catch (e) {}
      }
      bindings.length = 0;
      /* Listeners live in nested documents too (the frame may outlive us). */
      for (const item of frames) {
        try { item.target.removeEventListener(item.type, item.fn, item.capture); } catch (e) {}
      }
      frames.length = 0;
    }

    function make(tag, cls) {
      const node = doc.createElement(tag);
      if (cls) node.className = cls;
      return node;
    }

    function setText(node, value) {
      const next = value == null ? '' : String(value);
      /* Animated carousels repaint at RAF; rewriting identical strings on
         every poll tick would churn the DOM for nothing. */
      if (node.textContent !== next) node.textContent = next;
    }

    function setVisible(node, on) {
      if (!node) return;
      node.classList.toggle('is-on', !!on);
    }

    function hasClass(node, name) {
      return !!(node && node.classList && node.classList.contains(name));
    }

    function attr(node, name) {
      if (!node || typeof node.getAttribute !== 'function') return null;
      const value = node.getAttribute(name);
      return value === undefined ? null : value;
    }

    function all(scope, selector) {
      if (!scope) return [];
      const query = typeof scope.querySelectorAll === 'function' ? scope : scope.body;
      if (!query || typeof query.querySelectorAll !== 'function') return [];
      const found = query.querySelectorAll(selector);
      return found ? Array.prototype.slice.call(found) : [];
    }

    function textOf(node) {
      return node ? String(node.textContent || '') : '';
    }

    function number(value) {
      const n = Number(value);
      return Number.isFinite(n) ? n : null;
    }

    function lang() {
      try {
        return win.I18N && win.I18N.current === 'ru' ? 'ru' : 'en';
      } catch (e) {
        return 'en';
      }
    }

    function dict(code) {
      return STRINGS[code] || STRINGS.en;
    }

    function titleFor(key, code) {
      const row = TITLES[key] || TITLES.window;
      return row[code] || row.en;
    }

    function gateStarted() {
      try {
        const top = win.top || win;
        const gate = top.VoiceGate;
        if (!gate || typeof gate.started !== 'function') return true;
        return gate.started() !== false;
      } catch (e) {
        return true;
      }
    }

    function helpOpen() {
      const roots = all(doc, '.voice-help');
      for (const root of roots) if (!root.hidden) return true;
      return false;
    }

    /* --------------------------------------------------- host discovery */

    function frameOf(host) {
      return host.frame || null;
    }

    function srcOf(host) {
      const frame = frameOf(host);
      if (!frame) return '';
      return attr(frame, 'src') || frame.src || '';
    }

    function slugOf(src) {
      const match = /([a-z0-9_]+)\.html/i.exec(String(src || ''));
      return match ? match[1].toLowerCase() : '';
    }

    function resolveKind(host) {
      if (host.fixedKind) return host.fixedKind;
      const src = srcOf(host);
      if (!src || /^about:blank/i.test(src)) return 'blank';
      const slug = slugOf(src);
      if (slug === 'slide_09_ranks') return 'ranks';
      if (slug === 'slide_08_finflow') return 'steps0';
      if (slug === 'slide_04_inside' || slug === 'slide_10_vip') return 'steps';
      return 'single';
    }

    function contentWindow(host) {
      const frame = frameOf(host);
      if (!frame) return null;
      try {
        return frame.contentWindow || null;
      } catch (e) {
        return null;
      }
    }

    function contentDocument(host) {
      const frame = frameOf(host);
      if (!frame) return null;
      try {
        return frame.contentDocument || null;
      } catch (e) {
        return null;
      }
    }

    /* Product of the same-origin frame chain: visual rect / layout width.
       #screenFrame carries the phone canvas scale (1600 -> viewport), an
       outer slide frame adds its own. The root launcher document has no
       frameElement and therefore stays at 1. */
    function outerScale() {
      let scale = 1;
      try {
        let view = win;
        for (let depth = 0; depth < 6; depth++) {
          const frame = view && view.frameElement;
          if (!frame || typeof frame.getBoundingClientRect !== 'function') break;
          const rect = frame.getBoundingClientRect();
          const layout = frame.clientWidth || frame.offsetWidth || 0;
          if (rect && layout && rect.width) {
            const ratio = rect.width / layout;
            if (ratio > 0.05 && ratio < 20) scale *= ratio;
          }
          if (!view.parent || view.parent === view) break;
          view = view.parent;
        }
      } catch (e) {}
      return scale;
    }

    /* Keep the block and the cross at real, touchable size. */
    function applyScale(host) {
      const scale = outerScale();
      let inverse = 1;
      if (scale > 0 && scale < MIN_USABLE_SCALE) {
        inverse = Math.min(MAX_INVERSE_SCALE, 1 / scale);
      }
      host.scale = inverse;
      const transform = inverse > 1 ? 'scale(' + inverse.toFixed(3) + ')' : '';
      if (host.cluster && host.cluster.style) {
        host.cluster.style.transformOrigin = 'top right';
        host.cluster.style.transform = transform;
      }
      if (host.close && host.close.style) {
        host.close.style.transformOrigin = 'top right';
        host.close.style.transform = transform;
      }
    }

    function currentStep(host) {
      const cw = contentWindow(host);
      if (!cw) return null;
      try {
        return number(cw._currentStep);
      } catch (e) {
        return null;
      }
    }

    function configuredSteps(host) {
      const cw = contentWindow(host);
      if (!cw) return null;
      try {
        const slides = cw.VoiceSlides;
        if (!slides || typeof slides.getSlideConfig !== 'function') return null;
        const config = slides.getSlideConfig(cw.location && cw.location.pathname);
        return config && config.steps && config.steps.length ? config.steps.length : null;
      } catch (e) {
        return null;
      }
    }

    function totalSteps(host, kind) {
      const configured = configuredSteps(host);
      if (configured) return configured;
      const slug = slugOf(srcOf(host));
      if (FALLBACK_STEPS[slug]) return FALLBACK_STEPS[slug];
      return null;
    }

    /* The formulas window is our own document: #fcCount already reflects the
       real card position, so it is parsed instead of guessed. */
    function formulasCount() {
      const node = doc.getElementById('fcCount');
      if (!node) return null;
      const match = /(\d+)\s*\/\s*(\d+)/.exec(textOf(node));
      if (!match) return null;
      const current = Number(match[1]);
      const total = Number(match[2]);
      if (!total) return null;
      return {current, total};
    }

    function discover() {
      const screen = doc.getElementById('screenModal');
      if (screen) {
        const close = doc.getElementById('screenClose');
        if (close) {
          hosts.push({
            key: 'screenModal',
            root: screen,
            close,
            frame: doc.getElementById('screenFrame'),
            titleKey: 'screen',
            returnTo: 'deck',
          });
        }
      }

      /* slide_08_finflow.html: formulas sit in the same document as us. */
      const formulas = doc.getElementById('modal');
      if (formulas && doc.getElementById('modalClose') && doc.getElementById('fcCount')) {
        hosts.push({
          key: 'formulasModal',
          root: formulas,
          close: doc.getElementById('modalClose'),
          frame: null,
          fixedKind: 'formulas',
          titleKey: 'formulas',
          returnTo: 'finflow',
        });
      }

      for (const modal of all(doc, '.calc-modal')) {
        const close = modal.querySelector('.calc-close');
        if (!close) continue;
        hosts.push({
          key: modal.id || ('calc-' + (modal.className || '').replace(/\s+/g, '-')),
          root: modal,
          close,
          frame: modal.querySelector('iframe'),
          titleKey: modal.id || 'calc',
          returnTo: 'deck',
        });
      }

      for (const host of hosts) {
        host.open = false;
        host.kind = 'blank';
        host.hintSeen = false;
        host.hintVisible = false;
        host.ctaVisible = false;
        host.progress = '';
        host.title = '';
        host.closeLabel = '';
        host.ariaLabel = '';
        host.frameDoc = null;
        build(host);
      }
    }

    /* ------------------------------------------------------------ markup */

    function build(host) {
      const cluster = make('div', CLUSTER);
      cluster.setAttribute('data-rwa-iw-cluster', host.key);

      const row = make('div', 'rwa-iw-close-row');
      const label = make('button', 'rwa-iw-close-label');
      label.setAttribute('type', 'button');
      label.setAttribute('data-rwa-iw-close-label', '');
      row.appendChild(label);

      const meta = make('div', 'rwa-iw-meta');
      const title = make('div', 'rwa-iw-title');
      const progress = make('div', 'rwa-iw-progress');
      meta.appendChild(title);
      meta.appendChild(progress);

      const hint = make('div', 'rwa-iw-hint');
      const cta = make('button', 'rwa-iw-cta');
      cta.setAttribute('type', 'button');

      cluster.appendChild(row);
      cluster.appendChild(meta);
      cluster.appendChild(hint);
      cluster.appendChild(cta);
      host.root.appendChild(cluster);

      host.cluster = cluster;
      host.nodes = {label, title, progress, hint, cta};

      decorateClose(host);

      /* The block lives over a slide document: nothing that happens inside it
         may reach the deck's paging handlers. */
      for (const type of ['click', 'keydown', 'mousedown', 'pointerdown', 'wheel']) {
        cluster.addEventListener(type, function (event) {
          if (type === 'keydown' && event && event.key === 'Escape') return;
          if (event && typeof event.stopPropagation === 'function') event.stopPropagation();
        });
      }

      label.addEventListener('click', function (event) {
        if (event && typeof event.stopPropagation === 'function') event.stopPropagation();
        closeHost(host);
      });

      cta.addEventListener('click', function (event) {
        if (event && typeof event.stopPropagation === 'function') event.stopPropagation();
        closeHost(host);
      });

      place(host);
    }

    function decorateClose(host) {
      const close = host.close;
      if (!close) return;
      close.classList.add(CLOSE_CLASS);

      const tag = String(close.tagName || '').toUpperCase();
      if (tag !== 'BUTTON') {
        /* DIV fallback: the parent turns the main ones into real buttons, but
           a page that still has a div must stay operable meanwhile. */
        if (!attr(close, 'role')) close.setAttribute('role', 'button');
        if (!attr(close, 'tabindex')) close.setAttribute('tabindex', '0');
        bind(close, 'keydown', function (event) {
          const key = event && event.key;
          if (key !== 'Enter' && key !== ' ' && key !== 'Spacebar') return;
          if (typeof event.preventDefault === 'function') event.preventDefault();
          if (typeof event.stopPropagation === 'function') event.stopPropagation();
          if (typeof close.click === 'function') close.click();
        });
      }

      /* The audio owner can be a deeper iframe, so its listening guard may
         not contain keys on this parent document. Keep native activation,
         but never let Enter/Space page the background SlideEngine. */
      for (const type of ['keydown', 'keypress', 'keyup']) {
        bind(close, type, function (event) {
          if (event && ['Enter', ' ', 'Spacebar', 'ArrowRight', 'ArrowLeft',
              'PageUp', 'PageDown', 'Home', 'End'].indexOf(event.key) !== -1 &&
              typeof event.stopPropagation === 'function') event.stopPropagation();
        });
      }
      bind(close, 'click', function (event) {
        if (event && typeof event.stopPropagation === 'function') event.stopPropagation();
      });
    }

    /* Calling the live control keeps the slide's own close path (voice stop,
       frame reset, timers) exactly as it was. */
    function closeHost(host) {
      const close = host && host.close;
      if (!close) return;
      if (typeof close.click === 'function') {
        close.click();
        return;
      }
      try {
        const event = doc.createEvent('MouseEvents');
        event.initEvent('click', true, true);
        close.dispatchEvent(event);
      } catch (e) {}
    }

    /* Align the block with the real cross, left of it, when layout exists. */
    function place(host) {
      const cluster = host.cluster;
      if (!cluster || !cluster.style) return;
      try {
        const hostRect = host.root.getBoundingClientRect();
        const closeRect = host.close.getBoundingClientRect();
        if (!hostRect || !closeRect || !hostRect.width || !closeRect.width) return;
        const gap = Math.round(10 * (host.scale || 1));
        cluster.style.top = Math.max(8, Math.round(closeRect.top - hostRect.top)) + 'px';
        cluster.style.right = Math.max(8, Math.round(hostRect.right - closeRect.left + gap)) + 'px';
        cluster.style.left = 'auto';
        cluster.style.bottom = 'auto';
      } catch (e) {}
    }

    /* ---------------------------------------------------------- progress */

    function progressFor(host, kind, code) {
      const words = dict(code);
      if (kind === 'formulas') {
        const count = formulasCount();
        if (!count) return null;
        return {
          text: count.current + ' ' + words.of + ' ' + count.total,
          atEnd: count.current >= count.total,
        };
      }

      if (kind === 'ranks') {
        const step = currentStep(host);
        if (step === null) return null;
        if (step < 2) return {text: '', atEnd: false};   /* intro is not progress */
        const rank = Math.min(step - 1, RANKS_TOTAL);
        return {
          text: host.title + ' · ' + rank + ' ' + words.of + ' ' + RANKS_TOTAL,
          atEnd: step >= 9,
        };
      }

      if (kind === 'steps' || kind === 'steps0') {
        const step = currentStep(host);
        if (step === null) return null;
        const total = totalSteps(host, kind);
        if (!total) return null;
        const current = kind === 'steps0' ? step + 1 : step;
        if (current < 1) return null;
        const capped = Math.min(current, total);
        return {
          text: capped + ' ' + words.of + ' ' + total,
          atEnd: current >= total,
        };
      }

      /* One-page calculators have no honest "end": they explain the return and
         never claim the whole section was viewed. */
      return null;
    }

    /* ----------------------------------------------------------- refresh */

    function hintTextFor(host, code) {
      const words = dict(code);
      return host.returnTo === 'finflow' ? words.hintFinflow : words.hintDeck;
    }

    function ctaTextFor(host, code) {
      const words = dict(code);
      return host.returnTo === 'finflow' ? words.continueFinflow : words.continueDeck;
    }

    function closeLabelFor(host, code) {
      const words = dict(code);
      return host.returnTo === 'finflow' ? words.backToFinflow : words.backToDeck;
    }

    function ariaFor(host, code) {
      const words = dict(code);
      return host.returnTo === 'finflow' ? words.ariaFinflow : words.ariaDeck;
    }

    function titleOf(host, code) {
      if (host.fixedKind === 'formulas') return titleFor('formulas', code);
      const preset = HOST_TITLES[host.key];
      if (preset) return preset[code] || preset.en;
      const slug = slugOf(srcOf(host));
      return titleFor(slug || 'window', code);
    }

    function updateHost(host, allowed, code) {
      const open = hasClass(host.root, 'open');
      host.open = open;

      /* The cross always says where it goes, even while the nested document is
         still about:blank. That label is the whole point of the change. */
      const closeLabel = closeLabelFor(host, code);
      const ariaLabel = ariaFor(host, code);
      if (host.closeLabel !== closeLabel) {
        host.closeLabel = closeLabel;
        setText(host.nodes.label, closeLabel);
      }
      if (host.ariaLabel !== ariaLabel) {
        host.ariaLabel = ariaLabel;
        host.close.setAttribute('aria-label', ariaLabel);
        host.nodes.label.setAttribute('aria-label', ariaLabel);
      }

      if (!open || !allowed) {
        host.hintVisible = false;
        host.ctaVisible = false;
        setVisible(host.cluster, false);
        return;
      }

      host.kind = resolveKind(host);
      host.title = titleOf(host, code);
      setText(host.nodes.title, host.kind === 'blank' ? '' : host.title);

      /* Scale first, then place: the measured cross already includes its own
         inverse transform, so the gap stays visually constant. */
      applyScale(host);

      const progress = progressFor(host, host.kind, code);
      host.progress = progress ? progress.text : '';
      setText(host.nodes.progress, host.progress);

      /* A preload frame is not a viewed section: no hint, no completion. */
      const real = host.kind !== 'blank';
      if (!real) host.hintVisible = false;
      /* "Seen" is permanent, "visible" is until the first interaction: marking
         the hint as shown must not erase it on the next poll tick. */
      if (real && !host.hintSeen) {
        host.hintSeen = HINT_SEEN_ONCE;
        host.hintVisible = true;
      }
      const hintText = real && host.hintVisible ? hintTextFor(host, code) : '';
      host.hintVisible = !!hintText;
      setText(host.nodes.hint, hintText);

      const atEnd = host.kind !== 'single' && host.kind !== 'blank' && !!(progress && progress.atEnd);
      host.ctaVisible = atEnd;
      setText(host.nodes.cta, atEnd ? ctaTextFor(host, code) : '');
      setVisible(host.nodes.cta, atEnd);

      setVisible(host.cluster, true);
      place(host);
      bindDismiss(host);
    }

    /* First real open explains the exit once; any interaction or the close
       itself retires the hint for good. */
    function bindDismiss(host) {
      if (!host.dismissBound) {
        host.dismissBound = true;
        const mark = function () {
          if (!host.hintSeen) return;
          if (!host.hintVisible) return;
          host.hintVisible = false;
          setText(host.nodes.hint, '');
          setVisible(host.nodes.hint, false);
        };
        for (const type of ['pointerdown', 'touchstart', 'wheel', 'keydown']) {
          bind(host.root, type, mark, true);
        }
        host.dismiss = mark;
      }

      /* Clicks inside a same-origin iframe never reach the parent document. */
      const cd = contentDocument(host);
      if (!cd || typeof cd.addEventListener !== 'function') return;
      if (host.frameDoc === cd) return;
      host.frameDoc = cd;
      const mark = host.dismiss;
      for (const type of ['pointerdown', 'wheel', 'keydown']) {
        try {
          cd.addEventListener(type, mark, true);
          frames.push({target: cd, type, fn: mark, capture: true});
        } catch (e) {}
      }
    }

    function updateRotate(code) {
      const words = dict(code);
      const close = all(doc, '.rh-close')[0];
      const rootEl = doc.getElementById('rotateHint');
      if (!close || !rootEl) {
        state.rotateHint.closeLabel = null;
        return;
      }
      close.classList.add(CLOSE_CLASS);
      if (rotate.label !== words.backToDeck) {
        rotate.label = words.backToDeck;
        close.setAttribute('data-rwa-iw-label', words.backToDeck);
      }
      if (rotate.aria !== words.ariaRotate) {
        rotate.aria = words.ariaRotate;
        close.setAttribute('aria-label', words.ariaRotate);
      }
      state.rotateHint.closeLabel = words.backToDeck;
    }

    function refresh() {
      if (dead) return snapshot();
      const code = lang();
      const started = gateStarted();
      const help = helpOpen();

      state.lang = code;
      state.started = started;
      state.helpOpen = help;

      const allowed = started && !help;
      for (const host of hosts) updateHost(host, allowed, code);
      /* The portrait overlay covers the nested window, so its own cross must
         always carry the return label — including while help is open. */
      updateRotate(code);

      state.hosts = Object.create(null);
      for (const host of hosts) {
        state.hosts[host.key] = {
          open: !!host.open,
          kind: host.kind,
          title: host.title,
          progress: host.progress,
          atEnd: !!(host.ctaVisible),
          hint: host.hintVisible ? textOf(host.nodes.hint) : '',
          hintVisible: !!host.hintVisible,
          cta: host.ctaVisible ? textOf(host.nodes.cta) : '',
          ctaVisible: !!host.ctaVisible,
          closeLabel: host.closeLabel,
          ariaLabel: host.ariaLabel,
        };
      }
      return snapshot();
    }

    function snapshot() {
      const copy = {
        started: state.started,
        helpOpen: state.helpOpen,
        lang: state.lang,
        hosts: Object.create(null),
        rotateHint: {closeLabel: state.rotateHint.closeLabel},
      };
      for (const key of Object.keys(state.hosts)) copy.hosts[key] = state.hosts[key];
      return copy;
    }

    /* ------------------------------------------------------------- wiring */

    discover();

    /* One bounded tick, only when this document actually has nested windows. */
    if (hosts.length && typeof win.setInterval === 'function') {
      timer = win.setInterval(function () {
        try { refresh(); } catch (e) {}
      }, POLL_MS);
    }

    bind(win, 'resize', function () { refresh(); }, true);
    bind(doc, 'click', function () { refresh(); }, true);
    bind(doc, 'keydown', function () { refresh(); }, true);

    refresh();

    /* window.rwaInteractionWindows is the live instance (not the factory), so
       a QA script can call refresh()/state()/destroy() and a second load
       cannot stack a duplicate block on the same cross. */
    instance = {
      refresh: refresh,
      state: snapshot,
      destroy: function () {
        if (dead) return;
        dead = true;
        if (timer !== null && typeof win.clearInterval === 'function') {
          win.clearInterval(timer);
          timer = null;
        }
        unbindAll();
        for (const host of hosts) {
          if (host.cluster && host.cluster.parentNode) {
            try { host.cluster.parentNode.removeChild(host.cluster); } catch (e) {}
          }
          host.cluster = null;
        }
        hosts.length = 0;
        if (win.rwaInteractionWindows === instance) delete win.rwaInteractionWindows;
      },
    };
    win.rwaInteractionWindows = instance;

    return instance;
  }

  const api = {create, POLL_MS, version: '1.0.0'};
  return api;
});
