'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { loadSim } = require('./load');

const { World, parseMap, ENEMIES, ASSAULT, VILLAGE_PLAN, TOWERS_BY_ID, START, SELL_REFUND, buildWave, createRng, FIXED_STEP } = loadSim();

/** Projectile speed that lands within one tick, for hand-placed shots. */
const INSTANT = 1e6;

/** Runs the world for `seconds` of simulated time in fixed steps. */
function run(world, seconds) {
  const steps = Math.round(seconds / FIXED_STEP);
  for (let i = 0; i < steps; i++) world.update(FIXED_STEP);
}

/** First buildable tile next to the path, so towers there can reach enemies. */
function tileBesidePath(world) {
  for (const { x, y } of world.path.points) {
    for (const [dc, dr] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
      if (world.canBuildAt(x + dc, y + dr)) return { col: x + dc, row: y + dr };
    }
  }
  throw new Error('no buildable tile beside the path');
}

test('the map path runs from the spawn to the gate without gaps', () => {
  const world = new World();
  const { points, length } = world.path;
  assert.equal(`${points[0].x},${points[0].y}`, `${world.map.spawn.col},${world.map.spawn.row}`);
  assert.equal(`${points.at(-1).x},${points.at(-1).y}`, `${world.map.gate.col},${world.map.gate.row}`);
  for (let i = 1; i < points.length; i++) {
    assert.equal(Math.abs(points[i].x - points[i - 1].x) + Math.abs(points[i].y - points[i - 1].y), 1);
  }
  assert.equal(length, points.length - 1);
});

test('broken or branching maps are rejected', () => {
  assert.throws(() => parseMap(['S#.#E']), /breaks/);
  assert.throws(() => parseMap(['S##.', '.##E']), /branches|breaks/);
});

test('towers can only be built on free grass with enough gold', () => {
  const world = new World();
  const spot = tileBesidePath(world);
  assert.equal(world.build('archer', world.map.spawn.col, world.map.spawn.row).reason, 'blocked');
  const result = world.build('archer', spot.col, spot.row);
  assert.equal(result.ok, true);
  assert.equal(world.gold, START.gold - TOWERS_BY_ID.archer.levels[0].cost);
  assert.equal(world.build('archer', spot.col, spot.row).reason, 'blocked');
  world.gold = 0;
  const other = tileBesidePath(world);
  assert.equal(world.build('cannon', other.col, other.row).reason, 'noGold');
});

test('upgrades raise the level until maxed, and selling refunds part of the total spent', () => {
  const world = new World();
  world.gold = 10_000;
  const spot = tileBesidePath(world);
  const { tower } = world.build('cannon', spot.col, spot.row);
  const levels = TOWERS_BY_ID.cannon.levels;
  for (let level = 1; level < levels.length; level++) assert.equal(world.upgrade(tower).ok, true);
  assert.equal(world.upgrade(tower).reason, 'maxed');
  const spent = levels.reduce((sum, level) => sum + level.cost, 0);
  const goldBefore = world.gold;
  assert.equal(world.sell(tower).refund, Math.floor(spent * SELL_REFUND));
  assert.equal(world.gold, goldBefore + Math.floor(spent * SELL_REFUND));
  assert.equal(world.towerAt(spot.col, spot.row), null);
});

/** Runs until `done()` or `seconds` pass; returns the events seen. */
function runUntil(world, done, seconds = 60) {
  const events = [];
  for (let i = 0; i < Math.round(seconds / FIXED_STEP) && !done(events); i++) {
    world.update(FIXED_STEP);
    events.push(...world.drainEvents());
  }
  return events;
}

test('undefended enemies walk the path and batter the gate, every blow costing a life', () => {
  const world = new World({ seed: 3 });
  world.startWave();
  const pathSeconds = world.path.length / ENEMIES.footman.speed;
  run(world, pathSeconds + 30);
  const events = world.drainEvents();
  const arrivals = events.filter((event) => event.type === 'gateReached');
  const blows = events.filter((event) => event.type === 'gateHit');
  assert.ok(arrivals.length > 0, 'invaders reach the gate');
  assert.equal(world.lives, START.lives - blows.length, 'each blow on the gate costs one life');
  // Undefended, each invader lands all its blows and is then felled by the garrison, without a bounty.
  const dealt = arrivals.reduce((sum, event) => sum + ENEMIES[event.enemy.type].lives, 0);
  assert.equal(blows.length, dealt);
  assert.equal(events.filter((event) => event.type === 'repelled').length, arrivals.length);
  assert.equal(world.gold, START.gold + buildWave(1, createRng(3)).bonus, 'garrison kills pay no bounty');
  assert.equal(world.phase, 'build');
});

test('invaders crowd in ranks before the door: never through it, never inside each other, only the front rank strikes', () => {
  const world = new World({ seed: 8 });
  world.lives = 999;
  world.skipWaves(6);
  const { door } = world;
  let crowded = 0;
  let queued = 0;
  for (let i = 0; i < 60 * 90 && world.phase === 'wave'; i++) {
    world.update(FIXED_STEP);
    for (const event of world.drainEvents()) {
      if (event.type === 'gateHit') assert.equal(event.enemy.rank, 0, 'only the front rank reaches the door');
    }
    const crowd = world.enemies.filter((enemy) => enemy.state === 'assault' || enemy.state === 'queue');
    crowded = Math.max(crowded, crowd.length);
    if (crowd.some((enemy) => enemy.state === 'queue')) queued++;
    for (const enemy of world.enemies) {
      // In the gate's frame: how far past the door's face the invader's body reaches.
      const ahead = (enemy.x - door.x) * door.forward.x + (enemy.y - door.y) * door.forward.y;
      assert.ok(ahead + ENEMIES[enemy.type].radius <= 1e-6, `${enemy.type} ${enemy.id} walks into the closed gate`);
    }
    const settled = crowd.filter((enemy) => enemy.settled);
    for (let a = 0; a < settled.length; a++) {
      for (let b = a + 1; b < settled.length; b++) {
        const gap = Math.hypot(settled[a].x - settled[b].x, settled[a].y - settled[b].y);
        const room = (ENEMIES[settled[a].type].radius + ENEMIES[settled[b].type].radius) * ASSAULT.shoulder;
        assert.ok(gap >= room - 1e-6, `invaders ${settled[a].id} and ${settled[b].id} stand inside each other (${gap.toFixed(2)} < ${room.toFixed(2)})`);
      }
    }
    for (const enemy of crowd.filter((entry) => entry.rank === 0 && entry.settled)) {
      const across = Math.abs((enemy.x - door.x) * door.side.x + (enemy.y - door.y) * door.side.y);
      assert.ok(across + ENEMIES[enemy.type].radius * ASSAULT.shoulder <= ASSAULT.frontWidth / 2 + 0.15, 'the front rank fits the passage');
    }
  }
  assert.ok(crowded >= 3, `a crowd gathers at the gate (at most ${crowded})`);
  assert.ok(queued > 0, 'latecomers wait their turn behind the front rank');
});

test('an attacker lands its blows one at a time, then the garrison fells it', () => {
  const world = new World({ seed: 1 });
  const knight = world.spawnEnemy('knight', { distance: world.path.length - 0.2 });
  const { lives: blows, strike } = ENEMIES.knight;
  let events = runUntil(world, (seen) => seen.some((event) => event.type === 'gateReached'), 5);
  assert.equal(knight.state, 'assault');
  events = runUntil(world, () => knight.settled, 5);
  assert.equal(world.lives, START.lives, 'no damage before the first blow');
  run(world, ASSAULT.windup - 0.05);
  assert.equal(world.lives, START.lives, 'the wind-up takes time');
  events = runUntil(world, (seen) => seen.some((event) => event.type === 'gateHit'), 1);
  assert.equal(world.lives, START.lives - 1, 'the first blow lands');
  run(world, strike - 0.05);
  assert.equal(world.lives, START.lives - 1, 'blows come one at a time');
  events = runUntil(world, (seen) => seen.some((event) => event.type === 'repelled'), 10);
  assert.equal(world.lives, START.lives - blows);
  assert.ok(events.some((event) => event.type === 'gateHit' && event.final), 'the last blow is marked');
  assert.equal(world.enemies.length, 0, 'the garrison fells the spent attacker');
  assert.equal(world.gold, START.gold, 'the garrison earns no bounty');
});

test('towers can shoot attackers at the gate, and killing one stops its remaining blows', () => {
  const world = new World({ seed: 1 });
  world.gold = 10_000;
  const { gate } = world.map;
  const spot = [[-1, -1], [0, -1], [-1, 1], [0, 1]].map(([dc, dr]) => ({ col: gate.col + dc, row: gate.row + dr }))
    .find(({ col, row }) => world.canBuildAt(col, row));
  assert.ok(spot, 'a buildable tile beside the gate');
  const warlord = world.spawnEnemy('warlord', { distance: world.path.length - 0.5 });
  runUntil(world, () => warlord.state === 'assault' && warlord.settled, 10);
  world.build('archer', spot.col, spot.row);
  const events = runUntil(world, (seen) => seen.some((event) => event.type === 'gateHit'), 10);
  assert.ok(events.some((event) => event.type === 'shot' && event.projectile.target === warlord), 'towers shoot invaders at the gate');
  world.kill(warlord);
  run(world, 10);
  assert.ok(world.lives >= START.lives - 2, 'a slain attacker strikes no more');
  assert.ok(world.lives < START.lives);
});

test('when the last life goes the gate breaks, the game ends and the invaders pour into the village', () => {
  const world = new World({ seed: 2 });
  world.lives = 1;
  const first = world.spawnEnemy('footman', { distance: world.path.length - 0.3 });
  const second = world.spawnEnemy('scout', { distance: world.path.length - 0.6 });
  const behind = world.spawnEnemy('knight', { distance: world.path.length - 4 });
  const events = runUntil(world, (seen) => seen.some((event) => event.type === 'gameOver'), 10);
  const order = events.map((event) => event.type).filter((type) => ['gateHit', 'gateBroken', 'gameOver'].includes(type));
  assert.deepEqual(order, ['gateHit', 'gateBroken', 'gameOver']);
  assert.equal(world.phase, 'over');
  assert.ok(world.gateBroken);
  assert.equal(world.startWave().ok, false);
  run(world, 8);
  const { door } = world;
  for (const enemy of [first, second, behind]) {
    assert.equal(enemy.state, 'sack');
    const ahead = (enemy.x - door.x) * door.forward.x + (enemy.y - door.y) * door.forward.y;
    assert.ok(ahead > ASSAULT.passage - 0.05, `${enemy.type} is inside the village`);
  }
  assert.equal(world.lives, 0);
});

test('in a fallen village the invaders set the buildings alight one by one: nothing burns unless one of them held a torch to it', () => {
  const world = new World({ seed: 2 });
  world.lives = 1;
  for (const [type, back] of [['footman', 0.4], ['knight', 2], ['scout', 3], ['footman', 5]]) world.spawnEnemy(type, { distance: world.path.length - back });
  const kindling = new Map();
  const torches = [];
  let taken = null;
  for (let i = 0; i < 60 * 60; i++) {
    world.update(FIXED_STEP);
    for (const enemy of world.enemies) {
      if (enemy.kindle !== null) kindling.set(enemy.id, (kindling.get(enemy.id) ?? 0) + FIXED_STEP);
      if (enemy.lighting !== null) assert.ok(!enemy.torch, 'a torch is lit before it is used');
    }
    for (const event of world.drainEvents()) {
      if (event.type === 'torch') {
        const target = VILLAGE_PLAN.targets.find(({ name }) => name === event.target);
        const { gate } = world.map;
        // The invader stands where the plan says, facing the building, and has held its torch there a while.
        assert.ok(Math.hypot(event.enemy.x - (gate.col + target.stand[0]), event.enemy.y - (gate.row + target.stand[1])) < 1e-6, `${event.target} is fired from where the invader stands`);
        assert.ok(event.enemy.torch, 'only a lit torch sets a building alight');
        assert.ok(kindling.get(event.enemy.id) >= ASSAULT.kindle - FIXED_STEP * 1.5, 'the building takes a while to catch');
        kindling.set(event.enemy.id, 0);
        torches.push(event.target);
      }
      if (event.type === 'keepTaken') {
        assert.ok(torches.includes('keep'), 'the keep is taken by whoever fired it');
        taken = event.enemy;
      }
    }
  }
  assert.deepEqual([...torches].sort(), Array.from(VILLAGE_PLAN.targets, ({ name }) => name).sort(), 'every building the invaders can reach is burnt, each once');
  assert.ok(!torches.includes('farmhouse'), 'the farmhouse behind the keep is out of their reach');
  assert.ok(taken && !world.enemies.includes(taken), 'the invader who took the keep is inside it');
  for (const enemy of world.enemies) {
    assert.ok(enemy.settled && enemy.target === null, 'with nothing left to burn, the rest gather in the square');
    const { gate } = world.map;
    assert.ok(VILLAGE_PLAN.square.some(([x, y]) => Math.hypot(enemy.x - (gate.col + x), enemy.y - (gate.row + y)) < 0.3));
  }
});

test('a defended first wave is cleared with bounties and a wave bonus', () => {
  const world = new World({ seed: 3 });
  world.gold = 10_000;
  for (let i = 0; i < 4; i++) {
    const spot = tileBesidePath(world);
    world.build('archer', spot.col, spot.row);
  }
  world.startWave();
  run(world, 60);
  const events = world.drainEvents();
  const kills = events.filter((event) => event.type === 'death');
  const clear = events.find((event) => event.type === 'waveClear');
  assert.equal(world.lives, START.lives);
  assert.ok(clear, 'wave should be cleared');
  assert.equal(kills.length, buildWave(1, createRng(3)).spawns.length);
  assert.ok(events.some((event) => event.type === 'shot'));
});

test('armor reduces damage but every hit deals at least 1', () => {
  const world = new World();
  world.gold = 10_000;
  const spot = tileBesidePath(world);
  world.build('frost', spot.col, spot.row);
  world.startWave();
  run(world, 0.05);
  const [enemy] = world.enemies;
  enemy.type = 'knight';
  enemy.hp = 100;
  enemy.x = spot.col;
  enemy.y = spot.row;
  const projectile = { stats: { damage: 2 }, target: enemy, x: spot.col, y: spot.row, targetX: spot.col, targetY: spot.row, speed: INSTANT };
  world.projectiles.push(projectile);
  world.update(FIXED_STEP);
  assert.equal(enemy.hp, 99);
});

test('frost slows enemies and cannon splash hits a group', () => {
  const world = new World({ seed: 5 });
  world.gold = 10_000;
  const spot = tileBesidePath(world);
  world.build('frost', spot.col, spot.row);
  world.startWave();
  let slowed = false;
  for (let i = 0; i < 600 && !slowed; i++) {
    world.update(FIXED_STEP);
    slowed = world.enemies.some((enemy) => enemy.slowTimer > 0 && enemy.slowFactor === TOWERS_BY_ID.frost.levels[0].slow);
  }
  assert.ok(slowed, 'expected a slowed enemy');

  const splashWorld = new World({ seed: 5 });
  splashWorld.startWave();
  run(splashWorld, 0.05);
  const group = splashWorld.enemies.slice(0, 1);
  const extra = { ...group[0], id: 999, hp: 200, maxHp: 200 };
  splashWorld.enemies.push(extra);
  for (const enemy of splashWorld.enemies) enemy.hp = 200;
  const stats = TOWERS_BY_ID.cannon.levels[0];
  splashWorld.projectiles.push({ stats, target: group[0], x: group[0].x, y: group[0].y, targetX: group[0].x, targetY: group[0].y, speed: INSTANT });
  splashWorld.update(FIXED_STEP);
  assert.ok(splashWorld.enemies.every((enemy) => enemy.hp === 200 - stats.damage));
});

test('waves grow, add new enemies over time and bring a boss every fifth wave', () => {
  const rng = createRng(1);
  const waves = [1, 2, 3, 4, 5].map((n) => buildWave(n, rng));
  assert.ok(waves[4].spawns.length > waves[0].spawns.length);
  assert.ok(waves[0].spawns.every((type) => type === 'footman'));
  assert.ok(waves[4].spawns.includes('warlord'));
  assert.ok(!waves[3].spawns.includes('warlord'));
});

test('the game ends when the village runs out of lives', () => {
  const world = new World({ seed: 2 });
  world.lives = 1;
  world.startWave();
  run(world, 120);
  assert.equal(world.phase, 'over');
  assert.ok(world.drainEvents().some((event) => event.type === 'gameOver'));
  assert.equal(world.startWave().ok, false);
});

test('the same seed and inputs give the same game', () => {
  const play = () => {
    const world = new World({ seed: 9 });
    const spot = tileBesidePath(world);
    world.build('archer', spot.col, spot.row);
    world.startWave();
    run(world, 25);
    return JSON.stringify({ gold: world.gold, lives: world.lives, enemies: world.enemies.map((e) => [e.type, e.hp, e.distance]) });
  };
  assert.equal(play(), play());
});

test('debug helpers: spawning, killing, setting levels and skipping waves follow the rules', () => {
  const world = new World({ seed: 4 });
  const enemy = world.spawnEnemy('knight', { distance: 2 });
  assert.equal(world.phase, 'build', 'spawning between waves does not start a wave');
  assert.equal(enemy.type, 'knight');
  assert.ok(Math.abs(enemy.distance - 2) < 1e-9);
  run(world, 1);
  assert.ok(enemy.distance > 2, 'a spawned invader walks');
  assert.equal(world.spawnEnemy('dragon'), null, 'unknown invaders are refused');

  const gold = world.gold;
  world.kill(enemy);
  assert.equal(world.enemies.length, 0);
  assert.equal(world.gold, gold + ENEMIES.knight.bounty, 'killing pays the bounty');
  assert.ok(world.drainEvents().some((event) => event.type === 'death'));

  world.gold = 10_000;
  const spot = tileBesidePath(world);
  const { tower } = world.build('archer', spot.col, spot.row);
  world.setTowerLevel(tower, 2);
  const levels = TOWERS_BY_ID.archer.levels;
  assert.equal(tower.level, 2);
  assert.equal(tower.spent, levels[0].cost + levels[1].cost + levels[2].cost, 'spent matches buying the upgrades');
  assert.equal(world.upgrade(tower).reason, 'maxed');
  world.setTowerLevel(tower, 0);
  assert.equal(tower.spent, levels[0].cost);

  assert.equal(world.skipWaves(4).ok, true);
  assert.equal(world.wave, 5, 'skipping four waves starts wave five');
  assert.equal(world.phase, 'wave');
  assert.equal(world.skipWaves(1).ok, false, 'cannot skip during a wave');
  run(world, 0.5);
  world.spawnEnemy('footman');
  assert.ok(world.enemies.length > 0);
  for (const entry of [...world.enemies]) world.kill(entry);
  assert.ok(world.enemies.length === 0);
});
