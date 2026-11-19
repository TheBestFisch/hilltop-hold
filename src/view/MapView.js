(() => {
  'use strict';

  const { catalog, modelKit, animation, hash1, createTerrain, ASSAULT, VILLAGE_PLAN, sceneryModels } = Hold;
  const { mat, box, rampBox, cone, dodeca, octa, bakedMaterial, mergeGeometry, shade, mix, PALETTE } = modelKit;

  const GRASS = [PALETTE.grass, PALETTE.grassDark, PALETTE.grassLight];
  const PATH = [PALETTE.path, PALETTE.pathLight, 0xd0ae80];
  const SOIL_BAND = 0.45;
  /**
   * A sea of clouds around the foot of the hill: [x, y, z, variant, drift
   * axis] in world units. Every cloud stays below y = 0, the lowest tile top,
   * so it can never come between the camera (above) and the battlefield;
   * the drift lanes keep them clear of the hillside (see tests/scene.test.js).
   */
  const CLOUDS = [
    [-20, -1.7, -16, 1, 'x'], [2, -1.9, -19, 2, 'x'], [18, -1.6, -17, 0, 'x'], [-6, -1.8, -22, 0, 'x'],
    [-22, -1.8, -4, 2, 'z'], [-25, -1.6, 12, 0, 'z'], [23, -1.7, -6, 1, 'z'], [26, -1.9, 10, 2, 'z'],
    [-12, -1.7, 19, 1, 'x'], [16, -1.8, 22, 0, 'x'],
  ];
  const CLOUD_DRIFT = 0.25;
  const CLOUD_WRAP = 34;
  const HILLSIDE_STEP = 0.5;
  /** Props short enough to stand on the camera side of the hill without hiding any tile. */
  const SHORT_PROPS = new Set(['scenery:rock:0', 'scenery:rock:2', 'scenery:bush:0', 'scenery:bush:1', 'scenery:stump', 'scenery:mushrooms', 'scenery:flowers:0']);

  /** The gatehouse stands this far past the gate tile's centre, so its door's face is where the simulation's invaders meet it. */
  const GATEHOUSE_OFFSET = ASSAULT.gateFace + sceneryModels.GATE_DOOR.z + sceneryModels.GATE_DOOR.depth / 2;
  /** Stair steps are about this tall; the flight ends in a landing this deep, level with the wall walk. */
  const STAIR = { step: 0.13, landing: 0.15, width: 0.3 };
  /** Props scattered around the cave mouth, relative to the spawn. */
  const CAVE_PROPS = [
    { id: 'scenery:rock:1', at: [-0.9, -1.9], rotation: 0.4 },
    { id: 'scenery:rock:0', at: [-1.2, 2.2], rotation: 2.1 },
    { id: 'scenery:tree:0', at: [-3.4, 2.3], rotation: 0 },
    { id: 'scenery:tree:0', at: [-3.1, -1.6], rotation: 0.7 },
    { id: 'scenery:signpost', at: [-0.4, 1.4], rotation: 0.5 },
    { id: 'scenery:mushrooms', at: [-0.7, -1.0], rotation: 0 },
  ];
  /** Outer ring decoration: weighted choice by hash. */
  const RING_PROPS = [
    ['scenery:tree:0', 3], ['scenery:tree:1', 3], ['scenery:tree:2', 2], ['scenery:rock:0', 1], ['scenery:rock:1', 1],
    ['scenery:rock:2', 1], ['scenery:bush:0', 2], ['scenery:bush:1', 1], ['scenery:stump', 1], ['scenery:mushrooms', 1], ['scenery:flowers:0', 1],
  ];

  /**
   * Static map: the tiered hill, road, scenery, the cave at the spawn and the
   * village behind the gate. Also owns the placement marker, the ghost tower
   * preview and the range ring used while building, and answers where the
   * ground is (`heightAt`, `tileTop`) and which tile a ray hits (`pickTile`).
   * Converts tile coordinates (col, row) to world space with `toWorld`.
   * The village (laid out by VILLAGE_PLAN) is listed in `village`: its
   * gate, walls and buildings, the height of each wall walk (`levels`) and
   * the stairs up to them, for the VillageView, which brings it to life.
   */
  class MapView {
    #animated = [];
    #clouds = [];
    #time = 0;
    #tileDecor = new Map();
    #ghost = { model: null, type: null };
    #scratch = new THREE.Vector3();
    #tiles;

    constructor(map) {
      this.map = map;
      this.terrain = createTerrain(map);
      this.#tiles = [...this.terrain.tiles()];
      this.group = new THREE.Group();
      this.decor = new THREE.Group();
      this.group.add(this.decor);
      this.#buildTerrain();
      this.#buildValley();
      this.#buildApproach();
      this.#buildDecoration();
      this.#buildProps();
      this.#buildCave();
      this.#buildVillage();
      this.#buildClouds();
      this.marker = this.#buildMarker();
      this.rangeRing = this.#buildRangeRing();
      this.ghosts = new THREE.Group();
      this.group.add(this.marker, this.rangeRing, this.ghosts);
      this.#animated = animation.collect(this.group);
    }

    // Coordinates and heights

    toWorld(x, y, target = new THREE.Vector3()) {
      return target.set(x - (this.map.columns - 1) / 2, 0, y - (this.map.rows - 1) / 2);
    }

    /** Inverse of `toWorld` for the horizontal plane. */
    toTile(position) {
      return { x: position.x + (this.map.columns - 1) / 2, y: position.z + (this.map.rows - 1) / 2 };
    }

    /** Ground height (world y) at tile coordinates. */
    heightAt(x, y) {
      return this.terrain.heightAt(x, y);
    }

    tileTop(col, row) {
      return this.terrain.tileTop(col, row);
    }

    pathHeight(distance) {
      return this.terrain.pathHeight(distance);
    }

    /** Ground under an invader: the road's profile while it is on the road, the ground itself once it is in the village. */
    groundUnder(enemy) {
      return enemy.state === 'sack' ? this.heightAt(enemy.x, enemy.y) : this.pathHeight(enemy.distance);
    }

    /**
     * The map tile a world-space ray hits first, honouring tile heights so a
     * raised tile in front hides the lower one behind it. Returns null for
     * the surrounding scenery or the sky.
     */
    pickTile(ray) {
      let best = null;
      const origin = this.toTile(ray.origin);
      const direction = ray.direction;
      if (direction.y >= 0) return null;
      for (const tile of this.#tiles) {
        // Intersect the ray with the plane of this tile's top (use the centre height for ramps).
        const t = (tile.top - ray.origin.y) / direction.y;
        if (t < 0 || (best && t >= best.t)) continue;
        const x = origin.x + direction.x * t;
        const y = origin.y + direction.z * t;
        if (Math.abs(x - tile.col) > 0.5 || Math.abs(y - tile.row) > 0.5) continue;
        best = { t, col: tile.col, row: tile.row, inMap: tile.inMap };
      }
      return best?.inMap ? { col: best.col, row: best.row } : null;
    }

    // Build-time overlays

    /** Highlights a tile; `valid` colours it green (buildable) or red. */
    showMarker(col, row, valid) {
      this.marker.visible = true;
      this.toWorld(col, row, this.marker.position);
      this.marker.position.y = this.tileTop(col, row) + 0.015;
      const color = valid ? 0xfff6d8 : 0xe0604c;
      this.marker.material.color.setHex(color);
      this.marker.children[0].material.color.setHex(color);
    }

    hideMarker() {
      this.marker.visible = false;
    }

    /** Translucent preview of the tower about to be built. */
    showGhost(type, col, row, valid) {
      if (this.#ghost.type !== type) {
        this.ghosts.clear();
        const model = catalog.build(`tower:${type}:0`);
        model.traverse((node) => {
          if (!node.isMesh) return;
          node.material = GHOST.valid;
          node.castShadow = false;
          node.receiveShadow = false;
        });
        this.ghosts.add(model);
        this.#ghost = { model, type };
      }
      const { model } = this.#ghost;
      model.visible = true;
      this.toWorld(col, row, model.position);
      model.position.y = this.tileTop(col, row);
      model.traverse((node) => {
        if (node.isMesh) node.material = valid ? GHOST.valid : GHOST.invalid;
      });
    }

    hideGhost() {
      if (this.#ghost.model) this.#ghost.model.visible = false;
    }

    /** Range circle draped over the terrain around a tile. */
    showRange(col, row, range) {
      const ring = this.rangeRing;
      ring.visible = true;
      const position = ring.geometry.attributes.position;
      const polar = ring.geometry.userData.polar;
      for (let i = 0; i < polar.length; i++) {
        const [r, angle] = polar[i];
        const x = col + Math.cos(angle) * r * range;
        const y = row + Math.sin(angle) * r * range;
        this.toWorld(x, y, this.#scratch);
        position.setXYZ(i, this.#scratch.x, this.terrain.heightAt(x, y) + 0.04, this.#scratch.z);
      }
      position.needsUpdate = true;
      ring.geometry.computeBoundingSphere();
    }

    hideRange() {
      this.rangeRing.visible = false;
    }

    /** Hides grass and flowers under a tower so nothing pokes through its footing. */
    setTileOccupied(col, row, occupied) {
      const decor = this.#tileDecor.get(`${col},${row}`);
      if (!decor) return;
      for (const { mesh, index, matrix } of decor) {
        mesh.setMatrixAt(index, occupied ? HIDDEN : matrix);
        mesh.instanceMatrix.needsUpdate = true;
      }
    }

    /** Ambient motion: clouds drift, flames flicker, sails turn. `dt` in seconds. */
    update(dt) {
      this.#time += dt;
      animation.apply(this.#animated, { time: this.#time });
      for (const cloud of this.#clouds) {
        const axis = cloud.userData.drift;
        cloud.position[axis] += CLOUD_DRIFT * dt;
        if (cloud.position[axis] > CLOUD_WRAP) cloud.position[axis] = -CLOUD_WRAP;
      }
    }

    // Construction

    /** One merged mesh for every tile: grass or road cap, then soil and rock down to the valley. */
    #buildTerrain() {
      const { terrain } = this;
      const entries = [];
      const matrix = new THREE.Matrix4();
      const unit = box(1, 1, 1);
      const place = (geometry, color, x, yBottom, z, height) => {
        matrix.makeScale(1, height, 1).setPosition(x, yBottom + height / 2, z);
        entries.push({ geometry, matrix: matrix.clone(), color });
      };

      for (const tile of terrain.tiles()) {
        const { col, row } = tile;
        const world = this.toWorld(col, row);
        const seed = hash1(col * 53 + row * 977 + 11, 3);
        let base = tile.top - terrain.CAP;
        if (tile.path) {
          const corners = terrain.cornerHeights(col, row);
          base = Math.min(...corners) - terrain.CAP;
          const cap = rampBox(1, 1, corners.map((height) => height - base));
          matrix.makeTranslation(world.x, base, world.z);
          entries.push({ geometry: cap, matrix: matrix.clone(), color: PATH[Math.floor(seed * PATH.length)] });
        } else {
          // Battlefield tiles are a soft checkerboard (so the grid reads for building) with a little
          // per-tile variation and a lighter tint per tier; the surrounding ring is muted so the
          // playable area stands out.
          const tint = (1 + (tile.tier ?? 0) * 0.05) * (0.97 + seed * 0.06);
          let color = shade(tile.inMap ? GRASS[(col + row) % 2] : GRASS[Math.floor(seed * 3)], tint);
          if (tile.cave) color = mix(color, PALETTE.rock, 0.35);
          else if (!tile.inMap && !tile.village) color = mix(color, 0x5e7d45, 0.45);
          place(unit, color, world.x, base, world.z, terrain.CAP);
        }
        // Skip the strata when every neighbour is at least as high: nothing could be seen.
        const exposed = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dc, dr]) => terrain.tileTop(col + dc, row + dr) < tile.top);
        if (!exposed) continue;
        const edge = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dc, dr]) => !terrain.exists(col + dc, row + dr));
        place(unit, tile.path ? PALETTE.soilWet : PALETTE.soil, world.x, base - SOIL_BAND, world.z, SOIL_BAND);
        const rockTop = base - SOIL_BAND;
        if (edge) {
          // Cliff face down to the valley, in two bands so strata read.
          const bandA = 0.9 + seed * 0.4;
          place(unit, PALETTE.cliff, world.x, rockTop - bandA, world.z, bandA);
          place(unit, PALETTE.cliffDark, world.x, terrain.VALLEY_FLOOR - 0.2, world.z, rockTop - bandA - terrain.VALLEY_FLOOR + 0.2);
        } else {
          place(unit, PALETTE.cliff, world.x, rockTop - 0.8, world.z, 0.8);
        }
      }
      const mesh = new THREE.Mesh(mergeGeometry(entries), bakedMaterial());
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.group.add(mesh);
    }

    /**
     * Everything below the plateau: a hillside that slopes from the foot of
     * the cliffs down to the valley (so the hill sits on the land instead of
     * floating), the lake in its basin, the far floor, rolling hills and a
     * forest. The hillside is a flat-shaded heightfield coloured by slope.
     */
    #buildValley() {
      const { terrain } = this;
      const floor = new THREE.Mesh(new THREE.PlaneGeometry(400, 400).rotateX(-Math.PI / 2), mat(0x6f9d4f));
      floor.position.y = terrain.VALLEY_FLOOR - 0.03;
      floor.receiveShadow = true;
      this.group.add(floor);
      this.group.add(this.#buildHillside());

      const { lake } = terrain;
      const water = new THREE.Mesh(new THREE.CircleGeometry(lake.radius + 0.7, 28).rotateX(-Math.PI / 2), mat(PALETTE.water, { shine: 0.7, opacity: 0.88 }));
      this.toWorld(lake.x, lake.y, water.position);
      water.position.y = lake.level;
      water.receiveShadow = true;
      this.group.add(water);

      // Rolling hills and a forest around the valley, merged into one mesh.
      const entries = [];
      const matrix = new THREE.Matrix4();
      const hill = modelKit.sphere(1);
      const hills = [[-26, -18, 10, 1.8], [8, -26, 13, 2.2], [30, -14, 11, 2.0], [32, 14, 9, 1.6], [-32, 6, 10, 1.8], [-22, 28, 9, 1.5], [40, -2, 15, 2.6], [-14, -30, 12, 2.0]];
      for (const [index, [x, z, radius, height]] of hills.entries()) {
        matrix.makeScale(radius, height, radius * 0.85).setPosition(x, terrain.VALLEY_FLOOR - 0.6, z);
        entries.push({ geometry: hill, matrix: matrix.clone(), color: index % 2 ? 0x6a9a4c : 0x7aa85a });
      }
      const tree = cone(6);
      const trunk = box(1, 1, 1);
      for (let i = 0; i < 260; i++) {
        const angle = hash1(i, 21) * Math.PI * 2;
        const radius = 12 + hash1(i, 22) * 30;
        const x = Math.cos(angle) * radius + 1;
        const z = Math.sin(angle) * radius + 2;
        const tile = this.toTile({ x, z });
        if (terrain.exists(Math.round(tile.x), Math.round(tile.y))) continue;
        if (terrain.approach.nearest(tile.x, tile.y).gap < 1.6) continue;
        if (Math.hypot(tile.x - terrain.lake.x, tile.y - terrain.lake.y) < terrain.lake.radius + 1.2) continue;
        const ground = terrain.heightAt(tile.x, tile.y);
        const size = 0.35 + hash1(i, 23) * 0.45;
        matrix.makeScale(size, size * 2.2, size).setPosition(x, ground + size * 1.3, z);
        entries.push({ geometry: tree, matrix: matrix.clone(), color: i % 3 ? PALETTE.leafDark : PALETTE.leaf });
        matrix.makeScale(size * 0.18, size * 0.5, size * 0.18).setPosition(x, ground + size * 0.2, z);
        entries.push({ geometry: trunk, matrix: matrix.clone(), color: PALETTE.woodDark });
      }
      const mesh = new THREE.Mesh(mergeGeometry(entries), bakedMaterial());
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.group.add(mesh);
    }

    /** Flat-shaded heightfield of the hillside, coloured grass, scree and road shoulders. */
    #buildHillside() {
      const { terrain } = this;
      const { bounds } = terrain;
      const step = HILLSIDE_STEP;
      const x0 = bounds.minCol - 13;
      const x1 = bounds.maxCol + 13;
      const y0 = bounds.minRow - 13;
      const y1 = bounds.maxRow + 26;
      const columns = Math.round((x1 - x0) / step);
      const rows = Math.round((y1 - y0) / step);
      const heights = new Float32Array((columns + 1) * (rows + 1));
      for (let j = 0; j <= rows; j++) {
        for (let i = 0; i <= columns; i++) heights[j * (columns + 1) + i] = terrain.hillside(x0 + i * step, y0 + j * step);
      }
      const positions = [];
      const colors = [];
      const color = new THREE.Color();
      const world = new THREE.Vector3();
      const vertex = (i, j) => {
        const x = x0 + i * step;
        const y = y0 + j * step;
        this.toWorld(x, y, world);
        return [world.x, heights[j * (columns + 1) + i], world.z, x, y];
      };
      const push = (v) => {
        positions.push(v[0], v[1], v[2]);
        colors.push(color.r, color.g, color.b);
      };
      // Each quad gets one colour from its overall gradient, so banks read as clean bands.
      const quadColor = (a, b, c, d) => {
        const cx = (a[3] + d[3]) / 2;
        const cy = (a[4] + d[4]) / 2;
        const gradient = Math.max(Math.abs(b[1] - a[1]), Math.abs(c[1] - a[1]), Math.abs(d[1] - b[1]), Math.abs(d[1] - c[1])) / step;
        const high = Math.max(a[1], b[1], c[1], d[1]);
        const low = Math.min(a[1], b[1], c[1], d[1]);
        const seed = hash1(Math.round(cx * 2) * 131 + Math.round(cy * 2), 31);
        if (terrain.approach.nearest(cx, cy).gap < terrain.approach.halfWidth + 0.3) return 0xb89668;
        if (low < terrain.lake.level + 0.02) return 0xd9c98f;
        if (gradient > 1.35) return seed > 0.5 ? PALETTE.cliff : PALETTE.rockDark;
        const grass = mix(seed > 0.5 ? 0x7fb25a : 0x76aa53, 0x5e8f45, Math.min(1, (terrain.MOUND_TOP - high) / 2.5));
        return gradient > 0.7 ? shade(grass, 0.88) : grass;
      };
      for (let j = 0; j < rows; j++) {
        for (let i = 0; i < columns; i++) {
          const a = vertex(i, j);
          const b = vertex(i + 1, j);
          const c = vertex(i, j + 1);
          const d = vertex(i + 1, j + 1);
          const cx = (a[3] + d[3]) / 2;
          const cy = (a[4] + d[4]) / 2;
          // Quads hidden inside the plateau are skipped.
          if (terrain.exists(Math.round(cx), Math.round(cy)) && terrain.distanceToHill(cx, cy) === 0) continue;
          color.setHex(quadColor(a, b, c, d));
          // Alternate the diagonal so the low-poly facets do not line up.
          const triangles = (i + j) % 2 ? [a, c, b, b, c, d] : [a, c, d, a, d, b];
          for (const v of triangles) push(v);
        }
      }
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
      geometry.computeVertexNormals();
      const mesh = new THREE.Mesh(geometry, bakedMaterial());
      mesh.receiveShadow = true;
      mesh.castShadow = true;
      mesh.userData.hillside = true;
      return mesh;
    }

    /**
     * The road from the valley up to the village's south archway: a dirt
     * ribbon with shoulders and kerb stones on its embankment, with lanterns
     * on the climb, a railing on the drop side, a signpost and a cart below.
     */
    #buildApproach() {
      const { terrain } = this;
      const { approach } = terrain;
      const samples = [];
      for (let along = 0; along < approach.length; along += 0.25) samples.push(along);
      samples.push(approach.length);
      const positions = [];
      const colors = [];
      const color = new THREE.Color();
      const left = new THREE.Vector3();
      const right = new THREE.Vector3();
      const edges = samples.map((along) => {
        const at = approach.at(along);
        const ahead = approach.at(Math.min(approach.length, along + 0.3));
        const behind = approach.at(Math.max(0, along - 0.3));
        const heading = Math.atan2(ahead.x - behind.x, ahead.y - behind.y);
        const side = { x: Math.cos(heading), y: -Math.sin(heading) };
        const height = approach.height(along) + 0.03;
        const w = approach.halfWidth;
        return {
          along,
          height,
          left: this.toWorld(at.x - side.x * w, at.y - side.y * w, left.clone()).setY(height),
          right: this.toWorld(at.x + side.x * w, at.y + side.y * w, right.clone()).setY(height),
          side,
          at,
        };
      });
      const quad = (a, b, c, d, hex) => {
        color.setHex(hex);
        for (const v of [a, c, b, b, c, d]) {
          positions.push(v.x, v.y, v.z);
          colors.push(color.r, color.g, color.b);
        }
      };
      for (let i = 1; i < edges.length; i++) {
        const p = edges[i - 1];
        const q = edges[i];
        const tone = hash1(i, 41) > 0.5 ? PALETTE.path : 0xd0ae80;
        quad(p.left, p.right, q.left, q.right, tone);
        // Skirts down to the embankment so the road never shows a gap beneath.
        quad(p.left.clone().setY(p.height - 0.25), p.left, q.left.clone().setY(q.height - 0.25), q.left, PALETTE.soil);
        quad(p.right, p.right.clone().setY(p.height - 0.25), q.right, q.right.clone().setY(q.height - 0.25), PALETTE.soil);
      }
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
      geometry.computeVertexNormals();
      const road = new THREE.Mesh(geometry, bakedMaterial());
      road.receiveShadow = true;
      road.userData.approach = true;
      this.group.add(road);

      // Kerb stones along both edges.
      const kerbs = [];
      edges.forEach((edge, index) => {
        if (index % 2) return;
        for (const point of [edge.left, edge.right]) {
          kerbs.push({ key: 'approach', x: point.x, y: point.y - 0.02, z: point.z, seed: hash1(index * 3 + (point === edge.left ? 1 : 2), 42) });
        }
      });
      this.#instance(dodeca(), kerbs, (entry) => ({ scale: 0.06 + entry.seed * 0.03, color: entry.seed > 0.5 ? PALETTE.rockLight : PALETTE.rock, rotation: entry.seed * 6 }));

      // Props along the road, placed beside it at `offset` tiles (negative = left).
      const beside = (id, along, offset, turn = 0, scale = 1) => {
        const at = approach.at(along);
        const side = { x: Math.cos(at.heading), y: -Math.sin(at.heading) };
        const x = at.x + side.x * offset;
        const y = at.y + side.y * offset;
        const model = catalog.instance(id);
        this.toWorld(x, y, model.position);
        model.position.y = terrain.heightAt(x, y);
        model.rotation.y = at.heading + turn;
        model.scale.multiplyScalar(scale);
        this.group.add(model);
      };
      for (const [along, offset] of [[2.2, 0.7], [5.5, -0.7], [8.8, 0.7], [12.2, -0.7], [15.5, 0.7]]) beside('scenery:lamp', along, offset, offset > 0 ? Math.PI / 2 : -Math.PI / 2);
      for (let along = 1.2; along < 10; along += 1) beside('scenery:fence', along, 0.72, Math.PI / 2, 1);
      beside('scenery:signpost', 17.2, -0.85, Math.PI / 2);
      beside('scenery:cart', 20.5, 1.1, 0.2);
      beside('scenery:hay', 21.4, 1.6, 0.6);
      for (let along = 17; along < approach.length - 2; along += 2.3) {
        const offset = (hash1(Math.round(along * 10), 43) > 0.5 ? 1 : -1) * (1.7 + hash1(Math.round(along * 10), 44) * 1.2);
        beside(`scenery:tree:${Math.floor(hash1(Math.round(along * 10), 45) * 3)}`, along, offset, along);
      }
    }

    /** Instanced grass tufts, flowers and road pebbles; remembered per tile so towers can hide them. */
    #buildDecoration() {
      const { terrain } = this;
      const tufts = [];
      const flowers = [];
      const pebbles = [];
      for (const tile of terrain.tiles()) {
        const { col, row } = tile;
        const key = `${col},${row}`;
        const count = tile.path ? 0 : 1 + Math.floor(hash1(col * 7 + row * 131, 9) * 3);
        for (let i = 0; i < count; i++) {
          const dx = (hash1(col * 97 + row * 13 + i * 1000, 10) - 0.5) * 0.84;
          const dy = (hash1(col * 31 + row * 71 + i * 1000, 11) - 0.5) * 0.84;
          const x = col + dx;
          const y = row + dy;
          const world = this.toWorld(x, y);
          const entry = { key, x: world.x, y: terrain.heightAt(x, y, tile), z: world.z, seed: hash1(col * 3 + row * 17 + i, 12) };
          if (tile.inMap && !tile.village && !tile.cave && entry.seed > 0.82) flowers.push(entry);
          else tufts.push(entry);
        }
        if (tile.path) {
          const pebbleCount = Math.floor(hash1(col * 11 + row * 5, 13) * 3);
          for (let i = 0; i < pebbleCount; i++) {
            const x = col + (hash1(col + row * 91 + i * 77, 14) - 0.5) * 0.8;
            const y = row + (hash1(col * 5 + row + i * 33, 15) - 0.5) * 0.8;
            const world = this.toWorld(x, y);
            pebbles.push({ key, x: world.x, y: terrain.heightAt(x, y, tile), z: world.z, seed: hash1(i + col * 9 + row, 16) });
          }
        }
      }
      const tuftGeometry = modelKit.geo('tuft', () => mergeGeometry([0, 1, 2].map((i) => ({
        geometry: cone(4),
        matrix: new THREE.Matrix4().makeScale(0.05, 0.18, 0.05).setPosition(Math.cos(i * 2.1) * 0.05, 0.08, Math.sin(i * 2.1) * 0.05),
        color: 0xffffff,
      }))));
      this.#instance(tuftGeometry, tufts, (entry) => ({ scale: 0.7 + entry.seed * 0.8, color: entry.seed > 0.5 ? PALETTE.grassDark : shade(PALETTE.grassLight, 0.92), rotation: entry.seed * 6 }));
      this.#instance(octa(), flowers, (entry) => ({ scale: 0.045, color: PALETTE.flower[Math.floor(entry.seed * 4) % 4], lift: 0.1 }), { shadow: false });
      this.#instance(box(0.015, 0.1, 0.015), flowers, () => ({ scale: 1, color: PALETTE.leaf, lift: 0.05 }), { shadow: false });
      this.#instance(dodeca(), pebbles, (entry) => ({ scale: 0.035 + entry.seed * 0.03, color: entry.seed > 0.5 ? PALETTE.rockLight : PALETTE.rock, rotation: entry.seed * 6 }));
    }

    #instance(geometry, entries, style, { shadow = true } = {}) {
      if (!entries.length) return;
      const mesh = new THREE.InstancedMesh(geometry, new THREE.MeshStandardMaterial({ flatShading: true, roughness: 0.95 }), entries.length);
      mesh.castShadow = shadow;
      mesh.receiveShadow = shadow;
      const matrix = new THREE.Matrix4();
      const color = new THREE.Color();
      const quaternion = new THREE.Quaternion();
      const axis = new THREE.Vector3(0, 1, 0);
      entries.forEach((entry, index) => {
        const { scale, color: hex, rotation = 0, lift = 0 } = style(entry);
        quaternion.setFromAxisAngle(axis, rotation);
        matrix.compose(new THREE.Vector3(entry.x, entry.y + lift, entry.z), quaternion, new THREE.Vector3(scale, scale, scale));
        mesh.setMatrixAt(index, matrix);
        mesh.setColorAt(index, color.setHex(hex));
        if (!this.#tileDecor.has(entry.key)) this.#tileDecor.set(entry.key, []);
        this.#tileDecor.get(entry.key).push({ mesh, index, matrix: matrix.clone() });
      });
      this.decor.add(mesh);
    }

    /** Trees and rocks on the map's T/R tiles, and a hash-picked prop on outer ring tiles. */
    #buildProps() {
      const { terrain, map } = this;
      for (const tile of terrain.tiles()) {
        const { col, row } = tile;
        if (tile.village || tile.cave || tile.path) continue;
        const seed = hash1(col * 19 + row * 283 + 7, 8);
        let id = null;
        let scale = 1;
        if (tile.inMap) {
          const char = map.tileAt(col, row);
          if (char === 'T') id = `scenery:tree:${Math.floor(seed * 3)}`;
          else if (char === 'R') id = `scenery:rock:${Math.floor(seed * 3)}`;
          else continue;
        } else {
          if (seed > 0.34) continue;
          const total = RING_PROPS.reduce((sum, [, weight]) => sum + weight, 0);
          let roll = hash1(col * 41 + row * 59, 17) * total;
          for (const [candidate, weight] of RING_PROPS) {
            roll -= weight;
            if (roll < 0) { id = candidate; break; }
          }
          scale = 0.85 + hash1(col + row * 3, 18) * 0.35;
          // On the camera side of the hill only short props, so nothing hides a battlefield tile.
          if (row >= map.rows && !SHORT_PROPS.has(id)) id = [...SHORT_PROPS][Math.floor(seed * 10) % SHORT_PROPS.size];
        }
        this.#place(id, col + (tile.inMap ? 0 : (seed - 0.3) * 0.5), row + (tile.inMap ? 0 : (seed - 0.3) * 0.4), seed * Math.PI * 2, scale);
      }
    }

    #buildCave() {
      const { spawn } = this.map;
      this.#place('scenery:cave', spawn.col - 1.45, spawn.row, Math.PI / 2, 1.05);
      for (const prop of CAVE_PROPS) this.#place(prop.id, spawn.col + prop.at[0], spawn.row + prop.at[1], prop.rotation, 1);
    }

    #buildVillage() {
      const { gate } = this.map;
      const walls = VILLAGE_PLAN.walls.map((wall) => ({
        at: wall.at,
        model: this.#place('scenery:wall', gate.col + wall.at[0], gate.row + wall.at[1], wall.rotation, 1),
      }));
      const wallAt = ([x, y]) => walls.find(({ at }) => at[0] === x && at[1] === y).model;
      const gatehouse = this.#place('scenery:gate:0', gate.col + GATEHOUSE_OFFSET, gate.row, -Math.PI / 2, 1);
      this.village = {
        gate: gatehouse,
        walls,
        // The gatehouse counts among the buildings too: it can burn.
        buildings: [
          { id: 'scenery:gate:0', name: 'gatehouse', at: [GATEHOUSE_OFFSET, 0], model: gatehouse },
          ...VILLAGE_PLAN.buildings.map((prop) => ({
            id: prop.id,
            name: prop.name ?? null,
            at: prop.at,
            model: this.#place(prop.id, gate.col + prop.at[0], gate.row + prop.at[1], prop.rotation, 1),
          })),
        ],
        levels: Object.fromEntries(VILLAGE_PLAN.stairs.map(({ level, wall }) => [level, wallAt(wall).position.y + sceneryModels.WALL_WALK])),
        stairs: [],
      };
      for (const flight of VILLAGE_PLAN.stairs) this.#buildStairs(flight);
      // Cobbled lanes: gate to keep, and keep down to the south archway and the hill road.
      for (const [dx, dy, length, width, alongY] of VILLAGE_PLAN.lanes) {
        const lane = new THREE.Mesh(alongY ? box(width, 0.04, length) : box(length, 0.04, width), mat(0xcbb592));
        this.toWorld(gate.col + dx, gate.row + dy, lane.position);
        lane.position.y = this.tileTop(gate.col + Math.round(dx), gate.row + Math.round(dy)) + 0.02;
        lane.receiveShadow = true;
        this.group.add(lane);
      }
    }

    /**
     * A flight of stone steps along the inside of a wall, from the terrace
     * at `foot` up to a landing level with the wall walk at `top`, and from
     * the landing onto the walk. Remembered in `village.stairs` so people
     * climbing it can step up it exactly.
     */
    #buildStairs({ level, foot, top }) {
      const { gate } = this.map;
      const from = { x: gate.col + foot[0], y: gate.row + foot[1] };
      const to = { x: gate.col + top[0], y: gate.row + top[1] };
      const bottom = this.heightAt(from.x, from.y);
      const height = this.village.levels[level];
      const length = Math.hypot(to.x - from.x, to.y - from.y);
      const run = length - STAIR.landing;
      const steps = Math.max(2, Math.round((height - bottom) / STAIR.step));
      const along = { x: (to.x - from.x) / length, y: (to.y - from.y) / length };
      const yaw = Math.atan2(along.x, along.y);
      const entries = [];
      const matrix = new THREE.Matrix4();
      const rotation = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
      const unit = box(1, 1, 1);
      const block = (distance, depth, width, top, sideways, color) => {
        const x = from.x + along.x * distance + along.y * sideways;
        const y = from.y + along.y * distance - along.x * sideways;
        const center = this.toWorld(x, y);
        const base = bottom - 0.45;
        matrix.compose(new THREE.Vector3(center.x, (base + top) / 2, center.z), rotation, new THREE.Vector3(width, top - base, depth));
        entries.push({ geometry: unit, matrix: matrix.clone(), color });
      };
      for (let i = 0; i < steps; i++) {
        const depth = run / steps;
        block((i + 0.5) * depth, depth, STAIR.width, bottom + ((height - bottom) * (i + 1)) / steps, 0, i % 2 ? PALETTE.stone : PALETTE.stoneLight);
      }
      // The landing reaches across to the wall walk (towards the wall, on the side away from the village).
      const wallSide = Math.sign(from.x - (gate.col + VILLAGE_PLAN.walls[0].at[0])) || 1;
      block(length - STAIR.landing / 2, STAIR.landing * 2, STAIR.width + 0.22, height, -0.11 * wallSide * Math.sign(along.y || 1), PALETTE.stoneDark);
      const mesh = new THREE.Mesh(mergeGeometry(entries), bakedMaterial());
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.group.add(mesh);
      this.village.stairs.push({ level, foot: { ...from, height: bottom }, top: { ...to, height }, steps, run, length });
    }

    #buildClouds() {
      for (const [x, y, z, variant, drift] of CLOUDS) {
        const cloud = catalog.instance(`scenery:cloud:${variant}`);
        cloud.position.set(x, y, z);
        cloud.rotation.y = hash1(variant + x, 4) * Math.PI;
        cloud.traverse((node) => { node.receiveShadow = false; });
        cloud.userData.cloud = true;
        cloud.userData.drift = drift;
        this.group.add(cloud);
        this.#clouds.push(cloud);
      }
    }

    /** Bakes a catalog model and places it at tile coordinates on the ground. */
    #place(id, x, y, rotation, scale) {
      const model = catalog.instance(id);
      this.toWorld(x, y, model.position);
      model.position.y = this.terrain.heightAt(x, y);
      model.rotation.y = rotation;
      model.scale.multiplyScalar(scale);
      this.group.add(model);
      return model;
    }

    #buildMarker() {
      const marker = new THREE.Mesh(
        new THREE.PlaneGeometry(0.94, 0.94).rotateX(-Math.PI / 2),
        new THREE.MeshBasicMaterial({ color: 0xfff6d8, transparent: true, opacity: 0.35, depthWrite: false }),
      );
      const frame = new THREE.Mesh(
        new THREE.RingGeometry(0.6, 0.68, 4).rotateX(-Math.PI / 2).rotateY(Math.PI / 4),
        new THREE.MeshBasicMaterial({ color: 0xfff6d8, transparent: true, opacity: 0.9, depthWrite: false }),
      );
      frame.position.y = 0.005;
      marker.add(frame);
      marker.visible = false;
      return marker;
    }

    /** Polar grid mesh whose vertices are draped over the terrain in `showRange`. */
    #buildRangeRing() {
      const rings = 10;
      const segments = 56;
      const polar = [];
      const positions = [];
      const colors = [];
      const index = [];
      for (let r = 0; r <= rings; r++) {
        for (let s = 0; s < segments; s++) {
          polar.push([r / rings, (s / segments) * Math.PI * 2]);
          positions.push(0, 0, 0);
          // Vertex alpha: a crisp rim fading to a faint fill.
          const alpha = r === rings ? 0.95 : r === rings - 1 ? 0.5 : 0.16;
          colors.push(1, 1, 1, alpha);
        }
      }
      for (let r = 0; r < rings; r++) {
        for (let s = 0; s < segments; s++) {
          const a = r * segments + s;
          const b = r * segments + ((s + 1) % segments);
          const c = (r + 1) * segments + s;
          const d = (r + 1) * segments + ((s + 1) % segments);
          index.push(a, c, b, b, c, d);
        }
      }
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 4));
      geometry.setIndex(index);
      geometry.userData.polar = polar;
      const material = new THREE.MeshBasicMaterial({
        color: 0xfff6d8, vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide,
      });
      const ring = new THREE.Mesh(geometry, material);
      ring.frustumCulled = false;
      ring.visible = false;
      ring.renderOrder = 2;
      return ring;
    }
  }

  const GHOST = {
    valid: new THREE.MeshStandardMaterial({ color: 0xbfe8a8, emissive: 0x4c8a3a, emissiveIntensity: 0.5, transparent: true, opacity: 0.6, depthWrite: false, flatShading: true }),
    invalid: new THREE.MeshStandardMaterial({ color: 0xf0a08e, emissive: 0x8a2f22, emissiveIntensity: 0.5, transparent: true, opacity: 0.6, depthWrite: false, flatShading: true }),
  };
  const HIDDEN = new THREE.Matrix4().makeScale(0, 0, 0);

  Object.assign(Hold, { MapView, sceneryLayout: { CAVE_PROPS } });
})();
