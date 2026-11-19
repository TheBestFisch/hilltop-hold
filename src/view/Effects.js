(() => {
  'use strict';

  const MAX_PARTICLES = 1200;

  /**
   * Particle look and motion per burst kind. Particles fly out sideways at
   * `speed` and up at `lift`, fall with `gravity` (negative rises), slow
   * down with `drag`, drift with `wind` [x, y, z], live `life` seconds and
   * shrink as they age. `sphere` throws them in every direction (fireworks).
   */
  const KINDS = {
    hit: { count: 5, colors: [0xfff1c4, 0xf6c86b], speed: 2, lift: 2, gravity: 8, life: 0.3, size: 0.05 },
    splash: { count: 18, colors: [0x6e6a63, 0xf6c86b, 0x3d3a36, 0xff9a3c], speed: 3, lift: 3, gravity: 9, life: 0.5, size: 0.08 },
    frost: { count: 9, colors: [0xbfeaff, 0xffffff, 0x7fd7ff], speed: 1.5, lift: 1.5, gravity: 2, life: 0.5, size: 0.06 },
    poof: { count: 14, colors: [0xf3efe6, 0xd9d2c3, 0xb8a98f], speed: 2.5, lift: 3, gravity: 5, life: 0.6, size: 0.08 },
    coins: { count: 6, colors: [0xf2c23a, 0xffe07a], speed: 1, lift: 4, gravity: 9, life: 0.6, size: 0.06 },
    muzzle: { count: 8, colors: [0xd9d2c3, 0xa8a39b, 0xffb347], speed: 1.2, lift: 1.2, gravity: -0.5, life: 0.45, size: 0.07 },
    dust: { count: 12, colors: [0xd8b98c, 0xb08a62, 0xe6cba3], speed: 2.2, lift: 1.5, gravity: 4, life: 0.5, size: 0.07 },
    sparkle: { count: 16, colors: [0xffe07a, 0xffffff, 0x7fd7ff], speed: 1.4, lift: 3.5, gravity: 3, life: 0.8, size: 0.05 },
    // The gate beaten in and breaking; fireworks for a held wave.
    splinters: { count: 9, colors: [0xe6c48e, 0xb07a4a, 0x7a4e2e], speed: 1.1, lift: 1.6, gravity: 9, life: 0.55, size: 0.04 },
    // Burnt buildings coming down: dust and ash, and a shower of sparks.
    collapse: { count: 28, colors: [0x6e6760, 0x8f877c, 0x4a4542, 0xa89a86], speed: 1.8, lift: 1.4, gravity: 2.5, drag: 1.5, life: 1.3, size: 0.08 },
    sparks: { count: 26, colors: [0xffe07a, 0xffb347, 0xff7a1a], speed: 1.1, lift: 3.2, gravity: 1.2, drag: 0.8, life: 1.5, size: 0.03 },
    rubble: { count: 34, colors: [0xe6c48e, 0x7a4e2e, 0x9a968e, 0x6f6a66, 0xcfc8bd], speed: 2.6, lift: 2.6, gravity: 9, life: 0.9, size: 0.065 },
    stone: { count: 10, colors: [0x9a968e, 0x6f6a66, 0xd9d2c3], speed: 1.6, lift: 1.4, gravity: 8, life: 0.45, size: 0.05 },
    spark: { count: 1, colors: [0xffe07a, 0xfff1c4], speed: 0.15, lift: 0, gravity: 1.5, life: 0.35, size: 0.03 },
    firework: { count: 44, colors: [0xffe07a, 0xffffff], speed: 2.2, lift: 0, gravity: 1.4, drag: 1.1, life: 1.3, size: 0.06, sphere: true },
  };

  /** Pooled particles drawn with one instanced mesh. Advanced by simulation time. */
  class Effects {
    #particles = [];
    #matrix = new THREE.Matrix4();
    #scale = new THREE.Vector3();
    #color = new THREE.Color();
    #direction = new THREE.Vector3();

    constructor(scene) {
      this.mesh = new THREE.InstancedMesh(new THREE.OctahedronGeometry(1, 0), new THREE.MeshBasicMaterial(), MAX_PARTICLES);
      this.mesh.count = 0;
      this.mesh.frustumCulled = false;
      scene.add(this.mesh);
    }

    /**
     * Throws a burst of `kind` particles from `position`. `direction` (a
     * vector, its length in tiles per second) is added to every particle's
     * velocity; `colors` and `count` override the kind's.
     */
    burst(position, kind, { direction = null, colors = null, count = null } = {}) {
      const config = KINDS[kind];
      const palette = colors ?? config.colors;
      const total = count ?? config.count;
      for (let i = 0; i < total && this.#particles.length < MAX_PARTICLES; i++) {
        const velocity = new THREE.Vector3();
        if (config.sphere) {
          this.#direction.set(Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * 2 - 1);
          if (this.#direction.lengthSq() < 1e-4) this.#direction.set(0, 1, 0);
          velocity.copy(this.#direction.normalize()).multiplyScalar(config.speed * (0.75 + Math.random() * 0.25));
        } else {
          const angle = Math.random() * Math.PI * 2;
          const spread = config.speed * (0.4 + Math.random() * 0.6);
          velocity.set(Math.cos(angle) * spread, config.lift * (0.5 + Math.random() * 0.5), Math.sin(angle) * spread);
        }
        if (direction) velocity.addScaledVector(direction, 0.6 + Math.random() * 0.6);
        this.#particles.push({
          position: position.clone(),
          velocity,
          age: 0,
          config,
          color: palette[i % palette.length],
        });
      }
    }

    update(dt) {
      this.#particles = this.#particles.filter((particle) => (particle.age += dt) < particle.config.life);
      this.#particles.forEach((particle, index) => {
        const { config } = particle;
        particle.velocity.y -= config.gravity * dt;
        if (config.drag) particle.velocity.multiplyScalar(Math.exp(-config.drag * dt));
        particle.position.addScaledVector(particle.velocity, dt);
        if (config.wind) {
          particle.position.x += config.wind[0] * dt;
          particle.position.y += config.wind[1] * dt;
          particle.position.z += config.wind[2] * dt;
        }
        this.#scale.setScalar(config.size * (1 - (particle.age / config.life) * 0.7));
        this.#matrix.makeScale(this.#scale.x, this.#scale.y, this.#scale.z).setPosition(particle.position);
        this.mesh.setMatrixAt(index, this.#matrix);
        this.mesh.setColorAt(index, this.#color.setHex(particle.color));
      });
      this.mesh.count = this.#particles.length;
      this.mesh.instanceMatrix.needsUpdate = true;
      if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
    }

    clear() {
      this.#particles = [];
      this.mesh.count = 0;
    }
  }

  Object.assign(Hold, { Effects, EFFECT_KINDS: Object.keys(KINDS) });
})();
