/*
 * Stable slide -> voice mapping for every real screen.
 *
 * FinFlow keeps its historical runtime IDs through inventory-map.json. Every
 * other screen uses the inventory IDs verbatim so the checked inventory and
 * the runtime speak the same language. Containers own their own segment.
 */
(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.VoiceSlides = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  /*
   * Two visual steps: the title, then the dynamic video with the combined
   * speech. `s01.imagine.s03` is kept as the visual step ID for the old,
   * approved mapping; the boot resolves it to the new stable segment
   * `s01.imagine.dynamic` only when that recording is ready. The old
   * s01.imagine.s02 row stays in scenario.json untouched as history.
   */
  const S01_IMAGINE = Object.freeze({
    slideId: "s01.imagine",
    steps: Object.freeze(["s01.imagine.s01", "s01.imagine.s03"]),
    actions: Object.freeze(["s01.imagine.s01.a01", "s01.imagine.s02.a01"]),
  });
  const S02_BRIDGE = Object.freeze({
    slideId: "s02.bridge",
    steps: Object.freeze(["s02.bridge.s01", "s02.bridge.s02", "s02.bridge.s03", "s02.bridge.s04", "s02.bridge.s05"]),
    actions: Object.freeze(["s02.bridge.s01.a01", "s02.bridge.s03.a01"]),
  });
  const S06_SYSTEM = Object.freeze({
    slideId: "s06.system",
    steps: Object.freeze(["s06.system.s01", "s06.system.s02", "s06.system.s03", "s06.system.s04", "s06.system.s05", "s06.system.s06", "s06.system.s07", "s06.system.s08", "s06.system.s09", "s06.system.s10", "s06.system.s11"]),
    actions: Object.freeze(["s06.system.s01.a01", "s06.system.s02.a01", "s06.system.s02.a02", "s06.system.s02.a03", "s06.system.s05.a01", "s06.system.s06.a01", "s06.system.s07.a01"]),
  });
  /*
   * Two visual states: the carousel is visible immediately, followed by the
   * final CTA after every NFT card was actually viewed. s01 stays in the
   * frozen narration history; the local combined recording overrides s02.
   * The existing s03 visual ID still resolves to the approved CTA recording.
   */
  const S14_CHOOSE = Object.freeze({
    slideId: "s14.choose",
    steps: Object.freeze(["s14.choose.s02", "s14.choose.s03"]),
    actions: Object.freeze(["s14.choose.s02.a01", "s14.choose.s02.a02", "s14.choose.s02.a03"]),
  });
  const S08_FINFLOW = Object.freeze({
    slideId: "finflow",
    steps: Object.freeze(["finflow.funding-fee", "finflow.funding-flow", "finflow.mean-reversion", "finflow.volume-split", "finflow.three-sources"]),
    actions: Object.freeze([
      "finflow.formulas.card-1", "finflow.formulas.card-2", "finflow.formulas.card-3",
      "finflow.formulas.card-4", "finflow.formulas.card-5", "finflow.formulas.card-6",
      "finflow.formulas.close", "finflow.trade.advance", "finflow.operations.break", "finflow.operations.reset",
      /* legacy modal IDs: still accepted from older cached slides, never emitted by the current one */
      "finflow.formulas.open", "finflow.formulas.next", "finflow.formulas.prev",
    ]),
  });
  const S07C_MARKET = Object.freeze({
    slideId: "s07c.market",
    steps: Object.freeze(["s07c.market.s01"]),
    actions: Object.freeze(["s07c.market.s01.a01", "s07c.market.s01.a02"]),
  });
  const CAL_LITE = Object.freeze({
    slideId: "cal.lite",
    steps: Object.freeze(["cal.lite.s01"]),
    actions: Object.freeze(["cal.lite.s01.a01", "cal.lite.s01.a02", "cal.lite.s01.a03", "cal.lite.s01.a04", "cal.lite.s01.a05"]),
  });
  const S09_RANKS = Object.freeze({
    slideId: "s09.ranks",
    steps: Object.freeze(["s09.ranks.s01", "s09.ranks.s02", "s09.ranks.s03", "s09.ranks.s04", "s09.ranks.s05", "s09.ranks.s06", "s09.ranks.s07", "s09.ranks.s08", "s09.ranks.s09"]),
    actions: Object.freeze(["s09.ranks.s01.a01"]),
  });
  const S10_VIP = Object.freeze({
    slideId: "s10.vip",
    steps: Object.freeze(["s10.vip.s01", "s10.vip.s02", "s10.vip.s03", "s10.vip.s04"]),
    actions: Object.freeze(["s10.vip.s01.a01"]),
  });
  const S04_INSIDE = Object.freeze({
    slideId: "s04.inside",
    steps: Object.freeze(["s04.inside.s01", "s04.inside.s02", "s04.inside.s03", "s04.inside.s04", "s04.inside.s05", "s04.inside.s06", "s04.inside.s07"]),
    actions: Object.freeze(["s04.inside.s01.a01"]),
  });
  const SC1_MACHINE = Object.freeze({
    slideId: "sc1.machine",
    steps: Object.freeze(["sc1.machine.s01", "sc1.machine.s02", "sc1.machine.s03", "sc1.machine.s04", "sc1.machine.s05", "sc1.machine.s06"]),
    actions: Object.freeze(["sc1.machine.s01.a01"]),
  });
  const SC2_MECH = Object.freeze({
    slideId: "sc2.mech",
    steps: Object.freeze(["sc2.mech.s01", "sc2.mech.s02", "sc2.mech.s03", "sc2.mech.s04", "sc2.mech.s05", "sc2.mech.s06", "sc2.mech.s07", "sc2.mech.s08", "sc2.mech.s09", "sc2.mech.s10", "sc2.mech.s11", "sc2.mech.s12", "sc2.mech.s13", "sc2.mech.s14", "sc2.mech.s15", "sc2.mech.s16", "sc2.mech.s17", "sc2.mech.s18", "sc2.mech.s19", "sc2.mech.s20", "sc2.mech.s21", "sc2.mech.s22", "sc2.mech.s23"]),
    actions: Object.freeze(["sc2.mech.s01.a01"]),
  });
  const SC3_SELL = Object.freeze({
    slideId: "sc3.sell",
    steps: Object.freeze(["sc3.sell.s01", "sc3.sell.s02", "sc3.sell.s03", "sc3.sell.s04", "sc3.sell.s05", "sc3.sell.s06", "sc3.sell.s07", "sc3.sell.s08", "sc3.sell.s09"]),
    actions: Object.freeze(["sc3.sell.s01.a01"]),
  });
  const SC4_LEVELS = Object.freeze({
    slideId: "sc4.levels",
    steps: Object.freeze(["sc4.levels.s01", "sc4.levels.s02", "sc4.levels.s03", "sc4.levels.s04", "sc4.levels.s05", "sc4.levels.s06"]),
    actions: Object.freeze(["sc4.levels.s01.a01"]),
  });
  const SC5_CYCLE = Object.freeze({
    slideId: "sc5.cycle",
    steps: Object.freeze(["sc5.cycle.s01", "sc5.cycle.s02", "sc5.cycle.s03", "sc5.cycle.s04", "sc5.cycle.s05", "sc5.cycle.s06"]),
    actions: Object.freeze(["sc5.cycle.s01.a01"]),
  });
  const SC6_NOW = Object.freeze({
    slideId: "sc6.now",
    steps: Object.freeze(["sc6.now.s01", "sc6.now.s02", "sc6.now.s03", "sc6.now.s04", "sc6.now.s05", "sc6.now.s06"]),
    actions: Object.freeze(["sc6.now.s01.a01"]),
  });
  const DECK_SLIDES = Object.freeze({
    slideId: "deck.slides",
    steps: Object.freeze(["deck.slides.s00"]),
    actions: Object.freeze(["deck.slides.s00.a01", "deck.slides.s00.a02"]),
  });
  const DECK_SCHOOL = Object.freeze({
    slideId: "deck.school",
    steps: Object.freeze(["deck.school.s00"]),
    actions: Object.freeze(["deck.school.s00.a01"]),
  });

  const SLIDE_CONFIGS = Object.freeze({
    "slides/slide_01_imagine.html": S01_IMAGINE,
    "slides/slide_02_bridge.html": S02_BRIDGE,
    "slides/slide_06_system.html": S06_SYSTEM,
    "slides/slide_14_choose_nft.html": S14_CHOOSE,
    "slides/slide_08_finflow.html": S08_FINFLOW,
    "slides/slide_07c_simple_calc.html": S07C_MARKET,
    "calc/finflow_calculator_lite.html": CAL_LITE,
    "slides/slide_09_ranks.html": S09_RANKS,
    "slides/slide_10_vip.html": S10_VIP,
    "slides/slide_04_inside.html": S04_INSIDE,
    "slides/school_1_machine.html": SC1_MACHINE,
    "slides/school_2_mech.html": SC2_MECH,
    "slides/school_3_sell.html": SC3_SELL,
    "slides/school_4_levels.html": SC4_LEVELS,
    "slides/school_5_cycle.html": SC5_CYCLE,
    "slides/school_6_now.html": SC6_NOW,
    "index.html": DECK_SLIDES,
    "slides/school_deck.html": DECK_SCHOOL,
  });

  function normalizePath(path) {
    if (typeof path !== 'string') return '';
    let clean = path.split('#')[0].split('?')[0].replace(/\\/g, '/');
    if (clean === '') return '';
    if (clean === '/' || /(^|\/)index\.html$/.test(clean)) return 'index.html';
    const slideIndex = clean.indexOf('slides/');
    if (slideIndex >= 0) clean = clean.slice(slideIndex);
    const calcIndex = clean.indexOf('calc/');
    if (calcIndex >= 0) clean = clean.slice(calcIndex);
    return clean.replace(/^\.\//, '').replace(/^\/+/, '');
  }

  function getSlideConfig(path) {
    return SLIDE_CONFIGS[normalizePath(path)] || null;
  }

  function buildVoiceStep(config, stepIndex) {
    if (!config) return null;
    if (!Number.isInteger(stepIndex) || stepIndex < 0 || stepIndex >= config.steps.length) return null;
    return {
      source: 'slide',
      type: 'voice-step',
      slideId: config.slideId,
      stepId: config.steps[stepIndex],
      stepIndex,
    };
  }

  function buildVoiceAction(config, actionId, stepId) {
    if (!config) return null;
    if (typeof actionId !== 'string' || !config.actions.includes(actionId)) return null;
    if (stepId !== undefined && stepId !== null && !config.steps.includes(stepId)) return null;
    return {
      source: 'slide',
      type: 'voice-action',
      slideId: config.slideId,
      actionId,
      stepId: stepId || null,
    };
  }

  return {
    SLIDE_CONFIGS,
    normalizePath,
    getSlideConfig,
    buildVoiceStep,
    buildVoiceAction,
  };
});
