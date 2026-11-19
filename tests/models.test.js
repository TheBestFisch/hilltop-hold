'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { loadContext, scriptsOf } = require('./load');

/*
 * Collision and fit of the models. Towers must stay inside their tile so
 * neighbours never overlap, invaders must match the collision radius the
 * simulation uses, and upgrades must be visibly bigger.
 */

const scripts = scriptsOf('index.html').filter((script) => /vendor|namespace|core\/math|data\/|models\//.test(script));
const { THREE, Hold } = loadContext(scripts);
const { catalog, ENEMIES, TOWERS, modelKit, animation } = Hold;

const TILE_HALF = 0.5;
const TURRET_SWEEP_MAX = 0.68;

/** Bounding box of everything except the turret, which is allowed to overhang. */
function staticBounds(model) {
  const box = new THREE.Box3();
  const part = new THREE.Box3();
  model.updateMatrixWorld(true);
  model.traverse((node) => {
    if (!node.isMesh) return;
    for (let current = node; current; current = current.parent) {
      if (current === model.userData.turret) return;
    }
    part.setFromObject(node);
    box.union(part);
  });
  return box;
}

test('tower bodies stay inside their tile and turrets overhang only a little', () => {
  for (const entry of catalog.entries.filter((e) => e.group === 'tower')) {
    const model = entry.build();
    const bounds = staticBounds(model);
    assert.ok(bounds.min.x >= -TILE_HALF - 0.06 && bounds.max.x <= TILE_HALF + 0.06, `${entry.id} overflows its tile on x: ${bounds.min.x.toFixed(2)}..${bounds.max.x.toFixed(2)}`);
    assert.ok(bounds.min.z >= -TILE_HALF - 0.06 && bounds.max.z <= TILE_HALF + 0.06, `${entry.id} overflows its tile on z: ${bounds.min.z.toFixed(2)}..${bounds.max.z.toFixed(2)}`);
    assert.ok(bounds.min.y >= -0.01, `${entry.id} dips below the ground`);
    const sweep = modelKit.turretSweep(model.userData.turret);
    assert.ok(sweep.radius <= TURRET_SWEEP_MAX, `${entry.id} turret sweeps ${sweep.radius.toFixed(2)} tiles`);
    const [, my] = model.userData.muzzle;
    assert.ok(my > 0.3 && my < model.userData.height, `${entry.id} muzzle height ${my} is not on the tower`);
  }
});

test('every upgrade level is visibly taller than the one before', () => {
  for (const tower of TOWERS) {
    const heights = catalog.series(`tower:${tower.id}`).map((entry) => {
      const bounds = new THREE.Box3().setFromObject(entry.build());
      return bounds.max.y;
    });
    for (let level = 1; level < heights.length; level++) {
      assert.ok(heights[level] > heights[level - 1] + 0.15, `${tower.id} level ${level + 1} (${heights[level].toFixed(2)}) is not taller than level ${level} (${heights[level - 1].toFixed(2)})`);
    }
  }
});

/** Bounding box of the torso: limbs (arms, legs, clubs) swing outside the collision circle by design. */
function torsoBounds(model) {
  const box = new THREE.Box3();
  const part = new THREE.Box3();
  model.updateMatrixWorld(true);
  model.userData.body.traverse((node) => {
    if (!node.isMesh) return;
    for (let current = node; current && current !== model; current = current.parent) {
      if (current.userData.limb) return;
    }
    part.setFromObject(node);
    box.union(part);
  });
  return box;
}

test('invader models match the collision radius the simulation uses', () => {
  for (const [type, stats] of Object.entries(ENEMIES)) {
    const model = catalog.build(`enemy:${type}`);
    const bounds = torsoBounds(model);
    const radius = Math.max(bounds.max.x, -bounds.min.x, bounds.max.z, -bounds.min.z);
    assert.ok(radius >= stats.radius * 0.7 && radius <= stats.radius * 1.6, `${type} body radius ${radius.toFixed(2)} does not match collision radius ${stats.radius}`);
    assert.ok(bounds.min.y >= -0.01, `${type} sinks into the ground`);
    assert.ok(model.userData.height >= bounds.max.y - 0.05, `${type} health bar (${model.userData.height}) would cut through its body (${bounds.max.y.toFixed(2)})`);
  }
});

test('projectiles point along +Z so they fly nose first', () => {
  for (const tower of TOWERS) {
    const bounds = new THREE.Box3().setFromObject(catalog.build(`projectile:${tower.id}`));
    const size = bounds.getSize(new THREE.Vector3());
    assert.ok(size.z >= size.x && size.z >= size.y, `projectile:${tower.id} is not longest along z`);
  }
});

test('baking merges static parts and keeps animated ones moving', () => {
  const tree = modelKit.bake(catalog.build('scenery:tree:1'));
  let meshes = 0;
  tree.traverse((node) => { if (node.isMesh) meshes++; });
  assert.equal(meshes, 1, 'a tree should bake into one mesh');

  const mill = modelKit.bake(catalog.build('scenery:windmill'));
  const parts = animation.collect(mill);
  assert.ok(parts.some(({ node }) => node.userData.spin), 'windmill sails keep their spin hook');
  const sails = parts.find(({ node }) => node.userData.spin).node;
  const before = sails.rotation.z;
  animation.apply(parts, { time: 1 });
  assert.notEqual(sails.rotation.z, before, 'spin hook rotates');
  animation.reset(parts);
  assert.equal(sails.rotation.z, before, 'reset restores the built pose');

  const cloud = modelKit.bake(catalog.build('scenery:cloud:2'));
  assert.ok(cloud.scale.x > 1, 'baking keeps the model root transform');
});

test('walk cycles swing limbs by the walk phase, not by time', () => {
  const scout = catalog.build('enemy:scout');
  const parts = animation.collect(scout);
  const legs = parts.filter(({ node }) => node.userData.limb);
  assert.ok(legs.length >= 2, 'the scout has legs');
  animation.apply(parts, { time: 5, walk: 0 });
  const rest = legs.map(({ node }) => node.rotation.x);
  animation.apply(parts, { time: 5, walk: Math.PI / 2 });
  assert.ok(legs.some(({ node }, index) => Math.abs(node.rotation.x - rest[index]) > 0.1), 'legs move with the walk phase');
});

test('baked instances keep their turret and body references and share geometry', () => {
  const a = catalog.instance('tower:cannon:2');
  const b = catalog.instance('tower:cannon:2');
  assert.ok(a.userData.turret && a.userData.turret.parent === a, 'turret is a child of the baked tower');
  assert.notEqual(a.userData.turret, b.userData.turret, 'each instance has its own turret');
  let meshesA = 0;
  const geometries = new Set();
  a.traverse((node) => { if (node.isMesh) { meshesA++; geometries.add(node.geometry); } });
  let shared = 0;
  b.traverse((node) => { if (node.isMesh && geometries.has(node.geometry)) shared++; });
  assert.ok(meshesA < 12, `a baked level-3 cannon should be a handful of meshes, got ${meshesA}`);
  assert.equal(shared, meshesA, 'instances share geometry');
  assert.deepEqual(a.userData.muzzle, catalog.build('tower:cannon:2').userData.muzzle);

  const warlord = catalog.instance('enemy:warlord');
  assert.ok(warlord.userData.body && warlord.userData.body.parent === warlord, 'body survives baking');
  const parts = animation.collect(warlord);
  assert.ok(parts.filter(({ node }) => node.userData.limb).length >= 4, 'limbs survive baking');
  const sweep = modelKit.turretSweep(a.userData.turret);
  assert.ok(sweep.radius > 0.3 && sweep.radius <= TURRET_SWEEP_MAX);
});

test('doors are taller than the people who use them', () => {
  const { HUMAN } = modelKit;
  assert.ok(HUMAN.door > HUMAN.figure, 'the door minimum is taller than a figure');
  let doors = 0;
  let figures = 0;
  for (const entry of catalog.entries) {
    const model = entry.build();
    model.updateMatrixWorld(true);
    let tallestFigure = 0;
    model.traverse((node) => {
      if (node.name === 'figure') {
        figures++;
        const height = new THREE.Box3().setFromObject(node).getSize(new THREE.Vector3()).y;
        assert.ok(height <= HUMAN.figure + 0.01, `${entry.id} has a figure ${height.toFixed(2)} tall, above the human scale ${HUMAN.figure}`);
        tallestFigure = Math.max(tallestFigure, height);
      }
    });
    model.traverse((node) => {
      if (node.name !== 'door') return;
      doors++;
      const height = new THREE.Box3().setFromObject(node).getSize(new THREE.Vector3()).y;
      assert.ok(height >= HUMAN.door, `${entry.id} has a door only ${height.toFixed(2)} tall`);
      assert.ok(height > tallestFigure * 1.1, `${entry.id} has a door (${height.toFixed(2)}) barely taller than its people (${tallestFigure.toFixed(2)})`);
      const bottom = new THREE.Box3().setFromObject(node).min.y;
      assert.ok(bottom < 0.15, `${entry.id} has a door floating ${bottom.toFixed(2)} above the ground`);
    });
  }
  assert.ok(figures >= 4, 'the archer towers have figures');
  assert.ok(doors >= 8, `every building has a door (found ${doors})`);
  for (const id of ['tower:archer:1', 'tower:archer:2', 'scenery:keep', 'scenery:house:0', 'scenery:house:1', 'scenery:house:2', 'scenery:gate:0', 'scenery:windmill']) {
    let found = false;
    catalog.build(id).traverse((node) => { if (node.name === 'door') found = true; });
    assert.ok(found, `${id} has a proper door`);
  }
});

test('invaders are medieval soldiers of one rival army, not monsters', () => {
  const { LIVERY } = Hold.unitModels;
  const playerColours = Hold.towerModels.LEVELS.flatMap((level) => [level.banner, level.trim, level.cloth]).filter(Boolean);
  assert.ok(!playerColours.includes(LIVERY.primary), 'the enemy livery must differ from the player heraldry');
  for (const type of Object.keys(ENEMIES)) {
    const model = catalog.build(`enemy:${type}`);
    let livery = 0;
    let weapons = 0;
    let heads = 0;
    let glowing = 0;
    model.updateMatrixWorld(true);
    model.traverse((node) => {
      if (node.name === 'weapon') weapons++;
      if (node.name === 'head') {
        heads++;
        // A human head: about the size of an archer's.
        const size = new THREE.Box3().setFromObject(node).getSize(new THREE.Vector3());
        assert.ok(size.y < 0.2 && size.x < 0.2, `${type} has an oversized head`);
      }
      if (!node.isMesh) return;
      if (node.material.color.getHex() === LIVERY.primary) livery++;
      if (node.material.emissive && node.material.emissive.getHex() !== 0) glowing++;
    });
    assert.ok(livery > 0, `${type} does not wear the enemy livery`);
    assert.ok(weapons > 0, `${type} carries no weapon`);
    assert.equal(heads, 1, `${type} should have one human head`);
    assert.equal(glowing, 0, `${type} has glowing parts, which reads as a monster`);
    if (!ENEMIES[type].boss) {
      // Foot soldiers are human-sized: the top of the head is near the archers' height and below a door.
      let top = 0;
      model.traverse((node) => { if (node.name === 'head') top = new THREE.Box3().setFromObject(node).max.y; });
      assert.ok(top <= modelKit.HUMAN.door, `${type} is taller than a door (${top.toFixed(2)})`);
      assert.ok(top >= modelKit.HUMAN.figure * 0.9, `${type} is smaller than a person (${top.toFixed(2)})`);
    }
  }
});

/** Whether any mesh under `node` is hit by a ray, counting only meshes that are shown. */
function hitsVisible(raycaster, node) {
  node.updateMatrixWorld(true);
  const meshes = [];
  node.traverse((child) => {
    if (!child.isMesh) return;
    for (let current = child; current; current = current.parent) if (!current.visible) return;
    meshes.push(child);
  });
  return raycaster.intersectObjects(meshes, false)[0] ?? null;
}

test('the gate is a real doorway: its leaves swing inward on their hinges and open onto a passage', () => {
  const { poseGate, GATE_DOOR } = Hold.sceneryModels;
  const gate = catalog.build('scenery:gate:0');
  const { leafLeft, leafRight } = gate.userData;
  assert.ok(leafLeft && leafRight, 'the gate has two leaves');
  // A ray down the road at waist height, straight at the middle of the door.
  const ray = new THREE.Raycaster(new THREE.Vector3(0, 0.3, 2), new THREE.Vector3(0, 0, -1), 0, 2.6);
  const closed = hitsVisible(ray, gate);
  assert.ok(closed, 'a closed gate stops the way');
  assert.ok(Math.abs(closed.point.z - (GATE_DOOR.z + GATE_DOOR.depth / 2)) < 0.01, `the door's face is at ${closed.point.z.toFixed(3)}`);
  poseGate(gate, { open: 1 });
  assert.equal(hitsVisible(ray, gate), null, 'an open gate leaves the passage clear right through the gatehouse');
  const tip = (leaf, side) => leaf.localToWorld(new THREE.Vector3(side * -GATE_DOOR.width / 2, 0.3, 0));
  gate.updateMatrixWorld(true);
  assert.ok(tip(leafLeft, -1).z < GATE_DOOR.z - 0.2 && tip(leafRight, 1).z < GATE_DOOR.z - 0.2, 'both leaves swing inward, into the village');
});

test('the gate shows more damage at every stage and is torn down when broken', () => {
  const shown = (model) => {
    let count = 0;
    model.traverse((node) => { if (node.userData.damage !== undefined && node.visible) count++; });
    return count;
  };
  const counts = [0, 1, 2, 3].map((variant) => shown(catalog.build(`scenery:gate:${variant}`)));
  assert.equal(counts[0], 0, 'an intact gate shows no damage');
  for (let stage = 1; stage < 4; stage++) assert.ok(counts[stage] > counts[stage - 1], `stage ${stage} shows more damage than stage ${stage - 1}`);
  const broken = catalog.build('scenery:gate:3');
  assert.ok(broken.userData.leafLeft.rotation.x < -1.2, 'the broken gate has a leaf lying in the passage');
  // Baked for the game, the damage keeps its stage and starts hidden on an intact gate.
  const baked = catalog.instance('scenery:gate:0');
  assert.ok(baked.userData.leafLeft && baked.userData.leafRight && baked.userData.bell, 'leaves and bell survive baking');
  let hidden = 0;
  baked.traverse((node) => { if (node.userData.damage !== undefined) { assert.equal(node.visible, false, 'damage starts hidden'); hidden++; } });
  assert.ok(hidden >= 6, `the baked gate keeps its damage parts (${hidden})`);
});

test('every invader can batter the gate: a tagged weapon arm and a described blow', () => {
  for (const type of Object.keys(ENEMIES)) {
    const model = catalog.instance(`enemy:${type}`);
    const { weaponArm, attack } = model.userData;
    assert.ok(weaponArm?.userData.limb, `${type} has a weapon arm that still swings when walking`);
    let holdsWeapon = false;
    catalog.build(`enemy:${type}`).traverse((node) => {
      if (node.userData.role === 'weaponArm') node.traverse((child) => { if (child.name === 'weapon') holdsWeapon = true; });
    });
    assert.ok(holdsWeapon, `${type}'s weapon arm holds its weapon`);
    for (const key of ['rest', 'raise', 'hit', 'lean', 'lunge']) assert.equal(typeof attack?.[key], 'number', `${type} attack.${key}`);
    assert.equal(attack.cheer.length, 2, `${type} has a cheer`);
    assert.ok(Math.abs(attack.raise - attack.rest) > 0.4 && Math.abs(attack.hit - attack.raise) > 0.4, `${type} winds up and strikes visibly`);
  }
  const warlord = catalog.instance('enemy:warlord');
  assert.equal(animation.collect(warlord.userData.forehand).filter(({ node }) => node.userData.limb).length, 2, 'the warhorse rears on its forelegs');
  assert.ok(warlord.userData.attack.rear > 0 && warlord.userData.attack.pivot.length === 2);
});

test('the village garrison and villagers are people with arms to wave and bodies to jump', () => {
  for (const id of ['scenery:guard:0', 'scenery:guard:1', 'scenery:villager:0', 'scenery:villager:1', 'scenery:villager:2']) {
    const model = catalog.instance(id);
    for (const role of ['body', 'armLeft', 'armRight']) assert.ok(model.userData[role], `${id} has ${role}`);
    let figure = null;
    catalog.build(id).traverse((node) => { if (node.name === 'figure') figure = node; });
    assert.ok(figure, `${id} is a figure, held to human size`);
  }
  assert.ok(catalog.instance('scenery:villager:0').userData.legLeft, 'villagers in trousers walk on legs');
  const banner = catalog.instance('scenery:warBanner');
  assert.ok(banner.userData.cloth && banner.userData.pole, 'the war banner can be flown from another mast');
});

test('what fire brings down in a building is marked, and the ruin it leaves starts hidden', () => {
  for (const [id, spires, upper] of [
    ['scenery:house:0', 0, true], ['scenery:house:1', 0, true], ['scenery:house:2', 0, false],
    ['scenery:keep', 4, true], ['scenery:windmill', 1, true], ['scenery:cart', 0, true], ['scenery:gate:0', 2, false],
  ]) {
    const model = catalog.instance(id);
    const { roof, ruin } = model.userData;
    assert.ok(roof && roof.visible, `${id} has a roof that can fall in`);
    assert.equal(Boolean(model.userData.upper), upper, `${id} ${upper ? 'has' : 'has no'} storey that crumbles`);
    assert.ok(ruin && !ruin.visible, `${id} leaves a ruin, hidden until it burns down`);
    const found = Object.keys(model.userData).filter((key) => /^spire\d+$/.test(key));
    assert.equal(found.length, spires, `${id} has ${spires} spires`);
    for (const key of found) assert.equal(model.userData[key].userData.fall.length, 2, `${id} ${key} knows which way it falls`);
    // The ruin is lower than the building was: what is left is what stood below the roof.
    model.updateMatrixWorld(true);
    const standing = new THREE.Box3().setFromObject(roof);
    let top = -Infinity;
    ruin.traverse((node) => { if (node.isMesh) top = Math.max(top, new THREE.Box3().setFromObject(node).max.y); });
    assert.ok(top < standing.max.y, `${id}'s ruin stands lower than its roof did`);
  }
});

test('the gate is beaten in plank by plank: almost every blow (one life in twenty) breaks something new', () => {
  const { poseGate, PLANK_BREAKS } = Hold.sceneryModels;
  const gate = catalog.build('scenery:gate:0');
  const look = () => {
    const shown = [];
    gate.traverse((node) => { if ((node.userData.damage !== undefined || node.userData.intact !== undefined) && node.visible) shown.push(node.userData.role); });
    return shown.sort().join();
  };
  let changes = 0;
  let previous = look();
  for (let lost = 1; lost <= 20; lost++) {
    poseGate(gate, { damage: lost / 20 });
    const now = look();
    if (now !== previous) changes++;
    previous = now;
  }
  assert.ok(changes >= 17, `the door changes with ${changes} of 20 blows`);
  assert.equal(PLANK_BREAKS.length, 2 * Hold.sceneryModels.GATE_DOOR.planks, 'every plank can be smashed');
});
