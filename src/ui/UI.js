(() => {
  'use strict';

  const { i18n, SUPPORTED_LOCALES, Hud } = Hold;

  const TOAST_DURATION_MS = 2200;
  const MAX_TOASTS = 3;

  /**
   * Settings form fields. `options` builds a select's choices; anything else
   * is a checkbox. Add an entry here (and in index.html) for a new setting.
   */
  const SETTING_FIELDS = {
    language: {
      options: () => SUPPORTED_LOCALES.map((code) => ({ value: code, label: i18n.languageName(code) })),
    },
    autoStartWaves: {},
    screenShake: {},
  };

  /**
   * DOM layer: screens, toasts, settings and the game-over results, plus the
   * HUD. Buttons declare `data-action`; the game registers handlers with
   * `on(action, handler)`. Holds no game rules.
   */
  class UI {
    #screens;
    #form;
    #actions = new Map();
    #current = null;
    #returnTo = 'main';

    constructor({ settings, icons }) {
      this.settings = settings;
      this.hud = new Hud({ icons });
      this.#screens = new Map([...document.querySelectorAll('[data-screen]')].map((el) => [el.dataset.screen, el]));
      this.#form = document.querySelector('[data-settings]');
      this.hudRoot = document.getElementById('hud');

      document.addEventListener('click', (event) => {
        const trigger = event.target.closest('[data-action]');
        if (trigger && !trigger.disabled) this.#actions.get(trigger.dataset.action)?.(trigger);
      });

      this.on('settings', () => {
        this.#returnTo = this.#current;
        this.showScreen('settings');
      });
      this.on('back', () => this.showScreen(this.#returnTo));

      this.#bindSettings();
      i18n.addEventListener('change', () => {
        this.#renderSelectOptions();
        this.hud.invalidate();
      });
    }

    get currentScreen() {
      return this.#current;
    }

    on(action, handler) {
      this.#actions.set(action, handler);
    }

    showScreen(name) {
      this.#current = name;
      for (const [key, element] of this.#screens) element.hidden = key !== name;
      if (name === null) document.activeElement?.blur();
    }

    showHud(visible) {
      this.hudRoot.hidden = !visible;
    }

    setBest(wave) {
      const element = document.querySelector('[data-best]');
      element.hidden = wave < 1;
      element.textContent = i18n.t('menu.best', { wave });
    }

    showGameOver({ wave, best, newBest }) {
      const fields = Object.fromEntries([...document.querySelectorAll('[data-over]')].map((el) => [el.dataset.over, el]));
      fields.wave.textContent = wave;
      fields.best.textContent = best;
      fields.newBest.hidden = !newBest;
      this.showScreen('over');
    }

    toast(message) {
      const container = this.hud.toasts;
      if (container.children.length >= MAX_TOASTS) container.firstElementChild.remove();
      const element = document.createElement('div');
      element.className = 'toast';
      element.textContent = message;
      container.append(element);
      setTimeout(() => element.remove(), TOAST_DURATION_MS);
    }

    #renderSelectOptions() {
      for (const [name, field] of Object.entries(SETTING_FIELDS)) {
        if (!field.options) continue;
        const current = this.settings.get(name);
        this.#form.elements[name].replaceChildren(
          ...field.options().map(({ value, label }) => new Option(label, value, false, value === current)),
        );
      }
    }

    #bindSettings() {
      this.#renderSelectOptions();
      for (const [name, field] of Object.entries(SETTING_FIELDS)) {
        const input = this.#form.elements[name];
        const isSelect = Boolean(field.options);
        if (!isSelect) input.checked = this.settings.get(name);
        input.addEventListener('change', () => {
          this.settings.set(name, isSelect ? input.value : input.checked);
        });
      }
    }
  }

  Object.assign(Hold, { UI });
})();
