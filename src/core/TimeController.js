(() => {
  'use strict';

  const FIXED_STEP = 1 / 60;
  const MAX_REAL_SECONDS = 0.25;
  const MAX_STEPS_PER_FRAME = 240;
  const SCALES = [0.25, 0.5, 1, 2, 4];
  // Absorbs floating-point drift so half a tick plus half a tick makes a whole one.
  const EPSILON = 1e-9;

  /**
   * Turns real elapsed time into fixed simulation ticks of 1/60 s.
   *
   * The simulation only ever moves in whole ticks, so `scale` changes how many
   * ticks run per real second, `step()` runs exactly one tick, and the result
   * is identical whatever the frame rate. A long frame is capped at
   * MAX_REAL_SECONDS of real time, so a slow machine runs the game in slow
   * motion instead of jumping ahead.
   *
   * Dispatches `change` when `paused` or `scale` changes.
   */
  class TimeController extends EventTarget {
    paused = false;
    scale = 1;
    frame = 0;
    simTime = 0;
    #accumulator = 0;

    /** Runs as many ticks as `realSeconds` covers. Returns how many ran. */
    advance(realSeconds, tick) {
      if (this.paused) return 0;
      this.#accumulator += Math.min(realSeconds, MAX_REAL_SECONDS) * this.scale;
      let steps = 0;
      while (this.#accumulator >= FIXED_STEP - EPSILON && steps < MAX_STEPS_PER_FRAME) {
        this.#tick(tick);
        this.#accumulator = Math.max(0, this.#accumulator - FIXED_STEP);
        steps++;
      }
      if (steps === MAX_STEPS_PER_FRAME) this.#accumulator = 0;
      return steps;
    }

    /** Runs exactly `count` ticks, paused or not. */
    step(tick, count = 1) {
      for (let i = 0; i < count; i++) this.#tick(tick);
    }

    setPaused(paused) {
      if (this.paused === paused) return;
      this.paused = paused;
      this.#accumulator = 0;
      this.dispatchEvent(new Event('change'));
    }

    setScale(scale) {
      if (!SCALES.includes(scale) || this.scale === scale) return;
      this.scale = scale;
      this.dispatchEvent(new Event('change'));
    }

    reset() {
      this.frame = 0;
      this.simTime = 0;
      this.#accumulator = 0;
      this.dispatchEvent(new Event('change'));
    }

    #tick(tick) {
      tick(FIXED_STEP);
      this.frame++;
      this.simTime += FIXED_STEP;
    }
  }

  Object.assign(Hold, { TimeController, FIXED_STEP, TIME_SCALES: SCALES });
})();
