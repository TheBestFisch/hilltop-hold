(() => {
  'use strict';

  const { weightedPick, BOSS } = Hold;

  const START = { gold: 160, lives: 20 };
  const BOSS_EVERY = 5;

  /** Spawn weights and the wave each enemy first appears in. */
  const ROSTER = {
    footman: { weight: 3, from: 1 },
    scout: { weight: 2, from: 3 },
    knight: { weight: 1, from: 5 },
  };

  /**
   * Builds wave `n`: which enemies spawn, how far apart, and how much tougher
   * they are. Endless; uses `rng` so a fixed seed gives the same waves.
   * @returns {{ spawns: string[], interval: number, hpScale: number, bonus: number }}
   */
  function buildWave(n, rng) {
    const weights = Object.fromEntries(
      Object.entries(ROSTER).map(([id, entry]) => [id, n >= entry.from ? entry.weight : 0]),
    );
    const count = 6 + n * 2;
    const spawns = Array.from({ length: count }, () => weightedPick(weights, rng));
    if (n % BOSS_EVERY === 0) {
      for (let i = 0; i < n / BOSS_EVERY; i++) spawns.push(BOSS);
    }
    return {
      spawns,
      interval: Math.max(0.35, 0.9 - n * 0.03),
      hpScale: 1 + (n - 1) * 0.15,
      bonus: 20 + n * 5,
    };
  }

  Object.assign(Hold, { START, BOSS_EVERY, buildWave });
})();
