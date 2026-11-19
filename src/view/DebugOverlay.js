(() => {
  'use strict';

  const { ENEMIES, TOWERS_BY_ID, modelKit } = Hold;
  const { turretSweep } = modelKit;

  const SPLASH_SECONDS = 0.5;
  const COLORS = { enemy: 0xe0604c, range: 0xffd166, footprint: 0xffd166, sweep: 0x7fd7ff, path: 0xff8c42, grid: 0x7ee787, blocked: 0xe0604c, outer: 0x9aa3b5, pointer: 0xffffff, splash: 0xff8c42 };

  /**
   * Debug drawings over the battlefield, each switchable from the debug
   * menu: the collision shapes the simulation uses (invader circles, tower
   * footprints and ranges, turret sweeps, splash radii), the road draped over
   * the terrain with its tier steps, the tile grid coloured by buildability,
   * and where the pointer ray hits. Lines are drawn on top of everything so
   * nothing hides them.
   */
  class DebugOverlay {
    #layers = { collision: new THREE.Group(), path: new THREE.Group(), grid: new THREE.Group(), pointer: new THREE.Group() };
    #enabled = { collision: false, path: false, grid: false, pointer: false, wireframe: false };
    #enemies = new Map();
    #towers = new Map();
    #splashes = [];
    #materials = Object.fromEntries(Object.entries(COLORS).map(([key, color]) => [key, new THREE.LineBasicMaterial({ color, depthTest: false, transparent: true, opacity: 0.9 })]));
    #unitCircle = circleGeometry(1, 48);
    #unitSquare = squareGeometry(1);
    #pointerMarker;
    #pointerTile;

    constructor({ mapView, units }) {
      this.mapView = mapView;
      this.units = units;
      this.group = new THREE.Group();
      this.group.renderOrder = 10;
      for (const layer of Object.values(this.#layers)) {
        layer.visible = false;
        this.group.add(layer);
      }
      this.#buildPath();
      this.#buildGrid();
      this.#buildPointer();
    }

    get enabled() {
      return { ...this.#enabled };
    }

    /** Turns a layer on or off: `collision`, `path`, `grid`, `pointer` or `wireframe`. */
    set(layer, enabled) {
      if (!(layer in this.#enabled)) return;
      this.#enabled[layer] = enabled;
      if (this.#layers[layer]) this.#layers[layer].visible = enabled;
      if (layer === 'wireframe') this.#applyWireframe(enabled);
    }

    toggle(layer) {
      this.set(layer, !this.#enabled[layer]);
    }

    /** Remembers a splash impact to draw for a moment. */
    splash(x, y, radius) {
      const ring = new THREE.LineLoop(this.#unitCircle, this.#materials.splash);
      this.mapView.toWorld(x, y, ring.position);
      ring.position.y = this.mapView.heightAt(x, y) + 0.05;
      ring.scale.setScalar(radius);
      this.#layers.collision.add(ring);
      this.#splashes.push({ ring, age: 0 });
    }

    /** Where the pointer ray meets the ground and which tile was picked. */
    setPointer(ray, tile) {
      const hit = tile ? this.mapView.toWorld(tile.col, tile.row, this.#pointerTile.position) : null;
      this.#pointerTile.visible = Boolean(hit);
      if (hit) hit.y = this.mapView.tileTop(tile.col, tile.row) + 0.02;
      // The marker sits where the ray crosses the picked tile's plane (or the valley floor).
      const planeY = tile ? this.mapView.tileTop(tile.col, tile.row) : this.mapView.terrain.VALLEY_FLOOR;
      const t = (planeY - ray.origin.y) / ray.direction.y;
      this.#pointerMarker.visible = t > 0;
      if (t > 0) this.#pointerMarker.position.copy(ray.origin).addScaledVector(ray.direction, t);
    }

    update(world, dt) {
      if (this.#enabled.collision) this.#syncCollision(world, dt);
    }

    clear() {
      for (const view of this.#enemies.values()) view.removeFromParent();
      for (const view of this.#towers.values()) view.group.removeFromParent();
      for (const { ring } of this.#splashes) ring.removeFromParent();
      this.#enemies.clear();
      this.#towers.clear();
      this.#splashes = [];
    }

    #syncCollision(world, dt) {
      const layer = this.#layers.collision;
      const seenEnemies = new Set();
      for (const enemy of world.enemies) {
        seenEnemies.add(enemy.id);
        let ring = this.#enemies.get(enemy.id);
        if (!ring) {
          ring = new THREE.LineLoop(this.#unitCircle, this.#materials.enemy);
          ring.scale.setScalar(ENEMIES[enemy.type].radius);
          layer.add(ring);
          this.#enemies.set(enemy.id, ring);
        }
        this.mapView.toWorld(enemy.x, enemy.y, ring.position);
        ring.position.y = this.mapView.groundUnder(enemy) + 0.03;
      }
      for (const [id, ring] of this.#enemies) {
        if (seenEnemies.has(id)) continue;
        ring.removeFromParent();
        this.#enemies.delete(id);
      }

      const seenTowers = new Set();
      for (const tower of world.towers) {
        seenTowers.add(tower.id);
        let view = this.#towers.get(tower.id);
        if (!view || view.level !== tower.level) {
          view?.group.removeFromParent();
          view = { level: tower.level, group: this.#towerShapes(tower) };
          layer.add(view.group);
          this.#towers.set(tower.id, view);
        }
      }
      for (const [id, view] of this.#towers) {
        if (seenTowers.has(id)) continue;
        view.group.removeFromParent();
        this.#towers.delete(id);
      }

      this.#splashes = this.#splashes.filter((splash) => {
        splash.age += dt;
        if (splash.age < SPLASH_SECONDS) return true;
        splash.ring.removeFromParent();
        return false;
      });
    }

    /** Footprint square, range ring and turret sweep circle for one tower. */
    #towerShapes(tower) {
      const group = new THREE.Group();
      this.mapView.toWorld(tower.col, tower.row, group.position);
      const top = this.mapView.tileTop(tower.col, tower.row);
      group.position.y = top;
      const footprint = new THREE.LineLoop(this.#unitSquare, this.#materials.footprint);
      footprint.position.y = 0.02;
      const stats = TOWERS_BY_ID[tower.type].levels[tower.level];
      const range = new THREE.LineLoop(this.#unitCircle, this.#materials.range);
      range.scale.setScalar(stats.range);
      range.position.y = 0.02;
      group.add(footprint, range);
      const model = this.units.modelOf(tower);
      if (model?.userData.turret) {
        const sweep = turretSweep(model.userData.turret);
        const circle = new THREE.LineLoop(this.#unitCircle, this.#materials.sweep);
        circle.scale.setScalar(sweep.radius);
        circle.position.y = sweep.y - top;
        group.add(circle);
      }
      return group;
    }

    /** The road's centre line draped over the terrain, with a post at every tile centre. */
    #buildPath() {
      const { mapView } = this;
      const { path } = mapView.map;
      const points = [];
      for (let d = 0; d <= path.length; d += 0.1) {
        const at = path.positionAt(d);
        const world = mapView.toWorld(at.x, at.y);
        points.push(new THREE.Vector3(world.x, mapView.pathHeight(d) + 0.06, world.z));
      }
      this.#layers.path.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), this.#materials.path));
      const posts = [];
      for (const { x, y } of path.points) {
        const world = mapView.toWorld(x, y);
        const top = mapView.tileTop(x, y);
        posts.push(new THREE.Vector3(world.x, top, world.z), new THREE.Vector3(world.x, top + 0.3 + (mapView.terrain.tierAt(x, y) ?? 0) * 0.15, world.z));
      }
      this.#layers.path.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(posts), this.#materials.path));
    }

    /** Every tile outlined at its own height: green buildable, red blocked, grey outside the map. */
    #buildGrid() {
      const { mapView } = this;
      const buckets = { grid: [], blocked: [], outer: [] };
      for (const tile of mapView.terrain.tiles()) {
        const bucket = !tile.inMap ? 'outer' : mapView.map.tileAt(tile.col, tile.row) === '.' ? 'grid' : 'blocked';
        const world = mapView.toWorld(tile.col, tile.row);
        const corners = tile.path ? mapView.terrain.cornerHeights(tile.col, tile.row) : [tile.top, tile.top, tile.top, tile.top];
        const [a, b, c, d] = corners.map((height) => height + 0.02);
        const p = (dx, dz, y) => new THREE.Vector3(world.x + dx, y, world.z + dz);
        buckets[bucket].push(
          p(-0.5, -0.5, a), p(0.5, -0.5, b), p(0.5, -0.5, b), p(0.5, 0.5, d),
          p(0.5, 0.5, d), p(-0.5, 0.5, c), p(-0.5, 0.5, c), p(-0.5, -0.5, a),
        );
      }
      for (const [bucket, points] of Object.entries(buckets)) {
        if (points.length) this.#layers.grid.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(points), this.#materials[bucket]));
      }
    }

    #buildPointer() {
      this.#pointerMarker = new THREE.Mesh(new THREE.OctahedronGeometry(0.08), new THREE.MeshBasicMaterial({ color: COLORS.pointer, depthTest: false }));
      this.#pointerTile = new THREE.LineLoop(this.#unitSquare, this.#materials.pointer);
      this.#pointerMarker.visible = false;
      this.#pointerTile.visible = false;
      this.#layers.pointer.add(this.#pointerMarker, this.#pointerTile);
    }

    #applyWireframe(enabled) {
      const root = this.group.parent ?? this.group;
      root.traverse((node) => {
        if (node.isMesh && node.material && !node.material.isLineBasicMaterial && node.parent !== this.#layers.pointer) {
          node.material.wireframe = enabled;
        }
      });
    }
  }

  function circleGeometry(radius, segments) {
    const points = Array.from({ length: segments }, (_, i) => {
      const angle = (i / segments) * Math.PI * 2;
      return new THREE.Vector3(Math.cos(angle) * radius, 0, Math.sin(angle) * radius);
    });
    return new THREE.BufferGeometry().setFromPoints(points);
  }

  function squareGeometry(size) {
    const half = size / 2;
    return new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-half, 0, -half), new THREE.Vector3(half, 0, -half), new THREE.Vector3(half, 0, half), new THREE.Vector3(-half, 0, half),
    ]);
  }

  Object.assign(Hold, { DebugOverlay });
})();
