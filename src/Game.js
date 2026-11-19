(() => {
  'use strict';

  const {
    i18n, readJson, writeJson, TOWERS, TOWERS_BY_ID, ENEMIES, BOSS, TimeController, World, catalog, Thumbnailer, lighting,
    MapView, UnitsView, Effects, FireSystem, VillageView, VILLAGE_ALARM, DebugOverlay, UI, DebugMenu, createTimeControls, createTestControls,
    CAMERA_PRESETS, placeCamera, blendPresets,
  } = Hold;

  const BEST_WAVE_KEY = 'hilltopHold.bestWave';
  const ICON_SIZE = 64;
  const AUTO_START_SECONDS = 5;
  const SHAKE = { gateHit: 0.09, heavyHit: 0.16, gateBroken: 0.5, decay: 8, max: 0.5 };
  /** The fall of the village: seconds of it shown before the game-over screen, and how long the camera takes to turn to the village. */
  const FALL = { seconds: 9, camera: 3.2 };
  /** Share of the gate left when the player is warned it is about to give way. */
  const GATE_WEAK = 0.25;
  /** The part of the world that gets real shadows: the plateau, village, cave and the near hillside. */
  const SHADOW_BOUNDS = new THREE.Box3(new THREE.Vector3(-17, -3.2, -11), new THREE.Vector3(19, 4, 14));
  const TOWER_KEYS = Object.fromEntries(TOWERS.map((tower, index) => [`Digit${index + 1}`, tower.id]));

  /**
   * Owns the renderer and screen flow, and runs the World through a
   * TimeController so the debug menu can pause, step and speed it up.
   * Everything that should freeze when the simulation is paused (effects,
   * turret turning, the auto-start countdown, walk cycles) advances with
   * simulation time. Purely ambient motion (clouds, flames, windmill sails)
   * runs on real time so a paused frame still feels alive; the debug menu
   * can freeze it too.
   *
   * Screen flow: menu → playing ⇄ paused → fallen → over. When the gate
   * breaks the run is lost but the simulation keeps running ('fallen'): the
   * camera turns to the village while its people flee and the invaders pour
   * in and set it alight, and only then does the game-over screen come up,
   * over the still burning village.
   */
  class Game {
    #state = 'menu';
    #world;
    #buildType = null;
    #selected = null;
    #hovered = null;
    #autoStartIn = null;
    #simDelta = 0;
    #lastFrame = performance.now();
    #shake = 0;
    #bossWarnedWave = 0;
    #gateWarnedWave = -1;
    #gateWeakWarned = false;
    #fallIn = null;
    #fallCamera = null;
    /** Simulated seconds, for the fires (which freeze with the simulation). */
    #fireTime = 0;
    #cameraPreset = 'default';
    #ambientFrozen = false;
    #raycaster = new THREE.Raycaster();
    #pointer = new THREE.Vector2();
    #scratch = new THREE.Vector3();
    #fps = { frames: 0, since: performance.now(), value: 0 };

    constructor({ canvas, settings }) {
      this.canvas = canvas;
      this.settings = settings;
      this.bestWave = readJson(BEST_WAVE_KEY, 0);

      this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
      lighting.configureRenderer(this.renderer);
      this.renderer.setSize(window.innerWidth, window.innerHeight, false);
      this.camera = new THREE.PerspectiveCamera(CAMERA_PRESETS.default.fov, window.innerWidth / window.innerHeight, 0.1, 500);
      this.#placeCamera();

      this.scene = new THREE.Scene();
      this.scene.background = new THREE.Color(lighting.SKY.horizon);
      this.scene.fog = new THREE.Fog(lighting.SKY.fog, 30, 62);
      this.lights = lighting.createLights({ bounds: SHADOW_BOUNDS, shadowSize: lighting.shadowMapSize(this.renderer) });
      this.scene.add(this.lights.group, lighting.createSkyDome());

      this.time = new TimeController();
      this.#world = new World({ seed: this.#seed() });
      this.mapView = new MapView(this.#world.map);
      this.fire = new FireSystem();
      this.units = new UnitsView({ mapView: this.mapView, camera: this.camera, fire: this.fire });
      this.effects = new Effects(this.scene);
      this.village = new VillageView({ mapView: this.mapView, effects: this.effects, fire: this.fire });
      this.overlay = new DebugOverlay({ mapView: this.mapView, units: this.units });
      this.scene.add(this.mapView.group, this.units.group, this.village.group, this.fire.group, this.overlay.group);

      this.icons = this.#createIcons();
      this.ui = new UI({ settings, icons: this.icons });
      this.debug = new DebugMenu();
      this.debug.addSection(createTimeControls({ time: this.time, step: (ticks) => this.time.step(this.#tick, ticks) }));
      for (const section of createTestControls(this.#debugApi())) this.debug.addSection(section);

      this.#bindUi();
      this.#bindInput();
      this.#showMenu();
    }

    start() {
      this.renderer.setAnimationLoop(this.#frame);
    }

    /** The running simulation, read-only, for console experiments and screenshot tooling. */
    get world() {
      return this.#world;
    }

    // Flow

    #showMenu() {
      this.#resetWorld();
      this.#state = 'menu';
      this.ui.showHud(false);
      this.ui.setBest(this.bestWave);
      this.ui.showScreen('main');
    }

    #startRun() {
      this.#resetWorld();
      this.#state = 'playing';
      this.ui.showScreen(null);
      this.ui.showHud(true);
      this.#refreshHud();
    }

    #resetWorld() {
      this.#world = new World({ seed: this.#seed() });
      this.units.clear();
      this.effects.clear();
      this.overlay.clear();
      this.village.reset();
      this.fire.clear();
      this.time.reset();
      this.#buildType = null;
      this.#autoStartIn = null;
      this.#bossWarnedWave = 0;
      this.#gateWarnedWave = -1;
      this.#gateWeakWarned = false;
      this.#fallIn = null;
      this.#fallCamera = null;
      this.ui.hudRoot.classList.remove('fallen');
      this.#select(null);
    }

    #pauseToggle() {
      if (this.#state === 'playing') {
        this.#state = 'paused';
        this.ui.showScreen('pause');
      } else if (this.#state === 'paused' && this.ui.currentScreen === 'pause') {
        this.#resume();
      }
    }

    #resume() {
      this.#state = 'playing';
      this.#lastFrame = performance.now();
      this.ui.showScreen(null);
    }

    #endRun() {
      const wave = this.#world.wave;
      const newBest = this.bestWave > 0 && wave > this.bestWave;
      if (wave > this.bestWave) {
        this.bestWave = wave;
        writeJson(BEST_WAVE_KEY, wave);
      }
      this.#state = 'over';
      this.#select(null);
      this.ui.showHud(false);
      this.ui.showGameOver({ wave, best: this.bestWave, newBest });
    }

    // Simulation

    /** One fixed simulation tick. Used by the game loop and by debug stepping. */
    #tick = (dt) => {
      this.#world.update(dt);
      this.#simDelta += dt;
      this.#countDownAutoStart(dt);
      if (this.#state === 'fallen') {
        this.#fallIn -= dt;
        if (this.#fallIn <= 0) this.#endRun();
      }
    };

    /** The gate is broken: the run is lost. Show the village fall before the game-over screen. */
    #beginFall() {
      if (this.#state !== 'playing') return;
      this.#state = 'fallen';
      this.#fallIn = FALL.seconds;
      if (this.#cameraPreset === 'default') this.#fallCamera = 0;
      this.#buildType = null;
      this.#hovered = null;
      this.#select(null);
      this.#updateHover();
      this.ui.hudRoot.classList.add('fallen');
    }

    #countDownAutoStart(dt) {
      const world = this.#world;
      const eligible = this.#state === 'playing' && this.settings.get('autoStartWaves') && world.phase === 'build' && world.wave > 0;
      if (!eligible) {
        this.#autoStartIn = null;
        return;
      }
      this.#autoStartIn = (this.#autoStartIn ?? AUTO_START_SECONDS) - dt;
      if (this.#autoStartIn <= 0) {
        this.#autoStartIn = null;
        world.startWave();
      }
    }

    #frame = (now) => {
      const realDt = (now - this.#lastFrame) / 1000;
      this.#lastFrame = now;
      // The simulation also runs on through the fall and behind the game-over screen, so the village is seen burning.
      if (this.#state === 'playing' || this.#state === 'fallen' || this.#state === 'over') this.time.advance(realDt, this.#tick);

      for (const event of this.#world.drainEvents()) this.#handleEvent(event);
      const simDt = this.#simDelta;
      this.#simDelta = 0;
      this.effects.update(simDt);
      this.units.sync(this.#world, simDt);
      this.village.update(this.#world, simDt);
      this.#fireTime += simDt;
      this.fire.update(this.#fireTime);
      this.overlay.update(this.#world, simDt);
      if (!this.#ambientFrozen) this.mapView.update(Math.min(realDt, 0.1));

      if (this.#state === 'playing' || this.#state === 'fallen') this.#refreshHud();
      if (this.#fallCamera !== null) this.#fallCamera = Math.min(1, this.#fallCamera + Math.min(realDt, 0.1) / FALL.camera);
      this.#applyShake(simDt);
      this.renderer.render(this.scene, this.camera);
      this.#countFrame(now);
      this.debug.update();
    };

    #handleEvent(event) {
      const world = this.#world;
      this.village.handle(event, world);
      switch (event.type) {
        case 'spawn':
          if (event.enemy.type === BOSS && this.#bossWarnedWave !== world.wave) {
            this.#bossWarnedWave = world.wave;
            this.ui.toast(i18n.t('toast.boss'));
          }
          break;
        case 'death':
          this.effects.burst(this.#at(event.enemy.x, event.enemy.y, 0.4), 'poof');
          this.effects.burst(this.#at(event.enemy.x, event.enemy.y, 0.6), 'coins');
          break;
        case 'hit': {
          const kind = event.splash > 0 ? 'splash' : event.projectile.tower === 'frost' ? 'frost' : 'hit';
          this.effects.burst(this.#at(event.x, event.y, 0.4), kind);
          if (event.splash > 0) this.overlay.splash(event.x, event.y, event.splash);
          break;
        }
        case 'shot':
          if (event.tower.type === 'cannon') {
            this.effects.burst(this.units.muzzleOf(event.tower, this.#scratch).clone(), 'muzzle');
            this.#addShake(0.04);
          }
          break;
        case 'build':
          this.effects.burst(this.#at(event.tower.col, event.tower.row, 0.2), 'dust');
          break;
        case 'upgrade':
          this.effects.burst(this.#at(event.tower.col, event.tower.row, 0.8), 'sparkle');
          break;
        case 'sell':
          this.effects.burst(this.#at(event.tower.col, event.tower.row, 0.5), 'coins');
          break;
        case 'gateReached':
          // Once per wave: the first invader to reach the gate.
          if (this.#gateWarnedWave !== world.wave) {
            this.#gateWarnedWave = world.wave;
            this.ui.toast(i18n.t('toast.atGate'));
          }
          break;
        case 'gateHit':
          this.#addShake(ENEMIES[event.enemy.type].boss ? SHAKE.heavyHit : SHAKE.gateHit);
          this.ui.hud.flashLives();
          if (!this.#gateWeakWarned && event.lives > 0 && event.lives / world.maxLives <= GATE_WEAK) {
            this.#gateWeakWarned = true;
            this.ui.toast(i18n.t('toast.gateWeak'));
          }
          break;
        case 'repelled':
          this.effects.burst(this.#at(event.enemy.x, event.enemy.y, 0.4), 'poof');
          break;
        case 'gateBroken':
          this.ui.toast(i18n.t('toast.gateBroken'));
          this.#addShake(SHAKE.gateBroken);
          this.#beginFall();
          break;
        case 'waveStart':
          this.ui.toast(i18n.t('toast.waveStart', { wave: event.wave }));
          break;
        case 'waveClear':
          this.ui.toast(i18n.t('toast.waveClear', { wave: event.wave, bonus: event.bonus }));
          break;
        case 'gameOver':
          // The fall plays first (see #beginFall) and the game-over screen follows it; if it could not
          // play (the gate broke while debug-stepping on the pause screen), the run ends straight away.
          if (this.#state !== 'fallen' && this.#state !== 'over') this.#endRun();
          break;
        default:
          break;
      }
    }

    // Player actions

    #chooseTower(type) {
      this.#select(null);
      this.#buildType = this.#buildType === type ? null : type;
      this.#updateHover();
    }

    #select(tower) {
      this.#selected = tower;
      this.ui.hud.showTower(this.#world, tower);
      if (tower) this.mapView.showRange(tower.col, tower.row, this.#world.statsOf(tower).range);
      else this.mapView.hideRange();
    }

    #clickTile(tile) {
      const world = this.#world;
      const tower = tile && world.towerAt(tile.col, tile.row);
      if (tower) {
        this.#buildType = null;
        this.#select(tower);
      } else if (tile && this.#buildType) {
        const result = world.build(this.#buildType, tile.col, tile.row);
        if (!result.ok) this.ui.toast(i18n.t(`toast.${result.reason}`));
      } else {
        this.#select(null);
      }
      this.#updateHover();
    }

    #upgradeSelected() {
      const result = this.#world.upgrade(this.#selected);
      if (!result.ok) this.ui.toast(i18n.t(`toast.${result.reason}`));
      this.#select(this.#selected);
    }

    #sellSelected() {
      const { refund } = this.#world.sell(this.#selected);
      this.ui.toast(i18n.t('toast.sold', { amount: refund }));
      this.#select(null);
    }

    #refreshHud() {
      this.ui.hud.update(this.#world, { buildType: this.#buildType, autoStartIn: this.#autoStartIn, underAttack: this.village.alarm >= VILLAGE_ALARM.siege });
      if (this.#selected) this.ui.hud.showTower(this.#world, this.#selected);
    }

    // Wiring

    #bindUi() {
      const { ui } = this;
      ui.on('play', () => this.#startRun());
      ui.on('resume', () => this.#resume());
      ui.on('quit', () => this.#showMenu());
      ui.on('openDebug', () => this.debug.setOpen(true));
      ui.on('startWave', () => this.#world.startWave());
      ui.on('chooseTower', (button) => this.#chooseTower(button.dataset.tower));
      ui.on('upgradeTower', () => this.#upgradeSelected());
      ui.on('sellTower', () => this.#sellSelected());

      this.settings.addEventListener('change', ({ detail }) => {
        if (detail.key === 'screenShake' && !detail.value) this.#shake = 0;
      });
      i18n.addEventListener('change', () => {
        this.ui.setBest(this.bestWave);
        if (this.#selected) this.ui.hud.showTower(this.#world, this.#selected);
      });
    }

    #bindInput() {
      const playable = () => this.#state === 'playing' && this.ui.currentScreen === null;

      this.canvas.addEventListener('pointermove', (event) => {
        this.#hovered = playable() ? this.#pickTile(event) : null;
        this.overlay.setPointer(this.#raycaster.ray, this.#hovered);
        this.#updateHover();
      });
      this.canvas.addEventListener('pointerdown', (event) => {
        if (!playable()) return;
        if (event.button === 2) {
          this.#buildType = null;
          this.#select(null);
          this.#updateHover();
        } else if (event.button === 0) {
          this.#clickTile(this.#pickTile(event));
        }
      });
      this.canvas.addEventListener('contextmenu', (event) => event.preventDefault());

      window.addEventListener('keydown', (event) => {
        if (event.target.closest?.('input, select')) return;
        if (event.code === 'Escape' || event.code === 'KeyP') {
          if (playable() && (this.#buildType || this.#selected)) {
            this.#buildType = null;
            this.#select(null);
            this.#updateHover();
          } else {
            this.#pauseToggle();
          }
        } else if (TOWER_KEYS[event.code] && playable()) {
          this.#chooseTower(TOWER_KEYS[event.code]);
        } else if (event.code === 'Space' && playable()) {
          event.preventDefault();
          this.#world.startWave();
        }
      });
      document.addEventListener('visibilitychange', () => {
        if (document.hidden && this.#state === 'playing') this.#pauseToggle();
      });
      window.addEventListener('resize', () => {
        this.renderer.setSize(window.innerWidth, window.innerHeight, false);
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
      });
    }

    /** Tile under the pointer, honouring terrain heights (see MapView.pickTile). */
    #pickTile(event) {
      const rect = this.canvas.getBoundingClientRect();
      this.#pointer.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
      this.#raycaster.setFromCamera(this.#pointer, this.camera);
      return this.mapView.pickTile(this.#raycaster.ray);
    }

    /** Placement preview while building; range ring for the hovered or selected tower. */
    #updateHover() {
      const tile = this.#hovered;
      const world = this.#world;
      if (!tile) {
        this.mapView.hideMarker();
        this.mapView.hideGhost();
        if (!this.#selected) this.mapView.hideRange();
        return;
      }
      const tower = world.towerAt(tile.col, tile.row);
      if (this.#buildType && !tower) {
        const valid = world.canBuildAt(tile.col, tile.row);
        this.mapView.showMarker(tile.col, tile.row, valid);
        this.mapView.showGhost(this.#buildType, tile.col, tile.row, valid);
        const range = world.statsOf({ type: this.#buildType, level: 0 }).range;
        this.mapView.showRange(tile.col, tile.row, range);
        return;
      }
      this.mapView.hideMarker();
      this.mapView.hideGhost();
      const shown = tower ?? this.#selected;
      if (shown) this.mapView.showRange(shown.col, shown.row, world.statsOf(shown).range);
      else this.mapView.hideRange();
    }

    // Helpers

    /** World position `height` above the ground at tile coordinates. */
    #at(x, y, height) {
      return this.mapView.toWorld(x, y, this.#scratch).setY(this.mapView.heightAt(x, y) + height).clone();
    }

    #addShake(amount) {
      if (this.settings.get('screenShake')) this.#shake = Math.min(SHAKE.max, this.#shake + amount);
    }

    #applyShake(dt) {
      this.#placeCamera();
      if (this.#shake <= 0) return;
      this.camera.position.x += (Math.random() * 2 - 1) * this.#shake;
      this.camera.position.y += (Math.random() * 2 - 1) * this.#shake;
      this.#shake = this.#shake < 0.01 ? 0 : this.#shake * Math.exp(-SHAKE.decay * dt);
    }

    #placeCamera() {
      const preset = CAMERA_PRESETS[this.#cameraPreset];
      if (this.#fallCamera === null) placeCamera(this.camera, preset);
      else placeCamera(this.camera, blendPresets(preset, CAMERA_PRESETS.siege, this.#fallCamera * this.#fallCamera * (3 - 2 * this.#fallCamera)));
    }

    #countFrame(now) {
      const fps = this.#fps;
      fps.frames++;
      if (now - fps.since >= 500) {
        fps.value = Math.round((fps.frames * 1000) / (now - fps.since));
        fps.frames = 0;
        fps.since = now;
      }
    }

    #createIcons() {
      const thumbnailer = new Thumbnailer(this.renderer);
      const cache = new Map();
      for (const tower of TOWERS) {
        tower.levels.forEach((_, level) => {
          const id = `tower:${tower.id}:${level}`;
          cache.set(id, thumbnailer.render(catalog.build(id), ICON_SIZE));
        });
      }
      return { url: (id) => cache.get(id) };
    }

    #seed() {
      return Math.floor(Math.random() * 1e9);
    }

    /** What the debug testing tools may do to the running game. */
    #debugApi() {
      const ensurePlaying = () => {
        if (this.#state !== 'playing') this.#startRun();
      };
      return {
        world: () => this.#world,
        ensurePlaying,
        grantGold: (amount) => { this.#world.gold += amount; },
        addLives: (amount) => { this.#world.lives = Math.max(1, this.#world.lives + amount); },
        setLives: (lives) => { this.#world.lives = Math.max(1, lives); },
        spawn: (type) => { ensurePlaying(); this.#world.spawnEnemy(type); },
        killAll: () => { for (const enemy of [...this.#world.enemies]) this.#world.kill(enemy); },
        clearShots: () => { this.#world.projectiles = []; },
        startWave: () => { ensurePlaying(); this.#world.startWave(); },
        skipWaves: (count) => { ensurePlaying(); this.#world.skipWaves(count); },
        showcase: () => { ensurePlaying(); this.#showcaseTowers(); },
        maxAll: () => { for (const tower of this.#world.towers) this.#world.setTowerLevel(tower, TOWERS_BY_ID[tower.type].levels.length - 1); this.#select(this.#selected); },
        sellAll: () => { for (const tower of [...this.#world.towers]) this.#world.sell(tower); this.#select(null); },
        overlay: this.overlay,
        setAmbientFrozen: (frozen) => { this.#ambientFrozen = frozen; },
        ambientFrozen: () => this.#ambientFrozen,
        setShadows: (enabled) => {
          this.renderer.shadowMap.enabled = enabled;
          this.scene.traverse((node) => { if (node.material) node.material.needsUpdate = true; });
        },
        shadows: () => this.renderer.shadowMap.enabled,
        cameraPresets: Object.keys(CAMERA_PRESETS),
        setCamera: (name) => { if (CAMERA_PRESETS[name]) this.#cameraPreset = name; },
        camera: () => this.#cameraPreset,
        stats: () => ({
          fps: this.#fps.value,
          calls: this.renderer.info.render.calls,
          triangles: this.renderer.info.render.triangles,
          towers: this.#world.towers.length,
          enemies: this.#world.enemies.length,
          projectiles: this.#world.projectiles.length,
          hovered: this.#hovered && {
            ...this.#hovered,
            tier: this.mapView.terrain.tierAt(this.#hovered.col, this.#hovered.row),
            height: this.mapView.tileTop(this.#hovered.col, this.#hovered.row),
          },
        }),
        enemyTypes: Object.keys(ENEMIES),
      };
    }

    /** Builds every tower type at every level, free, on buildable tiles nearest the road. */
    #showcaseTowers() {
      const world = this.#world;
      const spots = [];
      const taken = new Set();
      for (const { x, y } of world.path.points) {
        for (const [dc, dr] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) {
          const key = `${x + dc},${y + dr}`;
          if (taken.has(key) || !world.canBuildAt(x + dc, y + dr)) continue;
          taken.add(key);
          spots.push({ col: x + dc, row: y + dr });
        }
      }
      // Spread the showcase along the road so the levels are easy to compare.
      const stride = Math.max(1, Math.floor(spots.length / (TOWERS.length * 3 + 1)));
      let index = 0;
      for (const tower of TOWERS) {
        tower.levels.forEach((_, level) => {
          const spot = spots[index * stride];
          index++;
          if (!spot) return;
          const cost = tower.levels[0].cost;
          world.gold += cost;
          const { tower: built } = world.build(tower.id, spot.col, spot.row);
          if (built) world.setTowerLevel(built, level);
        });
      }
    }
  }

  Object.assign(Hold, { Game });
})();
