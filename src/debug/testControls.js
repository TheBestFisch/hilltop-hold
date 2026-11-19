(() => {
  'use strict';

  const { i18n } = Hold;

  const button = (labelKey, onClick, params) => {
    const element = document.createElement('button');
    element.type = 'button';
    element.className = 'btn small';
    element.dataset.i18n = labelKey;
    element.textContent = i18n.t(labelKey, params);
    element.addEventListener('click', onClick);
    return element;
  };

  const row = (...children) => {
    const element = document.createElement('div');
    element.className = 'debug-row';
    element.append(...children);
    return element;
  };

  const label = (key) => {
    const element = document.createElement('span');
    element.className = 'debug-label';
    element.dataset.i18n = key;
    element.textContent = i18n.t(key);
    return element;
  };

  const toggle = (key, get, set) => {
    const element = document.createElement('label');
    element.className = 'debug-toggle';
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = get();
    input.addEventListener('change', () => set(input.checked));
    const text = document.createElement('span');
    text.dataset.i18n = key;
    text.textContent = i18n.t(key);
    element.append(input, text);
    element.refresh = () => { input.checked = get(); };
    return element;
  };

  /**
   * Debug sections for testing the game's behaviour and looks without
   * playing through it: cheats and spawns, a showcase of every tower at
   * every level, overlays for the collision shapes and terrain, camera
   * presets, and render statistics. `api` is provided by the Game (see
   * Game.#debugApi); everything goes through the World's own rules.
   */
  function createTestControls(api) {
    return [cheatsSection(api), overlaySection(api), statsSection(api)];
  }

  function cheatsSection(api) {
    function build(container) {
      container.append(
        row(
          button('debug.test.gold', () => api.grantGold(500)),
          button('debug.test.lives', () => api.addLives(10)),
          button('debug.test.oneLife', () => api.setLives(1)),
        ),
        row(
          label('debug.test.spawn'),
          ...api.enemyTypes.map((type) => button(`enemies.${type}`, () => api.spawn(type))),
        ),
        row(
          button('debug.test.killAll', () => api.killAll()),
          button('debug.test.clearShots', () => api.clearShots()),
          button('debug.test.startWave', () => api.startWave()),
          button('debug.test.skipWaves', () => api.skipWaves(5)),
        ),
        row(
          button('debug.test.showcase', () => api.showcase()),
          button('debug.test.maxAll', () => api.maxAll()),
          button('debug.test.sellAll', () => api.sellAll()),
        ),
        hint('debug.test.hint'),
      );
    }
    return { id: 'test', titleKey: 'debug.test.title', build };
  }

  function overlaySection(api) {
    const toggles = [];
    const cameraButtons = [];
    function build(container) {
      const { overlay } = api;
      for (const layer of ['collision', 'path', 'grid', 'pointer', 'wireframe']) {
        toggles.push(toggle(`debug.overlay.${layer}`, () => overlay.enabled[layer], (value) => overlay.set(layer, value)));
      }
      toggles.push(toggle('debug.overlay.shadows', () => api.shadows(), (value) => api.setShadows(value)));
      toggles.push(toggle('debug.overlay.ambient', () => api.ambientFrozen(), (value) => api.setAmbientFrozen(value)));
      const cameras = row(label('debug.overlay.camera'));
      for (const preset of api.cameraPresets) {
        const chip = document.createElement('button');
        chip.type = 'button';
        chip.className = 'chip';
        chip.dataset.i18n = `debug.overlay.presets.${preset}`;
        chip.dataset.preset = preset;
        chip.textContent = i18n.t(chip.dataset.i18n);
        chip.addEventListener('click', () => { api.setCamera(preset); update(); });
        cameraButtons.push(chip);
        cameras.append(chip);
      }
      container.append(row(...toggles.slice(0, 3)), row(...toggles.slice(3, 5)), row(...toggles.slice(5)), cameras, hint('debug.overlay.hint'));
      update();
    }
    function update() {
      for (const chip of cameraButtons) chip.setAttribute('aria-pressed', String(chip.dataset.preset === api.camera()));
      for (const entry of toggles) entry.refresh();
    }
    return { id: 'overlay', titleKey: 'debug.overlay.title', build, update };
  }

  function statsSection(api) {
    const lines = {};
    function build(container) {
      for (const key of ['fps', 'calls', 'entities', 'hovered']) {
        lines[key] = document.createElement('p');
        lines[key].className = 'debug-counters';
        container.append(lines[key]);
      }
    }
    function update() {
      const stats = api.stats();
      lines.fps.textContent = i18n.t('debug.stats.fps', { fps: stats.fps });
      lines.calls.textContent = i18n.t('debug.stats.calls', { calls: stats.calls, triangles: stats.triangles.toLocaleString() });
      lines.entities.textContent = i18n.t('debug.stats.entities', stats);
      lines.hovered.textContent = stats.hovered
        ? i18n.t('debug.stats.hovered', { col: stats.hovered.col, row: stats.hovered.row, tier: stats.hovered.tier, height: stats.hovered.height.toFixed(2) })
        : i18n.t('debug.stats.none');
    }
    return { id: 'stats', titleKey: 'debug.stats.title', build, update };
  }

  function hint(key) {
    const element = document.createElement('p');
    element.className = 'debug-hint';
    element.dataset.i18n = key;
    element.textContent = i18n.t(key);
    return element;
  }

  Object.assign(Hold, { createTestControls });
})();
