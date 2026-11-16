/*
 * Pure presentation model for the narration bar. Keeps localization and
 * control availability out of the DOM renderer.
 */
(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.VoiceUiModel = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const strings = {
    ru: {
      start: 'Начать со звуком',
      play: 'Слушать',
      pause: 'Пауза',
      resume: 'Продолжить',
      repeat: 'Повторить',
      disable: 'Отключить озвучку',
      enable: 'Включить озвучку',
      enableSound: 'Включить звук',
      listening: 'Звучит объяснение',
      ready: 'Текст объяснения',
      textOnly: 'Текст — аудио ещё не сгенерировано',
      unavailable: 'Аудио ещё не готово. Читайте текст.',
      unapproved: 'Аудио ещё не одобрено. Читайте текст.',
      disabled: 'Озвучка отключена.',
      blocked: 'Браузер заблокировал звук. Нажмите «Включить звук».',
      error: 'Не удалось воспроизвести аудио. Текст ниже.',
      ended: 'Объяснение завершено.',
      otherTab: 'Звук звучит в другой вкладке. Нажмите, чтобы слушать здесь.',
      unsupported: 'Озвучка доступна только на русском и английском.',
      noSlide: 'Озвучка этого экрана пока не подключена.',
      loading: 'Загрузка озвучки…',
      dataError: 'Не удалось загрузить данные озвучки.',
    },
    en: {
      start: 'Start with sound',
      play: 'Listen',
      pause: 'Pause',
      resume: 'Resume',
      repeat: 'Repeat',
      disable: 'Turn narration off',
      enable: 'Turn narration on',
      enableSound: 'Enable sound',
      listening: 'Explanation playing',
      ready: 'Explanation text',
      textOnly: 'Text — audio has not been generated yet',
      unavailable: 'Audio is not ready yet. Read the text.',
      unapproved: 'Audio is not approved yet. Read the text.',
      disabled: 'Narration is off.',
      blocked: 'The browser blocked sound. Press “Enable sound”.',
      error: 'Audio could not be played. The text is below.',
      ended: 'Explanation finished.',
      otherTab: 'Sound is playing in another tab. Press to listen here.',
      unsupported: 'Voice narration is available in Russian and English only.',
      noSlide: 'Narration for this screen is not connected yet.',
      loading: 'Loading narration…',
      dataError: 'Narration data could not be loaded.',
    },
  };

  function present(input) {
    const snapshot = (input && input.snapshot) || {};
    const config = input && input.config;
    const dataStatus = input && input.dataStatus;
    const lang = snapshot.lang === 'ru' ? 'ru' : 'en';
    const t = strings[lang];

    const base = {
      state: snapshot.status || 'idle',
      primaryAction: 'none',
      primaryLabel: t.play,
      primaryDisabled: false,
      repeatEnabled: false,
      offLabel: snapshot.enabled === false ? t.enable : t.disable,
      offPressed: snapshot.enabled === false,
      statusText: '',
      transcript: '',
      transcriptVisible: false,
      lang,
    };

    if (!config) {
      return Object.assign(base, {
        state: 'no-slide', primaryAction: 'none', primaryLabel: t.noSlide,
        primaryDisabled: true, statusText: t.noSlide,
      });
    }
    if (dataStatus === 'loading') {
      return Object.assign(base, {
        state: 'loading', primaryAction: 'none', primaryLabel: t.loading,
        primaryDisabled: true, statusText: t.loading,
      });
    }
    if (dataStatus === 'error') {
      return Object.assign(base, {
        state: 'data-error', primaryAction: 'none', primaryLabel: t.dataError,
        primaryDisabled: true, statusText: t.dataError,
      });
    }

    const transcript = snapshot.transcript || '';
    base.transcript = transcript;
    base.transcriptVisible = !!transcript;

    switch (snapshot.status) {
      case 'needs-gesture':
        return Object.assign(base, {
          state: 'needs-gesture', primaryAction: 'start', primaryLabel: t.start,
          statusText: t.textOnly,
        });
      case 'playing':
      case 'starting':
        return Object.assign(base, {
          state: snapshot.status, primaryAction: 'pause', primaryLabel: t.pause,
          repeatEnabled: true, statusText: t.listening,
        });
      case 'paused':
        return Object.assign(base, {
          state: 'paused', primaryAction: 'play', primaryLabel: t.resume,
          repeatEnabled: true,
          statusText: snapshot.reason === 'other-tab' ? t.otherTab : t.paused || t.resume,
        });
      case 'ended':
        return Object.assign(base, {
          state: 'ended', primaryAction: 'repeat', primaryLabel: t.repeat,
          repeatEnabled: true, statusText: t.ended,
        });
      case 'disabled':
        return Object.assign(base, {
          state: 'disabled', primaryAction: 'enable', primaryLabel: t.enable,
          statusText: t.disabled,
        });
      case 'unavailable':
        return Object.assign(base, {
          state: 'unavailable', primaryDisabled: true,
          statusText: snapshot.reason === 'audio-unapproved' ? t.unapproved : t.unavailable,
        });
      case 'blocked':
        return Object.assign(base, {
          state: 'blocked', primaryAction: 'retry', primaryLabel: t.enableSound,
          statusText: t.blocked,
        });
      case 'error':
        return Object.assign(base, {
          state: 'error', primaryAction: 'retry', primaryLabel: t.repeat,
          statusText: t.error,
        });
      case 'unsupported':
        return Object.assign(base, {
          state: 'unsupported', primaryDisabled: true,
          statusText: transcript || t.unsupported,
          transcript: '',
          transcriptVisible: false,
        });
      case 'ready':
        return Object.assign(base, {
          state: 'ready',
          primaryAction: snapshot.unlocked === false ? 'start' : 'play',
          primaryLabel: snapshot.unlocked === false ? t.start : t.play,
          repeatEnabled: !!transcript && snapshot.canPlay !== false,
          statusText: snapshot.unlocked === false ? t.textOnly : t.ready,
        });
      default:
        return Object.assign(base, {
          state: 'idle', primaryAction: 'start', primaryLabel: t.start,
          statusText: transcript ? t.textOnly : t.start,
        });
    }
  }

  return { strings, present };
});
