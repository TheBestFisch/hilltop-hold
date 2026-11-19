(() => {
  'use strict';

  /**
   * Invaders: the soldiers of a rival lord marching on the village. `speed`
   * is in tiles per second; `armor` is subtracted from every hit (a hit always
   * deals at least 1); `lives` is how many blows it lands on the gate, each
   * costing the village one heart; `strike` is the seconds between those
   * blows; `radius` is its collision circle in tiles; `reach`, if longer,
   * is how far it sticks out in front of its centre (the warhorse's head),
   * so it stands that far off the door; `boss` marks the one that leads
   * every fifth wave. Names live in the locales under `enemies.<id>`.
   */
  const ENEMIES = {
    footman: { hp: 30, speed: 1.2, armor: 0, bounty: 5, lives: 1, strike: 1.2, radius: 0.2 },
    scout: { hp: 22, speed: 2.2, armor: 0, bounty: 6, lives: 1, strike: 1.0, radius: 0.18 },
    knight: { hp: 110, speed: 0.8, armor: 4, bounty: 14, lives: 2, strike: 1.5, radius: 0.24 },
    warlord: { hp: 600, speed: 0.6, armor: 2, bounty: 80, lives: 5, strike: 1.9, radius: 0.5, reach: 0.68, boss: true },
  };

  /** The invader that leads every fifth wave. */
  const BOSS = Object.keys(ENEMIES).find((type) => ENEMIES[type].boss);

  /**
   * How invaders storm the gate (distances in tiles, times in seconds).
   *
   * The road ends at the gate tile's centre; the door's face stands
   * `gateFace` further on (tests/models.test.js checks it against the gate
   * model). Invaders that get there crowd in front of the door in ranks: the
   * front rank is `frontWidth` wide (the passage between the drum towers),
   * ranks behind it fill the road `rankWidth` wide, `rankGap` apart, and
   * soldiers stand shoulder to shoulder at `shoulder` of their collision
   * width. Only the front rank reaches the door: it raises its weapons for
   * `windup`, then strikes every `strike` seconds (per invader). When an
   * invader has landed all its blows, the garrison's stones fell it
   * `garrison` seconds later. Once the gate is broken, the invaders march
   * `passage` through the gatehouse, take `light` seconds to light their
   * torches, and set the village alight building by building
   * (VILLAGE_PLAN.targets), holding a torch to each for `kindle` seconds.
   */
  const ASSAULT = {
    gateFace: 0.36,
    frontWidth: 0.8,
    rankWidth: 0.95,
    rankGap: 0.06,
    shoulder: 0.9,
    windup: 0.7,
    garrison: 0.7,
    passage: 0.6,
    light: 1.6,
    kindle: 1.8,
  };

  Object.assign(Hold, { ENEMIES, BOSS, ASSAULT });
})();
