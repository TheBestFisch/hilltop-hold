'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { loadContext, scriptsOf } = require('./load');

/*
 * The assembled battlefield, built in Node exactly as the game builds it:
 * nothing in the scenery (clouds included) may block the player's view of
 * a tile, the clouds stay below the hilltop and clear of the hillside, the
 * hill road climbs from the valley to the village, and picking agrees with
 * real ray casts.
 */

const scripts = scriptsOf('index.html').filter((script) =>
  /vendor|namespace|core\/math|data\/|sim\/|models\/|view\/terrain|view\/MapView|render\/cameraRig/.test(script));
const { THREE, Hold } = loadContext(scripts);
const { World, MapView, CAMERA_PRESETS, placeCamera } = Hold;
const world = new World();
const mapView = new MapView(world.map);
mapView.group.updateMatrixWorld(true);
const { terrain, map } = mapView;
const ASPECTS = [16 / 9, 16 / 10, 4 / 3, 21 / 9];

const clouds = [];
mapView.group.traverse((node) => { if (node.userData.cloud) clouds.push(node); });

/** Scenery that must never stand between the camera and a tile: everything except the tiles' own contents. */
function blockers() {
  const result = [];
  const ownTile = new Set();
  // Props standing on battlefield tiles (trees and rocks on T/R tiles) belong to those tiles.
  for (const child of mapView.group.children) {
    const tile = mapView.toTile(child.position);
    const col = Math.round(tile.x);
    const row = Math.round(tile.y);
    if (col >= 0 && col < map.columns && row >= 0 && row < map.rows && Math.abs(tile.x - col) < 0.05 && Math.abs(tile.y - row) < 0.05) ownTile.add(child);
  }
  mapView.group.traverse((node) => {
    if (!node.isMesh || node.isInstancedMesh) return;
    for (let current = node; current; current = current.parent) {
      if (ownTile.has(current) || current === mapView.marker || current === mapView.rangeRing || current === mapView.ghosts) return;
    }
    result.push(node);
  });
  return result;
}

/** The volume a cloud sweeps over its whole drift lane (the lane is a straight line, so its two ends bound it). */
function sweptBounds(cloud) {
  const axis = cloud.userData.drift;
  const start = cloud.position[axis];
  const swept = new THREE.Box3();
  for (const end of [-34, 34]) {
    cloud.position[axis] = end;
    cloud.updateMatrixWorld(true);
    swept.union(new THREE.Box3().setFromObject(cloud));
  }
  cloud.position[axis] = start;
  cloud.updateMatrixWorld(true);
  return swept;
}

test('nothing in the scenery hides a battlefield tile from the player camera', () => {
  const objects = blockers().filter((mesh) => !clouds.some((cloud) => mesh.parent === cloud || mesh === cloud));
  const cloudVolumes = clouds.map(sweptBounds);
  const raycaster = new THREE.Raycaster();
  const hitPoint = new THREE.Vector3();
  for (const aspect of ASPECTS) {
    const camera = placeCamera(new THREE.PerspectiveCamera(40, aspect, 0.1, 500), CAMERA_PRESETS.default);
    for (let row = 0; row < map.rows; row++) {
      for (let col = 0; col < map.columns; col++) {
        const target = mapView.toWorld(col, row).setY(terrain.tileTop(col, row) + 0.03);
        const direction = target.clone().sub(camera.position);
        const distance = direction.length();
        raycaster.set(camera.position, direction.normalize());
        raycaster.far = distance - 0.2; // the tile's own surface (ramps included) is not a blocker
        const hit = raycaster.intersectObjects(objects, false)[0];
        assert.ok(!hit, `tile ${col},${row} is hidden at aspect ${aspect.toFixed(2)} by scenery at ${hit?.point.toArray().map((v) => v.toFixed(1))}`);
        // Clouds move, so test the whole volume each one sweeps while drifting.
        for (const volume of cloudVolumes) {
          const point = raycaster.ray.intersectBox(volume, hitPoint);
          assert.ok(!point || point.distanceTo(camera.position) > distance - 0.2, `a drifting cloud passes in front of tile ${col},${row} at aspect ${aspect.toFixed(2)}`);
        }
      }
    }
  }
});

test('clouds stay below the hilltop, so they can never come between the camera and the map', () => {
  assert.ok(clouds.length >= 6, 'there is a sea of clouds');
  const lowestTile = Math.min(...[...terrain.tiles()].filter((tile) => tile.inMap).map((tile) => tile.top));
  for (const cloud of clouds) {
    const bounds = new THREE.Box3().setFromObject(cloud);
    assert.ok(bounds.max.y < lowestTile, `a cloud reaches y ${bounds.max.y.toFixed(2)}, above the lowest tile top ${lowestTile}`);
  }
});

test('clouds drift clear of the hillside along their whole lane', () => {
  for (const cloud of clouds) {
    const axis = cloud.userData.drift;
    const start = cloud.position[axis];
    for (let at = -34; at <= 34; at += 1) {
      cloud.position[axis] = at;
      cloud.updateMatrixWorld(true);
      const bounds = new THREE.Box3().setFromObject(cloud);
      for (const x of [bounds.min.x, (bounds.min.x + bounds.max.x) / 2, bounds.max.x]) {
        for (const z of [bounds.min.z, (bounds.min.z + bounds.max.z) / 2, bounds.max.z]) {
          const tile = mapView.toTile({ x, z });
          const ground = terrain.heightAt(tile.x, tile.y);
          assert.ok(bounds.min.y > ground, `a cloud on the ${axis} lane cuts into the ground at ${x.toFixed(1)},${z.toFixed(1)}`);
        }
      }
    }
    cloud.position[axis] = start;
    cloud.updateMatrixWorld(true);
  }
});

test('the hill road climbs from the valley floor to the village gate without being buried', () => {
  const { approach } = terrain;
  const villageTop = terrain.villageTier * terrain.TIER_HEIGHT;
  assert.ok(Math.abs(approach.height(0) - villageTop) < 1e-9, 'the road starts level with the village terrace');
  assert.equal(approach.height(approach.length), terrain.VALLEY_FLOOR, 'the road ends on the valley floor');
  const gateway = approach.at(0);
  assert.ok(terrain.inVillage(Math.round(gateway.x), Math.round(gateway.y - 0.5)), 'the road starts at the village edge');
  let previous = Infinity;
  for (let along = 0; along <= approach.length; along += 0.2) {
    const height = approach.height(along);
    assert.ok(height <= previous + 1e-9, `the road climbs back up at ${along.toFixed(1)}`);
    previous = height;
    const at = approach.at(along);
    if (!terrain.exists(Math.round(at.x), Math.round(at.y))) {
      assert.ok(terrain.hillside(at.x, at.y) <= height + 1e-9, `the hillside buries the road at ${along.toFixed(1)}`);
    }
  }
  // From the player's camera the road is seen leaving the archway and running off the bottom of the screen.
  const camera = placeCamera(new THREE.PerspectiveCamera(40, 16 / 10, 0.1, 500), CAMERA_PRESETS.default);
  const onScreen = (along) => {
    const at = approach.at(along);
    const point = mapView.toWorld(at.x, at.y).setY(approach.height(along));
    const inFront = point.clone().applyMatrix4(camera.matrixWorldInverse).z < 0;
    const ndc = point.project(camera);
    return { inFront, x: ndc.x, y: ndc.y };
  };
  const start = onScreen(0);
  assert.ok(start.inFront && Math.abs(start.x) < 1 && Math.abs(start.y) < 1, 'the road starts on screen at the archway');
  let exits = false;
  for (let along = 0; along <= approach.length; along += 0.2) {
    const point = onScreen(along);
    if (point.inFront && point.y < -1 && Math.abs(point.x) < 1) exits = true;
  }
  assert.ok(exits, 'the road runs off the bottom of the screen towards the valley');
  assert.ok(!terrain.exists(Math.round(approach.at(3).x), Math.round(approach.at(3).y)), 'no ring tile sits on the road');
});

test('the hill is grounded: the hillside meets the foot of the cliffs all around', () => {
  for (const tile of terrain.tiles()) {
    for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      if (terrain.exists(tile.col + dc, tile.row + dr)) continue;
      const foot = terrain.hillside(tile.col + dc * 0.7, tile.row + dr * 0.7);
      assert.ok(foot > terrain.VALLEY_FLOOR + 1, `the cliff at ${tile.col},${tile.row} drops straight to the valley floor`);
      assert.ok(foot < tile.top, `the hillside rises above tile ${tile.col},${tile.row}`);
    }
  }
});

test('picking returns the tile a real ray cast hits first', () => {
  const camera = placeCamera(new THREE.PerspectiveCamera(40, 16 / 10, 0.1, 500), CAMERA_PRESETS.default);
  const ray = new THREE.Ray();
  for (let row = 0; row < map.rows; row++) {
    for (let col = 0; col < map.columns; col++) {
      const target = mapView.toWorld(col + 0.2, row - 0.25).setY(terrain.heightAt(col + 0.2, row - 0.25));
      ray.set(camera.position, target.clone().sub(camera.position).normalize());
      assert.deepEqual({ ...mapView.pickTile(ray) }, { col, row }, `picking near the centre of ${col},${row}`);
    }
  }
  ray.set(camera.position, new THREE.Vector3(0, 1, 0));
  assert.equal(mapView.pickTile(ray), null, 'the sky picks nothing');
});
