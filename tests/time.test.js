'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { loadSim } = require('./load');

const { TimeController, FIXED_STEP } = loadSim();

const counter = () => {
  const ticks = [];
  return { ticks, tick: (dt) => ticks.push(dt) };
};

test('real time becomes whole fixed ticks, carrying the remainder over', () => {
  const time = new TimeController();
  const { ticks, tick } = counter();
  time.advance(FIXED_STEP * 2.5, tick);
  assert.equal(ticks.length, 2);
  time.advance(FIXED_STEP * 0.5, tick);
  assert.equal(ticks.length, 3);
  assert.ok(ticks.every((dt) => dt === FIXED_STEP));
  assert.equal(time.frame, 3);
});

test('time scale changes how many ticks run, not their length', () => {
  const normal = new TimeController();
  const fast = new TimeController();
  fast.setScale(4);
  const a = counter();
  const b = counter();
  for (let i = 0; i < 10; i++) {
    normal.advance(1 / 60, a.tick);
    fast.advance(1 / 60, b.tick);
  }
  assert.equal(b.ticks.length, a.ticks.length * 4);
});

test('pausing stops ticks, and stepping runs exactly one tick while paused', () => {
  const time = new TimeController();
  const { ticks, tick } = counter();
  time.setPaused(true);
  assert.equal(time.advance(1, tick), 0);
  time.step(tick);
  assert.equal(ticks.length, 1);
  time.step(tick, 10);
  assert.equal(ticks.length, 11);
  assert.equal(time.frame, 11);
});

test('a very long frame runs in slow motion instead of jumping ahead', () => {
  const time = new TimeController();
  const { ticks, tick } = counter();
  time.advance(2, tick);
  assert.ok(ticks.length <= 0.25 / FIXED_STEP + 1);
});

test('unsupported scales are ignored and changes are announced', () => {
  const time = new TimeController();
  let changes = 0;
  time.addEventListener('change', () => changes++);
  time.setScale(3);
  assert.equal(time.scale, 1);
  time.setScale(2);
  time.setPaused(true);
  assert.equal(changes, 2);
});
