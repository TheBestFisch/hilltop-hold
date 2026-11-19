(() => {
  'use strict';

  /**
   * Towers and their upgrade levels. Level 0 is what you build; `cost` on
   * later levels is the upgrade price. `rate` is shots per second, `range` and
   * `splash` are in tiles, `slow` multiplies enemy speed for `slowSeconds`.
   * Names and descriptions live in the locales under `towers.<id>`.
   */
  const TOWERS = [
    {
      id: 'archer',
      projectileSpeed: 9,
      levels: [
        { cost: 60, damage: 12, range: 2.6, rate: 1.2 },
        { cost: 50, damage: 18, range: 2.9, rate: 1.5 },
        { cost: 90, damage: 26, range: 3.2, rate: 1.9 },
      ],
    },
    {
      id: 'cannon',
      projectileSpeed: 6,
      levels: [
        { cost: 90, damage: 28, range: 2.3, rate: 0.5, splash: 1 },
        { cost: 80, damage: 42, range: 2.5, rate: 0.6, splash: 1.2 },
        { cost: 130, damage: 62, range: 2.7, rate: 0.7, splash: 1.4 },
      ],
    },
    {
      id: 'frost',
      projectileSpeed: 7,
      levels: [
        { cost: 70, damage: 4, range: 2.2, rate: 1, slow: 0.5, slowSeconds: 1.5 },
        { cost: 60, damage: 6, range: 2.5, rate: 1.2, slow: 0.4, slowSeconds: 2 },
        { cost: 100, damage: 9, range: 2.8, rate: 1.4, slow: 0.3, slowSeconds: 2.5 },
      ],
    },
  ];

  const TOWERS_BY_ID = Object.fromEntries(TOWERS.map((tower) => [tower.id, tower]));

  /** Share of everything spent on a tower that selling it gives back. */
  const SELL_REFUND = 0.7;

  Object.assign(Hold, { TOWERS, TOWERS_BY_ID, SELL_REFUND });
})();
