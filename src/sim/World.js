(() => {
  'use strict';

  const {
    MAP_ROWS, ENEMIES, ASSAULT, VILLAGE_PLAN, TOWERS_BY_ID, SELL_REFUND, START, buildWave, parseMap, createRng, PathNetwork,
  } = Hold;

  /** Lowest forward share of a sideways step while shuffling into place, so soldiers never turn their backs on the gate. */
  const SHUFFLE_FORWARD = 0.25;

  /**
   * The whole game simulation, with no rendering. Advance it with
   * `update(dt)` in fixed steps; read state from its fields; collect what
   * happened since the last frame with `drainEvents()`.
   *
   * Positions are in tile coordinates: `x` is the column, `y` the row.
   * Phases: `build` (between waves), `wave`, `over`.
   *
   * Invaders march the road (`state` 'march') to the village gate, where
   * they do not vanish: they crowd in front of the door in ranks (see
   * ASSAULT). The front rank ('assault') raises its weapons and batters the
   * door, each blow costing the village one life; the ranks behind
   * ('queue') wait their turn and step up as the front thins. Towers can
   * still shoot them all. An invader that has landed all its blows is felled
   * by the garrison's stones. When the last life goes the gate breaks, the
   * phase becomes `over`, and the invaders pour through the gatehouse and
   * light torches ('sack'): each goes to the nearest building nobody has taken
   * yet (VILLAGE_PLAN.targets), holds its torch to it until it catches
   * (`torch`), and moves on; whoever fires the keep goes inside and takes
   * it (`keepTaken`); when nothing is left to burn they gather in the
   * square. The simulation keeps running them (and shots in flight) so the
   * fall can be shown. Nothing in the village burns unless an invader set
   * it alight.
   *
   * Events: spawn, death, gateReached, gateHit, repelled, gateBroken, torch,
   * keepTaken, shot, hit, waveStart, waveClear, gameOver, build, upgrade,
   * sell. Each is `{ type, ...details }`.
   */
  class World {
    gold = START.gold;
    lives = START.lives;
    /** The gate's full strength: `lives / maxLives` is how much of it still stands. */
    maxLives = START.lives;
    gateBroken = false;
    wave = 0;
    phase = 'build';
    time = 0;
    towers = [];
    enemies = [];
    projectiles = [];
    #events = [];
    #queue = [];
    /** Invaders at the gate, in order of arrival: the order they line up in. */
    #crowd = [];
    /** The sack: the village's paths, the buildings not yet taken by an invader, and the next free spot in the square. */
    #village = { paths: new PathNetwork(VILLAGE_PLAN.paths), targets: [...VILLAGE_PLAN.targets], spot: 0 };
    #spawnTimer = 0;
    #currentWave = null;
    #nextId = 1;
    #point = { x: 0, y: 0, heading: 0 };

    constructor({ seed = 1, map = MAP_ROWS } = {}) {
      this.seed = seed;
      this.map = parseMap(map);
      this.path = this.map.path;
      this.rng = createRng(seed);
      const end = this.path.points.at(-1);
      const before = this.path.points.at(-2) ?? { x: end.x - 1, y: end.y };
      const span = Math.hypot(end.x - before.x, end.y - before.y) || 1;
      const forward = { x: (end.x - before.x) / span, y: (end.y - before.y) / span };
      /**
       * The gate's door in tile coordinates: the middle of its face, the
       * heading that faces it, and the gate's frame (`forward` into the
       * village, `side` to the attackers' right) used to lay out the crowd.
       */
      this.door = {
        x: end.x + forward.x * ASSAULT.gateFace,
        y: end.y + forward.y * ASSAULT.gateFace,
        heading: Math.atan2(forward.x, forward.y),
        forward,
        side: { x: -forward.y, y: forward.x },
      };
    }

    // Queries

    towerAt(col, row) {
      return this.towers.find((tower) => tower.col === col && tower.row === row) ?? null;
    }

    canBuildAt(col, row) {
      return this.map.tileAt(col, row) === '.' && !this.towerAt(col, row);
    }

    statsOf(tower) {
      return TOWERS_BY_ID[tower.type].levels[tower.level];
    }

    /** Cost of the next upgrade, or null at the top level. */
    upgradeCost(tower) {
      return TOWERS_BY_ID[tower.type].levels[tower.level + 1]?.cost ?? null;
    }

    sellValue(tower) {
      return Math.floor(tower.spent * SELL_REFUND);
    }

    get enemiesRemaining() {
      return this.enemies.length + this.#queue.length;
    }

    drainEvents() {
      const events = this.#events;
      this.#events = [];
      return events;
    }

    // Player actions

    build(type, col, row) {
      const cost = TOWERS_BY_ID[type].levels[0].cost;
      if (this.phase === 'over') return { ok: false, reason: 'gameOver' };
      if (!this.canBuildAt(col, row)) return { ok: false, reason: 'blocked' };
      if (this.gold < cost) return { ok: false, reason: 'noGold' };
      this.gold -= cost;
      const tower = { id: this.#nextId++, type, level: 0, col, row, spent: cost, cooldown: 0, aim: 0 };
      this.towers.push(tower);
      this.#emit('build', { tower });
      return { ok: true, tower };
    }

    upgrade(tower) {
      const cost = this.upgradeCost(tower);
      if (cost === null) return { ok: false, reason: 'maxed' };
      if (this.gold < cost) return { ok: false, reason: 'noGold' };
      this.gold -= cost;
      tower.level++;
      tower.spent += cost;
      this.#emit('upgrade', { tower });
      return { ok: true };
    }

    sell(tower) {
      const refund = this.sellValue(tower);
      this.towers = this.towers.filter((entry) => entry !== tower);
      this.gold += refund;
      this.#emit('sell', { tower, refund });
      return { ok: true, refund };
    }

    startWave() {
      if (this.phase !== 'build') return { ok: false, reason: 'busy' };
      this.wave++;
      this.#currentWave = buildWave(this.wave, this.rng);
      this.#queue = [...this.#currentWave.spawns];
      this.#spawnTimer = 0;
      this.phase = 'wave';
      this.#emit('waveStart', { wave: this.wave });
      return { ok: true };
    }

    // Testing helpers (used by the debug menu and tests; they follow the same rules as play)

    /**
     * Puts one invader on the road right now, in any phase. Between waves it
     * simply walks to the gate; during a wave it counts towards the wave.
     * `hpScale` defaults to the current wave's toughness.
     */
    spawnEnemy(type, { distance = 0, hpScale = this.#currentWave?.hpScale ?? 1 } = {}) {
      if (this.phase === 'over' || !ENEMIES[type]) return null;
      const enemy = this.#createEnemy(type, hpScale);
      enemy.distance = Math.min(Math.max(0, distance), this.path.length);
      this.path.positionAt(enemy.distance, enemy);
      this.enemies.push(enemy);
      this.#emit('spawn', { enemy });
      return enemy;
    }

    /** Kills an invader outright, paying its bounty like any other kill. */
    kill(enemy) {
      if (enemy.dead) return;
      this.#damage(enemy, Infinity);
      this.enemies = this.enemies.filter((entry) => !entry.dead);
      this.#checkWaveEnd();
    }

    /** Sets a tower's level directly, as if the upgrades had been bought. */
    setTowerLevel(tower, level) {
      const levels = TOWERS_BY_ID[tower.type].levels;
      const target = Math.min(Math.max(0, level), levels.length - 1);
      if (target === tower.level) return;
      tower.level = target;
      tower.spent = levels.slice(0, target + 1).reduce((sum, entry) => sum + entry.cost, 0);
      this.#emit('upgrade', { tower });
    }

    /** Advances the wave counter without playing the waves, then starts the next one. */
    skipWaves(count) {
      if (this.phase !== 'build') return { ok: false, reason: 'busy' };
      this.wave += Math.max(0, count);
      return this.startWave();
    }

    // Simulation

    update(dt) {
      this.time += dt;
      if (this.phase === 'over') {
        // The village has fallen: the invaders sack it while shots already loosed land.
        this.enemies = this.enemies.filter((enemy) => !enemy.dead);
        this.#sack(dt);
        this.#moveProjectiles(dt);
        this.enemies = this.enemies.filter((enemy) => !enemy.dead);
        return;
      }
      this.#spawn(dt);
      this.#moveEnemies(dt);
      if (this.phase === 'over') return;
      this.#storm(dt);
      if (this.phase === 'over') return;
      this.#fireTowers(dt);
      this.#moveProjectiles(dt);
      this.enemies = this.enemies.filter((enemy) => !enemy.dead);
      this.#checkWaveEnd();
    }

    #spawn(dt) {
      if (this.phase !== 'wave' || this.#queue.length === 0) return;
      this.#spawnTimer -= dt;
      while (this.#spawnTimer <= 0 && this.#queue.length > 0) {
        const enemy = this.#createEnemy(this.#queue.shift(), this.#currentWave.hpScale);
        this.path.positionAt(0, enemy);
        this.enemies.push(enemy);
        this.#emit('spawn', { enemy });
        this.#spawnTimer += this.#currentWave.interval;
      }
    }

    #createEnemy(type, hpScale) {
      const hp = Math.round(ENEMIES[type].hp * hpScale);
      return {
        id: this.#nextId++, type, hp, maxHp: hp, distance: 0,
        x: 0, y: 0, heading: 0, slowTimer: 0, slowFactor: 1, dead: false,
        // At the gate: where it stands across the road, and its blows.
        state: 'march', lateral: 0, rank: -1, settled: false,
        strikes: 0, strikeTimer: 0, strikeTime: 0, repelIn: null,
        // In a fallen village: the way it is walking, what it is about to burn, and how long until it catches.
        route: null, target: null, lighting: null, torch: false, kindle: null, entering: false, inside: false,
      };
    }

    #speedOf(enemy) {
      return ENEMIES[enemy.type].speed * (enemy.slowTimer > 0 ? enemy.slowFactor : 1);
    }

    /** Marching invaders walk the road until they reach the back of the crowd at the gate, and join it. */
    #moveEnemies(dt) {
      for (const enemy of this.enemies) enemy.slowTimer = Math.max(0, enemy.slowTimer - dt);
      // The furthest first, so two arriving in the same tick line up in the order they walk.
      const marching = this.enemies
        .filter((enemy) => enemy.state === 'march')
        .sort((a, b) => b.distance - a.distance || a.id - b.id);
      let back = this.#crowdBack();
      for (const enemy of marching) {
        const step = this.#speedOf(enemy) * dt;
        enemy.distance += step;
        // Only work out its place in line once it is close to the back of the crowd.
        if (enemy.distance >= back - 1) {
          const slot = this.#layout([...this.#crowd, enemy]).get(enemy);
          if (enemy.distance >= slot.distance) {
            // It stops where its place is; if the crowd grew back past it, it steps back (see #storm).
            if (enemy.distance - slot.distance <= step) enemy.distance = slot.distance;
            enemy.state = slot.rank === 0 ? 'assault' : 'queue';
            enemy.rank = slot.rank;
            this.#crowd.push(enemy);
            this.#emit('gateReached', { enemy });
            back = this.#crowdBack();
          }
        }
        this.#roadPoint(enemy.distance, enemy);
      }
    }

    /**
     * The crowd at the gate: everyone shuffles towards their place in the
     * ranks; the front rank batters the door; spent attackers are felled by
     * the garrison.
     */
    #storm(dt) {
      this.#crowd = this.#crowd.filter((enemy) => !enemy.dead);
      if (!this.#crowd.length) return;
      const slots = this.#layout(this.#crowd);
      for (const enemy of this.#crowd) {
        const slot = slots.get(enemy);
        enemy.rank = slot.rank;
        enemy.state = slot.rank === 0 ? 'assault' : 'queue';
        this.#shuffle(enemy, slot.distance, slot.lateral, dt);

        if (enemy.repelIn !== null) {
          enemy.repelIn -= dt;
          if (enemy.repelIn <= 0) {
            enemy.dead = true;
            this.#emit('repelled', { enemy });
          }
          continue;
        }
        if (enemy.rank !== 0 || !enemy.settled) continue;
        const def = ENEMIES[enemy.type];
        if (enemy.strikeTime === 0) {
          // Just reached the door: raise the weapon before the first blow.
          enemy.strikeTime = ASSAULT.windup;
          enemy.strikeTimer = ASSAULT.windup;
        }
        enemy.strikeTimer -= dt;
        if (enemy.strikeTimer > 0) continue;
        enemy.strikes++;
        this.lives = Math.max(0, this.lives - 1);
        this.#emit('gateHit', { enemy, lives: this.lives, final: enemy.strikes >= def.lives });
        if (this.lives === 0) {
          this.#breakGate();
          return;
        }
        if (enemy.strikes >= def.lives) {
          enemy.repelIn = ASSAULT.garrison;
        } else {
          enemy.strikeTime = def.strike;
          enemy.strikeTimer += def.strike;
        }
      }
    }

    #breakGate() {
      this.gateBroken = true;
      this.phase = 'over';
      for (const enemy of this.#crowd) {
        enemy.state = 'sack';
        enemy.repelIn = null;
      }
      this.#crowd = [];
      this.#emit('gateBroken', {});
      this.#emit('gameOver', { wave: this.wave });
    }

    /**
     * After the fall: the invaders still on the road march on; everyone
     * pours through the gatehouse, lighting torches, and goes to burn the
     * village (see the class comment).
     */
    #sack(dt) {
      const { path } = this;
      const inside = path.length + ASSAULT.gateFace + ASSAULT.passage;
      for (const enemy of this.enemies) {
        enemy.slowTimer = Math.max(0, enemy.slowTimer - dt);
        const speed = this.#speedOf(enemy);
        if (enemy.state === 'march') {
          enemy.distance += speed * dt;
          this.#roadPoint(enemy.distance, enemy);
          if (enemy.distance >= path.length) enemy.state = 'sack';
          continue;
        }
        enemy.state = 'sack';
        if (!enemy.torch) {
          if (enemy.lighting === null) {
            // Through the middle of the door and the gatehouse.
            this.#shuffle(enemy, inside, 0, dt);
            if (enemy.settled) enemy.lighting = ASSAULT.light;
            continue;
          }
          // Just inside, lighting a torch.
          enemy.lighting -= dt;
          if (enemy.lighting <= 0) {
            enemy.lighting = null;
            enemy.torch = true;
            this.#nextTask(enemy, VILLAGE_PLAN.entrance);
          }
          continue;
        }
        if (enemy.kindle !== null) {
          enemy.kindle -= dt;
          if (enemy.kindle <= 0) this.#setAlight(enemy);
          continue;
        }
        if (this.#walk(enemy, speed * dt)) this.#arrive(enemy);
      }
      this.enemies = this.enemies.filter((enemy) => !enemy.dead && !enemy.inside);
    }

    /** Sends an invader standing at a path point to the nearest building nobody has taken, or to the square if none is left. */
    #nextTask(enemy, from) {
      const { paths, targets } = this.#village;
      let best = null;
      let bestDistance = Infinity;
      for (const target of targets) {
        const point = paths.point(target.from);
        const distance = paths.distance(from, target.from) + Math.hypot(target.stand[0] - point.x, target.stand[1] - point.y);
        if (distance < bestDistance) {
          best = target;
          bestDistance = distance;
        }
      }
      if (best) {
        targets.splice(targets.indexOf(best), 1);
        enemy.target = best;
        enemy.route = [...paths.route(from, best.from), { x: best.stand[0], y: best.stand[1] }].map((point) => this.#villagePoint(point.x, point.y));
      } else {
        enemy.target = null;
        const spot = VILLAGE_PLAN.square[this.#village.spot++ % VILLAGE_PLAN.square.length];
        const gather = paths.nearest(spot[0], spot[1]);
        enemy.route = [...paths.route(from, gather.name), { x: spot[0], y: spot[1] }].map((point) => this.#villagePoint(point.x, point.y));
      }
      enemy.settled = false;
    }

    /** Walks an invader along its route; true when it gets to the end. */
    #walk(enemy, step) {
      let left = step;
      while (enemy.route.length && left > 0) {
        const [target] = enemy.route;
        const dx = target.x - enemy.x;
        const dy = target.y - enemy.y;
        const gap = Math.hypot(dx, dy);
        if (gap > 1e-9) enemy.heading = Math.atan2(dx, dy);
        if (gap <= left) {
          enemy.x = target.x;
          enemy.y = target.y;
          enemy.route.shift();
          left -= gap;
        } else {
          enemy.x += (dx / gap) * left;
          enemy.y += (dy / gap) * left;
          left = 0;
        }
      }
      return enemy.route.length === 0 && !enemy.settled;
    }

    #arrive(enemy) {
      const { target } = enemy;
      if (!target) {
        enemy.settled = true;
        return;
      }
      if (enemy.kindle === null && !enemy.entering) {
        // At the building: face it and hold the torch to it until it catches.
        const face = this.#villagePoint(...target.face);
        enemy.heading = Math.atan2(face.x - enemy.x, face.y - enemy.y);
        enemy.kindle = ASSAULT.kindle;
        enemy.settled = true;
        return;
      }
      if (enemy.entering) {
        // Through the keep's door: the keep is theirs.
        enemy.inside = true;
        this.#emit('keepTaken', { enemy });
      }
    }

    #setAlight(enemy) {
      const { target } = enemy;
      enemy.kindle = null;
      this.#emit('torch', { enemy, target: target.name });
      if (target.enter) {
        enemy.entering = true;
        enemy.settled = false;
        enemy.route = [this.#villagePoint(...target.face)];
        return;
      }
      // Back to the path, and on to the next.
      this.#nextTask(enemy, target.from);
    }

    /** Tile coordinates of a point of the village plan. */
    #villagePoint(x, y) {
      const { gate } = this.map;
      return { x: gate.col + x, y: gate.row + y };
    }

    /**
     * Who stands where in front of the door: ranks filled in order of
     * arrival, the front one as wide as the passage and the rest as wide as
     * the road, each centred on it. Returns a Map of enemy → `{ rank,
     * distance, lateral }` in road coordinates (distance along the road,
     * which continues straight on past its end to the door).
     */
    #layout(members) {
      const ranks = [];
      for (const enemy of members) {
        const { radius, reach = radius } = ENEMIES[enemy.type];
        const width = radius * 2 * ASSAULT.shoulder;
        let rank = ranks.at(-1);
        const limit = ranks.length <= 1 ? ASSAULT.frontWidth : ASSAULT.rankWidth;
        if (!rank || (rank.members.length > 0 && rank.width + width > limit + 1e-9)) {
          rank = { members: [], width: 0, depth: 0, reach: 0 };
          ranks.push(rank);
        }
        rank.members.push({ enemy, width });
        rank.width += width;
        rank.depth = Math.max(rank.depth, radius);
        rank.reach = Math.max(rank.reach, reach);
      }
      const slots = new Map();
      let front = this.path.length + ASSAULT.gateFace;
      ranks.forEach((rank, index) => {
        // The front rank stands so that whatever sticks out furthest (a horse's head) just meets the door.
        const distance = Math.max(0, front - (index === 0 ? rank.reach : rank.depth));
        let lateral = -rank.width / 2;
        for (const { enemy, width } of rank.members) {
          slots.set(enemy, { rank: index, distance, lateral: lateral + width / 2 });
          lateral += width;
        }
        front = distance - rank.depth - ASSAULT.rankGap;
      });
      return slots;
    }

    /** A road distance a tile behind the crowd's last member: nobody short of it can be joining the crowd yet. */
    #crowdBack() {
      if (!this.#crowd.length) return this.path.length;
      let back = Infinity;
      for (const enemy of this.#crowd) back = Math.min(back, enemy.distance);
      return back - 1;
    }

    /** Walks an invader in road coordinates towards `distance` along and `lateral` across the road, facing the gate. */
    #shuffle(enemy, distance, lateral, dt) {
      const along = distance - enemy.distance;
      const across = lateral - enemy.lateral;
      const gap = Math.hypot(along, across);
      const step = this.#speedOf(enemy) * dt;
      if (gap <= step) {
        enemy.distance = distance;
        enemy.lateral = lateral;
        enemy.settled = true;
      } else {
        enemy.distance += (along / gap) * step;
        enemy.lateral += (across / gap) * step;
        enemy.settled = false;
      }
      const road = this.#roadPoint(enemy.distance, this.#point);
      // The road's right-hand side: its heading turned a quarter to the right.
      enemy.x = road.x - Math.cos(road.heading) * enemy.lateral;
      enemy.y = road.y + Math.sin(road.heading) * enemy.lateral;
      // Face the gate; turn a little towards a sideways shuffle, never away from it.
      enemy.heading = enemy.settled ? road.heading : road.heading - Math.atan2(across, Math.max(along, Math.abs(across) * SHUFFLE_FORWARD));
    }

    /** Point and heading `distance` along the road; past its end the road runs straight on to the door and into the village. */
    #roadPoint(distance, target) {
      const { path } = this;
      if (distance <= path.length) return path.positionAt(distance, target);
      const end = path.points.at(-1);
      const over = distance - path.length;
      target.x = end.x + this.door.forward.x * over;
      target.y = end.y + this.door.forward.y * over;
      target.heading = this.door.heading;
      return target;
    }

    /** Towers shoot the enemy furthest along the path within range. */
    #fireTowers(dt) {
      for (const tower of this.towers) {
        tower.cooldown = Math.max(0, tower.cooldown - dt);
        if (tower.cooldown > 0) continue;

        const stats = this.statsOf(tower);
        let target = null;
        for (const enemy of this.enemies) {
          if (enemy.dead || Math.hypot(enemy.x - tower.col, enemy.y - tower.row) > stats.range) continue;
          if (!target || enemy.distance > target.distance) target = enemy;
        }
        if (!target) continue;

        tower.cooldown = 1 / stats.rate;
        tower.aim = Math.atan2(target.x - tower.col, target.y - tower.row);
        const projectile = {
          id: this.#nextId++, tower: tower.type, x: tower.col, y: tower.row,
          target, targetX: target.x, targetY: target.y,
          speed: TOWERS_BY_ID[tower.type].projectileSpeed, stats,
        };
        this.projectiles.push(projectile);
        this.#emit('shot', { tower, projectile });
      }
    }

    #moveProjectiles(dt) {
      this.projectiles = this.projectiles.filter((projectile) => {
        if (!projectile.target.dead) {
          projectile.targetX = projectile.target.x;
          projectile.targetY = projectile.target.y;
        }
        const dx = projectile.targetX - projectile.x;
        const dy = projectile.targetY - projectile.y;
        const distance = Math.hypot(dx, dy);
        const travel = projectile.speed * dt;
        if (distance > travel) {
          projectile.x += (dx / distance) * travel;
          projectile.y += (dy / distance) * travel;
          return true;
        }
        projectile.x = projectile.targetX;
        projectile.y = projectile.targetY;
        this.#impact(projectile);
        return false;
      });
    }

    #impact(projectile) {
      const { stats } = projectile;
      const victims = stats.splash
        ? this.enemies.filter((enemy) => !enemy.dead && Math.hypot(enemy.x - projectile.x, enemy.y - projectile.y) <= stats.splash)
        : [projectile.target].filter((enemy) => !enemy.dead);

      for (const enemy of victims) {
        if (stats.slow) {
          enemy.slowFactor = stats.slow;
          enemy.slowTimer = stats.slowSeconds;
        }
        this.#damage(enemy, stats.damage);
      }
      this.#emit('hit', { projectile, x: projectile.x, y: projectile.y, splash: stats.splash ?? 0 });
    }

    #damage(enemy, amount) {
      const def = ENEMIES[enemy.type];
      enemy.hp -= Math.max(1, amount - def.armor);
      if (enemy.hp > 0 || enemy.dead) return;
      enemy.dead = true;
      this.gold += def.bounty;
      this.#emit('death', { enemy, bounty: def.bounty });
    }

    #checkWaveEnd() {
      if (this.phase !== 'wave' || this.#queue.length > 0 || this.enemies.length > 0) return;
      this.phase = 'build';
      this.gold += this.#currentWave.bonus;
      this.#emit('waveClear', { wave: this.wave, bonus: this.#currentWave.bonus });
    }

    #emit(type, details) {
      this.#events.push({ type, ...details });
    }
  }

  Object.assign(Hold, { World });
})();
