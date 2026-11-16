/*
 * Voice message protocol.
 *
 * The deck owns audio. Slides may only announce a stable step/action ID.
 * Every inbound message is checked for origin, sending window, envelope
 * source, type, stable-ID membership and payload size before it is trusted.
 */
(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.VoiceProtocol = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const VOICE_EVENT_TYPES = Object.freeze(['voice-step', 'voice-action']);
  const MAX_PAYLOAD = 4096;
  const ID_RE = /^[a-z0-9][a-z0-9-]*(?:\.[a-z0-9][a-z0-9-]*)*$/;

  function isVoiceOrigin(origin) {
    return typeof origin === 'string' && origin !== 'null' && /^https?:\/\/[^/]+$/.test(origin);
  }

  function canOwnAudio(win, top) {
    return !!win && win === top;
  }

  function isPlainObject(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    const proto = Object.getPrototypeOf(value);
    return proto === Object.prototype || proto === null;
  }

  function isValidId(value) {
    return typeof value === 'string' && value.length <= 64 && ID_RE.test(value);
  }

  function reject(reason) {
    return { ok: false, reason };
  }

  function serializeLength(data) {
    try {
      return JSON.stringify(data).length;
    } catch (e) {
      return Infinity;
    }
  }

  /*
   * options: {origin, source, slideId, allowedSteps:Set, allowedActions:Set}
   * Returns {ok:true, data} with only known fields, or {ok:false, reason}.
   */
  function validateSlideVoiceEvent(event, options) {
    const opts = options || {};
    if (!event || typeof event !== 'object') return reject('bad-payload');
    if (!isVoiceOrigin(opts.origin) || event.origin !== opts.origin) return reject('untrusted-origin');
    if (!opts.source || event.source !== opts.source) return reject('untrusted-source');

    const data = event.data;
    if (!isPlainObject(data)) return reject('bad-payload');
    if (serializeLength(data) > MAX_PAYLOAD) return reject('bad-payload');
    if (data.source !== 'slide') return reject('bad-source');
    if (!VOICE_EVENT_TYPES.includes(data.type)) return reject('bad-type');
    if (data.slideId !== opts.slideId) return reject('bad-slide');

    if (data.type === 'voice-step') {
      if (!isValidId(data.stepId) || !opts.allowedSteps || !opts.allowedSteps.has(data.stepId)) {
        return reject('bad-step');
      }
      if (!Number.isInteger(data.stepIndex) || data.stepIndex < 0 || data.stepIndex > 99) {
        return reject('bad-step-index');
      }
      return {
        ok: true,
        data: {
          type: data.type,
          slideId: data.slideId,
          stepId: data.stepId,
          stepIndex: data.stepIndex,
        },
      };
    }

    if (!isValidId(data.actionId) || !opts.allowedActions || !opts.allowedActions.has(data.actionId)) {
      return reject('bad-action');
    }
    if (data.stepId !== undefined && (!isValidId(data.stepId) || !opts.allowedSteps || !opts.allowedSteps.has(data.stepId))) {
      return reject('bad-step');
    }
    return {
      ok: true,
      data: {
        type: data.type,
        slideId: data.slideId,
        actionId: data.actionId,
        stepId: data.stepId || null,
      },
    };
  }

  return {
    VOICE_EVENT_TYPES,
    MAX_PAYLOAD,
    isVoiceOrigin,
    canOwnAudio,
    isValidId,
    validateSlideVoiceEvent,
  };
});
