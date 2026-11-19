(() => {
  'use strict';

  const LOCALES = Hold.locales;
  const FALLBACK = 'en';

  const SUPPORTED_LOCALES = Object.keys(LOCALES);

  function detectLocale() {
    const preferred = (navigator.language || FALLBACK).slice(0, 2).toLowerCase();
    return preferred in LOCALES ? preferred : FALLBACK;
  }

  function lookup(dictionary, key) {
    return key.split('.').reduce((node, part) => node?.[part], dictionary);
  }

  /**
   * Minimal i18n: dotted keys, `{name}` interpolation, English fallback.
   * Elements with `data-i18n="key"` are translated automatically.
   * Dispatches `change` after the locale switches.
   */
  class I18n extends EventTarget {
    #locale = FALLBACK;

    get locale() {
      return this.#locale;
    }

    setLocale(locale) {
      this.#locale = locale in LOCALES ? locale : FALLBACK;
      document.documentElement.lang = this.#locale;
      this.translate(document);
      this.dispatchEvent(new Event('change'));
    }

    t(key, params = {}) {
      const template = lookup(LOCALES[this.#locale], key) ?? lookup(LOCALES[FALLBACK], key);
      if (typeof template !== 'string') return key;
      return template.replace(/\{(\w+)\}/g, (match, name) => (name in params ? String(params[name]) : match));
    }

    translate(root) {
      for (const element of root.querySelectorAll('[data-i18n]')) {
        element.textContent = this.t(element.dataset.i18n);
      }
    }

    languageName(locale) {
      return LOCALES[locale]?.meta.name ?? locale;
    }
  }

  const i18n = new I18n();

  Object.assign(Hold, { SUPPORTED_LOCALES, detectLocale, i18n });
})();
