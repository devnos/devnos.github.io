/*
 * RWA NFT — interaction controls (cards, one-time hints, local NFT progress).
 *
 * Scope (deliberately narrow, no runtime of its own):
 *   • permanent small action marker on the five real 3D flip cards of
 *     slide_06 + keyboard reachability for those div cards;
 *   • one explicit "view specifications / show NFT" button on the centre card
 *     of slide_14, isolated from the drag physics and from the deck click;
 *   • one grouped "drag the slider" hint per real range group;
 *   • a local "choose NFT · N of M" counter bound to the immediate carousel state (step 0) and
 *     a single swipe hint that leaves after real browsing.
 *
 * Hard rules honoured here: nothing starts before the top VoiceGate reports
 * started; one-time hints are only spent by a visible, active frame; no
 * renderer is reimplemented — the slides keep their own flip/step engines and
 * this module only reads their state and clicks their own controls.
 *
 * Public API: window.RwaInteractionControls.create({doc, win})
 *   -> { refresh(), destroy(), state() }
 * A single browser instance auto-inits on DOMContentLoaded (or immediately).
 */
(function (root, factory) {
  'use strict';
  const api = factory();

  if (typeof module === 'object' && module.exports) {
    module.exports = api;
    return;
  }

  root.RwaInteractionControls = api;
  /* Some embeddings evaluate this file against a sandbox global whose real
     window is one hop away; publish there too so the deck always finds it. */
  if (root.window && root.window !== root) {
    try { root.window.RwaInteractionControls = api; } catch (e) {}
  }

  function boot() {
    if (!root.document) return null;
    if (root.rwaInteractionControls) return root.rwaInteractionControls;
    const w = root.window && root.window.document ? root.window : root;
    try {
      const instance = api.create({ doc: root.document, win: w });
      root.rwaInteractionControls = instance;
      if (w !== root) { try { w.rwaInteractionControls = instance; } catch (e) {} }
      return instance;
    } catch (e) {
      return null;
    }
  }

  if (root.document && root.document.readyState === 'loading') {
    root.document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const POLL_MS = 300;
  const HIDDEN = 'rwa-hidden';

  const TEXT = {
    ru: {
      flip: 'Перевернуть',
      flipAria: 'Перевернуть карточку',
      inside: 'Что внутри ключа',
      choose: 'Выберите действие',
      openRanks: 'Открыть ранги',
      openCalc: 'Открыть калькулятор',
      openVip: 'Открыть VIP',
      specs: 'Посмотреть характеристики',
      showNft: 'Показать NFT',
      swipe: 'Листайте карты стрелками или перетаскивайте',
      range: 'Перетащите ползунок, чтобы изменить расчёт',
    },
    en: {
      flip: 'Flip',
      flipAria: 'Flip the card',
      inside: 'What is inside the key',
      choose: 'Choose an action',
      openRanks: 'Open the ranks',
      openCalc: 'Open the calculator',
      openVip: 'Open VIP',
      specs: 'View specifications',
      showNft: 'Show NFT',
      swipe: 'Browse the cards with the arrows or by dragging',
      range: 'Drag the slider to change the calculation',
    },
  };

  /* The five real flip cards of slide_06 — ids owned by that slide. */
  const FLIP_CARDS = [
    { id: 'nftFlip', back: 'inside' },
    { id: 'finproFlip', back: 'choose', nested: true },
    { id: 'partnerFlip', back: 'openCalc' },
    { id: 'careerFlip', back: 'openRanks' },
    { id: 'vipFlip', back: 'openVip' },
  ];

  /* Real ranges and the block each group hint belongs to. */
  const RANGE_GROUPS = {
    mktSlider: { group: '.n-slider-row', mode: 'after-group' },
    fillRange: { group: '.sidefill', mode: 'append-group' },
    ml1: { group: '#panelMatching', mode: 'prepend-group' },
    slider: { mode: 'after-input' },
    phSlider: { group: '.ph-sliders', mode: 'prepend-group' },
    rpSlider: { group: '.ph-sliders', mode: 'prepend-group' },
  };

  function counterText(lang, index, total) {
    return lang === 'ru'
      ? 'Выбор NFT · ' + index + ' из ' + total
      : 'Choose NFT · ' + index + ' of ' + total;
  }

  function create(options) {
    const opts = options || {};
    const win = opts.win || null;
    const doc = opts.doc || (win && win.document) || null;
    if (!doc || !win) throw new Error('create({doc, win}) needs both a document and a window');

    let destroyed = false;
    let timer = null;
    const flips = [];
    const rangeGroups = [];
    let hintSeq = 0;
    let nftBox = null;
    let cardButton = null;
    let cardLabel = null;
    const lastNft = { step: null, index: null, total: null };

    /* ---------- tiny DOM kit (works with the bounded test adapter) ---------- */

    function el(tag, className, text) {
      const node = doc.createElement(tag);
      if (className) node.className = className;
      if (text !== undefined) node.textContent = text;
      return node;
    }

    function setAttr(node, name, value) {
      if (!node) return;
      try { node.setAttribute(name, String(value)); } catch (e) {}
    }

    function removeAttr(node, name) {
      if (!node) return;
      try {
        if (typeof node.removeAttribute === 'function') { node.removeAttribute(name); return; }
      } catch (e) {}
      if (node.attrs) delete node.attrs[name];
      if (name === 'hidden') node.hidden = false;
    }

    function hide(node, hidden) {
      if (!node) return;
      node.hidden = !!hidden;
      if (hidden) setAttr(node, 'hidden', '');
      else removeAttr(node, 'hidden');
      if (node.classList) node.classList.toggle(HIDDEN, !!hidden);
    }

    function isHidden(node) {
      return !node || node.hidden === true || !!(node.classList && node.classList.contains(HIDDEN));
    }

    function hasClass(node, name) {
      return !!(node && node.classList && node.classList.contains(name));
    }

    function toArray(list) {
      const out = [];
      if (!list) return out;
      for (let i = 0; i < list.length; i++) out.push(list[i]);
      return out;
    }

    function body() {
      return doc.body || doc.documentElement || doc;
    }

    function detach(node) {
      if (node && node.parentNode) {
        try { node.parentNode.removeChild(node); } catch (e) {}
      }
    }

    function nextSiblingOf(node) {
      if (!node) return null;
      if (node.nextSibling !== undefined) return node.nextSibling;
      const parent = node.parentNode;
      if (!parent || !parent.children) return null;
      const i = parent.children.indexOf(node);
      return i >= 0 && parent.children[i + 1] ? parent.children[i + 1] : null;
    }

    /* prepend/insertBefore/appendChild in one place: the bounded adapter only
       implements appendChild, a browser takes the exact position. */
    function place(parent, node, ref) {
      if (!parent) return null;
      if (ref !== null && ref !== undefined && typeof parent.insertBefore === 'function') {
        try { parent.insertBefore(node, ref); return node; } catch (e) {}
      }
      parent.appendChild(node);
      return node;
    }

    /* ---------- language, gate, visibility ---------- */

    function lang() {
      try {
        const i18n = win.I18N;
        if (i18n && i18n.current === 'ru') return 'ru';
      } catch (e) {}
      return 'en';
    }

    function t(key) {
      const row = TEXT[lang()];
      return (row && row[key]) || TEXT.en[key] || '';
    }

    /* The deck lives in the top document; a slide opened on its own is top. */
    function gateStarted() {
      const candidates = [];
      try { if (win.top && win.top !== win) candidates.push(win.top); } catch (e) {}
      try { if (win.parent && win.parent !== win && candidates.indexOf(win.parent) < 0) candidates.push(win.parent); } catch (e) {}
      candidates.push(win);
      for (let i = 0; i < candidates.length; i++) {
        try {
          const gate = candidates[i] && candidates[i].VoiceGate;
          if (gate && typeof gate.started === 'function') return !!gate.started();
        } catch (e) {}
      }
      return true; /* no gate on this page: plain QA, nothing to wait for */
    }

    function frameActive(node) {
      if (!node) return false;
      try {
        if (doc.hidden || doc.visibilityState === 'hidden') return false;
      } catch (e) {}
      if (typeof win.getComputedStyle === 'function') {
        try {
          const cs = win.getComputedStyle(node);
          if (cs && (cs.display === 'none' || cs.visibility === 'hidden' || cs.opacity === '0')) return false;
        } catch (e) {}
      }
      if (typeof node.getBoundingClientRect === 'function') {
        try {
          const rect = node.getBoundingClientRect();
          if (rect && (rect.width === 0 || rect.height === 0)) return false;
        } catch (e) {}
      }
      /* a preloaded / inactive frame must not spend a one-time hint */
      let w = win;
      let guard = 0;
      while (w && guard++ < 6) {
        let fe = null;
        try { fe = w.frameElement; } catch (e) { fe = null; }
        if (!fe) break;
        if (typeof fe.getBoundingClientRect === 'function') {
          try {
            const rect = fe.getBoundingClientRect();
            if (rect && (rect.width === 0 || rect.height === 0)) return false;
          } catch (e) {}
        }
        let next = null;
        try { next = w.parent; } catch (e) { next = null; }
        if (!next || next === w) break;
        w = next;
      }
      return true;
    }

    /* Phone landscape hands the slide a 1600px virtual frame drawn with a CSS
       scale; labels would shrink to ~6px. Read the real scale from the frame
       chain and hand every module-owned control its inverse. */
    function viewScale() {
      let s = 1;
      let w = win;
      let guard = 0;
      while (w && guard++ < 6) {
        let fe = null;
        try { fe = w.frameElement; } catch (e) { fe = null; }
        if (!fe) break;
        let layout = 0;
        let visual = 0;
        try { layout = fe.offsetWidth || 0; } catch (e) { layout = 0; }
        try { visual = fe.getBoundingClientRect ? fe.getBoundingClientRect().width : 0; } catch (e) { visual = 0; }
        if (layout > 0 && visual > 0) s *= visual / layout;
        let next = null;
        try { next = w.parent; } catch (e) { next = null; }
        if (!next || next === w) break;
        w = next;
      }
      if (!(s > 0)) return 1;
      return Math.min(3, Math.max(0.2, s));
    }

    function applyScale(node, scale) {
      if (!node || !node.style || typeof node.style.setProperty !== 'function') return;
      const inv = 1 / scale;
      if (Math.abs(inv - 1) < 0.02) {
        try { node.style.removeProperty('--rwa-inv-scale'); } catch (e) {}
        try { node.style.removeProperty('--rwa-touch-min'); } catch (e) {}
        return;
      }
      try { node.style.setProperty('--rwa-inv-scale', inv.toFixed(4)); } catch (e) {}
      try { node.style.setProperty('--rwa-touch-min', inv > 1 ? '44px' : '0px'); } catch (e) {}
    }

    /* ---------- slide 06: the five real flip cards ---------- */

    function ensureFlipMark(rec) {
      const mark = el('span', 'rwa-flip-mark');
      mark.setAttribute('aria-hidden', 'true');
      const icon = el('span', 'rwa-flip-ico', '⟳');
      const text = el('span', 'rwa-flip-txt', '');
      mark.appendChild(icon);
      mark.appendChild(text);
      rec.host.appendChild(mark);
      rec.mark = mark;
      rec.text = text;
    }

    function ensureFlipCard(cfg) {
      const host = doc.getElementById(cfg.id);
      if (!host) return null;

      let rec = null;
      for (let i = 0; i < flips.length; i++) if (flips[i].host === host) rec = flips[i];
      if (rec) return rec;

      /* the slide rebuilt this card: drop the stale record, keep it bounded */
      flips.slice().forEach(old => {
        if (old.id === cfg.id && old.host !== host) forgetFlip(old);
      });

      rec = { id: cfg.id, back: cfg.back, nested: !!cfg.nested, host: host, mark: null, text: null };
      flips.push(rec);

      if (host.classList) host.classList.add('rwa-action-host');
      ensureFlipMark(rec);

      setAttr(host, 'role', 'button');
      setAttr(host, 'tabindex', '0');
      setAttr(host, 'aria-label', t('flipAria'));

      rec.onKey = function (event) {
        if (!event || event.target !== host) return; /* nested native buttons keep their own keys */
        const key = event.key;
        if (key !== 'Enter' && key !== ' ' && key !== 'Spacebar') return;
        if (event.preventDefault) event.preventDefault();
        if (event.stopPropagation) event.stopPropagation();
        if (typeof host.click === 'function') host.click(); /* the slide's own flip handler */
      };
      host.addEventListener('keydown', rec.onKey);
      return rec;
    }

    function forgetFlip(rec) {
      if (!rec) return;
      if (rec.onKey) {
        try { rec.host.removeEventListener('keydown', rec.onKey); } catch (e) {}
      }
      detach(rec.mark);
      if (rec.host.classList) rec.host.classList.remove('rwa-action-host');
      removeAttr(rec.host, 'role');
      removeAttr(rec.host, 'tabindex');
      removeAttr(rec.host, 'aria-label');
      const i = flips.indexOf(rec);
      if (i >= 0) flips.splice(i, 1);
    }

    function updateFlipCards(started, scale) {
      FLIP_CARDS.forEach(cfg => ensureFlipCard(cfg));
      flips.slice().forEach(rec => {
        const flipped = hasClass(rec.host, 'flipped');
        const label = flipped ? t(rec.back) : t('flip');
        rec.text.textContent = label;
        setAttr(rec.host, 'aria-label', flipped ? t(rec.back) : t('flipAria'));
        if (rec.nested && flipped) {
          /* the back face exposes its own native buttons: hand focus over */
          removeAttr(rec.host, 'role');
          setAttr(rec.host, 'tabindex', '-1');
        } else {
          setAttr(rec.host, 'role', 'button');
          setAttr(rec.host, 'tabindex', started ? '0' : '-1');
        }
        applyScale(rec.mark, scale);
        hide(rec.mark, !started);
      });
    }

    /* ---------- slide 14: chooser button, counter, one-time swipe hint ---------- */

    function centreCard(cards) {
      for (let i = 0; i < cards.length; i++) if (hasClass(cards[i], 'center')) return cards[i];
      return null;
    }

    function readCarousel() {
      try {
        const carousel = win.RwaNftCarousel;
        if (!carousel || typeof carousel.state !== 'function') return null;
        const st = carousel.state();
        if (!st || typeof st !== 'object') return null;
        return st;
      } catch (e) {
        return null;
      }
    }

    function ensureNftBox() {
      if (nftBox) return nftBox;
      /* A full-bleed overlay inside the slide: it must not push the existing
         head layout (the phone frame is only ~740px tall) and must never sit
         on the cards, the dots or the CTA. */
      const host = doc.getElementById('slide') || body().querySelector('.slide') || doc.body;
      const box = el('div', 'rwa-nft-progress');
      const count = el('div', 'rwa-nft-count');
      const hint = el('div', 'rwa-nft-swipe');
      count.setAttribute('aria-live', 'off');
      hint.setAttribute('role', 'note');
      box.appendChild(count);
      box.appendChild(hint);
      host.appendChild(box);
      nftBox = { box: box, count: count, hint: hint, host: host, hintDone: false, firstIndex: null, flippedSeen: false };
      return nftBox;
    }

    function createCardButton() {
      const btn = el('button', 'rwa-card-action');
      btn.setAttribute('type', 'button');
      btn.setAttribute('data-no-click', '1');
      const icon = el('span', 'rwa-card-action-ico', '⟲');
      icon.setAttribute('aria-hidden', 'true');
      cardLabel = el('span', 'rwa-card-action-txt', '');
      btn.appendChild(icon);
      btn.appendChild(cardLabel);

      btn.addEventListener('pointerdown', function (e) { if (e && e.stopPropagation) e.stopPropagation(); });
      btn.addEventListener('pointerup', function (e) { if (e && e.stopPropagation) e.stopPropagation(); });
      btn.addEventListener('click', function (e) {
        if (e) {
          if (e.stopPropagation) e.stopPropagation();
          if (e.preventDefault) e.preventDefault();
        }
        toggleCentreCard();
      });
      btn.addEventListener('keydown', function (e) {
        if (!e || e.target !== btn) return;
        const key = e.key;
        if (key !== 'Enter' && key !== ' ' && key !== 'Spacebar') return;
        /* cancel the native key click so one press flips exactly once */
        if (e.preventDefault) e.preventDefault();
        if (e.stopPropagation) e.stopPropagation();
        toggleCentreCard();
      });
      cardButton = btn;
      return btn;
    }

    function syncCardButton(card) {
      if (!cardButton) return;
      const flipped = hasClass(card, 'flipped');
      const label = flipped ? t('showNft') : t('specs');
      if (cardLabel) cardLabel.textContent = label;
      setAttr(cardButton, 'aria-label', label);
      setAttr(cardButton, 'aria-pressed', flipped ? 'true' : 'false');
    }

    function toggleCentreCard() {
      if (destroyed) return;
      const card = centreCard(toArray(body().querySelectorAll('.ncard')));
      if (!card) return;
      card.classList.toggle('flipped'); /* same class the deck physics uses */
      syncCardButton(card);
    }

    function updateChooser(started, scale) {
      const cards = toArray(body().querySelectorAll('.ncard'));
      const st = readCarousel();
      if (!cards.length || !st) {
        if (nftBox) { hide(nftBox.count, true); hide(nftBox.hint, true); }
        if (cardButton) hide(cardButton, true);
        return;
      }

      const step = typeof st.step === 'number' ? st.step : null;
      const index = Number.isInteger(st.index) ? st.index : 0;
      const total = Number.isInteger(st.count) ? st.count : cards.length;
      lastNft.step = step;
      lastNft.index = index;
      lastNft.total = total;

      const box = ensureNftBox();
      applyScale(box.box, scale);
      const onChooser = step === 0;
      const active = frameActive(box.host);

      box.count.textContent = counterText(lang(), index + 1, total);
      hide(box.count, !(started && onChooser && active));

      if (started && onChooser) {
        if (box.firstIndex === null) box.firstIndex = index;
        for (let i = 0; i < cards.length; i++) if (hasClass(cards[i], 'flipped')) box.flippedSeen = true;
        if (!box.hintDone && (index !== box.firstIndex || box.flippedSeen) && active) box.hintDone = true;
      }
      box.hint.textContent = t('swipe');
      hide(box.hint, !(started && onChooser && !box.hintDone && active));

      const center = centreCard(cards);
      if (!center) {
        if (cardButton) hide(cardButton, true);
        return;
      }
      if (!cardButton) createCardButton();
      if (cardButton.parentNode !== center) {
        detach(cardButton);
        center.appendChild(cardButton); /* the active card owns the only action */
      }
      syncCardButton(center);
      applyScale(cardButton, scale);
      hide(cardButton, !(started && onChooser && active));
    }

    /* ---------- real sliders ---------- */

    function ensureRangeGroup(input) {
      const id = input.getAttribute('id') || '';
      const cfg = RANGE_GROUPS[id];
      if (!cfg) return null;

      const group = cfg.group ? (input.closest ? input.closest(cfg.group) : null) : input.parentNode;
      if (!group) return null;

      for (let i = 0; i < rangeGroups.length; i++) {
        if (rangeGroups[i].group === group) {
          attachRange(rangeGroups[i], input);
          return rangeGroups[i];
        }
      }

      hintSeq += 1;
      let hintId = 'rwa-range-hint-' + hintSeq;
      let guard = 0;
      while (doc.getElementById(hintId) && guard++ < 20) {
        hintSeq += 1;
        hintId = 'rwa-range-hint-' + hintSeq;
      }

      const hint = el('div', 'rwa-range-hint', t('range'));
      hint.setAttribute('id', hintId);
      hint.setAttribute('role', 'note');

      if (cfg.mode === 'append-group') {
        group.appendChild(hint);
      } else if (cfg.mode === 'prepend-group') {
        place(group, hint, group.children && group.children[0] ? group.children[0] : null);
      } else if (cfg.mode === 'after-group') {
        place(group.parentNode || group, hint, nextSiblingOf(group));
      } else {
        place(input.parentNode || group, hint, nextSiblingOf(input));
      }

      const rec = { group: group, hint: hint, inputs: [], consumed: false };
      rangeGroups.push(rec);
      attachRange(rec, input);
      return rec;
    }

    function attachRange(rec, input) {
      if (rec.inputs.indexOf(input) >= 0) return;
      rec.inputs.push(input);
      const previous = input.getAttribute('aria-describedby') || '';
      setAttr(input, 'data-rwa-describedby', previous);
      setAttr(input, 'aria-describedby', previous ? previous + ' ' + rec.hint.id : rec.hint.id);
    }

    function scanRanges() {
      const inputs = toArray(body().querySelectorAll('input'));
      for (let i = 0; i < inputs.length; i++) {
        const type = (inputs[i].getAttribute('type') || '').toLowerCase();
        if (type !== 'range') continue;
        ensureRangeGroup(inputs[i]);
      }
    }

    function updateRanges(started, scale) {
      rangeGroups.forEach(rec => {
        rec.hint.textContent = t('range');
        applyScale(rec.hint, scale);
        hide(rec.hint, !(started && !rec.consumed && frameActive(rec.group)));
      });
    }

    function onRangeInput(event) {
      if (destroyed || !event) return;
      const target = event.target;
      if (!target) return;
      for (let i = 0; i < rangeGroups.length; i++) {
        const rec = rangeGroups[i];
        if (rec.consumed || rec.inputs.indexOf(target) < 0) continue;
        /* an inactive/preloaded frame must not spend the hint */
        if (!gateStarted() || !frameActive(rec.group)) return;
        rec.consumed = true;
        hide(rec.hint, true);
        return;
      }
    }

    /* ---------- update loop ---------- */

    function update() {
      if (destroyed) return;
      const started = gateStarted();
      const scale = viewScale();
      updateFlipCards(started, scale);
      updateChooser(started, scale);
      scanRanges();
      updateRanges(started, scale);
    }

    function state() {
      return {
        started: gateStarted(),
        lang: lang(),
        scale: viewScale(),
        destroyed: destroyed,
        flips: flips.map(rec => ({
          id: rec.id,
          flipped: hasClass(rec.host, 'flipped'),
          label: rec.text ? rec.text.textContent : '',
          visible: !isHidden(rec.mark),
        })),
        rangeHints: rangeGroups.map(rec => ({
          group: rec.hint.id,
          inputs: rec.inputs.map(input => input.getAttribute('id')),
          consumed: rec.consumed,
          visible: !isHidden(rec.hint),
        })),
        nft: nftBox ? {
          step: lastNft.step,
          index: lastNft.index,
          total: lastNft.total,
          text: nftBox.count.textContent,
          visible: !isHidden(nftBox.count),
          hint: !isHidden(nftBox.hint),
          hintDone: nftBox.hintDone,
        } : null,
        card: cardButton ? {
          attached: !!cardButton.parentNode,
          label: cardLabel ? cardLabel.textContent : '',
          visible: !isHidden(cardButton),
        } : null,
      };
    }

    /* ---------- lifecycle ---------- */

    doc.addEventListener('input', onRangeInput, true);

    let onChange = null;
    try {
      const i18n = win.I18N;
      if (i18n && typeof i18n.onChange === 'function') {
        onChange = function () { if (!destroyed) update(); };
        i18n.onChange(onChange);
      }
    } catch (e) {}

    const setI = typeof win.setInterval === 'function' ? win.setInterval.bind(win) : null;
    if (setI) {
      try { timer = setI(function () { if (!destroyed) update(); }, POLL_MS); } catch (e) { timer = null; }
    }

    update();

    return {
      refresh: function () { update(); },
      destroy: function () {
        if (destroyed) return;
        destroyed = true;
        if (timer !== null) {
          try { (typeof win.clearInterval === 'function' ? win.clearInterval : clearInterval).call(win, timer); } catch (e) {}
          timer = null;
        }
        try { doc.removeEventListener('input', onRangeInput, true); } catch (e) {}
        flips.slice().forEach(forgetFlip);
        rangeGroups.slice().forEach(rec => {
          detach(rec.hint);
          rec.inputs.forEach(input => {
            const previous = input.getAttribute('data-rwa-describedby') || '';
            removeAttr(input, 'data-rwa-describedby');
            if (previous) setAttr(input, 'aria-describedby', previous);
            else removeAttr(input, 'aria-describedby');
          });
          const i = rangeGroups.indexOf(rec);
          if (i >= 0) rangeGroups.splice(i, 1);
        });
        if (nftBox) { detach(nftBox.box); nftBox = null; }
        if (cardButton) { detach(cardButton); cardButton = null; cardLabel = null; }
        onChange = null;
      },
      state: state,
    };
  }

  return { create: create, POLL_MS: POLL_MS };
});
