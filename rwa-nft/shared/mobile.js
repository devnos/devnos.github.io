/* ============================================================
   RWA NFT — МОБИЛЬНЫЙ РЕЖИМ (общий модуль для всех слайдов)

   Логика:
   • Телефон в портрете + слайд «кинематографичный» -> вежливо просим
     повернуть экран (композиция 16:9 в портрете нечитаема).
   • Телефон в альбоме -> слайд работает как на десктопе.
   • Слайд с собственной вертикальной вёрсткой помечает себя сам:
        <body data-mobile-ready>   или   window.MOBILE_READY = true;
     Тогда просьба повернуть не показывается.

   Подключение: <script src="../shared/mobile.js"></script> после i18n.js
   ============================================================ */
(function () {

  /* Языков ровно два: русский и английский. Незнакомый код (или старый
     it/ka/de) ведёт себя как русский. */
  const TXT = {
    ru: { l1: 'Поверните телефон', l2: 'Так презентация раскроется полностью' },
    en: { l1: 'Turn your phone', l2: 'The presentation opens up in landscape' }
  };

  const CSS = `
    #rotateHint {
      position: fixed; inset: 0; z-index: 10085;   /* above navigation, below Help */
      display: none; flex-direction: column;
      align-items: center; justify-content: center; gap: 18px;
      background: radial-gradient(ellipse at center, #0c0b12 0%, #050507 100%);
      text-align: center; padding: 30px;
      font-family: 'Unbounded', system-ui, sans-serif;
    }
    #rotateHint.on { display: flex; }
    body:has(> #rotateHint.on) > .voice-listening-nav { display: none !important; }
    #rotateHint .rh-ico {
      width: 74px; height: 74px;
      animation: rhTurn 2.6s ease-in-out infinite;
    }
    @keyframes rhTurn {
      0%, 45%   { transform: rotate(0deg); }
      60%, 100% { transform: rotate(-90deg); }
    }
    #rotateHint .rh-1 {
      font-weight: 300; font-size: clamp(19px, 5.6vw, 26px);
      letter-spacing: 0.02em; color: #f5f5f7;
    }
    #rotateHint .rh-2 {
      font-family: 'DM Sans', system-ui, sans-serif; font-weight: 500;
      font-size: clamp(12px, 3.6vw, 15px); color: rgba(245,245,247,0.55);
      max-width: 300px; line-height: 1.5;
    }
    /* крестик виден только когда подсказка накрыла открытое окно */
    #rotateHint .rh-close {
      display: none; position: absolute; top: 14px; right: 14px;
      width: 42px; height: 42px; border-radius: 50%;
      border: 1px solid rgba(212,168,87,0.45); background: rgba(0,0,0,0.35);
      color: #f0c674; font-size: 20px; line-height: 1; cursor: pointer;
      align-items: center; justify-content: center;
    }
    #rotateHint.over-screen .rh-close { display: flex; }
    /* на телефоне убираем наведение-эффекты, которые «залипают» после тапа */
    @media (pointer: coarse) {
      * { -webkit-tap-highlight-color: transparent; }
    }
    /* Горизонтальный свайп по презентации — это листание слайдов, а не жест
       «назад» браузера. Без этого Chrome на телефоне уводил вкладку на
       предыдущую страницу (в нашей проверке — на about:blank) прямо во время
       свайпа вправо. */
    html, body {
      overscroll-behavior-x: none;
      overscroll-behavior-y: none;
    }
  `;

  function buildOverlay() {
    if (document.getElementById('rotateHint')) return;
    const st = document.createElement('style');
    st.textContent = CSS;
    document.head.appendChild(st);

    const el = document.createElement('div');
    el.id = 'rotateHint';
    /* Подсказка «поверните телефон» — служебный слой: жест по ней не должен
       молча листать слайд, который она накрывает. */
    el.setAttribute('data-noswipe', '');
    el.innerHTML =
      '<svg class="rh-ico" viewBox="0 0 64 64" fill="none">' +
        '<rect x="21" y="6" width="22" height="40" rx="4" stroke="#f0c674" stroke-width="2"/>' +
        '<rect x="24.5" y="11" width="15" height="28" rx="1.5" fill="rgba(212,168,87,0.16)"/>' +
        '<circle cx="32" cy="43" r="1.6" fill="#f0c674"/>' +
        '<path d="M12 52 A22 22 0 0 0 52 52" stroke="rgba(240,198,116,0.55)" stroke-width="2" stroke-linecap="round" stroke-dasharray="3 4"/>' +
      '</svg>' +
      '<div class="rh-1"></div><div class="rh-2"></div>' +
      '<button class="rh-close" type="button" aria-label="close">&#10005;</button>';
    document.body.appendChild(el);
    el.querySelector('.rh-close').addEventListener('click', () => {
      if (typeof window.onRotateHintClose === 'function') window.onRotateHintClose();
    });
  }

  /* Подсказка накрывает окно поверх слайда: в ней нужен свой крестик. */
  window.setRotateHintOverScreen = function (v) {
    const el = document.getElementById('rotateHint');
    if (el) el.classList.toggle('over-screen', !!v);
  };

  function lang() {
    try { return (window.I18N && I18N.current) || 'ru'; } catch (e) { return 'ru'; }
  }

  function paint() {
    const t = TXT[lang()] || TXT.ru;
    const el = document.getElementById('rotateHint');
    if (!el) return;
    el.querySelector('.rh-1').textContent = t.l1;
    el.querySelector('.rh-2').textContent = t.l2;
  }

  function isPhone() {
    /* грубый экран + узкая короткая сторона = телефон, а не планшет */
    const coarse = window.matchMedia('(pointer: coarse)').matches;
    const shortSide = Math.min(window.innerWidth, window.innerHeight);
    return coarse && shortSide <= 560;
  }

  function mobileReady() {
    return window.MOBILE_READY === true ||
           document.body.hasAttribute('data-mobile-ready');
  }

  function update() {
    const portrait = window.innerHeight > window.innerWidth;
    const show = isPhone() && portrait && !mobileReady();
    const el = document.getElementById('rotateHint');
    if (!el) return;
    el.classList.toggle('on', show);
    if (show) paint();
  }

  function init() {
    buildOverlay();
    update();
    window.addEventListener('resize', update);
    window.addEventListener('orientationchange', () => setTimeout(update, 120));
    if (window.I18N && I18N.onChange) I18N.onChange(paint);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  /* слайд может объявить себя готовым к портрету уже после загрузки */
  window.setMobileReady = function (v) {
    window.MOBILE_READY = v !== false;
    update();
  };

  /* ==================== ЖЕСТЫ ====================
     На телефоне палец влево-вправо — первое, что человек пробует.
     Движки слайдов уже слушают стрелки, поэтому жест просто подделывает
     нажатие клавиши: работает и на пошаговых слайдах, и на переходах колоды.

     Направление конвенциональное, как в лентах и галереях: содержимое едет
     за пальцем. Свайп ВЛЕВО открывает следующий экран, свайп ВПРАВО —
     предыдущий. (Раньше было наоборот, и презентация листалась против руки.)

     Ровно один жест = ровно одно нажатие. Несостоявшийся жест (touchcancel,
     второй палец, палец ещё на экране) разоружает распознаватель: следующий
     touchend не должен «выстрелить» от старой точки. */
  (function swipe() {
    const MIN_DIST = 48;      /* короче — это тап или дрожание руки */
    /* Тяжёлый слайд (s06 с анимациями) растягивает даже обычный свайп:
       замеренный жест занимал 788 мс собственного времени событий, а не
       700. Окно должно переживать джанк, иначе жест молча теряется. */
    const MAX_TIME = 1200;    /* дольше — это перетаскивание, не листание */
    const RATIO = 1.3;        /* насколько горизонтальнее вертикального */
    let x0 = 0, y0 = 0, t0 = 0, armed = false;

    /* внутри карусели, таблицы или ленты чипов свайп принадлежит им */
    function ownsGesture(node) {
      if (document.body.hasAttribute('data-no-swipe')) return true;
      let el = node;
      while (el && el !== document.body) {
        if (el.nodeType === 1) {
          if (el.hasAttribute('data-noswipe')) return true;
          const ox = getComputedStyle(el).overflowX;
          if ((ox === 'auto' || ox === 'scroll') && el.scrollWidth > el.clientWidth + 4) return true;
          const tag = el.tagName;
          if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
          if (el.isContentEditable === true) return true;
        }
        el = el.parentElement;
      }
      return false;
    }

    /* Один движок смотрит на e.key, другой на e.code (слайд 06), третий на
       keyCode, поэтому заполняем все поля: иначе жест молча не работает на
       части слайдов. */
    function press(key) {
      const next = key === 'ArrowRight';
      const keyCode = next ? 39 : 37;
      document.dispatchEvent(new KeyboardEvent('keydown', {
        key: key, code: key, keyCode: keyCode, which: keyCode,
        bubbles: true, cancelable: true
      }));
    }

    function disarm() {
      armed = false;
    }

    /* Длительность жеста считаем по меткам самих touch-событий, а не по
       Date.now(): на тяжёлом слайде главный поток может «залипнуть» на
       полсекунды между touchstart и touchend, и быстрый свайп ошибочно
       считался бы перетаскиванием. */
    function stamp(e) {
      return (e && typeof e.timeStamp === 'number' && e.timeStamp > 0) ? e.timeStamp : Date.now();
    }

    document.addEventListener('touchstart', (e) => {
      if (!e.touches || e.touches.length !== 1) { disarm(); return; }
      const t = e.touches[0];
      armed = !ownsGesture(e.target);
      x0 = t.clientX; y0 = t.clientY; t0 = stamp(e);
    }, { passive: true });

    /* Система отобрала жест (звонок, уведомление, скролл-лок): не оставляем
       взведённую точку до будущего touchend. */
    document.addEventListener('touchcancel', disarm, { passive: true });

    /* Горизонтальное движение внутри презентации забираем себе: без
       preventDefault браузер считает свайп вправо жестом «назад» и уводит
       вкладку с презентации. Только горизонталь: вертикальный скролл в
       модалах и таблицах остаётся родным, а карусели и ленты, которым жест
       принадлежит по ownsGesture(), сюда вообще не попадают. */
    document.addEventListener('touchmove', (e) => {
      if (!armed) return;
      const t = e.touches && e.touches[0];
      if (!t) return;
      const dx = t.clientX - x0, dy = t.clientY - y0;
      if (Math.abs(dx) > 10 && Math.abs(dx) >= Math.abs(dy) * RATIO &&
          typeof e.preventDefault === 'function') {
        e.preventDefault();
      }
    }, { passive: false });

    document.addEventListener('touchend', (e) => {
      if (!armed) return;
      /* Палец ещё на экране — жест не закончен, это не листание. */
      if (e.touches && e.touches.length > 0) { disarm(); return; }
      armed = false;
      const t = e.changedTouches && e.changedTouches[0];
      if (!t) return;
      const dx = t.clientX - x0, dy = t.clientY - y0;
      if (stamp(e) - t0 > MAX_TIME) return;
      if (Math.abs(dx) < MIN_DIST || Math.abs(dx) < Math.abs(dy) * RATIO) return;
      press(dx < 0 ? 'ArrowRight' : 'ArrowLeft');   /* палец влево = вперёд */
    }, { passive: true });
  })();
})();
