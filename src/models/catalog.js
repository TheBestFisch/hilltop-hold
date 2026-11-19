(() => {
  'use strict';

  const { TOWERS, ENEMIES, towerModels, unitModels, sceneryModels, modelKit } = Hold;

  /**
   * Every model in the game, by id: `tower:<type>:<level>`, `enemy:<type>`,
   * `projectile:<tower type>`, `scenery:<name>[:<variant>]`. The game builds
   * models and icons through it, the gallery lists it, and tests check that
   * every entry builds.
   *
   * Each entry carries:
   *   group     'tower' | 'enemy' | 'projectile' | 'scenery'
   *   label     locale key for its name
   *   footprint how it occupies the ground: `{ tile: 1 }` (fills whole
   *             tiles), `{ radius }` (a collision circle) or `null`
   *   series    id shared by variants of one thing (tower levels, tree kinds)
   *   variant   index within the series, and `variantLabel` a locale key
   */

  /**
   * Scenery: [name, variants, footprint, variant names]. Variant names are
   * locale keys under `scenery.<name>Kinds` (the gate's are its damage
   * stages); without them the gallery numbers the variants.
   */
  const SCENERY = [
    ['tree', 3, 'tile'], ['rock', 3, 'tile'], ['bush', 2, null], ['stump', 1, null], ['mushrooms', 1, null],
    ['flowers', 2, null], ['cave', 1, null], ['house', 3, null], ['keep', 1, null],
    ['gate', 4, null, ['intact', 'battered', 'splintered', 'broken']], ['arch', 1, null],
    ['wall', 1, null], ['well', 1, null], ['windmill', 1, null], ['hay', 1, null], ['fence', 1, null],
    ['cart', 1, null], ['lamp', 1, null], ['signpost', 1, null], ['barrels', 1, null], ['cloud', 3, null],
    ['guard', 2, null, ['spear', 'bow']], ['villager', 3, null, ['farmer', 'woman', 'child']],
    ['warBanner', 1, null],
  ];

  const builderOf = (name) => sceneryModels[`build${name[0].toUpperCase()}${name.slice(1)}`];

  const entries = [
    ...TOWERS.flatMap((tower) => tower.levels.map((_, level) => ({
      id: `tower:${tower.id}:${level}`,
      group: 'tower',
      series: `tower:${tower.id}`,
      variant: level,
      variantLabel: 'gallery.level',
      label: `towers.${tower.id}.name`,
      footprint: { tile: 1 },
      build: () => towerModels.buildTower(tower.id, level),
    }))),
    ...Object.keys(ENEMIES).map((type) => ({
      id: `enemy:${type}`,
      group: 'enemy',
      series: `enemy:${type}`,
      variant: 0,
      label: `enemies.${type}`,
      footprint: { radius: ENEMIES[type].radius },
      build: () => unitModels.buildEnemy(type),
    })),
    ...TOWERS.map((tower) => ({
      id: `projectile:${tower.id}`,
      group: 'projectile',
      series: `projectile:${tower.id}`,
      variant: 0,
      label: `gallery.projectileOf`,
      labelParams: { tower: `towers.${tower.id}.name` },
      footprint: null,
      build: () => unitModels.buildProjectile(tower.id),
    })),
    ...SCENERY.flatMap(([name, variants, footprint, kinds]) => Array.from({ length: variants }, (_, variant) => ({
      id: variants > 1 ? `scenery:${name}:${variant}` : `scenery:${name}`,
      group: 'scenery',
      series: `scenery:${name}`,
      variant,
      variantLabel: kinds ? `scenery.${name}Kinds.${kinds[variant]}` : variants > 1 ? 'gallery.variant' : undefined,
      label: `scenery.${name}`,
      footprint: footprint === 'tile' ? { tile: 1 } : null,
      build: () => builderOf(name)(variant),
    }))),
  ];

  const byId = new Map(entries.map((entry) => [entry.id, entry]));
  const baked = new Map();

  const catalog = {
    entries,
    groups: ['tower', 'enemy', 'projectile', 'scenery'],
    get(id) {
      return byId.get(id) ?? null;
    },
    build(id) {
      const entry = byId.get(id);
      if (!entry) throw new Error(`Unknown model "${id}"`);
      return entry.build();
    },
    /**
     * A baked copy for drawing in the game: a few meshes instead of dozens,
     * sharing geometry with every other copy of the same model. Turrets,
     * bodies and animation hooks are preserved (see modelKit.bake).
     */
    instance(id) {
      if (!baked.has(id)) baked.set(id, modelKit.bake(this.build(id)));
      return modelKit.resolveRoles(baked.get(id).clone());
    },
    /** All entries of a series (e.g. the three levels of a tower), in variant order. */
    series(seriesId) {
      return entries.filter((entry) => entry.series === seriesId);
    },
  };

  Object.assign(Hold, { catalog });
})();
