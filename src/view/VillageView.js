(() => {
  'use strict';

  const { catalog, animation, modelKit, sceneryModels, ENEMIES, ASSAULT, VILLAGE_PLAN, PathNetwork } = Hold;
  const { poseGate } = sceneryModels;
  const { PALETTE } = modelKit;

  /**
   * How alarmed the village is, from peace to the fall. Worked out every
   * frame from the World: invaders anywhere put it on alert, invaders near
   * the gate (DANGER_TILES of road left) put it in danger, invaders at the
   * gate mean a siege, and a broken gate means it has fallen.
   */
  const ALARM = { calm: 0, alert: 1, danger: 2, siege: 3, fallen: 4 };
  const DANGER_TILES = 7;
  /** Kills this close to the gate (tiles of road left) make the whole garrison cheer; further off one man cheers. */
  const CHEER_TILES = 8;
  /** Seconds of calm before sheltering villagers come out, and before the men called up by the alarm go back down to the keep. */
  const CALM = { villagers: 1.2, garrison: 3 };

  const GATE = { openSpeed: 0.6, closeSpeed: 1.3, shudder: 0.07, shudderSpeed: 38, shudderDecay: 6, breakSeconds: 0.8 };
  /** Bell swing per alarm level: [amplitude (radians), speed (radians of swing per second)]. */
  const BELL = { calm: [0, 2], alert: [0.35, 3.2], danger: [0.6, 5], siege: [0.85, 7.5], joy: [0.7, 5.5], ease: 2.5 };
  /**
   * People: walking and hurrying speeds (tiles per second), how far they turn
   * to follow an invader from a post, how quickly they turn, how high they
   * jump for joy, and the seconds between men leaving the keep for the walls.
   */
  const PEOPLE = { walk: 0.8, hurry: 1.15, run: 1.4, look: 1.0, turn: 8, hop: 0.09, stagger: 0.5 };
  /** The way out: how far down the hill road (tiles) the evacuation goes before it is out of sight, and how far apart people walk. */
  const EVACUATION = { along: 8, spread: 0.13 };

  /**
   * A building set alight: the flames first catch where the torch touched
   * it, take hold of the roof `spread` seconds later, one part after another
   * `step` apart, each growing over `grow` seconds; the walls char from
   * `charFrom` seconds over `charSeconds`.
   */
  const BURN = { catch: 1.2, spread: 2.2, step: 0.9, grow: 2.5, charFrom: 2, charSeconds: 9, char: 0x7d7773, light: 12 };
  /**
   * A burning building comes down `after` seconds of fire (by kind, give or
   * take `jitter`): its spires topple one after another (`spire` seconds
   * each, `spireStep` apart), its roof falls in (from `roofAt`, taking
   * `roof`), its upper storey crumbles (from `upperAt`, taking `upper`) and
   * the ruin shows from `ruinAt`. The fires flare as the roof lands, sink
   * onto the rubble over `settle` seconds and die down to a smoulder
   * (`ember` of their strength) over `smoulder` seconds, under more smoke.
   */
  const COLLAPSE = {
    after: { 'scenery:cart': 7, 'scenery:house:0': 9, 'scenery:house:1': 11, 'scenery:house:2': 12, 'scenery:windmill': 10, 'scenery:gate:0': 12, 'scenery:keep': 15 },
    jitter: 2, spire: 1.3, spireStep: 0.6, roofAt: 0.4, roof: 0.9, upperAt: 0.8, upper: 1.4, ruinAt: 0.9,
    flare: 0.8, settle: 1.2, smoulder: 25, ember: 0.35,
  };
  /**
   * Where each kind of building burns once it has caught, in its own frame
   * (facing +Z): [x, y, z, footprint radius, flame height, puff size].
   * Roofs and upper windows; the first flames are wherever the torch was.
   */
  const FLAMES = {
    'scenery:house:0': [[-0.24, 1.0, 0.05, 0.26, 0.75, 0.25], [0.24, 1.02, -0.05, 0.26, 0.75, 0.25]],
    'scenery:house:1': [[-0.22, 1.32, 0.05, 0.25, 0.8, 0.25], [0.22, 1.35, -0.05, 0.25, 0.8, 0.25], [-0.25, 0.87, 0.45, 0.1, 0.45, 0.15]],
    'scenery:house:2': [[-0.25, 0.98, 0.05, 0.26, 0.75, 0.25], [0.25, 1.0, -0.05, 0.26, 0.75, 0.25]],
    'scenery:keep': [[0, 2.05, 0, 0.36, 1.0, 0.32], [-0.4, 1.25, 0.68, 0.08, 0.5, 0.15], [0.4, 1.25, 0.68, 0.08, 0.5, 0.15], [0, 1.35, 0.68, 0.08, 0.55, 0.16]],
    'scenery:windmill': [[0, 1.72, 0, 0.24, 0.8, 0.25], [0.05, 1.2, 0.34, 0.08, 0.45, 0.15]],
    'scenery:cart': [[0, 0.42, 0, 0.22, 0.6, 0.22]],
    'scenery:gate:0': [[0, 1.62, 0, 0.32, 0.8, 0.26], [-0.62, 1.75, 0, 0.14, 0.6, 0.2], [0.62, 1.75, 0, 0.14, 0.6, 0.2]],
  };
  /** Fireworks for a held wave: rockets from the keep's turrets in the village's colours. */
  const FIREWORKS = {
    rise: 0.7, speed: 2.3, trail: 40,
    colors: [[PALETTE.banner, 0xffffff], [PALETTE.crimson, PALETTE.gold], [PALETTE.gold, 0xfff1c4], [0x7fd7ff, 0xffffff]],
  };

  const smooth = (t) => t * t * (3 - 2 * t);
  const clamp01 = (t) => Math.min(1, Math.max(0, t));
  const wrap = (angle) => Math.atan2(Math.sin(angle), Math.cos(angle));
  /** Falls and bounces once, like a heavy door slamming down. */
  const slam = (t) => (t < 0.7 ? (t / 0.7) ** 2 : 1 - Math.sin(((t - 0.7) / 0.3) * Math.PI) * 0.12);

  /**
   * The village reacting to the battle. The MapView builds the village; this
   * brings it to life from the World's state and events, on simulated time
   * (so it freezes with the simulation). Everyone in it walks the village's
   * paths (VILLAGE_PLAN.paths): nobody goes through a wall.
   *
   * - Peace: the gate stands open, two sentries keep watch from the walls,
   *   villagers stroll around the well.
   * - Invaders on the road: the bell rings, the gate swings shut, the men of
   *   the garrison come out of the keep and climb the stairs to their posts,
   *   where they watch the nearest invader, and the villagers go into the
   *   keep. The closer the invaders come, the faster the bell and the more
   *   agitated the men. Once it is over the men go back down and the
   *   villagers come out again.
   * - At the gate: every blow jolts the door on its hinges and splinters
   *   fly; plank by plank it is beaten in as the village loses lives (the
   *   masonry around it stands firm); guards hurl the stones that fell spent
   *   attackers.
   * - Kills: the garrison cheers (all of it when the kill was near the
   *   gate). A held wave or a slain warlord: fireworks, a joyful bell,
   *   cheering, the gate opens and the villagers come out.
   * - The fall: the door bursts, and the garrison comes down from the walls
   *   to lead the villagers out of the keep and away through the south
   *   archway and down the hill road. Buildings burn only where an invader
   *   held a torch to them (the World's `torch` events): the flames start
   *   there, take the roof, and the walls char; when an invader has gone
   *   into the keep its banner comes down and the invaders' goes up.
   */
  class VillageView {
    #time = 0;
    #alarm = ALARM.calm;
    #calmFor = 0;
    #alertFor = 0;
    #celebrate = 0;
    #gate;
    #bell = { amplitude: 0, phase: 0 };
    #paths = new PathNetwork(VILLAGE_PLAN.paths);
    /** Which way the garrison faces at its posts: out of the gate, towards the road. */
    #facing = 0;
    #guards = [];
    #villagers = [];
    #stones = new Map();
    #rockets = [];
    #burning = new Map();
    /** What each named building can lose to fire (see scenery's `structure`), with the pose to put it back in. */
    #structures = new Map();
    #lights = [];
    #banners;
    #scratch = new THREE.Vector3();

    constructor({ mapView, effects, fire }) {
      this.mapView = mapView;
      this.effects = effects;
      this.fire = fire;
      this.group = new THREE.Group();
      mapView.group.updateMatrixWorld(true);
      const { village } = mapView;
      const model = village.gate;
      this.#gate = { model, open: 1, damage: 0, shudder: 0, shudderTime: 0, broken: null };
      this.#buildPeople();
      this.#buildStructures(village);
      this.#buildLights(village);
      this.#buildBanners(village);
      this.reset();
    }

    /** How alarmed the village is: one of ALARM's values. */
    get alarm() {
      return this.#alarm;
    }

    /** The garrison, the villagers, the burning buildings and the war banner, for tests and tooling. */
    get models() {
      return {
        guards: this.#guards.map((guard) => ({ model: guard.model, state: guard.state, facing: this.#facing })),
        villagers: this.#villagers.map((villager) => villager.model),
        people: [...this.#guards, ...this.#villagers].map(({ model, state, level }) => ({ model, state, level })),
        burning: [...this.#burning.keys()],
        warBanner: this.#banners.theirs,
      };
    }

    /** Puts the village back to peacetime for a new run. */
    reset() {
      this.#time = 0;
      this.#alarm = ALARM.calm;
      this.#calmFor = CALM.garrison;
      this.#alertFor = 0;
      this.#celebrate = 0;
      const gate = this.#gate;
      Object.assign(gate, { open: 1, damage: 0, shudder: 0, shudderTime: 0, broken: null });
      poseGate(gate.model, { damage: 0, open: 1 });
      Object.assign(this.#bell, { amplitude: 0, phase: 0 });
      gate.model.userData.bell.rotation.x = 0;
      for (const guard of this.#guards) {
        this.#placeAt(guard, guard.post.at, guard.post.level);
        Object.assign(guard, { state: guard.sentry ? 'post' : 'inside', route: [], yaw: 0, cheer: 0, cheerDelay: 0, throwing: 0 });
        guard.heading = this.#facing;
        guard.model.visible = guard.sentry;
      }
      this.#villagers.forEach((villager, index) => {
        this.#placeAt(villager, villager.plan.loop[0], 'ground');
        Object.assign(villager, { state: 'out', target: 1, route: [], wait: index * 0.7, heading: 0 });
        villager.model.visible = true;
      });
      for (const person of [...this.#guards, ...this.#villagers]) this.#pose(person, 0);
      for (const stone of this.#stones.values()) stone.mesh.removeFromParent();
      this.#stones.clear();
      for (const rocket of this.#rockets) rocket.mesh.removeFromParent();
      this.#rockets = [];
      for (const burning of this.#burning.values()) {
        for (const flame of burning.flames) this.fire.remove(flame.emitter);
        burning.restore();
      }
      this.#burning.clear();
      for (const structure of this.#structures.values()) {
        for (const { node, position, quaternion, scale, visible } of structure.parts) {
          node.position.copy(position);
          node.quaternion.copy(quaternion);
          node.scale.copy(scale);
          node.visible = visible;
        }
      }
      for (const light of this.#lights) {
        light.intensity = 0;
        light.userData.building = null;
      }
      const { ours, oursY, theirs } = this.#banners;
      ours.position.y = oursY;
      ours.visible = true;
      theirs.visible = false;
      this.#banners.takenAt = null;
    }

    /** Reacts to what happened in the World since the last frame. */
    handle(event, world) {
      switch (event.type) {
        case 'gateHit':
          this.#gateHit(event, world);
          break;
        case 'repelled':
          this.#stoneLands(event.enemy);
          this.#cheer(this.#nearestGuards(event.enemy, 3), 1.1);
          break;
        case 'death':
          this.#onKill(event.enemy, world);
          break;
        case 'waveClear':
          this.#celebrateHeld(4.5, 5);
          break;
        case 'gateBroken':
          this.#gateBursts(world);
          break;
        case 'torch':
          this.#setAlight(event.target, event.enemy);
          break;
        case 'keepTaken':
          this.#banners.takenAt = this.#time;
          break;
        default:
          break;
      }
    }

    /** Advances the village by `dt` simulated seconds. */
    update(world, dt) {
      this.#time += dt;
      this.#celebrate = Math.max(0, this.#celebrate - dt);
      this.#alarm = this.#assess(world);
      this.#calmFor = this.#alarm === ALARM.calm && this.#celebrate === 0 ? this.#calmFor + dt : 0;
      this.#alertFor = this.#alarm >= ALARM.alert ? this.#alertFor + dt : 0;
      this.#updateGate(world, dt);
      this.#updateBell(dt);
      this.#updateGuards(world, dt);
      this.#updateVillagers(dt);
      this.#updateStones();
      this.#updateRockets(dt);
      this.#updateFires(dt);
      this.#updateBanners();
    }

    // Reading the battle

    #assess(world) {
      if (world.gateBroken) return ALARM.fallen;
      let nearest = Infinity;
      for (const enemy of world.enemies) {
        if (enemy.state === 'assault' || enemy.state === 'queue') return ALARM.siege;
        nearest = Math.min(nearest, world.path.length - enemy.distance);
      }
      if (nearest <= DANGER_TILES) return ALARM.danger;
      if (world.enemies.length > 0 || world.phase === 'wave') return ALARM.alert;
      return ALARM.calm;
    }

    // The gate

    /** A blow on the door: the leaves jolt on their hinges and splinters fly back off it; more when a plank gives way. The masonry stands firm. */
    #gateHit(event, world) {
      const gate = this.#gate;
      gate.shudder = GATE.shudder * (ENEMIES[event.enemy.type].boss ? 1.6 : 1);
      gate.shudderTime = 0;
      const { door } = world;
      const face = this.#tileToWorld(door.x, door.y, 0.25 + Math.random() * 0.3);
      const back = this.#scratch.set(-door.forward.x, 0, -door.forward.y).multiplyScalar(1.2);
      const before = gate.damage;
      const after = 1 - event.lives / world.maxLives;
      const smashed = sceneryModels.PLANK_BREAKS.some(([, , , at]) => before + 1e-9 < at && after + 1e-9 >= at);
      this.effects.burst(face, 'splinters', { direction: back, count: smashed ? 22 : 9 });
      // A blow that leaves the attacker spent: the nearest guard hurls a stone down on it.
      if (event.final && world.lives > 0) this.#throwStone(event.enemy);
    }

    #gateBursts(world) {
      const { door } = world;
      const face = this.#tileToWorld(door.x, door.y, 0.35);
      this.effects.burst(face, 'rubble', { direction: new THREE.Vector3(door.forward.x, 0.3, door.forward.y).multiplyScalar(1.5) });
      this.effects.burst(face, 'splinters', { count: 20, direction: new THREE.Vector3(-door.forward.x, 0.5, -door.forward.y) });
      this.effects.burst(face, 'poof');
      for (const stone of this.#stones.values()) stone.mesh.removeFromParent();
      this.#stones.clear();
    }

    #updateGate(world, dt) {
      const gate = this.#gate;
      gate.damage = Math.max(0, 1 - world.lives / world.maxLives);
      if (world.gateBroken && !gate.broken) gate.broken = { t: 0 };
      if (gate.broken) {
        gate.broken.t = Math.min(1, gate.broken.t + dt / GATE.breakSeconds);
        poseGate(gate.model, { damage: 1, broken: slam(gate.broken.t) });
        return;
      }
      // Open in peacetime; shut the moment invaders are about.
      const target = this.#alarm === ALARM.calm ? 1 : 0;
      const speed = target > gate.open ? GATE.openSpeed : GATE.closeSpeed;
      gate.open += Math.sign(target - gate.open) * Math.min(Math.abs(target - gate.open), speed * dt);
      gate.shudderTime += dt;
      const decay = Math.exp(-GATE.shudderDecay * gate.shudderTime);
      const shudder = gate.shudder * Math.abs(Math.sin(gate.shudderTime * GATE.shudderSpeed)) * decay;
      poseGate(gate.model, { damage: gate.damage, open: smooth(gate.open), shudder });
    }

    // The alarm bell

    #updateBell(dt) {
      const bell = this.#bell;
      let setting = BELL.calm;
      if (this.#celebrate > 0 && this.#alarm < ALARM.fallen) setting = BELL.joy;
      else if (this.#alarm === ALARM.siege) setting = BELL.siege;
      else if (this.#alarm === ALARM.danger) setting = BELL.danger;
      else if (this.#alarm === ALARM.alert) setting = BELL.alert;
      const [amplitude, speed] = setting;
      bell.amplitude += (amplitude - bell.amplitude) * Math.min(1, dt * BELL.ease);
      bell.phase += dt * speed;
      this.#gate.model.userData.bell.rotation.x = bell.amplitude * Math.sin(bell.phase);
    }

    // People: the garrison and the villagers

    #buildPeople() {
      this.#facing = this.mapView.village.gate.rotation.y;
      VILLAGE_PLAN.posts.forEach((post, order) => {
        const model = catalog.instance(`scenery:guard:${post.variant}`);
        this.group.add(model);
        this.#guards.push(this.#person(model, { post, order, sentry: Boolean(post.sentry), variant: post.variant, speed: PEOPLE.hurry }));
      });
      VILLAGE_PLAN.strolls.forEach((plan, order) => {
        const model = catalog.instance(`scenery:villager:${plan.variant}`);
        this.group.add(model);
        this.#villagers.push(this.#person(model, { plan, order, speed: plan.speed }));
      });
    }

    #person(model, details) {
      return {
        model, x: 0, y: 0, level: 'ground', height: 0, heading: 0, route: [], leg: details.order, moved: 0,
        state: 'out', yaw: 0, cheer: 0, cheerDelay: 0, throwing: 0, wait: 0, phase: details.order * 1.9,
        lane: ((details.order % 3) - 1) * EVACUATION.spread, ...details,
      };
    }

    /** Puts someone at a point of the village plan ([east, south] from the gate) on a level. */
    #placeAt(person, [x, y], level) {
      const { gate } = this.mapView.map;
      person.x = gate.col + x;
      person.y = gate.row + y;
      person.level = level;
      person.height = this.#heightOf(person.x, person.y, level);
      person.route = [];
    }

    /** Sends someone along the paths from where they are to the named point, then on through `then` (points with optional heights). */
    #send(person, to, then = []) {
      const { gate } = this.mapView.map;
      const start = this.#paths.nearest(person.x - gate.col, person.y - gate.row, person.level);
      const route = this.#paths.route(start.name, to) ?? [];
      person.route = [
        ...route.map((point) => ({ x: gate.col + point.x, y: gate.row + point.y, level: point.level })),
        ...then,
      ];
    }

    /** The way down the hill road from the archway, until out of sight, each walker a little to one side. */
    #wayOut(person) {
      const { approach } = this.mapView.terrain;
      const points = [];
      for (let along = 0.5; along <= EVACUATION.along; along += 0.5) {
        const at = approach.at(along);
        points.push({
          x: at.x + Math.cos(at.heading) * person.lane,
          y: at.y - Math.sin(at.heading) * person.lane,
          height: approach.height(along),
        });
      }
      return points;
    }

    #evacuate(person) {
      if (person.state === 'inside') {
        this.#placeAt(person, this.#planPoint(VILLAGE_PLAN.shelter), 'ground');
        person.model.visible = true;
      }
      // Villagers leave the keep one after another; the garrison runs down from the walls at once, to clear the square before the invaders are through.
      person.state = 'evacuating';
      person.speed = person.plan ? PEOPLE.hurry : PEOPLE.run;
      person.wait = person.post ? 0 : person.order * 0.35;
      this.#send(person, VILLAGE_PLAN.exit, this.#wayOut(person));
    }

    #planPoint(name) {
      const point = this.#paths.point(name);
      return [point.x, point.y];
    }

    #heightOf(x, y, level) {
      if (level === 'ground') return this.mapView.heightAt(x, y);
      return this.mapView.village.levels[level];
    }

    /**
     * Height at (x, y) on the way from point `a` to point `b`: on the level
     * both are on, stepping up a stair flight between a level and the
     * ground, or between given heights (the hill road).
     */
    #heightBetween(a, b, x, y) {
      if (a.height !== undefined && b.height !== undefined) {
        const span = Math.hypot(b.x - a.x, b.y - a.y) || 1;
        return a.height + (b.height - a.height) * clamp01(Math.hypot(x - a.x, y - a.y) / span);
      }
      const levelA = a.level ?? 'ground';
      const levelB = b.level ?? 'ground';
      if (levelA === levelB) return this.#heightOf(x, y, levelA);
      const flight = this.mapView.village.stairs.find((stairs) => stairs.level === (levelA === 'ground' ? levelB : levelA));
      const climbed = Math.hypot(x - flight.foot.x, y - flight.foot.y);
      if (climbed >= flight.run) return flight.top.height;
      const step = Math.min(flight.steps, Math.floor((climbed / flight.run) * flight.steps + 0.35));
      return flight.foot.height + ((flight.top.height - flight.foot.height) * step) / flight.steps;
    }

    /** Walks someone along their route; true when they get to the end of it. */
    #walk(person, dt) {
      if (person.wait > 0) {
        person.wait -= dt;
        person.moved = 0;
        return false;
      }
      let left = person.speed * dt;
      const from = { x: person.x, y: person.y, level: person.level, height: person.route[0]?.height !== undefined ? person.height : undefined };
      person.moved = 0;
      while (person.route.length && left > 0) {
        const [next] = person.route;
        const dx = next.x - person.x;
        const dy = next.y - person.y;
        const gap = Math.hypot(dx, dy);
        if (gap > 1e-6) person.heading = Math.atan2(dx, dy);
        const step = Math.min(gap, left);
        person.x += gap > 1e-9 ? (dx / gap) * step : 0;
        person.y += gap > 1e-9 ? (dy / gap) * step : 0;
        person.height = this.#heightBetween(from, next, person.x, person.y);
        person.moved += step;
        left -= step;
        if (step >= gap - 1e-9) {
          person.route.shift();
          person.level = next.level ?? 'ground';
          Object.assign(from, { x: next.x, y: next.y, level: next.level, height: next.height });
        }
      }
      return person.route.length === 0;
    }

    #updateGuards(world, dt) {
      const fallen = this.#alarm === ALARM.fallen;
      for (const guard of this.#guards) {
        // Where the man should be: evacuating once the gate has fallen, at his post while there is danger
        // (a sentry always), otherwise back in the keep once things have been quiet a while.
        if (fallen) {
          if (guard.state !== 'evacuating' && guard.state !== 'gone') this.#evacuate(guard);
        } else if (this.#alarm >= ALARM.alert || guard.sentry || this.#celebrate > 0) {
          if (guard.state === 'inside' && this.#alertFor >= guard.order * PEOPLE.stagger) {
            this.#placeAt(guard, this.#planPoint(VILLAGE_PLAN.shelter), 'ground');
            guard.model.visible = true;
            this.#toPost(guard);
          } else if (guard.state === 'toKeep') {
            this.#toPost(guard);
          }
        } else if (this.#calmFor >= CALM.garrison && (guard.state === 'post' || guard.state === 'toPost')) {
          guard.state = 'toKeep';
          guard.speed = PEOPLE.walk;
          this.#send(guard, VILLAGE_PLAN.shelter);
        }

        if (guard.state === 'inside' || guard.state === 'gone') continue;
        if (guard.state !== 'post') {
          const done = this.#walk(guard, dt);
          if (done && guard.state === 'toPost') guard.state = 'post';
          else if (done && guard.state === 'toKeep') {
            guard.state = 'inside';
            guard.model.visible = false;
            continue;
          } else if (done && guard.state === 'evacuating') {
            guard.state = 'gone';
            guard.model.visible = false;
            continue;
          }
        }
        if (guard.state === 'post') this.#stand(guard, world, dt);
        else this.#pose(guard, dt);
      }
    }

    /** Up to the wall walk by the stairs on his side, and along it to his post, in a hurry. */
    #toPost(guard) {
      const { gate } = this.mapView.map;
      const { at, level } = guard.post;
      const walk = this.#paths.nearest(at[0], at[1], level);
      guard.state = 'toPost';
      guard.speed = PEOPLE.hurry;
      this.#send(guard, walk.name, [{ x: gate.col + at[0], y: gate.row + at[1], level }]);
    }

    /** A man at his post: watching the nearest invader, and shouting, cheering or heaving stones as the battle goes. */
    #stand(guard, world, dt) {
      const { model } = guard;
      const { body, armLeft, armRight } = model.userData;
      const target = this.#nearestEnemy(world, guard);
      let look = 0;
      if (target) look = Math.max(-PEOPLE.look, Math.min(PEOPLE.look, wrap(Math.atan2(target.x - guard.x, target.y - guard.y) - this.#facing)));
      else look = Math.sin(this.#time * 0.4 + guard.phase) * 0.35;
      guard.yaw += (look - guard.yaw) * Math.min(1, dt * PEOPLE.turn);
      guard.heading = wrap(guard.heading + wrap(this.#facing + guard.yaw - guard.heading) * Math.min(1, dt * PEOPLE.turn));

      const t = this.#time + guard.phase;
      guard.throwing = Math.max(0, guard.throwing - dt);
      guard.cheerDelay = Math.max(0, guard.cheerDelay - dt);
      if (guard.cheerDelay === 0) guard.cheer = Math.max(0, guard.cheer - dt);
      let right;
      let left;
      let hop = 0;
      let lean = 0;
      if (guard.throwing > 0) {
        // Heave a stone over the parapet: arm back, then over and down.
        const k = 1 - guard.throwing / ASSAULT.garrison;
        right = k < 0.25 ? -2.6 * smooth(k / 0.25) : -2.6 + 1.6 * smooth((k - 0.25) / 0.3);
        left = -0.6;
        lean = k < 0.25 ? -0.1 : 0.25 * smooth(Math.min(1, (k - 0.25) / 0.3));
      } else if (guard.cheer > 0 && guard.cheerDelay === 0) {
        // Both arms (and weapons) up, jumping for joy.
        const beat = Math.sin(t * 9);
        right = -2.7 - 0.25 * beat;
        left = -2.6 + 0.25 * beat;
        hop = Math.abs(Math.sin(t * 6)) * PEOPLE.hop;
      } else if (this.#alarm >= ALARM.siege) {
        // Shaking weapons and shouting down at the attackers.
        const beat = Math.max(0, Math.sin(t * 7));
        right = guard.variant ? -1.3 : -1.7 - 0.7 * beat;
        left = guard.variant ? -1.55 : -0.9;
        lean = 0.12 + 0.05 * beat;
      } else if (this.#alarm >= ALARM.danger) {
        // Weapons ready: spears levelled and shields up, bows drawn.
        right = guard.variant ? -1.2 : -1.0;
        left = guard.variant ? -1.55 : -0.85;
        lean = 0.06;
      } else if (this.#alarm >= ALARM.alert) {
        right = -0.5;
        left = guard.variant ? -0.9 : -0.5;
      } else {
        right = -0.12 + Math.sin(t * 1.3) * 0.05;
        left = -0.25;
      }
      const ease = Math.min(1, dt * 12);
      armRight.rotation.x += (right - armRight.rotation.x) * ease;
      armLeft.rotation.x += (left - armLeft.rotation.x) * ease;
      body.rotation.x += (lean - body.rotation.x) * ease;
      body.position.y = hop;
      this.#legs(guard, 0);
      this.#place(guard);
    }

    #updateVillagers(dt) {
      const fallen = this.#alarm === ALARM.fallen;
      const alarmed = this.#alarm >= ALARM.alert;
      for (const villager of this.#villagers) {
        const { plan } = villager;
        if (fallen) {
          if (villager.state !== 'evacuating' && villager.state !== 'gone') this.#evacuate(villager);
        } else if (alarmed && (villager.state === 'out' || villager.state === 'emerging')) {
          // The alarm sends everyone into the keep.
          villager.state = 'sheltering';
          villager.wait = 0;
          villager.speed = PEOPLE.hurry;
          this.#send(villager, VILLAGE_PLAN.shelter);
        } else if (!alarmed && villager.state === 'inside' && this.#calmFor > CALM.villagers + villager.order * 0.8) {
          // Peace brings them out again, one by one.
          villager.state = 'emerging';
          villager.speed = plan.speed * 1.3;
          this.#placeAt(villager, this.#planPoint(VILLAGE_PLAN.shelter), 'ground');
          villager.model.visible = true;
          const { gate } = this.mapView.map;
          const home = { x: gate.col + plan.loop[0][0], y: gate.row + plan.loop[0][1], level: 'ground' };
          const nearHome = this.#paths.nearest(plan.loop[0][0], plan.loop[0][1]);
          this.#send(villager, nearHome.name, [home]);
        }
        if (villager.state === 'inside' || villager.state === 'gone') continue;

        if (villager.state === 'out') {
          // Strolling round its loop, pausing now and then.
          if (!villager.route.length) {
            const [x, y] = plan.loop[villager.target];
            const { gate } = this.mapView.map;
            villager.route = [{ x: gate.col + x, y: gate.row + y, level: 'ground' }];
            villager.target = (villager.target + 1) % plan.loop.length;
            if (villager.target % 2 === 0) villager.wait = 0.6 + (villager.order % 3) * 0.5;
          }
          this.#walk(villager, dt);
        } else if (this.#walk(villager, dt)) {
          if (villager.state === 'sheltering') {
            villager.state = 'inside';
            villager.model.visible = false;
            continue;
          }
          if (villager.state === 'evacuating') {
            villager.state = 'gone';
            villager.model.visible = false;
            continue;
          }
          villager.state = 'out';
          villager.speed = plan.speed;
          villager.target = 1;
        }
        this.#pose(villager, dt);
      }
    }

    /** Someone walking or standing about: legs and arms swing with their steps; cheering when there is joy. */
    #pose(person, dt) {
      const { body, armLeft, armRight } = person.model.userData;
      const walking = person.moved > 1e-6 ? 1 : 0;
      const hurrying = person.state === 'evacuating' || person.state === 'sheltering';
      person.leg += person.moved * (hurrying ? 16 : 22);
      const swing = Math.sin(person.leg) * 0.7 * walking;
      if (this.#celebrate > 0 && !hurrying && person.state !== 'toPost') {
        const beat = Math.sin(this.#time * 8 + person.leg);
        armLeft.rotation.x = -2.7 + beat * 0.3;
        armRight.rotation.x = -2.7 - beat * 0.3;
        body.position.y = Math.abs(Math.sin(this.#time * 6 + person.order)) * 0.06 * (1 - walking * 0.5);
      } else if (hurrying && person.plan) {
        // Villagers run with their arms up in fright.
        armLeft.rotation.x = -2.3 + swing * 0.3;
        armRight.rotation.x = -2.1 - swing * 0.3;
        body.position.y = Math.abs(Math.sin(person.leg)) * 0.03;
      } else if (person.post) {
        // The garrison on the move: weapons carried, shield arm up when hurrying away from the enemy.
        armRight.rotation.x = -0.3 - swing * 0.4;
        armLeft.rotation.x = hurrying ? -0.9 : swing * 0.5;
        body.position.y = Math.abs(Math.sin(person.leg)) * 0.025 * walking;
      } else {
        armLeft.rotation.x = -swing * 0.6;
        armRight.rotation.x = swing * 0.6;
        body.position.y = Math.abs(Math.sin(person.leg)) * 0.015 * walking;
      }
      body.rotation.x = hurrying ? 0.12 : 0;
      this.#legs(person, swing);
      this.#place(person);
    }

    #legs(person, swing) {
      const { legLeft, legRight } = person.model.userData;
      if (!legLeft) return;
      legLeft.rotation.x = swing;
      legRight.rotation.x = -swing;
    }

    #place(person) {
      this.mapView.toWorld(person.x, person.y, person.model.position);
      person.model.position.y = person.height;
      person.model.rotation.y = person.heading;
    }

    #nearestEnemy(world, tile, range = 9) {
      let best = null;
      let bestDistance = range;
      for (const enemy of world.enemies) {
        const distance = Math.hypot(enemy.x - tile.x, enemy.y - tile.y);
        if (distance < bestDistance) {
          best = enemy;
          bestDistance = distance;
        }
      }
      return best;
    }

    /** Guards at their posts nearest an invader, nearest first. */
    #nearestGuards(enemy, count) {
      return this.#guards
        .filter((guard) => guard.state === 'post')
        .sort((a, b) => Math.hypot(a.x - enemy.x, a.y - enemy.y) - Math.hypot(b.x - enemy.x, b.y - enemy.y))
        .slice(0, count);
    }

    #cheer(guards, seconds) {
      for (const guard of guards) {
        if (guard.throwing > 0) continue;
        guard.cheerDelay = guard.cheer > 0 ? 0 : Math.random() * 0.25;
        guard.cheer = Math.max(guard.cheer, seconds);
      }
    }

    #onKill(enemy, world) {
      if (this.#alarm === ALARM.fallen) return;
      const near = world.path.length - enemy.distance <= CHEER_TILES || enemy.state === 'assault' || enemy.state === 'queue';
      const posted = this.#guards.filter((guard) => guard.state === 'post');
      if (ENEMIES[enemy.type].boss) this.#celebrateHeld(3, 3);
      else if (near) this.#cheer(posted, 1.3);
      else {
        const idle = posted.filter((guard) => guard.cheer === 0);
        if (idle.length) this.#cheer([idle[Math.floor(Math.random() * idle.length)]], 0.9);
      }
    }

    /** A held wave or a slain warlord: the garrison cheers, the bell rings for joy and rockets go up from the keep. */
    #celebrateHeld(seconds, rockets) {
      if (this.#alarm === ALARM.fallen) return;
      this.#celebrate = Math.max(this.#celebrate, seconds);
      this.#cheer(this.#guards.filter((guard) => guard.state === 'post'), seconds);
      for (let i = 0; i < rockets; i++) this.#launch(i * 0.55 + Math.random() * 0.2, i);
    }

    // Stones from the walls

    #throwStone(enemy) {
      const [guard] = this.#nearestGuards(enemy, 1);
      const from = guard
        ? guard.model.localToWorld(new THREE.Vector3(0.09, 0.62, 0.05))
        : this.#gate.model.localToWorld(new THREE.Vector3(0, 1.4, 0.3));
      if (guard) {
        guard.throwing = ASSAULT.garrison;
        guard.cheer = 0;
      }
      const mesh = new THREE.Mesh(modelKit.dodeca(), modelKit.mat(PALETTE.rock));
      mesh.scale.setScalar(0.07);
      mesh.castShadow = true;
      mesh.visible = false;
      this.group.add(mesh);
      this.#stones.set(enemy.id, { mesh, from, enemy });
    }

    /** Stones fly from the thrower's hand onto the attacker's head, landing as the garrison fells it. */
    #updateStones() {
      for (const [id, stone] of this.#stones) {
        const { enemy, mesh, from } = stone;
        if (enemy.dead) {
          // A tower got there first; the stone falls on nobody.
          mesh.removeFromParent();
          this.#stones.delete(id);
          continue;
        }
        if (enemy.repelIn === null) continue;
        const k = 1 - enemy.repelIn / ASSAULT.garrison;
        const flight = clamp01((k - 0.4) / 0.6);
        mesh.visible = flight > 0;
        const to = this.#tileToWorld(enemy.x, enemy.y, 0.5);
        mesh.position.lerpVectors(from, to, flight);
        mesh.position.y += Math.sin(flight * Math.PI) * 0.3;
        mesh.rotation.set(flight * 9, flight * 5, 0);
      }
    }

    #stoneLands(enemy) {
      const stone = this.#stones.get(enemy.id);
      this.effects.burst(this.#tileToWorld(enemy.x, enemy.y, 0.35), 'stone');
      if (!stone) return;
      stone.mesh.removeFromParent();
      this.#stones.delete(enemy.id);
    }

    // Fireworks

    #launch(delay, index) {
      const keep = this.mapView.village.buildings.find(({ name }) => name === 'keep')?.model;
      if (!keep) return;
      const corner = index % 2 ? 1 : -1;
      const origin = keep.localToWorld(new THREE.Vector3(0.6 * corner, 2.7, 0.6 * (index % 3 ? 1 : -1)));
      const mesh = new THREE.Mesh(modelKit.sphere(0), modelKit.mat(0xfff1c4, { glow: 0xffc04d, glowStrength: 2 }));
      mesh.scale.setScalar(0.045);
      mesh.visible = false;
      this.group.add(mesh);
      const drift = new THREE.Vector3(Math.random() - 0.5, 0, Math.random() - 0.5).multiplyScalar(0.8);
      this.#rockets.push({ mesh, origin, drift, age: -delay, colors: FIREWORKS.colors[index % FIREWORKS.colors.length] });
    }

    #updateRockets(dt) {
      this.#rockets = this.#rockets.filter((rocket) => {
        rocket.age += dt;
        if (rocket.age < 0) return true;
        if (rocket.age >= FIREWORKS.rise) {
          this.effects.burst(rocket.mesh.position, 'firework', { colors: rocket.colors });
          this.effects.burst(rocket.mesh.position, 'sparkle', { colors: rocket.colors, count: 10 });
          rocket.mesh.removeFromParent();
          return false;
        }
        const k = rocket.age / FIREWORKS.rise;
        rocket.mesh.visible = true;
        rocket.mesh.position.copy(rocket.origin).addScaledVector(rocket.drift, k);
        rocket.mesh.position.y += FIREWORKS.speed * FIREWORKS.rise * (1 - (1 - k) ** 2);
        if (Math.random() < dt * FIREWORKS.trail) this.effects.burst(rocket.mesh.position, 'spark');
        return true;
      });
    }

    // Fire: only where the invaders put their torches

    /** An invader has held a torch to a building: it catches where the torch touched it, then its roof goes up. */
    #setAlight(name, enemy) {
      if (this.#burning.has(name)) return;
      const entry = this.mapView.village.buildings.find((building) => building.name === name);
      if (!entry) return;
      const { model, id } = entry;
      model.updateMatrixWorld(true);
      const bounds = new THREE.Box3().setFromObject(model);
      // Where the torch touched: the side of the building nearest the invader, low down.
      const torch = this.#tileToWorld(enemy.x, enemy.y, 0);
      const touch = bounds.clampPoint(torch, new THREE.Vector3());
      touch.y = Math.max(bounds.min.y + 0.22, Math.min(torch.y + 0.3, bounds.max.y));
      const flames = [{ at: touch, radius: 0.07, height: 0.4, size: 0.14, smoke: 0.35, from: 0, grow: BURN.catch }];
      (FLAMES[id] ?? []).forEach(([x, y, z, radius, height, size], index) => {
        flames.push({ at: model.localToWorld(new THREE.Vector3(x, y, z)), radius, height, size, smoke: 1, from: BURN.spread + index * BURN.step, grow: BURN.grow });
      });
      for (const flame of flames) flame.emitter = this.fire.add({ position: flame.at, radius: flame.radius, height: flame.height, size: flame.size, smoke: flame.smoke, strength: 0 });
      // The building chars with its own copy of the baked material, so the rest of the village stays as it is.
      const baked = modelKit.bakedMaterial();
      const meshes = [];
      model.traverse((node) => { if (node.isMesh && node.material === baked) meshes.push(node); });
      const material = baked.clone();
      for (const mesh of meshes) mesh.material = material;
      for (const flame of flames) flame.base = { y: flame.at.y, height: flame.height, smoke: flame.smoke };
      const burning = {
        model, flames, material, age: 0, center: bounds.getCenter(new THREE.Vector3()),
        structure: this.#structures.get(name) ?? null, landed: false, ruined: false, spiresDown: new Set(),
        restore: () => { for (const mesh of meshes) mesh.material = baked; },
      };
      this.#burning.set(name, burning);
      const light = this.#lights.find((entry) => !entry.userData.building);
      if (light) {
        light.userData.building = burning;
        light.position.copy(burning.center).setY(bounds.max.y * 0.6 + bounds.min.y * 0.4 + 0.6);
      }
    }

    #updateFires(dt) {
      const char = new THREE.Color(BURN.char);
      for (const burning of this.#burning.values()) {
        burning.age += dt;
        for (const flame of burning.flames) {
          if (!flame.emitter) continue;
          flame.emitter.strength = smooth(clamp01((burning.age - flame.from) / flame.grow));
        }
        burning.material.color.setHex(0xffffff).lerp(char, smooth(clamp01((burning.age - BURN.charFrom) / BURN.charSeconds)));
        if (burning.structure) this.#collapse(burning);
      }
      this.#lights.forEach((light, index) => {
        const burning = light.userData.building;
        if (!burning) return;
        const blaze = smooth(clamp01(burning.age / (BURN.spread + BURN.grow)));
        const flicker = 0.8 + 0.2 * Math.sin(this.#time * (11 + index * 3)) * Math.sin(this.#time * 7.3 + index);
        light.intensity = BURN.light * blaze * flicker;
      });
    }

    // Burnt buildings coming down

    /** Finds what each named building can lose to fire, and remembers how it stands. */
    #buildStructures(village) {
      for (const { name, id, model } of village.buildings) {
        if (!name) continue;
        const { roof = null, upper = null, ruin = null } = model.userData;
        const spires = Object.keys(model.userData).filter((key) => /^spire\d+$/.test(key)).sort().map((key) => model.userData[key]);
        if (!roof && !upper && !spires.length) continue;
        model.updateMatrixWorld(true);
        const height = (node) => (node ? new THREE.Box3().setFromObject(node) : null);
        const parts = [roof, upper, ruin, ...spires].filter(Boolean).map((node) => ({
          node, position: node.position.clone(), quaternion: node.quaternion.clone(), scale: node.scale.clone(), visible: node.visible,
        }));
        const ruinBox = height(ruin);
        const upperBox = height(upper);
        // Buildings come down in their own time: a steady per-building offset, not a random one, so a run replays alike.
        const jitter = ((name.length * 7 + name.charCodeAt(0)) % 10) / 10 * COLLAPSE.jitter;
        this.#structures.set(name, {
          model, roof, upper, ruin, spires, parts,
          after: (COLLAPSE.after[id] ?? 10) + jitter,
          // Local heights: where what is left tops out (the roof lands there) and half the upper storey.
          rest: ruinBox ? ruinBox.max.y - model.position.y : 0.3,
          upperHalf: upperBox ? (upperBox.max.y - upperBox.min.y) / 2 : 0,
          tilt: new THREE.Vector3(Math.sin(name.length), 0, Math.cos(name.length)).normalize(),
        });
      }
    }

    /** Brings a burning building down once it has burnt long enough: spires, roof, upper storey; then the fires settle onto the ruin. */
    #collapse(burning) {
      const structure = burning.structure;
      const t = burning.age - structure.after;
      if (t < 0) return;
      const { model } = structure;
      const base = (node) => structure.parts.find((entry) => entry.node === node);
      const axis = new THREE.Vector3();
      // The spires topple outward about their feet, one after another, and shatter where they land.
      structure.spires.forEach((spire, index) => {
        if (burning.spiresDown.has(index)) return;
        const k = (t - index * COLLAPSE.spireStep) / COLLAPSE.spire;
        if (k < 0) return;
        const rest = base(spire);
        const [fx, fz] = spire.userData.fall ?? [1, 0];
        if (k >= 1) {
          burning.spiresDown.add(index);
          spire.visible = false;
          const landing = model.localToWorld(new THREE.Vector3(rest.position.x + fx * 0.7, 0.1, rest.position.z + fz * 0.7));
          this.effects.burst(landing, 'collapse', { count: 14 });
          this.effects.burst(landing, 'rubble', { count: 10 });
          return;
        }
        spire.quaternion.setFromAxisAngle(axis.set(fz, 0, -fx), 1.5 * k * k);
        const drop = Math.max(0, (k - 0.45) / 0.55) ** 2;
        spire.position.set(rest.position.x + fx * 0.4 * k, rest.position.y - (rest.position.y - 0.1) * drop, rest.position.z + fz * 0.4 * k);
      });
      // The roof falls in, tilting and crumpling, and lands on what is left in a burst of dust and sparks.
      const { roof, upper, ruin } = structure;
      const roofK = (t - COLLAPSE.roofAt) / COLLAPSE.roof;
      if (roof && roofK >= 0 && !burning.landed) {
        const rest = base(roof);
        if (roofK >= 1) {
          burning.landed = true;
          roof.visible = false;
          const at = model.localToWorld(new THREE.Vector3(rest.position.x, structure.rest, rest.position.z));
          this.effects.burst(at, 'collapse');
          this.effects.burst(at, 'collapse', { count: 16 });
          this.effects.burst(at, 'sparks');
          this.effects.burst(at, 'rubble', { count: 14 });
        } else {
          const fall = roofK * roofK;
          roof.position.set(rest.position.x, rest.position.y - (rest.position.y - structure.rest) * fall, rest.position.z);
          roof.quaternion.setFromAxisAngle(structure.tilt, 0.3 * roofK);
          roof.scale.set(rest.scale.x, rest.scale.y * (1 - 0.45 * fall), rest.scale.z);
        }
      } else if (!roof && roofK >= 1) {
        burning.landed = true;
      }
      // The upper storey crumbles down into the ruin.
      if (upper && upper.visible) {
        const k = (t - COLLAPSE.upperAt) / COLLAPSE.upper;
        if (k >= 1) {
          upper.visible = false;
        } else if (k >= 0) {
          const rest = base(upper);
          const squash = 1 - 0.88 * k ** 1.5;
          upper.scale.set(rest.scale.x, rest.scale.y * squash, rest.scale.z);
          upper.position.set(rest.position.x, rest.position.y - structure.upperHalf * (1 - squash), rest.position.z);
          upper.quaternion.setFromAxisAngle(structure.tilt, -0.12 * k);
        }
      }
      if (ruin && !burning.ruined && t >= COLLAPSE.ruinAt) {
        burning.ruined = true;
        ruin.visible = true;
        this.effects.burst(burning.center.clone().setY(model.position.y + structure.rest * 0.6), 'collapse', { count: 20 });
      }
      // The fires flare as the roof comes in, then sink onto the rubble and die down to a smoulder under more smoke.
      if (!burning.landed) return;
      burning.landedAt ??= t;
      const since = t - burning.landedAt;
      const flare = since < COLLAPSE.flare ? 1 + 0.4 * Math.sin((since / COLLAPSE.flare) * Math.PI) : 1;
      const dying = smooth(clamp01(since / COLLAPSE.smoulder));
      const settle = smooth(clamp01(since / COLLAPSE.settle));
      const restY = model.position.y + structure.rest + 0.04;
      for (const flame of burning.flames) {
        if (!flame.emitter) continue;
        const { emitter } = flame;
        emitter.position.y = flame.base.y + (Math.min(flame.base.y, restY) - flame.base.y) * settle;
        emitter.strength *= flare * (1 - (1 - COLLAPSE.ember) * dying);
        emitter.height = flame.base.height * (1 - 0.4 * dying);
        emitter.smoke = Math.min(1.4, flame.base.smoke * (1 + 0.4 * dying) + 0.2 * dying);
      }
    }

    #buildLights() {
      // Two warm lights for the first buildings to burn; always present (at zero) so lighting never recompiles.
      for (let i = 0; i < 2; i++) {
        const light = new THREE.PointLight(0xff8a3a, 0, 8, 1.6);
        this.group.add(light);
        this.#lights.push(light);
      }
    }

    // The keep's banner

    #buildBanners(village) {
      const keep = village.buildings.find(({ name }) => name === 'keep')?.model;
      const ours = keep?.userData.banner ?? new THREE.Group();
      const theirs = catalog.instance('scenery:warBanner');
      theirs.userData.pole.visible = false;
      (keep ?? this.group).add(theirs);
      this.#banners = { ours, oursY: ours.position.y, theirs, parts: animation.collect(theirs), takenAt: null };
    }

    /** Once an invader is inside the keep, the lord's banner comes down its mast and the invaders' goes up. */
    #updateBanners() {
      const { ours, oursY, theirs, parts, takenAt } = this.#banners;
      if (takenAt === null) return;
      const taken = this.#time - takenAt;
      const lower = smooth(clamp01(taken / 2));
      ours.position.y = oursY - lower * 0.9;
      ours.visible = lower < 1;
      const raise = smooth(clamp01((taken - 1.8) / 2.2));
      theirs.visible = raise > 0;
      theirs.position.set(0, oursY - 0.9 - theirs.userData.cloth.position.y + raise * 0.9, 0);
      animation.apply(parts, { time: this.#time });
    }

    // Helpers

    #tileToWorld(x, y, lift) {
      return this.mapView.toWorld(x, y).setY(this.mapView.heightAt(x, y) + lift);
    }
  }

  Object.assign(Hold, { VillageView, VILLAGE_ALARM: ALARM });
})();
