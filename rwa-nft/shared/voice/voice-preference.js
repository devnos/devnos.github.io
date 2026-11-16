/*
 * Narration mute preference.
 *
 * An explicit "narration off" is a user decision: navigation, a language
 * switch and a reload must not turn sound back on. Storage is optional and
 * never throws into the deck; a denied or corrupt store means "enabled".
 */
(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.VoicePreference = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const KEY = 'rwa_voice_off';

  function readEnabled(storage) {
    if (!storage) return true;
    try {
      return storage.getItem(KEY) !== '1';
    } catch (e) {
      return true;
    }
  }

  function writeEnabled(storage, enabled) {
    if (!storage) return;
    try {
      storage.setItem(KEY, enabled ? '0' : '1');
    } catch (e) {}
  }

  return { KEY, readEnabled, writeEnabled };
});
