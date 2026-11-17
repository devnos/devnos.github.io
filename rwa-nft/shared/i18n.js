/* ============================================================
   RWA NFT — ДВА ЯЗЫКА: РУССКИЙ И АНГЛИЙСКИЙ (единая точка правды)

   Русский текст живёт в разметке слайда и является запасным вариантом.
   Английский — единственный перевод в словаре ниже.

   КАК ДОБАВИТЬ ТЕКСТ НА НОВОМ СЛАЙДЕ:
   1. В HTML пишем:  <div data-i18n="s20.title">Русский текст</div>
   2. Сюда в DICT добавляем ключ:
      's20.title': { en: '…' }
   3. Для текста из JS:  el.textContent = T('s20.name');
      и подписка на смену языка: I18N.onChange(() => render());

   Языков ровно два. Старые коды (it, ka, de, …) больше не поддерживаются:
   сохранённый в localStorage старый язык при загрузке приводится к ru.
   ============================================================ */
(function () {

  /* ---------- Флаги: компактные SVG (эмодзи-флаги не рисуются в Windows) ---------- */
  const FLAG = {
    ru: '<svg viewBox="0 0 60 40"><rect width="60" height="40" fill="#fff"/><rect y="13.3" width="60" height="13.4" fill="#0039A6"/><rect y="26.7" width="60" height="13.3" fill="#D52B1E"/></svg>',
    en: '<svg viewBox="0 0 60 40"><rect width="60" height="40" fill="#012169"/><path d="M0 0 L60 40 M60 0 L0 40" stroke="#fff" stroke-width="8"/><path d="M0 0 L60 40 M60 0 L0 40" stroke="#C8102E" stroke-width="4"/><path d="M30 0 V40 M0 20 H60" stroke="#fff" stroke-width="13"/><path d="M30 0 V40 M0 20 H60" stroke="#C8102E" stroke-width="8"/></svg>'
  };

  /* ---------- Список языков (порядок = порядок в выпадающем списке) ---------- */
  const LANGS = [
    { code: 'ru', name: 'Русский',  flag: FLAG.ru },
    { code: 'en', name: 'English',  flag: FLAG.en }
  ];

  /* ---------- Словарь: только английские переводы ---------- */
  const DICT = {

    /* ===== Слайд 01: Представьте ===== */
    "s01.brand.sub": { en: "The beginning of a new reality" },
    "s01.plate1.l1": { en: "People are on holiday" },
    "s01.plate1.l2": { en: "The owner earns income" },
    "s01.plate2": { en: "But it can be different" },
    "s01.plate3.l1": { en: "You are a co-owner" },
    "s01.plate3.l2": { en: "and you earn income" },

    /* ===== Слайд 02: Мост ===== */
    "s02.before.word": { en: "Before" },
    "s02.before.sub": { en: "Access for a chosen few" },
    "s02.banks": { en: "Banks" },
    "s02.funds": { en: "Funds" },
    "s02.millionaires": { en: "Millionaires" },
    "s02.before.note": { en: "Reliable assets only for large capital." },
    "s02.now.word": { en: "Now" },
    "s02.now.sub": { en: "The boundaries are dissolving" },
    "s02.hero": { en: "Access. <em>Open to everyone.</em>" },
    "s02.pill": { en: "<em>RWA NFT</em> dissolved the limits" },

    /* ===== Слайд 06: Как работает платформа ===== */
    "s06.eyebrow": { en: "How the platform works" },
    "s06.finpro": { en: "FinPro" },
    "s06.da": { en: "Growing asset DA" },
    "s06.rwa": { en: "RWA" },
    "s06.partner": { en: "Partner<br>programme" },
    "s06.career": { en: "Career" },
    "s06.vip": { en: "VIP Club" },
    "s06.hint.calc": { en: "Calculate income" },
    "s06.hint.steps": { en: "Eight steps" },
    "s06.hint.limited": { en: "Limited Edition" },
    "s06.hint.sources": { en: "Multiple income sources" },
    "s06.style": { en: "Style" },
    "s06.gadgets": { en: "Gadgets" },
    "s06.leisure": { en: "Leisure" },
    "s06.travel": { en: "Travel" },
    "s06.auto": { en: "Car" },
    "s06.realty": { en: "Real estate" },
    "s06.balance": { en: "Balance" },
    "s06.yourname": { en: "YOUR NAME" },
    "s06.final.line": { en: "Bought once. <em>Earning for decades.</em>" },
    "s06.final.sub": { en: "Every day &#8734; for the rest of your life" },
    "s06.act.math": { en: "How it works" },
    "s06.act.calc": { en: "Calculate income" },

    /* ===== Слайд 04: Что внутри ключа ===== */
    "s04.eyebrow": { en: "What is inside the key" },
    "s04.rwa": { en: "Access to RWA" },
    "s04.income": { en: "Income" },
    "s04.capital": { en: "Capital" },
    "s04.business": { en: "Business" },
    "s04.legacy": { en: "Legacy" },
    "s04.f1": { en: "This is not a picture." },
    "s04.f2": { en: "This is <em>your financial empire</em>." },

    /* ===== Слайд 09: Ранги ===== */
    "s09.eyebrow": { en: "Career ranks" },
    "s09.intro": { en: "Eight steps. <em>Eight new opportunities.</em>" },
    "s09.final": { en: "Every step. <em>A new life.</em>" },
    "s09.bonus": { en: "Bonus" },
    "s09.turn": { en: "Turnover" },
    "s09.pers": { en: "Personal" },
    "s09.or": { en: "or" },
    "s09.trip": { en: "a trip" },
    "s09.flat": { en: "an apartment" },

    /* ===== Слайд 10: VIP ===== */
    "s10.eyebrow": { en: "The peak of the career" },
    "s10.pct": { en: "of the company income" },
    "s10.dist": { en: "is shared among the owners of <em>200 limited NFTs</em> worldwide." },
    "s10.cap1": { en: "<strong>VIP</strong> · 100 worldwide" },
    "s10.cap2": { en: "<strong>AMBASSADOR</strong> · 100 worldwide" },

    /* ===== Слайд 07: Калькулятор доходности ===== */
    "s07.change": { en: "Change NFT" },
    "s07.levels": { en: "Levels" },
    "s07.limit": { en: "Income limit" },
    "s07.bank": { en: "Earned over all waves" },
    "s07.reset": { en: "Reset" },
    "s07.fill": { en: "Fill rate" },
    "s07.tab1": { en: "Marketing" },
    "s07.th.lvl": { en: "Level" },
    "s07.th.acc": { en: "Accounts" },
    "s07.th.pct": { en: "Percent" },
    "s07.th.inc": { en: "Income, USDT" },
    "s07.total": { en: "Total:" },
    "s07.you": { en: "You" },
    "s07.wave": { en: "Matching of this wave" },
    "s07.line1": { en: "Line 1" },
    "s07.line1s": { en: "your personals" },
    "s07.line2": { en: "Line 2" },
    "s07.line2s": { en: "partners of line&nbsp;1" },
    "s07.line3": { en: "Line 3" },
    "s07.line3s": { en: "partners of line&nbsp;2" },
    "s07.line4": { en: "Line 4" },
    "s07.line4s": { en: "buy from line&nbsp;3" },
    "s07.grow": { en: "growth continues" },
    "s07.give3": { en: "generate income for line 3" },
    "s07.cheq": { en: "Average team purchase" },
    "s07.theirinc": { en: "their income" },
    "s07.persfrom": { en: "personal sales from" },
    "s07.lineShort": { en: "line" },
    "s07.typehint": { en: "Click to enter a number" },

    /* ===== Слайд 08: FinFlow ===== */
    "s08.b1.title": { en: "The algorithm opens <em>two opposite trades</em> at once" },
    "s08.b1.lead": { en: "One to buy, one to sell, for an equal amount. Wherever the price goes, the second trade covers the first." },
    "s08.b1.sub": { en: "So where does the income come from" },
    "s08.sc": { en: "Some bet on growth, others on decline. The sides are almost never equal. The exchange balances them in a simple way: <b>the larger side pays the smaller one</b>. Every eight hours. Automatically." },
    "s08.moveMarket": { en: "Move the market" },
    "s08.legBuy": { en: "Buy trade" },
    "s08.legBuyD": { en: "Rises with the market and falls with it" },
    "s08.legSell": { en: "Sell trade" },
    "s08.legSellD": { en: "A mirror of the first. Works exactly the opposite way" },
    "s08.legSum": { en: "Result" },
    "s08.legSumD": { en: "Market movement does not affect it" },
    "s08.crowd1k": { en: "Betting on growth" },
    "s08.crowd1n": { en: "The majority" },
    "s08.crowd1d": { en: "pay because there are more of them" },
    "s08.crowd2k": { en: "Standing on the other side" },
    "s08.crowd2n": { en: "The minority" },
    "s08.crowd2d": { en: "receive the payment. FinFlow is here" },
    "s08.every8": { en: "every 8 hours" },
    "s08.perDay": { en: "payments per day" },
    "s08.perYear": { en: "payments per year" },
    "s08.whileWatch": { en: "received while you are watching" },
    "s08.n1": { en: "Funding fee" },
    "s08.n2": { en: "Return to the mean" },
    "s08.n3": { en: "Capital protection" },
    "s08.eb3": { en: "Volume distribution" },
    "s08.eb4": { en: "Three sources" },
    "s08.bs1.txt": { en: "The algorithm holds two opposite trades of equal size, so the price does not affect the result. The exchange pays for someone keeping the balance." },
    "s08.bs1.stat": { en: "payments a year, every eight hours" },
    "s08.b2.title": { en: "The algorithm catches <em>price deviations</em>" },
    "s08.b2.lead": { en: "A price has its usual level that it moves around. When it drifts too far from it, the algorithm buys and waits for the return." },
    "s08.bs2.txt": { en: "When the price drifts from its usual level more than normal, the algorithm buys and closes the trade on the way back. The market direction plays no role here." },
    "s08.bs2.stat": { en: "per unit in the example above" },
    "s08.b3.title": { en: "The volume is split into <em>a thousand parts</em>" },
    "s08.b3.lead": { en: "No single operation decides the fate of the account. The algorithm does not enter with the whole amount at once, it splits it into a thousand small operations spread over time and price. <b>Break a few and see what happens.</b>" },
    "s08.bs3.txt": { en: "The volume is split into a thousand small operations. The failure of a single one cannot become noticeable for the account, because its share is negligible." },
    "s08.bs3.stat": { en: "of the volume per single operation" },
    "s08.gridCap": { en: "Each square is 5 operations. 1,000 running in total" },
    "s08.failed": { en: "Operations failed" },
    "s08.working": { en: "Still running" },
    "s08.affected": { en: "Volume affected" },
    "s08.sNote0": { en: "Everything is running. Press the button and break some of the operations." },
    "s08.breakBtn": { en: "Break operations" },
    "s08.resetBtn": { en: "Reset" },
    "s08.formulas": { en: "Formulas" },
    "s08.next": { en: "Next" },
    "s08.again": { en: "Again" },
    "s08.h2": { en: "Mathematics <em>you cannot argue with</em>" },
    "s08.gives": { en: "What it gives FinFlow" },
    "s08.footMain": { en: "Three independent sources. The funding fee gives a steady base, price deviations add on top, and volume distribution keeps any single failure from becoming noticeable. <b>Three pillars instead of one.</b>" },
    "s08.foot": { en: "All figures are targets, not guarantees. Operations with digital assets carry technical and market risks." },
    "s08.f1.crown": { en: "Nobel Prize in Economics, 1990" },
    "s08.f1.name": { en: "Market neutrality" },
    "s08.f1.txt": { en: "The 1990 prize was shared by three people: Harry Markowitz, Merton Miller and William Sharpe. Markowitz showed how positions add up together, Sharpe introduced the very measure of dependence on the market. Keeping this value near zero, a portfolio stops depending on where the market goes." },
    "s08.f1.gives": { en: "A market crash stops being an event. The result is counted not from the price, but from the structure of the trades." },
    "s08.f2.crown": { en: "Beat the casino, then beat the market" },
    "s08.f2.name": { en: "Size of a single operation" },
    "s08.f2.txt": { en: "John Kelly, Bell Labs, 1956. The formula answers the question of what share of the money to stake at a time so that capital grows fastest and never goes to zero. Ed Thorp worked by it: first he beat blackjack, then ran a market fund for almost twenty years without a single losing year." },
    "s08.f2.gives": { en: "No single operation can become fatal. The size of each one is calculated in advance, not picked by eye." },
    "s08.f3.crown": { en: "Banks are required to measure risk by this principle" },
    "s08.f3.name": { en: "Budget for rare events" },
    "s08.f3.txt": { en: "Rockafellar and Uryasev, 2000. Ordinary models count the average day, but an account is ruined not by an average day, it is ruined by a rare one. This value answers the question of how bad it gets if the bad thing happens, and it is written into the Basel III banking standard as a measure of market risk." },
    "s08.f3.gives": { en: "The worst case has a ceiling set in advance. It limits the volume of the whole system." },
    "s08.f4.crown": { en: "Academic work that became an industry norm" },
    "s08.f4.name": { en: "Cutting volume during a drawdown" },
    "s08.f4.txt": { en: "A person in a drawdown usually raises the stake to win it back faster. That is exactly how everything is lost. The formula does the opposite: the deeper the fall, the less the system risks, and the decrease accelerates. The principle was described by Moreira and Muir in 2017 and has been used by the largest funds since." },
    "s08.f4.gives": { en: "The system slows down by itself, with no human involved and no discussion." },
    "s08.f5.crown": { en: "An industry standard for almost fifty years" },
    "s08.f5.name": { en: "Exit threshold of an operation" },
    "s08.f5.txt": { en: "Welles Wilder described this in 1978, and the whole market industry has used it since. The exit threshold is set neither at a round number nor by eye: it adapts to how wildly the market is moving right now. On a calm day it sits closer, on a stormy one further away." },
    "s08.f5.gives": { en: "An operation is not closed by ordinary market noise and does not hang around too long on a bad day." },
    "s08.f6.crown": { en: "This is how professional order execution works" },
    "s08.f6.name": { en: "Filter of artificial price spikes" },
    "s08.f6.txt": { en: "Sharp price spikes with no real volume behind them happen on exchanges regularly. Some of them are made on purpose, to knock out other positions. The rule is simple: an operation goes through only when there is real volume behind the move. Firms like Citadel Securities and Jane Street, which specialise in order execution, are built on this check." },
    "s08.f6.gives": { en: "The algorithm does not react to manipulation and does not hand money to those who arrange it." },
    "s08.tr1": { en: "The price moves calmly around its usual level. The algorithm waits." },
    "s08.tr2": { en: "The price dropped <b>2.40</b> below its usual level. Such a gap is rare." },
    "s08.tr3": { en: "The algorithm buys at <b>52.10</b>. It does not guess the bottom, it reacts to a rare deviation." },
    "s08.tr4": { en: "The price returns to its usual level. As it almost always does." },
    "s08.tr5": { en: "The algorithm sells at <b>54.50</b>. The trade is closed." },
    "s08.tr5p": { en: "+2.40 per unit" },
    "s08.sn1a": { en: "Lost" },
    "s08.sn1b": { en: "operations out of a thousand. That is" },
    "s08.sn1c": { en: "of the volume" },
    "s08.sn1d": { en: "The remaining" },
    "s08.sn1e": { en: "keep working, the account barely notices the difference." },
    "s08.sn2a": { en: "Even at" },
    "s08.sn2b": { en: "of losses" },
    "s08.sn2c": { en: "operations keep working" },
    "s08.sn2d": { en: "None of them was large enough to change everything." },
    "s08.sn3a": { en: "To get here we had to stop" },
    "s08.sn3b": { en: "operations in a row. In real life they are" },
    "s08.sn3c": { en: "not connected to each other" },
    "s08.sn3d": { en: "and do not fail all at once. The whole design rests on this." },

    /* ===== Калькулятор FinFlow ===== */
    "fc.amount": { en: "FinFlow purchase amount" },
    "fc.hint": { en: "from 25 to 70,000 USDT · you can type it in" },
    "fc.tierlbl": { en: "access level:" },
    "fc.topup1": { en: "I top up monthly" },
    "fc.topup2": { en: "I add my own funds to the base amount every month" },
    "fc.topuplbl": { en: "USDT per month from your own funds" },
    "fc.rei1": { en: "Reinvest the income" },
    "fc.rei2": { en: "Income is added to the base amount every day: compound growth" },
    "fc.week": { en: "Per week" },
    "fc.weeksub": { en: "payout to the wallet every Monday" },
    "fc.month": { en: "Per month" },
    "fc.monthsub": { en: "about 4.3 weeks" },
    "fc.totalpay": { en: "Total payouts" },
    "fc.growweeks": { en: "Growth by weeks" },
    "fc.reitime": { en: "Reinvestment period" },
    "fc.after": { en: "· then all income goes to the wallet" },
    "fc.inrei": { en: "To reinvest" },
    "fc.towallet": { en: "to the wallet" },
    "fc.details": { en: "↻ &nbsp;Payout details" },
    "fc.bydays": { en: "By days" },
    "fc.byweeks": { en: "By weeks" },
    "fc.bymonths": { en: "By months" },
    "fc.th.body": { en: "Base" },
    "fc.th.earned": { en: "Earned" },
    "fc.th.wallet": { en: "To wallet" },
    "fc.th.rei": { en: "Reinvested" },
    "fc.th.gotall": { en: "Received in total" },
    "fc.th.capital": { en: "Capital" },
    "fc.fulllink": { en: "Full version of the calculator →" },
    "fc.day": { en: "Day" },
    "fc.wk": { en: "Wk" },
    "fc.mo": { en: "Mo" },
    "fc.rowday": { en: "Each row: one day" },
    "fc.rowweek": { en: "Each row: one week" },
    "fc.rowmonth": { en: "State at the end of each month" },
    "fc.totalword": { en: "TOTAL" },
    "fc.auto": { en: "auto by amount" },
    "fc.limit": { en: "· limit" },
    "fc.max": { en: "maximum for" },
    "fc.min": { en: "minimum" },
    "fc.atlimit": { en: "The amount is already at the level limit" },
    "fc.nowork": { en: "USDT): top-ups will not work. Choose a higher level in the list." },
    "fc.through": { en: "In" },
    "fc.reachlimit": { en: "months the base will reach the level limit" },
    "fc.stopped": { en: "USDT), top-ups will stop. Own funds in total:" },
    "fc.add3y": { en: "Over 3 years you will add of your own:" },
    "fc.ownall": { en: "USDT. Own funds in total:" },
    "fc.grow3y": { en: "Base amount in 3 years" },
    "fc.growx": { en: "growth with daily reinvestment:" },
    "fc.times": { en: "times" },
    "fc.ofall": { en: "(of all your own funds)" },
    "fc.received": { en: "Received to the wallet in" },
    "fc.doubledone": { en: "the amount is doubled by payouts, FinFlow completed · after the ramp-up ≈" },
    "fc.perweek": { en: "USDT per week" },
    "fc.basegrew": { en: "the base has grown to" },
    "fc.afterboost": { en: "USDT · after the ramp-up ≈" },
    "fc.doubledfor": { en: "the amount is doubled by payouts in" },
    "fc.mofin": { en: "months · FinFlow completed" },
    "fc.paidfor": { en: "paid out in" },
    "fc.mocont": { en: "months · FinFlow continues" },
    "fc.start": { en: "USDT · start" },
    "fc.mos": { en: "mo" },
    "fc.totalcount": { en: "(total" },
    "fc.note": { en: "The figures are indicative: calculated using the platform actual return range of 11-16% per month. Reinvestment happens daily once 2 USDT is accumulated (smart contract rule). Want to set up your own strategy?" },

    "s04.nav.arrow": { en: "To continue, use the arrow on the right." },
    "s04.nav.mouse": { en: "On a computer, scroll the mouse wheel down." },

    /* ===== Слайд 14: Выбор NFT ===== */
    "s14.eyebrow": { en: "How to start" },
    "s14.title": { en: "Choose <em>your NFT</em>" },
    "s14.sub": { en: "The higher the level, the higher the income" },
    "s14.levels": { en: "Levels" },
    "s14.limit": { en: "Limit" },
    "s14.q": { en: "What income can you receive?" },
    "s14.cap1": { en: "per year. Financial products" },
    "s14.cap2": { en: "per year. DA growth potential" },
    "s14.cta": { en: "Activate Business" },
    "s14.cta.copy1": { en: "Build your digital assets and financial independence!" },
    "s14.cta.copy2": { en: "Make your decision right now." },
    "s14.b.levels": { en: "Marketing levels" },
    "s14.b.of": { en: "of 22" },
    "s14.b.limit": { en: "Income limit" },
    "s14.b.fin": { en: "Financial tools" },
    "s14.b.match": { en: "Matching Bonus" },
    "s14.b.credit": { en: "Loan secured by DA" },
    "s14.b.nftm": { en: "NFTM generation" },
    "s14.b.da": { en: "DA accrual" },
    "s14.b.back": { en: "Tap to go back" },
    "s14.days.1": { en: "day" },
    "s14.days.many": { en: "days" },
  };

  /* ---------- Ядро ---------- */
  const STORAGE_KEY = 'rwa_lang';
  let current = 'ru';
  const listeners = [];

  function isSupported(code) {
    return typeof code === 'string' && LANGS.some(l => l.code === code);
  }

  /* Сохранённый язык: ru/en сохраняются, всё остальное (итальянский,
     грузинский, повреждённое значение) приводится к ru и перезаписывается. */
  function detect() {
    let saved = null;
    try { saved = localStorage.getItem(STORAGE_KEY); } catch (e) {}
    if (saved === null || saved === undefined) return 'ru';
    const next = isSupported(saved) ? saved : 'ru';
    if (next !== saved) {
      try { localStorage.setItem(STORAGE_KEY, next); } catch (e) {}
    }
    return next;
  }

  /* Перевод по ключу. Русский берётся из разметки, поэтому для ru возвращаем null */
  function get(key) {
    if (current === 'ru') return null;
    const row = DICT[key];
    if (!row) return null;
    /* пустая строка — осознанный выбор переводчика (другой порядок слов),
       поэтому проверяем именно наличие ключа, а не «истинность» */
    if (row[current] !== undefined) return row[current];
    return row.en !== undefined ? row.en : null;
  }

  /* Применить перевод ко всем элементам с data-i18n внутри root */
  function apply(root) {
    (root || document).querySelectorAll('[data-i18n]').forEach(el => {
      const key = el.getAttribute('data-i18n');
      /* сохраняем русский оригинал при первом проходе */
      if (el.dataset.i18nRu === undefined) el.dataset.i18nRu = el.innerHTML;
      const val = get(key);
      el.innerHTML = (val === null) ? el.dataset.i18nRu : val;
    });
  }

  /* Язык документа всегда один из двух и всегда слева направо. */
  function syncDocument() {
    const root = document.documentElement;
    if (!root) return;
    root.setAttribute('lang', current);
    root.setAttribute('dir', 'ltr');
  }

  function setLang(code, silent) {
    /* Неподдерживаемый код (в том числе из старого сообщения родителя)
       не вводит третий язык: текущий выбор остаётся прежним. */
    if (!isSupported(code)) return;
    current = code;
    try { localStorage.setItem(STORAGE_KEY, code); } catch (e) {}
    syncDocument();
    apply(document);
    listeners.forEach(fn => { try { fn(code); } catch (e) {} });
    /* слайды могли пересобрать разметку в обработчиках — переводим её тоже */
    apply(document);
    if (!silent) broadcastToFrames(code);
  }

  /* Передать язык во все вложенные iframe (модалы супер-слайда) */
  function broadcastToFrames(code) {
    document.querySelectorAll('iframe').forEach(f => {
      try { f.contentWindow.postMessage({ source: 'deck', type: 'set-lang', lang: code }, '*'); } catch (e) {}
    });
  }

  /* Любой iframe, загрузившийся на странице (модалы супер-слайда),
     автоматически получает текущий язык. Новые окна подключать не нужно. */
  document.addEventListener('load', e => {
    const el = e.target;
    if (el && el.tagName === 'IFRAME') {
      try { el.contentWindow.postMessage({ source: 'deck', type: 'set-lang', lang: current }, '*'); } catch (err) {}
    }
  }, true);

  /* Слушаем язык от родителя (лаунчер -> слайд -> модал) */
  window.addEventListener('message', e => {
    const m = e.data;
    if (m && m.source === 'deck' && m.type === 'set-lang') setLang(m.lang, false);
  });

  window.I18N = {
    langs: LANGS,
    dict: DICT,
    get current() { return current; },
    t: get,
    apply,
    setLang,
    broadcast: broadcastToFrames,
    onChange(fn) { listeners.push(fn); }
  };
  /* короткий помощник для слайдов: T('key') || 'русский запасной' */
  window.T = function (key, ru) { return get(key) || ru || ''; };

  current = detect();
  syncDocument();
  document.addEventListener('DOMContentLoaded', () => { apply(document); });
})();
