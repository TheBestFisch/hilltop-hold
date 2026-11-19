(() => {
  'use strict';

  const { i18n, TIME_SCALES, FIXED_STEP } = Hold;

  const TICKS_PER_SECOND = Math.round(1 / FIXED_STEP);

  const button = (className, onClick) => {
    const element = document.createElement('button');
    element.type = 'button';
    element.className = className;
    element.addEventListener('click', onClick);
    return element;
  };

  /**
   * Debug section: pause the simulation, step it one tick (1/60 s) or one
   * second at a time, and change its speed. Rendering keeps running while
   * paused, so the frozen frame can be inspected. `.` steps one tick while
   * paused.
   *
   * @param {{ time: TimeController, step: (ticks: number) => void }} options
   *   `step` must run the same tick the game loop runs.
   */
  function createTimeControls({ time, step }) {
    const elements = {};

    function build(container) {
      elements.status = document.createElement('p');
      elements.status.className = 'debug-status';
      elements.counters = document.createElement('p');
      elements.counters.className = 'debug-counters';

      elements.pause = button('btn small', () => time.setPaused(!time.paused));
      elements.step = button('btn small', () => step(1));
      elements.stepSecond = button('btn small', () => step(TICKS_PER_SECOND));
      const actions = document.createElement('div');
      actions.className = 'debug-row';
      actions.append(elements.pause, elements.step, elements.stepSecond);

      const speedLabel = document.createElement('span');
      speedLabel.className = 'debug-label';
      speedLabel.dataset.i18n = 'debug.time.speed';
      speedLabel.textContent = i18n.t('debug.time.speed');
      elements.scales = TIME_SCALES.map((scale) => {
        const choice = button('chip', () => time.setScale(scale));
        choice.textContent = `${scale}×`;
        choice.dataset.scale = String(scale);
        return choice;
      });
      const speeds = document.createElement('div');
      speeds.className = 'debug-row';
      speeds.append(speedLabel, ...elements.scales);

      const hint = document.createElement('p');
      hint.className = 'debug-hint';
      hint.dataset.i18n = 'debug.time.shortcut';
      hint.textContent = i18n.t('debug.time.shortcut');

      container.append(elements.status, elements.counters, actions, speeds, hint);
      time.addEventListener('change', update);
      i18n.addEventListener('change', update);
      window.addEventListener('keydown', (event) => {
        if (event.code !== 'Period' || !time.paused || event.target.closest?.('input, select')) return;
        event.preventDefault();
        step(1);
      });
    }

    function update() {
      if (!elements.status) return;
      elements.status.textContent = `${i18n.t(time.paused ? 'debug.time.paused' : 'debug.time.running')} · ${time.scale}×`;
      elements.status.classList.toggle('paused', time.paused);
      elements.counters.textContent = `${i18n.t('debug.time.frame', { frame: time.frame })} · ${i18n.t('debug.time.simTime', { seconds: time.simTime.toFixed(2) })}`;
      elements.pause.textContent = i18n.t(time.paused ? 'debug.time.resume' : 'debug.time.pause');
      elements.step.textContent = i18n.t('debug.time.step');
      elements.stepSecond.textContent = i18n.t('debug.time.stepSecond');
      elements.step.disabled = !time.paused;
      elements.stepSecond.disabled = !time.paused;
      for (const choice of elements.scales) {
        choice.setAttribute('aria-pressed', String(Number(choice.dataset.scale) === time.scale));
      }
    }

    return { id: 'time', titleKey: 'debug.time.title', build, update };
  }

  Object.assign(Hold, { createTimeControls });
})();
