(() => {
  'use strict';

  const { i18n, TOWERS, TOWERS_BY_ID } = Hold;

  const element = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };

  /**
   * In-game overlay: wave, lives, gold, the build bar, the wave button and the
   * selected tower's panel. Stateless: the game passes in what to show.
   */
  class Hud {
    #fields;
    #buildBar;
    #panel;
    #panelFields;
    #textCache = new Map();

    constructor({ icons }) {
      this.icons = icons;
      this.#fields = Object.fromEntries([...document.querySelectorAll('[data-hud]')].map((el) => [el.dataset.hud, el]));
      this.#buildBar = document.querySelector('[data-build-bar]');
      this.#panel = document.querySelector('[data-tower-panel]');
      this.#panelFields = Object.fromEntries([...this.#panel.querySelectorAll('[data-tower]')].map((el) => [el.dataset.tower, el]));
    }

    get toasts() {
      return this.#fields.toasts;
    }

    /** Text changes reset after a language switch. */
    invalidate() {
      this.#textCache.clear();
    }

    /**
     * @param {World} world
     * @param {{ buildType: string|null, autoStartIn: number|null, underAttack?: boolean }} view
     */
    update(world, { buildType, autoStartIn, underAttack = false }) {
      this.#setText('wave', world.wave > 0 ? i18n.t('hud.wave', { wave: world.wave }) : i18n.t('hud.ready'));
      this.#setText('lives', world.lives);
      // The village card pulses while the gate is under attack and reddens as the gate weakens.
      const card = this.#fields.lives.closest('.lives');
      card.classList.toggle('under-attack', underAttack);
      card.classList.toggle('weak', world.lives / world.maxLives <= 0.25);
      this.#setText('gold', world.gold);
      this.#setText('enemies', i18n.t('hud.enemies', { count: world.enemiesRemaining }));

      const button = this.#fields.waveButton;
      button.hidden = world.phase !== 'build';
      this.#setText('waveButton', autoStartIn !== null
        ? i18n.t('hud.nextWaveIn', { seconds: Math.ceil(autoStartIn) })
        : i18n.t('hud.startWave', { wave: world.wave + 1 }));

      this.#renderBuildBar(world, buildType);
    }

    /** Flashes the village card: a blow has landed on the gate. */
    flashLives() {
      const card = this.#fields.lives.closest('.lives');
      card.classList.remove('hit');
      // Restart the animation even if the last flash is still running.
      void card.offsetWidth;
      card.classList.add('hit');
    }

    /** Shows the panel for a placed tower, or hides it with `null`. */
    showTower(world, tower) {
      this.#panel.hidden = !tower;
      if (!tower) return;
      const f = this.#panelFields;
      const stats = world.statsOf(tower);
      f.name.textContent = i18n.t(`towers.${tower.type}.name`);
      f.level.textContent = i18n.t('towerPanel.level', { level: tower.level + 1 });
      f.icon.src = this.icons.url(`tower:${tower.type}:${tower.level}`);

      const rows = [
        [i18n.t('towerPanel.damage'), stats.damage],
        [i18n.t('towerPanel.range'), stats.range],
        [i18n.t('towerPanel.rate'), stats.rate],
      ];
      if (stats.splash) rows.push([i18n.t('towerPanel.splash'), stats.splash]);
      f.stats.replaceChildren(...rows.flatMap(([label, value]) => [element('dt', null, label), element('dd', null, String(value))]));
      if (stats.slow) f.stats.append(element('dd', 'wide', i18n.t('towerPanel.slow', { percent: Math.round(stats.slow * 100) })));

      const cost = world.upgradeCost(tower);
      f.upgrade.textContent = cost === null ? i18n.t('towerPanel.maxed') : i18n.t('towerPanel.upgrade', { cost });
      f.upgrade.disabled = cost === null || world.gold < cost;
      f.sell.textContent = i18n.t('towerPanel.sell', { value: world.sellValue(tower) });
      // Preview of the next level so players can see what the upgrade builds.
      f.next.hidden = cost === null;
      if (cost !== null) {
        const next = TOWERS_BY_ID[tower.type].levels[tower.level + 1];
        f.nextIcon.src = this.icons.url(`tower:${tower.type}:${tower.level + 1}`);
        f.nextText.textContent = i18n.t('towerPanel.next', { damage: next.damage, range: next.range, rate: next.rate });
      }
    }

    #renderBuildBar(world, buildType) {
      const key = `${buildType}|${world.gold}|${i18n.locale}`;
      if (this.#textCache.get('buildBar') === key) return;
      this.#textCache.set('buildBar', key);

      this.#buildBar.replaceChildren(...TOWERS.map((tower, index) => {
        const cost = TOWERS_BY_ID[tower.id].levels[0].cost;
        const option = element('button', `build-option${world.gold < cost ? ' unaffordable' : ''}`);
        option.dataset.action = 'chooseTower';
        option.dataset.tower = tower.id;
        option.setAttribute('aria-pressed', String(buildType === tower.id));
        option.title = i18n.t(`towers.${tower.id}.description`);
        const icon = element('img');
        icon.src = this.icons.url(`tower:${tower.id}:0`);
        icon.alt = '';
        option.append(
          icon,
          element('span', null, i18n.t(`towers.${tower.id}.name`)),
          element('span', 'cost', i18n.t('common.gold', { amount: cost })),
          element('span', 'key', String(index + 1)),
        );
        return option;
      }));
    }

    #setText(key, value) {
      const text = String(value);
      if (this.#textCache.get(key) === text) return;
      this.#textCache.set(key, text);
      this.#fields[key].textContent = text;
    }
  }

  Object.assign(Hold, { Hud });
})();
