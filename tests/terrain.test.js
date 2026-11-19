'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { loadScripts, loadSim } = require('./load');

/*
 * The hill's height model. Towers need flat whole-tier tiles, invaders need
 * a road without jumps, and everything placed on the map must agree on
 * where the ground is.
 */

const Hold = loadScripts([
  'src/namespace.js', 'src/core/math.js', 'src/data/map.js', 'src/sim/path.js', 'src/view/terrain.js',
]);
const { parseMap, MAP_ROWS, createTerrain, TERRAIN } = Hold;
const map = parseMap(MAP_ROWS);
const terrain = createTerrain(map);
const close = (a, b, message) => assert.ok(Math.abs(a - b) < 1e-9, `${message}: ${a} vs ${b}`);

test('every map tile stands on a whole tier', () => {
  for (let row = 0; row < map.rows; row++) {
    for (let col = 0; col < map.columns; col++) {
      assert.ok(terrain.exists(col, row), `tile ${col},${row} has no ground`);
      const tier = terrain.tierAt(col, row);
      assert.ok(Number.isInteger(tier) && tier >= 0, `tile ${col},${row} has tier ${tier}`);
      close(terrain.tileTop(col, row), tier * TERRAIN.TIER_HEIGHT, `tile ${col},${row} top`);
      if (map.tileAt(col, row) === '.') {
        // Buildable tiles are flat: all four corners at the tile top.
        for (const corner of terrain.cornerHeights(col, row)) close(corner, terrain.tileTop(col, row), `tile ${col},${row} corner`);
      }
    }
  }
});

test('the road ramps smoothly, never more than one tier per tile, and meets every tile top', () => {
  const { path } = map;
  path.points.forEach(({ x, y }, index) => {
    close(terrain.pathHeight(path.lengths[index]), terrain.tileTop(x, y), `road height at tile ${x},${y}`);
    if (index > 0) {
      const step = Math.abs(terrain.tileTop(x, y) - terrain.tileTop(path.points[index - 1].x, path.points[index - 1].y));
      assert.ok(step <= TERRAIN.TIER_HEIGHT + 1e-9, `road steps ${step} between tiles ${index - 1} and ${index}`);
    }
  });
  let previous = terrain.pathHeight(0);
  for (let d = 0.05; d <= path.length; d += 0.05) {
    const height = terrain.pathHeight(d);
    assert.ok(Math.abs(height - previous) <= TERRAIN.TIER_HEIGHT * 0.05 + 1e-9, `road jumps at distance ${d}`);
    previous = height;
  }
  assert.ok(path.points.some(({ x, y }, i) => i > 0 && terrain.tileTop(x, y) !== terrain.tileTop(path.points[i - 1].x, path.points[i - 1].y)), 'the road should climb or descend somewhere');
});

test('heightAt agrees with the road on path tiles and with tile tops elsewhere', () => {
  const { path } = map;
  for (let d = 0; d <= path.length; d += 0.25) {
    const at = path.positionAt(d);
    close(terrain.heightAt(at.x, at.y), terrain.pathHeight(d), `heightAt on the road at ${d}`);
  }
  for (let row = 0; row < map.rows; row++) {
    for (let col = 0; col < map.columns; col++) {
      if (terrain.isPath(col, row)) continue;
      close(terrain.heightAt(col + 0.3, row - 0.2), terrain.tileTop(col, row), `heightAt on tile ${col},${row}`);
    }
  }
  assert.equal(terrain.heightAt(-40, -40), TERRAIN.VALLEY_FLOOR, 'beyond the hill is the valley floor');
});

test('consecutive road tiles share the same edge heights', () => {
  const { path } = map;
  for (let i = 1; i < path.points.length; i++) {
    const a = path.points[i - 1];
    const b = path.points[i];
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    const fromA = terrain.heightAt(mid.x, mid.y, { col: a.x, row: a.y });
    const fromB = terrain.heightAt(mid.x, mid.y, { col: b.x, row: b.y });
    close(fromA, fromB, `edge between road tiles ${i - 1} and ${i}`);
  }
});

test('the village terrace sits one tier above the road, which climbs to the gate, and the cave rests at the spawn tier', () => {
  const { gate, spawn, path } = map;
  const before = path.points.at(-2);
  assert.equal(terrain.villageTier, terrain.tierAt(before.x, before.y) + 1, 'the terrace is a tier above the road');
  // The last road tile ramps up to the terrace so the door sill meets the road: invaders can reach the gate.
  assert.equal(terrain.tierAt(gate.col, gate.row), terrain.villageTier, 'the gate tile is level with the terrace');
  close(terrain.heightAt(gate.col + 0.45, gate.row), terrain.tileTop(gate.col + 1, gate.row), 'the road meets the door sill');
  assert.ok(terrain.inVillage(gate.col + 2, gate.row));
  assert.equal(terrain.caveTier, terrain.tierAt(spawn.col, spawn.row));
  assert.ok(terrain.inCave(spawn.col - 1, spawn.row));
  assert.ok(!terrain.inCave(spawn.col, spawn.row) && !terrain.inVillage(gate.col, gate.row));
});

test('the surrounding ring is ragged but never floats away from the hill', () => {
  let outer = 0;
  for (const tile of terrain.tiles()) {
    if (tile.inMap) continue;
    outer++;
    assert.ok(tile.tier !== null, 'existing tiles have a tier');
    if (tile.village || tile.cave) continue;
    const towardCol = tile.col < 0 ? tile.col + 1 : tile.col >= map.columns ? tile.col - 1 : tile.col;
    const towardRow = tile.row < 0 ? tile.row + 1 : tile.row >= map.rows ? tile.row - 1 : tile.row;
    assert.ok(terrain.exists(towardCol, towardRow), `ring tile ${tile.col},${tile.row} is detached`);
  }
  assert.ok(outer > 20, 'there is a ring around the map');
  assert.ok(!terrain.exists(-TERRAIN.OUTER_RING - 1, map.rows - 1), 'nothing beyond the ring (outside the cave shelf)');
});

test('the simulation and the terrain see the same map', () => {
  const { World } = loadSim();
  const world = new World();
  const fromWorld = createTerrain(world.map);
  assert.equal(fromWorld.pathHeight(world.path.length), terrain.pathHeight(map.path.length));
});
