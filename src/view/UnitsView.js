(() => {
  'use strict';

  const { catalog, ENEMIES, ASSAULT, modelKit, animation } = Hold;
  const { box, geo, PALETTE } = modelKit;

  const HOPS_PER_TILE = 3;
  const BOB_HEIGHT = 0.06;
  const BAR_WIDTH = 0.6;
  const IMPACT_HEIGHT = 0.35;
  const CANNON_ARC = 0.9;
  const TURN_RATE = 12;
  /** How quickly invaders turn to a new heading and settle into or out of their stride (per second). */
  const ENEMY_TURN_RATE = 10;
  const STRIDE_RATE = 9;
  /** Share of a blow's cycle spent recovering from the last blow, and where the downswing starts. */
  const SWING = { recover: 0.22, strike: 0.8 };
  const CHEER = { speed: 7, hop: 0.07 };
  /**
   * The torch an invader carries in a fallen village: a stick in the hand
   * of its other arm, burning at `tip` (in the arm's frame), with a small
   * flame; the arm's angle while walking, holding it to a building, and
   * waving it in the square.
   */
  const TORCH = { tip: [0, 0, 0.21], tilt: 0.5, flame: { radius: 0.02, height: 0.2, size: 0.08, smoke: 0.25 }, carry: -1.35, kindle: -1.55, wave: [-1.6, -2.2] };
  const SLOW_TINT = new THREE.Color(0x9fdcf2);
  const PROJECTILE_SHADOW = 0.32;

  /** Soft round shadow texture (alpha falls off from the centre), made in code so nothing is loaded. */
  function blobTexture(size = 64) {
    const data = new Uint8Array(size * size * 4);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const d = Math.hypot(x - size / 2 + 0.5, y - size / 2 + 0.5) / (size / 2);
        const alpha = Math.max(0, 1 - d);
        data[(y * size + x) * 4 + 3] = Math.round(255 * alpha * alpha * (3 - 2 * alpha));
      }
    }
    const texture = new THREE.DataTexture(data, size, size);
    texture.needsUpdate = true;
    return texture;
  }

  /**
   * Contact shadows: a soft dark disc under every invader and projectile.
   * The sun's shadow map gives the long cast shadows; these ground small,
   * fast-moving things and show where a cannonball will land.
   */
  const BLOB = {
    geometry: new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
    material: new THREE.MeshBasicMaterial({
      color: 0x142010, map: blobTexture(), transparent: true, opacity: 0.5, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2,
    }),
  };

  const smooth = (t) => t * t * (3 - 2 * t);
  const lerp = (a, b, t) => a + (b - a) * t;

  /**
   * The pose of an invader battering the gate, from its blow timer: the
   * weapon arm's angle, how far the body leans into the blow and lunges
   * forward, and how far the warlord's horse rears (0–1).
   */
  function assaultPose(enemy, attack) {
    const { rest, raise, hit } = attack;
    if (enemy.repelIn !== null) {
      // Spent: recovering from its last blow as the garrison's stone comes down.
      const k = smooth(Math.min(1, (1 - enemy.repelIn / ASSAULT.garrison) / SWING.recover));
      return { arm: lerp(hit, rest, k), lean: (1 - k) * attack.lean - k * 0.12, lunge: (1 - k) * attack.lunge, rear: 0 };
    }
    if (!enemy.strikeTime) return { arm: rest, lean: 0, lunge: 0, rear: 0 };
    const p = 1 - Math.max(0, enemy.strikeTimer) / enemy.strikeTime;
    const struck = enemy.strikes > 0;
    if (struck && p < SWING.recover) {
      const k = smooth(p / SWING.recover);
      return { arm: lerp(hit, rest, k), lean: (1 - k) * attack.lean, lunge: (1 - k) * attack.lunge, rear: 0 };
    }
    if (p < SWING.strike) {
      const from = struck ? SWING.recover : 0;
      const k = smooth((p - from) / (SWING.strike - from));
      return { arm: lerp(rest, raise, k), lean: -0.4 * k * attack.lean, lunge: 0, rear: k };
    }
    const k = ((p - SWING.strike) / (1 - SWING.strike)) ** 2;
    return { arm: lerp(raise, hit, k), lean: lerp(-0.4 * attack.lean, attack.lean, k), lunge: k * attack.lunge, rear: 1 - k };
  }

  /** Rotates `node` by `angle` about the x axis through (y, z) in its parent, from a rest position `baseY`. */
  function pitchAbout(node, angle, [y, z], baseY = 0) {
    node.rotation.x = angle;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    node.position.y = baseY + y - (y * cos - z * sin);
    node.position.z = z - (y * sin + z * cos);
  }

  /**
   * Draws towers, enemies and projectiles from the World each frame. Models
   * are created when an entity first appears and dropped when it is gone,
   * keyed by entity id. Reads the World; never changes it. Everything is
   * placed on the terrain the map view describes, and animation hooks run
   * on simulated time so they freeze with the simulation.
   *
   * Invaders stride while they move and stand still when they stop. At the
   * gate they batter the door in time with the simulation's blow timer
   * (see `assaultPose`), fidget while they wait their turn, and if the
   * village falls they carry lit torches through it, hold them to the
   * buildings they burn and cheer in the square. Torch flames are drawn by
   * the FireSystem (`fire`).
   */
  class UnitsView {
    #towers = new Map();
    #enemies = new Map();
    #projectiles = new Map();
    #time = 0;
    #barMaterials = {
      back: new THREE.MeshBasicMaterial({ color: 0x2b2118 }),
      fill: new THREE.MeshBasicMaterial({ color: 0x7ccf5a }),
      hurt: new THREE.MeshBasicMaterial({ color: 0xe0604c }),
    };

    constructor({ mapView, camera, fire = null }) {
      this.fire = fire;
      this.mapView = mapView;
      this.camera = camera;
      this.group = new THREE.Group();
    }

    sync(world, dt) {
      this.#time += dt;
      this.#syncTowers(world, dt);
      this.#syncEnemies(world, dt);
      this.#syncProjectiles(world, dt);
    }

    clear() {
      for (const [, view] of this.#towers) this.mapView.setTileOccupied(view.col, view.row, false);
      for (const map of [this.#towers, this.#enemies, this.#projectiles]) {
        for (const view of map.values()) {
          view.model.removeFromParent();
          view.blob?.removeFromParent();
          if (view.flame) this.fire?.remove(view.flame);
        }
        map.clear();
      }
    }

    /** World-space point a tower's shots leave from, given its current aim. */
    muzzleOf(tower, target = new THREE.Vector3()) {
      const view = this.#towers.get(tower.id);
      if (!view) return this.mapView.toWorld(tower.col, tower.row, target).setY(this.mapView.tileTop(tower.col, tower.row) + 0.8);
      const [mx, my, mz] = view.model.userData.muzzle ?? [0, 0.8, 0];
      const aim = view.aim;
      return target.set(
        view.model.position.x + Math.sin(aim) * mz + Math.cos(aim) * mx,
        view.model.position.y + my,
        view.model.position.z + Math.cos(aim) * mz - Math.sin(aim) * mx,
      );
    }

    /** The tower model drawn for a simulation tower, if any. */
    modelOf(tower) {
      return this.#towers.get(tower.id)?.model ?? null;
    }

    #syncTowers(world, dt) {
      const seen = new Set();
      for (const tower of world.towers) {
        seen.add(tower.id);
        let view = this.#towers.get(tower.id);
        if (!view || view.level !== tower.level) {
          view?.model.removeFromParent();
          const model = catalog.instance(`tower:${tower.type}:${tower.level}`);
          this.mapView.toWorld(tower.col, tower.row, model.position);
          model.position.y = this.mapView.tileTop(tower.col, tower.row);
          this.group.add(model);
          this.mapView.setTileOccupied(tower.col, tower.row, true);
          view = { model, level: tower.level, aim: view?.aim ?? tower.aim, col: tower.col, row: tower.row, parts: animation.collect(model) };
          this.#towers.set(tower.id, view);
        }
        const delta = Math.atan2(Math.sin(tower.aim - view.aim), Math.cos(tower.aim - view.aim));
        view.aim += delta * Math.min(1, TURN_RATE * dt);
        view.model.userData.turret.rotation.y = view.aim;
        animation.apply(view.parts, { time: this.#time });
      }
      for (const [id, view] of this.#towers) {
        if (!seen.has(id)) this.mapView.setTileOccupied(view.col, view.row, false);
      }
      this.#dropMissing(this.#towers, seen);
    }

    #syncEnemies(world, dt) {
      const seen = new Set();
      for (const enemy of world.enemies) {
        seen.add(enemy.id);
        let view = this.#enemies.get(enemy.id);
        if (!view) {
          const model = catalog.instance(`enemy:${enemy.type}`);
          const bar = this.#buildHealthBar(model.userData.height ?? 0.55 + ENEMIES[enemy.type].radius * 1.6);
          model.add(bar.group);
          const blob = new THREE.Mesh(BLOB.geometry, BLOB.material);
          blob.scale.setScalar(ENEMIES[enemy.type].radius * 2.6);
          blob.position.y = 0.02;
          blob.userData.bar = true;
          blob.renderOrder = 1;
          model.add(blob);
          model.userData.blob = blob;
          this.group.add(model);
          const parts = animation.collect(model);
          view = {
            model, bar, parts, phase: enemy.id * 1.7, slowed: false,
            limbs: parts.filter(({ hooks }) => hooks.includes('limb')),
            // Walk by distance travelled, so enemies freeze mid-stride when the simulation is paused.
            travel: enemy.distance, x: enemy.x, y: enemy.y, heading: enemy.heading, stride: 1,
          };
          this.#enemies.set(enemy.id, view);
        }
        const { model } = view;
        this.mapView.toWorld(enemy.x, enemy.y, model.position);
        model.position.y = this.mapView.groundUnder(enemy);
        // Tilt the contact shadow with the road so it hugs ramps instead of cutting into them.
        const slope = enemy.state === 'sack' ? 0 : (this.mapView.pathHeight(enemy.distance + 0.1) - this.mapView.pathHeight(enemy.distance - 0.1)) / 0.2;
        model.userData.blob.rotation.x = -Math.atan(slope);

        const moved = Math.hypot(enemy.x - view.x, enemy.y - view.y);
        view.travel += moved;
        view.x = enemy.x;
        view.y = enemy.y;
        const ease = Math.min(1, dt * STRIDE_RATE);
        view.stride += ((moved > 1e-6 ? 1 : 0) - view.stride) * ease;
        const turn = Math.atan2(Math.sin(enemy.heading - view.heading), Math.cos(enemy.heading - view.heading));
        view.heading += turn * Math.min(1, dt * ENEMY_TURN_RATE);
        model.rotation.y = view.heading;

        const walk = view.travel * HOPS_PER_TILE * Math.PI + view.phase;
        const body = model.userData.body;
        body.position.y = Math.abs(Math.sin(walk)) * (model.userData.bob ?? BOB_HEIGHT) * view.stride;
        animation.apply(view.parts, { time: this.#time, walk: walk * 2 });
        // Standing still, the legs come together instead of freezing mid-stride.
        for (const { node, base } of view.limbs) {
          const axis = node.userData.limb.axis ?? 'x';
          node.rotation[axis] = base.rotation[axis] + (node.rotation[axis] - base.rotation[axis]) * view.stride;
        }
        this.#fight(enemy, view);

        const slowed = enemy.slowTimer > 0;
        if (slowed !== view.slowed) {
          view.slowed = slowed;
          this.#tint(model, slowed);
        }

        const ratio = Math.max(0, enemy.hp / enemy.maxHp);
        view.bar.group.visible = ratio < 1 && enemy.state !== 'sack';
        view.bar.fill.scale.x = Math.max(ratio, 0.001);
        view.bar.fill.material = ratio < 0.35 ? this.#barMaterials.hurt : this.#barMaterials.fill;
        view.bar.group.quaternion.copy(model.quaternion).invert().multiply(this.camera.quaternion);
      }
      this.#dropMissing(this.#enemies, seen);
    }

    /** Poses an invader at the gate: battering the door, waiting its turn, or cheering in the fallen village. */
    #fight(enemy, view) {
      const { model } = view;
      const { body, weaponArm, forehand, attack } = model.userData;
      body.rotation.x = 0;
      body.position.z = 0;
      if (forehand) pitchAbout(forehand, 0, attack.pivot);
      if (!weaponArm || !attack) return;
      const time = this.#time + view.phase;
      if (enemy.state === 'assault') {
        const pose = assaultPose(enemy, attack);
        weaponArm.rotation.x = pose.arm;
        if (attack.rear) {
          // The warhorse rears as the lord winds up and crashes its forehooves into the door.
          const rear = -attack.rear * pose.rear;
          pitchAbout(body, rear, attack.pivot, body.position.y);
          pitchAbout(forehand, rear, attack.pivot);
          const paw = Math.sin(time * 14) * 0.7 * pose.rear;
          forehand.children.forEach((leg, index) => { leg.rotation.x = -0.5 * pose.rear + (index % 2 ? paw : -paw); });
        } else {
          body.rotation.x = pose.lean;
        }
        model.position.x += Math.sin(view.heading) * pose.lunge;
        model.position.z += Math.cos(view.heading) * pose.lunge;
      } else if (enemy.state === 'queue') {
        // Waiting a turn at the door: shaking the weapon at the walls now and then.
        weaponArm.rotation.x = attack.rest + (attack.cheer[1] - attack.rest) * 0.25 * Math.max(0, Math.sin(time * 2.6)) * (1 - view.stride);
      } else if (enemy.state === 'sack' && enemy.kindle !== null) {
        // Holding the torch to a building until it catches, leaning into it.
        body.rotation.x = 0.1;
      } else if (enemy.state === 'sack' && enemy.settled) {
        // The village has fallen: they cheer and wave their weapons in the square.
        const beat = Math.sin(time * CHEER.speed);
        weaponArm.rotation.x = lerp(attack.cheer[0], attack.cheer[1], 0.5 + 0.5 * beat);
        body.position.y = Math.abs(Math.sin(time * CHEER.speed * 0.5)) * CHEER.hop * (1 - view.stride);
      }
      this.#torch(enemy, view, time);
    }

    /** Once through the gate of a fallen village an invader carries a lit torch: held up, to a building, or waved. */
    #torch(enemy, view, time) {
      const { offArm } = view.model.userData;
      const lighting = enemy.lighting !== null;
      if (!offArm || (!enemy.torch && !lighting)) return;
      if (!view.stick) {
        // Gripped across the fist, so it stands up when the arm is held out.
        view.stick = new THREE.Group();
        const wood = new THREE.Mesh(box(0.018, 0.018, 0.26), modelKit.mat(PALETTE.woodDark));
        wood.position.z = TORCH.tip[2] - 0.13;
        const wrap = new THREE.Mesh(box(0.032, 0.032, 0.05), modelKit.mat(0x3a2a1e));
        wrap.position.set(...TORCH.tip);
        view.stick.add(wood, wrap);
        view.stick.position.y = -0.16;
        view.stick.rotation.x = TORCH.tilt;
        offArm.add(view.stick);
        view.flame = this.fire?.add({ position: view.model.position, ...TORCH.flame }) ?? null;
      }
      if (lighting) offArm.rotation.x = TORCH.carry;
      else if (enemy.kindle !== null) offArm.rotation.x = TORCH.kindle;
      else if (enemy.settled && !enemy.target) offArm.rotation.x = lerp(TORCH.wave[0], TORCH.wave[1], 0.5 + 0.5 * Math.sin(time * CHEER.speed + 1.3));
      else offArm.rotation.x = TORCH.carry + Math.sin(view.travel * HOPS_PER_TILE * Math.PI) * 0.08;
      if (!view.flame) return;
      // Catching from a spark while it is lit, then burning steadily.
      view.flame.strength = lighting ? smooth(Math.max(0, 1 - enemy.lighting / ASSAULT.light)) : 1;
      view.model.updateMatrixWorld(true);
      view.stick.localToWorld(view.flame.position.set(TORCH.tip[0], TORCH.tip[1], TORCH.tip[2] + 0.02));
    }

    #syncProjectiles(world, dt) {
      const seen = new Set();
      for (const projectile of world.projectiles) {
        seen.add(projectile.id);
        let view = this.#projectiles.get(projectile.id);
        if (!view) {
          const model = catalog.instance(`projectile:${projectile.tower}`);
          model.rotation.order = 'YXZ'; // yaw along the flight path, then pitch with the arc
          this.group.add(model);
          // Shots start at their tower's muzzle; the tower is the one on the tile the shot came from.
          const col = Math.round(projectile.x);
          const row = Math.round(projectile.y);
          const tower = world.towerAt(col, row);
          const start = tower ? this.muzzleOf(tower) : this.mapView.toWorld(col, row).setY(this.mapView.tileTop(col, row) + 0.8);
          const blob = new THREE.Mesh(BLOB.geometry, BLOB.material);
          blob.renderOrder = 1;
          this.group.add(blob);
          view = { model, blob, startX: col, startY: row, startHeight: start.y, parts: animation.collect(model) };
          this.#projectiles.set(projectile.id, view);
        }
        const { model } = view;
        this.mapView.toWorld(projectile.x, projectile.y, model.position);
        const total = Math.hypot(projectile.targetX - view.startX, projectile.targetY - view.startY) || 1;
        const done = Math.min(1, Math.hypot(projectile.x - view.startX, projectile.y - view.startY) / total);
        const end = this.mapView.heightAt(projectile.targetX, projectile.targetY) + IMPACT_HEIGHT;
        let height = view.startHeight + (end - view.startHeight) * done;
        if (projectile.tower === 'cannon') height += Math.sin(done * Math.PI) * CANNON_ARC;
        model.position.y = height;
        model.rotation.y = Math.atan2(projectile.targetX - projectile.x, projectile.targetY - projectile.y);
        // Its shadow sits on the ground right below, shrinking as the shot climbs.
        const ground = this.mapView.heightAt(projectile.x, projectile.y);
        view.blob.position.set(model.position.x, ground + 0.03, model.position.z);
        view.blob.scale.setScalar(PROJECTILE_SHADOW * Math.max(0.4, 1 - (height - ground) * 0.25));
        // Pitch the shot along its flight so arrows nose down as they fall.
        const slope = done < 1 ? (end - view.startHeight) / total + (projectile.tower === 'cannon' ? Math.cos(done * Math.PI) * CANNON_ARC * Math.PI / total : 0) : 0;
        model.rotation.x = -Math.atan(slope);
        animation.apply(view.parts, { time: this.#time });
      }
      this.#dropMissing(this.#projectiles, seen);
    }

    #dropMissing(views, seen) {
      for (const [id, view] of views) {
        if (seen.has(id)) continue;
        view.model.removeFromParent();
        view.blob?.removeFromParent();
        if (view.flame) this.fire?.remove(view.flame);
        views.delete(id);
      }
    }

    /** Frosted enemies get an icy tint on every part, restored when the slow wears off. */
    #tint(model, slowed) {
      model.traverse((node) => {
        if (!node.isMesh || node.userData.bar) return;
        if (slowed) {
          if (!node.userData.baseMaterial) node.userData.baseMaterial = node.material;
          node.material = frosted(node.userData.baseMaterial);
        } else if (node.userData.baseMaterial) {
          node.material = node.userData.baseMaterial;
        }
      });
    }

    #buildHealthBar(height) {
      const group = new THREE.Group();
      group.position.y = height + 0.12;
      const back = new THREE.Mesh(box(BAR_WIDTH + 0.06, 0.1, 0.01), this.#barMaterials.back);
      // Anchored at its left end so scaling x empties the bar towards the left.
      const fillGeometry = geo('healthFill', () => new THREE.BoxGeometry(BAR_WIDTH, 0.06, 0.012).translate(BAR_WIDTH / 2, 0, 0.005));
      const fill = new THREE.Mesh(fillGeometry, this.#barMaterials.fill);
      fill.position.x = -BAR_WIDTH / 2;
      back.userData.bar = true;
      fill.userData.bar = true;
      group.add(back, fill);
      return { group, fill };
    }
  }

  const frostedCache = new Map();
  function frosted(material) {
    if (!frostedCache.has(material)) {
      const clone = material.clone();
      clone.color.lerp(SLOW_TINT, 0.55);
      clone.emissive.setHex(0x1b4a5e);
      frostedCache.set(material, clone);
    }
    return frostedCache.get(material);
  }

  Object.assign(Hold, { UnitsView });
})();
