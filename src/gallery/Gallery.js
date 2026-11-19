(() => {
  'use strict';

  const {
    i18n, SUPPORTED_LOCALES, catalog, TOWERS_BY_ID, ENEMIES, Thumbnailer, lighting, animation, modelKit,
  } = Hold;
  const { mat, box, turretSweep, PALETTE } = modelKit;

  const THUMB_SIZE = 88;
  const FOV = 32;
  const ORBIT = { minPitch: 0.05, maxPitch: 1.45, minZoom: 0.5, maxZoom: 3 };
  const GROUPS = ['tower', 'enemy', 'projectile', 'scenery'];
  const GROUP_LABELS = { tower: 'gallery.towers', enemy: 'gallery.enemies', projectile: 'gallery.projectiles', scenery: 'gallery.scenery' };
  const WALK_SPEED = 7;

  const element = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };

  /**
   * Standalone asset browser: lists every catalog entry with a thumbnail,
   * and shows the selected one on a turntable with the game's lighting.
   * Variants (tower levels, tree kinds) switch in place; overlays show the
   * footprint and collision shapes the simulation uses. Needs no game code
   * beyond the models and data, so it opens straight from disk.
   */
  class Gallery {
    #entries = catalog.entries;
    #filter = 'all';
    #selected = null;
    #model = null;
    #parts = [];
    #orbit = { yaw: 0.7, pitch: 0.55, zoom: 1, auto: true, dragging: false, lastX: 0, lastY: 0 };
    #fit = { center: new THREE.Vector3(), radius: 1 };
    #clock = { last: performance.now(), time: 0 };
    #options = { animate: true, wireframe: false, footprint: true, ground: true };
    #thumbs = new Map();
    #cards = new Map();
    #stats = { meshes: 0, triangles: 0, size: new THREE.Vector3() };

    constructor({ canvas, settings }) {
      this.canvas = canvas;
      this.settings = settings;
      this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
      lighting.configureRenderer(this.renderer);
      this.scene = new THREE.Scene();
      this.scene.background = new THREE.Color(lighting.SKY.horizon);
      this.camera = new THREE.PerspectiveCamera(FOV, 1, 0.05, 100);
      this.lights = lighting.createLights({ shadowSize: 2048 });
      this.scene.add(this.lights.group);
      this.stage = new THREE.Group();
      this.ground = new THREE.Group();
      this.overlay = new THREE.Group();
      this.scene.add(this.stage, this.ground, this.overlay);
      this.thumbnailer = new Thumbnailer(this.renderer);

      this.#bindDom();
      this.#resize();
      window.addEventListener('resize', () => this.#resize());
      this.#renderCards();
      this.#select(this.#entryFromHash() ?? this.#entries[0]);
      this.renderer.setAnimationLoop(() => this.#frame());
      i18n.addEventListener('change', () => this.#retranslate());
    }

    // DOM

    #bindDom() {
      this.dom = {
        filters: document.querySelector('[data-filters]'),
        cards: document.querySelector('[data-cards]'),
        count: document.querySelector('[data-count]'),
        name: document.querySelector('[data-detail="name"]'),
        id: document.querySelector('[data-detail="id"]'),
        variants: document.querySelector('[data-detail="variants"]'),
        stats: document.querySelector('[data-detail="stats"]'),
        data: document.querySelector('[data-detail="data"]'),
        footprint: document.querySelector('[data-detail="footprint"]'),
        language: document.querySelector('[data-language]'),
      };
      for (const input of document.querySelectorAll('[data-option]')) {
        input.checked = this.#options[input.dataset.option];
        input.addEventListener('change', () => {
          this.#options[input.dataset.option] = input.checked;
          this.#applyOptions();
        });
      }
      document.querySelector('[data-reset-view]').addEventListener('click', () => this.#resetView());

      this.dom.language.replaceChildren(...SUPPORTED_LOCALES.map((code) => new Option(i18n.languageName(code), code, false, code === i18n.locale)));
      this.dom.language.addEventListener('change', () => this.settings.set('language', this.dom.language.value));

      // Orbit: drag to turn, wheel to zoom.
      this.canvas.addEventListener('pointerdown', (event) => {
        this.#orbit.dragging = true;
        this.#orbit.auto = false;
        this.#orbit.lastX = event.clientX;
        this.#orbit.lastY = event.clientY;
        this.canvas.setPointerCapture(event.pointerId);
      });
      this.canvas.addEventListener('pointermove', (event) => {
        if (!this.#orbit.dragging) return;
        this.#orbit.yaw -= (event.clientX - this.#orbit.lastX) * 0.008;
        this.#orbit.pitch = THREE.MathUtils.clamp(this.#orbit.pitch + (event.clientY - this.#orbit.lastY) * 0.006, ORBIT.minPitch, ORBIT.maxPitch);
        this.#orbit.lastX = event.clientX;
        this.#orbit.lastY = event.clientY;
      });
      const stop = () => { this.#orbit.dragging = false; };
      this.canvas.addEventListener('pointerup', stop);
      this.canvas.addEventListener('pointercancel', stop);
      this.canvas.addEventListener('wheel', (event) => {
        event.preventDefault();
        this.#orbit.zoom = THREE.MathUtils.clamp(this.#orbit.zoom * Math.exp(event.deltaY * 0.001), ORBIT.minZoom, ORBIT.maxZoom);
      }, { passive: false });

      window.addEventListener('keydown', (event) => {
        if (event.target.closest?.('input, select')) return;
        const visible = this.#visibleEntries();
        const index = visible.indexOf(this.#selected);
        if (event.code === 'ArrowRight' || event.code === 'ArrowDown') {
          event.preventDefault();
          this.#select(visible[(index + 1) % visible.length]);
        } else if (event.code === 'ArrowLeft' || event.code === 'ArrowUp') {
          event.preventDefault();
          this.#select(visible[(index - 1 + visible.length) % visible.length]);
        } else if (/^Digit[1-9]$/.test(event.code)) {
          const variants = catalog.series(this.#selected.series);
          const target = variants[Number(event.code.slice(5)) - 1];
          if (target) this.#select(target);
        } else if (event.code === 'Space') {
          event.preventDefault();
          this.#orbit.auto = !this.#orbit.auto;
        }
      });
      window.addEventListener('hashchange', () => {
        const entry = this.#entryFromHash();
        if (entry && entry !== this.#selected) this.#select(entry);
      });
    }

    #entryFromHash() {
      return catalog.get(decodeURIComponent(location.hash.slice(1))) ?? null;
    }

    #visibleEntries() {
      return this.#entries.filter((entry) => this.#filter === 'all' || entry.group === this.#filter);
    }

    #renderCards() {
      const filters = ['all', ...GROUPS].map((group) => {
        const chip = element('button', 'chip');
        chip.type = 'button';
        chip.dataset.filter = group;
        chip.dataset.i18n = group === 'all' ? 'gallery.all' : GROUP_LABELS[group];
        chip.textContent = i18n.t(chip.dataset.i18n);
        chip.setAttribute('aria-pressed', String(group === this.#filter));
        chip.addEventListener('click', () => {
          this.#filter = group;
          for (const other of this.dom.filters.children) other.setAttribute('aria-pressed', String(other === chip));
          this.#renderCardList();
        });
        return chip;
      });
      this.dom.filters.replaceChildren(...filters);
      this.#renderCardList();
    }

    #renderCardList() {
      const visible = this.#visibleEntries();
      this.dom.count.textContent = i18n.t('gallery.count', { count: visible.length });
      const sections = [];
      for (const group of GROUPS) {
        const entries = visible.filter((entry) => entry.group === group);
        if (!entries.length) continue;
        const heading = element('h2', 'cards-heading', i18n.t(GROUP_LABELS[group]));
        heading.dataset.i18n = GROUP_LABELS[group];
        const grid = element('div', 'cards-grid');
        for (const entry of entries) grid.append(this.#card(entry));
        sections.push(heading, grid);
      }
      this.dom.cards.replaceChildren(...sections);
      this.#highlightCard();
    }

    #card(entry) {
      let card = this.#cards.get(entry.id);
      if (!card) {
        card = element('button', 'asset-card');
        card.type = 'button';
        card.dataset.id = entry.id;
        const image = element('img');
        image.alt = '';
        image.src = this.#thumbnail(entry);
        card.append(image, element('span', 'asset-name', this.#labelOf(entry)), element('code', 'asset-id', entry.id));
        card.addEventListener('click', () => this.#select(entry));
        this.#cards.set(entry.id, card);
      } else {
        card.querySelector('.asset-name').textContent = this.#labelOf(entry);
      }
      return card;
    }

    #thumbnail(entry) {
      if (!this.#thumbs.has(entry.id)) this.#thumbs.set(entry.id, this.thumbnailer.render(entry.build(), THUMB_SIZE));
      return this.#thumbs.get(entry.id);
    }

    #labelOf(entry) {
      const params = Object.fromEntries(Object.entries(entry.labelParams ?? {}).map(([key, value]) => [key, i18n.t(value)]));
      const name = i18n.t(entry.label, params);
      return entry.variantLabel ? `${name} · ${i18n.t(entry.variantLabel, { n: entry.variant + 1 })}` : name;
    }

    #highlightCard() {
      for (const [id, card] of this.#cards) card.setAttribute('aria-pressed', String(this.#selected?.id === id));
      const card = this.#cards.get(this.#selected?.id);
      card?.scrollIntoView({ block: 'nearest' });
    }

    #retranslate() {
      this.#renderCardList();
      if (this.#selected) this.#renderDetails();
    }

    // Selection

    #select(entry) {
      if (!entry) return;
      this.#selected = entry;
      if (location.hash.slice(1) !== entry.id) history.replaceState(null, '', `#${entry.id}`);
      this.#highlightCard();
      this.#mount(entry);
      this.#renderDetails();
    }

    #mount(entry) {
      this.stage.clear();
      this.ground.clear();
      this.overlay.clear();
      this.#model = entry.build();
      this.#parts = animation.collect(this.#model);
      this.stage.add(this.#model);

      const bounds = modelKit.visibleBounds(this.#model);
      bounds.getSize(this.#stats.size);
      const sphere = bounds.getBoundingSphere(new THREE.Sphere());
      this.#fit.center.copy(sphere.center);
      this.#fit.radius = Math.max(0.35, sphere.radius);
      this.#stats.meshes = 0;
      this.#stats.triangles = 0;
      this.#model.traverse((node) => {
        if (!node.isMesh) return;
        this.#stats.meshes++;
        const { geometry } = node;
        this.#stats.triangles += (geometry.index ? geometry.index.count : geometry.attributes.position.count) / 3;
      });

      this.#buildGround(entry, bounds);
      this.#buildOverlay(entry, bounds);
      this.#applyOptions();
    }

    /** Grass plate under the model: whole tiles for tile-sized things, a disc otherwise. */
    #buildGround(entry, bounds) {
      const extent = Math.max(bounds.max.x, -bounds.min.x, bounds.max.z, -bounds.min.z, 0.5);
      const tiles = entry.group === 'scenery' && !entry.footprint ? Math.ceil(extent + 0.5) : 1;
      const span = tiles * 2 + 1;
      const plate = new THREE.Mesh(box(span, 0.16, span), mat(PALETTE.grassDark));
      plate.position.y = -0.08;
      plate.receiveShadow = true;
      this.ground.add(plate);
      for (let col = -tiles; col <= tiles; col++) {
        for (let row = -tiles; row <= tiles; row++) {
          const centre = col === 0 && row === 0;
          const tile = new THREE.Mesh(box(0.96, 0.02, 0.96), mat(centre ? PALETTE.grassLight : (col + row) % 2 ? PALETTE.grass : PALETTE.grassDark));
          tile.position.set(col, 0.01, row);
          tile.receiveShadow = true;
          this.ground.add(tile);
        }
      }
      if (entry.group === 'projectile') this.ground.position.y = -0.6;
    }

    /** Collision shapes and bounds: the tile outline, enemy radius, turret sweep, bounding box. */
    #buildOverlay(entry, bounds) {
      const yellow = new THREE.LineBasicMaterial({ color: 0xffd166 });
      const red = new THREE.LineBasicMaterial({ color: 0xe0604c });
      const cyan = new THREE.LineBasicMaterial({ color: 0x7fd7ff });
      const boxHelper = new THREE.Box3Helper(bounds, 0xffffff);
      boxHelper.material.transparent = true;
      boxHelper.material.opacity = 0.35;
      this.overlay.add(boxHelper);

      if (entry.footprint?.tile) {
        this.overlay.add(outline([[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]], 0.03, yellow));
      }
      if (entry.footprint?.radius) {
        this.overlay.add(circle(entry.footprint.radius, 0.03, red));
        this.overlay.add(circle(entry.footprint.radius, this.#model.userData.height ?? 1, red));
      }
      const { turret, muzzle } = this.#model.userData;
      if (turret) {
        const sweep = turretSweep(turret);
        this.overlay.add(circle(sweep.radius, sweep.y, cyan));
      }
      if (muzzle) {
        const marker = new THREE.Mesh(new THREE.OctahedronGeometry(0.04), new THREE.MeshBasicMaterial({ color: 0x7fd7ff }));
        marker.position.set(...muzzle);
        this.overlay.add(marker);
      }
    }

    #applyOptions() {
      this.ground.visible = this.#options.ground;
      this.overlay.visible = this.#options.footprint;
      this.#model?.traverse((node) => {
        if (node.isMesh) node.material.wireframe = this.#options.wireframe;
      });
      if (!this.#options.animate) {
        animation.reset(this.#parts);
        if (this.#model?.userData.body) this.#model.userData.body.position.y = 0;
        if (this.#model?.userData.turret) this.#model.userData.turret.rotation.y = 0;
      }
    }

    /** Sets the orbit directly (used by tooling and the console). */
    setView({ yaw = this.#orbit.yaw, pitch = this.#orbit.pitch, zoom = this.#orbit.zoom, auto = false } = {}) {
      Object.assign(this.#orbit, { yaw, pitch, zoom, auto });
    }

    select(id) {
      this.#select(catalog.get(id));
    }

    #resetView() {
      this.#orbit.yaw = 0.7;
      this.#orbit.pitch = 0.55;
      this.#orbit.zoom = 1;
      this.#orbit.auto = true;
    }

    // Details panel

    #renderDetails() {
      const entry = this.#selected;
      const { dom } = this;
      dom.name.textContent = this.#labelOf(entry);
      dom.id.textContent = entry.id;

      const variants = catalog.series(entry.series);
      dom.variants.replaceChildren(...(variants.length > 1 ? variants.map((variant) => {
        const button = element('button', 'chip', i18n.t(variant.variantLabel, { n: variant.variant + 1 }));
        button.type = 'button';
        button.setAttribute('aria-pressed', String(variant === entry));
        button.addEventListener('click', () => this.#select(variant));
        return button;
      }) : []));
      dom.variants.hidden = variants.length < 2;

      const { size } = this.#stats;
      dom.stats.replaceChildren(
        ...row(i18n.t('gallery.meshes'), String(this.#stats.meshes)),
        ...row(i18n.t('gallery.triangles'), String(Math.round(this.#stats.triangles))),
        ...row(i18n.t('gallery.size'), `${size.x.toFixed(2)} × ${size.y.toFixed(2)} × ${size.z.toFixed(2)}`),
      );

      dom.footprint.textContent = entry.footprint?.tile
        ? i18n.t('gallery.footprintTile')
        : entry.footprint?.radius
          ? i18n.t('gallery.footprintRadius', { radius: entry.footprint.radius })
          : i18n.t('gallery.footprintNone');

      dom.data.replaceChildren(...this.#dataRows(entry));
    }

    /** Gameplay numbers behind the model: tower level stats or invader stats. */
    #dataRows(entry) {
      if (entry.group === 'tower') {
        const [, type, level] = entry.id.split(':');
        const stats = TOWERS_BY_ID[type].levels[Number(level)];
        const rows = [
          ...row(i18n.t('gallery.cost'), i18n.t('common.gold', { amount: stats.cost })),
          ...row(i18n.t('towerPanel.damage'), String(stats.damage)),
          ...row(i18n.t('towerPanel.range'), `${stats.range} ${i18n.t('gallery.tiles')}`),
          ...row(i18n.t('towerPanel.rate'), String(stats.rate)),
        ];
        if (stats.splash) rows.push(...row(i18n.t('towerPanel.splash'), `${stats.splash} ${i18n.t('gallery.tiles')}`));
        if (stats.slow) rows.push(...row(i18n.t('gallery.slow'), `${Math.round(stats.slow * 100)}% · ${stats.slowSeconds}s`));
        return rows;
      }
      if (entry.group === 'enemy') {
        const stats = ENEMIES[entry.id.split(':')[1]];
        return [
          ...row(i18n.t('gallery.hp'), String(stats.hp)),
          ...row(i18n.t('gallery.speed'), `${stats.speed} ${i18n.t('gallery.tilesPerSecond')}`),
          ...row(i18n.t('gallery.armor'), String(stats.armor)),
          ...row(i18n.t('gallery.bounty'), i18n.t('common.gold', { amount: stats.bounty })),
          ...row(i18n.t('gallery.lives'), String(stats.lives)),
          ...row(i18n.t('gallery.strike'), `${stats.strike} ${i18n.t('gallery.seconds')}`),
        ];
      }
      if (entry.group === 'projectile') {
        const tower = TOWERS_BY_ID[entry.id.split(':')[1]];
        return row(i18n.t('gallery.speed'), `${tower.projectileSpeed} ${i18n.t('gallery.tilesPerSecond')}`);
      }
      return [];
    }

    // Rendering

    #resize() {
      const { clientWidth, clientHeight } = this.canvas.parentElement;
      this.renderer.setSize(clientWidth, clientHeight, false);
      this.camera.aspect = clientWidth / clientHeight;
      this.camera.updateProjectionMatrix();
    }

    #frame() {
      const now = performance.now();
      const dt = Math.min(0.1, (now - this.#clock.last) / 1000);
      this.#clock.last = now;
      if (this.#options.animate) {
        this.#clock.time += dt;
        this.#animate(this.#clock.time);
      }
      if (this.#orbit.auto && !this.#orbit.dragging) this.#orbit.yaw += dt * 0.35;
      this.#placeCamera();
      this.renderer.render(this.scene, this.camera);
    }

    #animate(time) {
      const model = this.#model;
      if (!model) return;
      const walking = this.#selected.group === 'enemy';
      animation.apply(this.#parts, { time, walk: walking ? time * WALK_SPEED : 0 });
      if (model.userData.body && walking) model.userData.body.position.y = Math.abs(Math.sin(time * WALK_SPEED / 2)) * (model.userData.bob ?? 0.05);
      if (model.userData.turret) model.userData.turret.rotation.y = Math.sin(time * 0.8) * 1.1;
    }

    #placeCamera() {
      const { yaw, pitch, zoom } = this.#orbit;
      const distance = (this.#fit.radius / Math.sin(THREE.MathUtils.degToRad(FOV / 2))) * 1.15 * zoom;
      this.camera.position.set(
        this.#fit.center.x + Math.sin(yaw) * Math.cos(pitch) * distance,
        this.#fit.center.y + Math.sin(pitch) * distance,
        this.#fit.center.z + Math.cos(yaw) * Math.cos(pitch) * distance,
      );
      this.camera.lookAt(this.#fit.center);
    }
  }

  function row(label, value) {
    return [element('dt', null, label), element('dd', null, value)];
  }

  function outline(points, y, material) {
    const vertices = points.map(([x, z]) => new THREE.Vector3(x, y, z));
    return new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(vertices), material);
  }

  function circle(radius, y, material, segments = 48) {
    const points = Array.from({ length: segments }, (_, i) => {
      const angle = (i / segments) * Math.PI * 2;
      return new THREE.Vector3(Math.cos(angle) * radius, y, Math.sin(angle) * radius);
    });
    return new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(points), material);
  }

  Object.assign(Hold, { Gallery });
})();
