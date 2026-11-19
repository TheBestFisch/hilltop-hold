'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { loadContext, scriptsOf } = require('./load');

/*
 * The village reacting to the battle, driven by a real World exactly as
 * the game drives it: events first, then an update per tick. Also checks
 * that the gate the invaders batter is where the simulation says it is,
 * that everyone walks the village's paths (up the stairs, never through a
 * wall, a building or the ground), that nothing burns unless an invader
 * set it alight, and that the garrison never hides a battlefield tile.
 */

const scripts = scriptsOf('index.html').filter((script) =>
  /vendor|namespace|core\/math|core\/TimeController|data\/|sim\/|models\/|view\/terrain|view\/MapView|view\/FireSystem|view\/VillageView|render\/cameraRig/.test(script));
const { THREE, Hold } = loadContext(scripts);
const { World, MapView, FireSystem, VillageView, VILLAGE_ALARM: ALARM, VILLAGE_PLAN, ASSAULT, FIXED_STEP, CAMERA_PRESETS, placeCamera } = Hold;

/** A village on its own map, with a world to drive it and a record of what it asks the effects for. */
function setup(seed = 1) {
  const world = new World({ seed });
  const mapView = new MapView(world.map);
  const bursts = [];
  const effects = { burst: (position, kind, options) => bursts.push({ kind, position: position.clone(), options }) };
  const fire = new FireSystem();
  const village = new VillageView({ mapView, effects, fire });
  const events = [];
  /** Runs `seconds` of the game; `each` is called after every tick. */
  const run = (seconds, each = null) => {
    for (let i = 0; i < Math.round(seconds / FIXED_STEP); i++) {
      world.update(FIXED_STEP);
      for (const event of world.drainEvents()) {
        events.push(event);
        village.handle(event, world);
      }
      village.update(world, FIXED_STEP);
      each?.();
    }
  };
  return { world, mapView, village, fire, bursts, events, run };
}

const shown = (model) => {
  for (let node = model; node; node = node.parent) if (!node.visible) return false;
  return true;
};
const leafSwing = (mapView) => Math.abs(mapView.village.gate.userData.leafLeft.rotation.y);
const guards = (village) => village.models.guards.map(({ model }) => model);
const villagers = (village) => village.models.villagers;
const turn = (a, b) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
/** World position of a point of the village plan. */
const planPoint = (mapView, [x, y]) => mapView.toWorld(mapView.map.gate.col + x, mapView.map.gate.row + y);

/**
 * Checks, every tick, that nobody in the village is under the ground or
 * inside a wall: standing on a curtain wall's footprint means standing on
 * its walk. Returns the check to pass to `run`.
 */
function nobodyInWalls(mapView, village) {
  const walls = mapView.village.walls.map(({ model }) => new THREE.Box3().setFromObject(model));
  return () => {
    for (const { model } of village.models.people) {
      if (!shown(model)) continue;
      const { position } = model;
      const tile = mapView.toTile(position);
      assert.ok(position.y >= mapView.heightAt(tile.x, tile.y) - 0.02, `someone is under the ground at ${tile.x.toFixed(2)},${tile.y.toFixed(2)}`);
      for (const box of walls) {
        if (position.x > box.min.x && position.x < box.max.x && position.z > box.min.z && position.z < box.max.z) {
          assert.ok(position.y >= box.max.y - 0.2, `someone is inside a wall at ${tile.x.toFixed(2)},${tile.y.toFixed(2)} (y ${position.y.toFixed(2)})`);
        }
      }
    }
  };
}

test('the gate the invaders batter stands where the simulation puts its door', () => {
  const { world, mapView } = setup();
  const gate = mapView.village.gate;
  // Close the gate, then cast along the road at waist height: the first thing hit is the door's face.
  Hold.sceneryModels.poseGate(gate, { open: 0 });
  gate.updateMatrixWorld(true);
  const start = mapView.toWorld(world.door.x - 1.5, world.door.y).setY(mapView.heightAt(world.door.x, world.door.y) + 0.3);
  const direction = new THREE.Vector3(world.door.forward.x, 0, world.door.forward.y);
  const hit = new THREE.Raycaster(start, direction, 0, 3).intersectObject(gate, true)[0];
  assert.ok(hit, 'the road leads into the gate');
  const face = mapView.toTile(hit.point);
  assert.ok(Math.abs(face.x - world.door.x) < 0.02 && Math.abs(face.y - world.door.y) < 0.02, `the door's face is at ${face.x.toFixed(2)},${face.y.toFixed(2)}, the simulation's at ${world.door.x},${world.door.y}`);
  const front = world.door.x - ASSAULT.gateFace * 0.5;
  assert.ok(Math.abs(mapView.heightAt(front, world.door.y) - gate.position.y) < 1e-9, 'the road meets the door sill');
});

test("the village's paths pass clear of every building, prop and wall", () => {
  const { mapView } = setup();
  const { gate } = mapView.map;
  // Outlines of what stands at head height or below (a windmill's sails turn overhead).
  const outline = (model) => {
    const box = new THREE.Box3();
    model.updateMatrixWorld(true);
    model.traverse((node) => {
      if (!node.isMesh) return;
      for (let current = node; current !== model; current = current.parent) if (!current.visible) return;
      const part = new THREE.Box3().setFromObject(node);
      if (part.min.y < model.position.y + 0.45) box.union(part);
    });
    return box;
  };
  const obstacles = mapView.village.buildings
    .filter(({ id }) => !/flowers|mushrooms|arch/.test(id))
    .map(({ id, model }) => ({ id, box: outline(model) }));
  for (const { at, model } of mapView.village.walls) obstacles.push({ id: `wall ${at}`, box: outline(model) });
  const points = VILLAGE_PLAN.paths.points;
  const ground = (name) => Array.isArray(points[name]);
  const at = (name) => (Array.isArray(points[name]) ? points[name] : points[name].at);
  const legs = VILLAGE_PLAN.paths.links.filter(([a, b]) => ground(a) && ground(b)).map(([a, b]) => [a, b, at(a), at(b)]);
  // And the last steps off the paths: to where invaders stand to burn a building and to the square.
  for (const target of VILLAGE_PLAN.targets) legs.push([target.from, target.name, at(target.from), target.stand]);
  const margin = 0.08;
  const door = at(VILLAGE_PLAN.shelter);
  for (const [a, b, from, to] of legs) {
    for (let t = 0; t <= 1; t += 0.02) {
      const x = gate.col + from[0] + (to[0] - from[0]) * t;
      const y = gate.row + from[1] + (to[1] - from[1]) * t;
      const point = mapView.toWorld(x, y);
      // The keep's door is set back between its corner turrets: the last steps to it are inside its outline.
      if (Math.hypot(x - gate.col - door[0], y - gate.row - door[1]) < 0.3) continue;
      for (const { id, box } of obstacles) {
        const inside = point.x > box.min.x + margin && point.x < box.max.x - margin && point.z > box.min.z + margin && point.z < box.max.z - margin;
        assert.ok(!inside, `the way from ${a} to ${b} runs into ${id}`);
      }
    }
  }
});

test('in peace the gate stands open, sentries keep watch and villagers stroll', () => {
  const { village, mapView, run } = setup();
  run(3, nobodyInWalls(mapView, village));
  assert.equal(village.alarm, ALARM.calm);
  assert.ok(leafSwing(mapView) > 1.2, 'the gate is open');
  assert.equal(guards(village).filter(shown).length, 2, 'two sentries on the walls, the rest in the keep');
  const walkers = villagers(village);
  assert.ok(walkers.length >= 3 && walkers.every(shown), 'villagers are out in the square');
  const before = walkers.map((model) => model.position.clone());
  run(2);
  assert.ok(walkers.some((model, index) => model.position.distanceTo(before[index]) > 0.1), 'villagers walk about');
});

test('invaders on the road: the bell rings, the gate shuts, the garrison climbs the stairs to the walls and the villagers shelter', () => {
  const { world, village, mapView, run } = setup();
  const check = nobodyInWalls(mapView, village);
  run(1, check);
  world.startWave();
  const bell = mapView.village.gate.userData.bell;
  let swing = 0;
  // Who went up the stairs: every man called up passes the foot and the top of a flight.
  const flights = mapView.village.stairs;
  const climbed = new Map();
  run(10, () => {
    check();
    swing = Math.max(swing, Math.abs(bell.rotation.x));
    for (const { model } of village.models.guards) {
      if (!shown(model)) continue;
      const tile = mapView.toTile(model.position);
      for (const flight of flights) {
        const marks = climbed.get(model) ?? new Set();
        if (Math.hypot(tile.x - flight.foot.x, tile.y - flight.foot.y) < 0.12) marks.add('foot');
        if (Math.hypot(tile.x - flight.top.x, tile.y - flight.top.y) < 0.12 && Math.abs(model.position.y - flight.top.height) < 0.02) marks.add('top');
        climbed.set(model, marks);
      }
    }
  });
  assert.equal(village.alarm, ALARM.alert);
  assert.ok(swing > 0.15, 'the alarm bell swings');
  assert.ok(leafSwing(mapView) < 0.05, 'the gate has swung shut');
  assert.ok(village.models.guards.every(({ state }) => state === 'post'), 'every post is manned');
  for (const { model } of village.models.guards.slice(2)) {
    assert.deepEqual([...(climbed.get(model) ?? [])].sort(), ['foot', 'top'], 'the men called up came out of the keep and climbed the stairs');
  }
  assert.ok(villagers(village).every((model) => !shown(model)), 'the villagers have gone into the keep');
  // The garrison watches the invaders: guards turn towards the nearest one.
  const enemy = world.spawnEnemy('knight', { distance: world.path.length - 3 });
  run(1);
  for (const { model, facing } of village.models.guards) {
    const tile = mapView.toTile(model.position);
    const toward = Math.atan2(enemy.x - tile.x, enemy.y - tile.y);
    assert.ok(turn(toward, model.rotation.y) < turn(toward, facing) - 0.05 || turn(toward, model.rotation.y) < 0.2, 'each guard turns towards the invader');
  }
  // Once it is over the men called up go back down into the keep; the sentries stay.
  for (const entry of [...world.enemies]) world.kill(entry);
  for (let i = 0; i < 400 && world.phase === 'wave'; i++) {
    for (const entry of [...world.enemies]) world.kill(entry);
    run(0.25);
  }
  run(14, check);
  assert.deepEqual(Array.from(village.models.guards, ({ state }) => state), ['post', 'post', 'inside', 'inside', 'inside', 'inside']);
  assert.ok(villagers(village).every(shown), 'the villagers are out again');
});

test('the siege: blows beat the door in plank by plank while the masonry stands firm; guards hurl the killing stones', () => {
  const { world, village, mapView, bursts, events, run } = setup();
  const gate = mapView.village.gate;
  const where = gate.position.clone();
  const facing = gate.quaternion.clone();
  /** What the door shows: which of its breakable parts are visible. */
  const look = () => {
    const shown = [];
    gate.traverse((node) => { if ((node.userData.damage !== undefined || node.userData.intact !== undefined) && node.visible) shown.push(node.userData.role); });
    return shown.sort().join();
  };
  world.lives = 999;
  world.maxLives = 20;
  for (let i = 0; i < 6; i++) world.spawnEnemy(i % 3 ? 'footman' : 'knight', { distance: world.path.length - 0.5 - i * 0.6 });
  run(2);
  assert.equal(village.alarm, ALARM.siege);
  world.lives = 20;
  // Each time the village loses lives (two attackers may strike in the same moment), the door should look worse.
  let losses = 0;
  let changed = 0;
  let blows = 0;
  let before = look();
  let lives = world.lives;
  run(14, () => {
    // Whatever the door goes through, the gatehouse does not move.
    assert.ok(gate.position.equals(where) && gate.quaternion.equals(facing), 'the gatehouse shakes');
    blows += events.splice(0).filter((event) => event.type === 'gateHit').length;
    if (world.lives === lives) return;
    lives = world.lives;
    losses++;
    const now = look();
    if (now !== before) changed++;
    before = now;
  });
  assert.ok(blows >= 4, 'the front rank has been battering the gate');
  assert.ok(changed >= losses * 0.8, `nearly every blow breaks more of the door (${changed} of ${losses})`);
  const splinters = bursts.filter((burst) => burst.kind === 'splinters');
  assert.ok(splinters.length >= blows, 'every blow splinters the door');
  assert.ok(splinters.some((burst) => burst.options.count > 15), 'a plank giving way throws a shower of splinters');
  assert.ok(bursts.some((burst) => burst.kind === 'stone'), 'stones from the walls fell spent attackers');
  world.lives = 2;
  run(0.1);
  let smashed = 0;
  gate.traverse((node) => { if (/^smashed/.test(node.userData.role) && node.visible) smashed++; });
  assert.ok(smashed >= 6, `a gate about to give is mostly smashed through (${smashed} planks)`);
  assert.equal(village.models.burning.length, 0, 'a siege sets nothing alight');
});

test('kills near the gate make the garrison cheer; a held wave brings fireworks and the villagers back out', () => {
  const { world, village, bursts, run } = setup();
  world.startWave();
  run(8);
  const enemy = world.spawnEnemy('footman', { distance: world.path.length - 2 });
  run(0.2);
  const arms = () => guards(village).filter(shown).map((guard) => guard.userData.armRight.rotation.x);
  world.kill(enemy);
  run(0.5);
  assert.ok(arms().filter((angle) => angle < -2.2).length >= 3, 'the garrison throws its arms up');
  for (let i = 0; i < 400 && world.phase === 'wave'; i++) {
    for (const entry of [...world.enemies]) world.kill(entry);
    run(0.25);
  }
  assert.equal(world.phase, 'build');
  run(4);
  assert.ok(bursts.some((burst) => burst.kind === 'firework'), 'rockets burst over the village');
  run(6);
  assert.equal(village.alarm, ALARM.calm);
  assert.ok(villagers(village).some(shown), 'the villagers come out again');
});

test('the fall: the garrison leads the villagers out through the south archway, and only what the invaders torch burns', () => {
  const { world, village, mapView, fire, bursts, events, run } = setup();
  world.startWave();
  run(6);
  world.lives = 1;
  for (const [type, back] of [['footman', 0.4], ['knight', 2], ['scout', 3], ['footman', 5]]) world.spawnEnemy(type, { distance: world.path.length - back });
  const check = nobodyInWalls(mapView, village);
  const arch = planPoint(mapView, VILLAGE_PLAN.paths.points[VILLAGE_PLAN.exit]);
  const nearestToArch = new Map();
  const torched = new Set();
  let keepTakenAt = null;
  const keep = mapView.village.buildings.find(({ name }) => name === 'keep').model;
  const torchedAt = new Map();
  let clock = 0;
  run(40, () => {
    check();
    clock += FIXED_STEP;
    // A building burns a good while before it comes down.
    for (const [name, at] of torchedAt) {
      const { roof } = mapView.village.buildings.find((building) => building.name === name).model.userData;
      if (roof && clock - at < 6) assert.ok(shown(roof), `the ${name} came down too soon`);
    }
    for (const event of events.splice(0)) {
      if (event.type === 'torch') {
        torched.add(event.target);
        torchedAt.set(event.target, clock);
      }
      if (event.type === 'keepTaken') keepTakenAt = events.length;
    }
    // Nothing burns that no invader has set alight.
    assert.deepEqual([...village.models.burning].sort(), [...torched].sort());
    if (keepTakenAt === null) assert.ok(shown(keep.userData.banner) && !shown(village.models.warBanner), "the lord's banner flies until the keep is taken");
    for (const { model } of village.models.people) {
      if (!shown(model)) continue;
      const distance = Math.hypot(model.position.x - arch.x, model.position.z - arch.z);
      nearestToArch.set(model, Math.min(nearestToArch.get(model) ?? Infinity, distance));
    }
  });
  assert.ok(world.gateBroken);
  assert.ok(bursts.some((burst) => burst.kind === 'rubble'), 'the door bursts in a shower of rubble');
  assert.ok(mapView.village.gate.userData.leafLeft.rotation.x < -1.2, 'a leaf lies torn down in the passage');
  // Everyone got out: through the archway and down the hill road, out of sight.
  for (const { model, state } of village.models.people) {
    assert.equal(state, 'gone', 'everyone has left the village');
    assert.ok(!shown(model));
    assert.ok(nearestToArch.get(model) < 0.35, 'they left through the south archway');
  }
  // The fires: every building the invaders reached, and nothing else.
  assert.deepEqual([...torched].sort(), Array.from(VILLAGE_PLAN.targets, ({ name }) => name).sort());
  assert.ok(!village.models.burning.includes('farmhouse'), 'the farmhouse nobody reached does not burn');
  assert.ok(fire.burning.length >= torched.size * 2, 'each burning building has caught in several places');
  assert.ok(keepTakenAt !== null && shown(village.models.warBanner) && !shown(keep.userData.banner), "the invaders' banner flies over the keep they took");
  let charred = 0;
  keep.traverse((node) => { if (node.isMesh && node.material !== Hold.modelKit.bakedMaterial() && node.material.vertexColors) charred++; });
  assert.ok(charred > 0, 'the keep is blackened');
  // Burnt long enough, every building they fired has come down: roof fallen in, upper storey gone, spires toppled, ruin left.
  for (const { name, model } of mapView.village.buildings) {
    const { roof, upper, ruin } = model.userData;
    const spires = Object.keys(model.userData).filter((key) => /^spire/.test(key)).map((key) => model.userData[key]);
    if (torched.has(name)) {
      assert.ok(roof && !shown(roof), `the ${name}'s roof has fallen in`);
      if (upper) assert.ok(!shown(upper), `the ${name}'s upper storey has crumbled`);
      assert.ok(spires.every((spire) => !shown(spire)), `the ${name}'s spires have toppled`);
      assert.ok(ruin && shown(ruin), `the ${name} lies in ruins`);
    } else if (roof) {
      assert.ok(shown(roof) && !shown(ruin), `the ${name}, never set alight, still stands`);
    }
  }
  // The fires die down on the rubble.
  assert.ok(fire.burning.every((emitter) => emitter.strength < 1), 'the fires are dying down');

  village.reset();
  village.update(new World({ seed: 1 }), 0);
  assert.equal(village.models.burning.length, 0, 'the fires are out');
  assert.equal(fire.burning.length, 0);
  assert.ok(shown(keep.userData.banner) && !shown(village.models.warBanner), "the lord's banner flies again");
  assert.ok(Math.abs(mapView.village.gate.userData.leafLeft.rotation.x) < 1e-9, 'the gate is whole again');
  for (const { name, model } of mapView.village.buildings) {
    const { roof, ruin } = model.userData;
    if (roof) assert.ok(shown(roof) && !shown(ruin), `the ${name} stands again`);
  }
  keep.traverse((node) => { if (node.isMesh && node.material.vertexColors) assert.equal(node.material, Hold.modelKit.bakedMaterial(), 'the keep is clean again'); });
  assert.equal(guards(village).filter(shown).length, 2, 'the sentries are back at their posts');
  assert.ok(villagers(village).every(shown), 'the villagers are home');
});

test('the garrison on the walls never hides a battlefield tile', () => {
  const { world, village, mapView, run } = setup();
  world.startWave();
  run(10);
  assert.ok(village.models.guards.every(({ state }) => state === 'post'));
  const meshes = [];
  village.group.updateMatrixWorld(true);
  for (const guard of guards(village)) guard.traverse((node) => { if (node.isMesh) meshes.push(node); });
  const raycaster = new THREE.Raycaster();
  const { map, terrain } = mapView;
  for (const aspect of [16 / 9, 4 / 3, 21 / 9]) {
    const camera = placeCamera(new THREE.PerspectiveCamera(40, aspect, 0.1, 500), CAMERA_PRESETS.default);
    for (let row = 0; row < map.rows; row++) {
      for (let col = 0; col < map.columns; col++) {
        const target = mapView.toWorld(col, row).setY(terrain.tileTop(col, row) + 0.03);
        const direction = target.clone().sub(camera.position);
        const distance = direction.length();
        raycaster.set(camera.position, direction.normalize());
        raycaster.far = distance - 0.2;
        const hit = raycaster.intersectObjects(meshes, false)[0];
        assert.ok(!hit, `a guard hides tile ${col},${row} at aspect ${aspect.toFixed(2)}`);
      }
    }
  }
});
