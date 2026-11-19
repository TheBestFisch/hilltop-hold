(() => {
  'use strict';

  const { i18n, readJson, writeJson } = Hold;

  const STORAGE_KEY = 'hilltopHold.debugOpen';
  const TOGGLE_KEYS = new Set(['Backquote', 'F2']);

  /**
   * Developer panel, available in every build and toggled with ` or F2.
   * Tools are sections: `addSection({ id, titleKey, build(container), update() })`.
   * `build` runs once; `update` runs every frame while the panel is open.
   * The open/closed state is remembered between sessions.
   */
  class DebugMenu {
    #sections = [];

    constructor() {
      this.root = document.querySelector('[data-debug]');
      this.body = this.root.querySelector('[data-debug-sections]');
      this.root.querySelector('[data-debug-close]').addEventListener('click', () => this.setOpen(false));
      window.addEventListener('keydown', (event) => {
        if (!TOGGLE_KEYS.has(event.code) || event.target.closest?.('input, select')) return;
        event.preventDefault();
        this.toggle();
      });
      this.setOpen(readJson(STORAGE_KEY, false));
    }

    get open() {
      return !this.root.hidden;
    }

    setOpen(open) {
      this.root.hidden = !open;
      writeJson(STORAGE_KEY, open);
      if (open) this.update();
    }

    toggle() {
      this.setOpen(!this.open);
    }

    addSection(section) {
      const wrapper = document.createElement('section');
      wrapper.className = 'debug-section';
      wrapper.dataset.debugSection = section.id;
      const heading = document.createElement('h3');
      heading.dataset.i18n = section.titleKey;
      heading.textContent = i18n.t(section.titleKey);
      const content = document.createElement('div');
      wrapper.append(heading, content);
      this.body.append(wrapper);
      section.build(content);
      this.#sections.push(section);
      if (this.open) section.update?.();
    }

    update() {
      if (!this.open) return;
      for (const section of this.#sections) section.update?.();
    }
  }

  Object.assign(Hold, { DebugMenu });
})();
