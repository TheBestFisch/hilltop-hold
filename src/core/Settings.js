(() => {
  'use strict';

  const { readJson, writeJson, detectLocale } = Hold;

  const STORAGE_KEY = 'hilltopHold.settings';

  const defaults = () => ({
    language: detectLocale(),
    autoStartWaves: false,
    screenShake: true,
  });

  /** Persistent user settings. Dispatches `change` with `{ key, value }`. */
  class Settings extends EventTarget {
    #values;

    constructor() {
      super();
      this.#values = { ...defaults(), ...readJson(STORAGE_KEY, {}) };
    }

    get(key) {
      return this.#values[key];
    }

    set(key, value) {
      if (!(key in this.#values) || this.#values[key] === value) return;
      this.#values[key] = value;
      writeJson(STORAGE_KEY, this.#values);
      this.dispatchEvent(new CustomEvent('change', { detail: { key, value } }));
    }
  }

  Object.assign(Hold, { Settings });
})();
