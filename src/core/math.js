(() => {
  'use strict';

  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

  /** Deterministic hash of an integer, in [0, 1). */
  function hash1(n, seed) {
    let h = Math.imul(n ^ seed, 0x27d4eb2d);
    h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
    return ((h ^ (h >>> 13)) >>> 0) / 4294967296;
  }

  /** Mulberry32 PRNG: fast and seedable, good enough for gameplay randomness. */
  function createRng(seed) {
    let state = seed >>> 0;
    return () => {
      state = (state + 0x6d2b79f5) >>> 0;
      let t = state;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /** Picks a key from `{ key: weight }` using `rng` in [0, 1). */
  function weightedPick(weights, rng) {
    const entries = Object.entries(weights).filter(([, weight]) => weight > 0);
    const total = entries.reduce((sum, [, weight]) => sum + weight, 0);
    let roll = rng() * total;
    for (const [key, weight] of entries) {
      roll -= weight;
      if (roll < 0) return key;
    }
    return entries.at(-1)?.[0] ?? null;
  }

  Object.assign(Hold, { clamp, hash1, createRng, weightedPick });
})();
