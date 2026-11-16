/*
 * Narration bar for the top-level deck. The deck is the only audio owner;
 * this file only renders controller state and forwards explicit user clicks.
 */
(function () {
  'use strict';

  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  if (!window.VoiceUiModel || !window.VoiceCore) return;

  const ICONS = {
    play: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7z" fill="currentColor"/></svg>',
    pause: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 5h4v14H6zM14 5h4v14h-4z" fill="currentColor"/></svg>',
    repeat: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M17 2l4 4-4 4V7H7a3 3 0 0 0-3 3v2H2v-2a5 5 0 0 1 5-5h10V2zM7 22l-4-4 4-4v3h10a3 3 0 0 0 3-3v-2h2v2a5 5 0 0 1-5 5H7v3z" fill="currentColor"/></svg>',
    sound: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9H4zm12.5 3a4.5 4.5 0 0 0-2.5-4v8a4.5 4.5 0 0 0 2.5-4z" fill="currentColor"/></svg>',
    soundOff: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9H4zm12 1.5 1.5-1.5 1.5 1.5L20.5 12 22 13.5 20.5 15 19 13.5 17.5 15 16 13.5 17.5 12 16 10.5z" fill="currentColor"/></svg>',
  };

  function mount(options) {
    const opts = options || {};
    const root = opts.root || (function () {
      let el = document.getElementById('voiceRoot');
      if (!el) {
        el = document.createElement('div');
        el.id = 'voiceRoot';
        document.body.appendChild(el);
      }
      return el;
    })();

    const BAR_EVENTS = [
      'click', 'dblclick', 'auxclick',
      'pointerdown', 'pointerup',
      'touchstart', 'touchmove', 'touchend',
      'wheel', 'keydown', 'keyup',
    ];

    /*
     * Standalone screens navigate from document-level click/keydown/wheel
     * handlers, so a control press must not escape #voiceRoot. One boundary per
     * root; stopPropagation only, so native button activation, focus and scroll
     * defaults still run. Clicks outside the bar keep navigating.
     */
    function containBarEvent(event) {
      event.stopPropagation();
    }
    for (const type of BAR_EVENTS) {
      root.addEventListener(type, containBarEvent);
    }

    let controller = opts.controller;
    let config = opts.config || null;
    let dataStatus = opts.dataStatus || 'ready';
    let unsubscribe = null;

    root.innerHTML = [
      '<div class="voice-bar" data-state="idle" role="region">',
      '  <button class="voice-primary" type="button">',
      '    <span class="voice-primary-icon" aria-hidden="true"></span>',
      '    <span class="voice-primary-label"></span>',
      '  </button>',
      '  <button class="voice-repeat" type="button" aria-pressed="false"></button>',
      '  <button class="voice-off" type="button" aria-pressed="false"></button>',
      '  <button class="voice-expand" type="button" aria-expanded="false"></button>',
      '  <div class="voice-copy">',
      '    <span class="voice-status" role="status" aria-live="polite"></span>',
      '    <p class="voice-transcript"></p>',
      '  </div>',
      '</div>',
    ].join('');

    const bar = root.querySelector('.voice-bar');
    const primary = root.querySelector('.voice-primary');
    const primaryIcon = root.querySelector('.voice-primary-icon');
    const primaryLabel = root.querySelector('.voice-primary-label');
    const repeatButton = root.querySelector('.voice-repeat');
    const offButton = root.querySelector('.voice-off');
    const expandButton = root.querySelector('.voice-expand');
    const statusEl = root.querySelector('.voice-status');
    const transcriptEl = root.querySelector('.voice-transcript');

    function t() {
      const lang = controller && controller.snapshot().lang === 'ru' ? 'ru' : 'en';
      return window.VoiceUiModel.strings[lang];
    }

    function render() {
      if (!controller) return;
      const snapshot = controller.snapshot();
      const model = window.VoiceUiModel.present({
        snapshot,
        config,
        dataStatus,
      });
      const labels = t();

      bar.dataset.state = model.state;
      bar.setAttribute('aria-label', snapshot.lang === 'ru' ? 'Озвучка' : 'Narration');
      primary.disabled = !!model.primaryDisabled;
      primaryLabel.textContent = model.primaryLabel;
      primary.setAttribute('aria-label', model.primaryLabel);
      const icon = model.primaryAction === 'pause' ? ICONS.pause
        : model.primaryAction === 'repeat' ? ICONS.repeat
          : ICONS.play;
      primaryIcon.innerHTML = icon;

      repeatButton.disabled = !model.repeatEnabled;
      repeatButton.setAttribute('aria-label', labels.repeat);
      repeatButton.title = labels.repeat;
      repeatButton.innerHTML = ICONS.repeat;

      offButton.setAttribute('aria-pressed', model.offPressed ? 'true' : 'false');
      offButton.setAttribute('aria-label', model.offLabel);
      offButton.title = model.offLabel;
      offButton.innerHTML = model.offPressed ? ICONS.soundOff : ICONS.sound;

      const textLabel = snapshot.lang === 'ru' ? 'Текст' : 'Text';
      expandButton.textContent = textLabel;
      expandButton.setAttribute('aria-label', textLabel);
      expandButton.title = textLabel;

      statusEl.textContent = model.statusText;
      transcriptEl.textContent = model.transcript;
      transcriptEl.hidden = !model.transcriptVisible;
      bar.classList.toggle('has-text', !!model.transcriptVisible);
    }

    async function runPrimary() {
      if (!controller) return;
      const snapshot = controller.snapshot();
      const model = window.VoiceUiModel.present({ snapshot, config, dataStatus });
      const action = model.primaryAction;
      if (action === 'none') return;

      if (action === 'pause') {
        controller.pause();
      } else if (action === 'enable') {
        controller.enable();
      } else if (action === 'repeat') {
        controller.unlock();
        await controller.repeat();
      } else {
        controller.unlock();
        if (!snapshot.currentId && config && config.steps.length) {
          await controller.select(config.steps[0]);
        }
        if (action === 'play' || action === 'retry') await controller.play();
        else await controller.start();
      }
      render();
    }

    function bindController(next) {
      if (unsubscribe) unsubscribe();
      controller = next;
      if (controller) unsubscribe = controller.subscribe(render);
      render();
    }

    primary.addEventListener('click', function () {
      runPrimary().catch(function () {});
    });

    repeatButton.addEventListener('click', function () {
      if (!controller) return;
      controller.unlock();
      controller.repeat().then(render).catch(function () {});
    });

    offButton.addEventListener('click', function () {
      if (!controller) return;
      if (controller.snapshot().enabled) controller.disable();
      else controller.enable();
      render();
    });

    expandButton.addEventListener('click', function () {
      const open = bar.classList.toggle('expanded');
      expandButton.setAttribute('aria-expanded', open ? 'true' : 'false');
    });

    bindController(controller);

    return {
      render,
      setController: bindController,
      setConfig(next) {
        config = next || null;
        render();
      },
      setDataStatus(next) {
        dataStatus = next || 'ready';
        render();
      },
      destroy() {
        if (unsubscribe) unsubscribe();
        for (const type of BAR_EVENTS) {
          root.removeEventListener(type, containBarEvent);
        }
        root.innerHTML = '';
      },
    };
  }

  window.VoiceUI = { mount };
})();
