(() => {
  'use strict';

  /** Particles per fire: flame puffs (a few become embers) and smoke puffs. */
  const FLAMES = 40;
  const SMOKE = 18;
  const WIND = [0.22, 0, -0.1];

  const COMMON = /* glsl */ `
    uniform float uTime;
    uniform vec3 uWind;
    attribute vec3 aOrigin;
    attribute vec4 aShape;
    attribute vec4 aSeed;
    varying vec2 vUv;
    varying float vAge;
    varying float vStrength;
    const float TAU = 6.2831853;
    float hash(float n) { return fract(sin(n) * 43758.5453); }
    // A camera-facing quad of the given width and height around p.
    vec4 billboard(vec3 p, vec2 size) {
      vec4 mv = modelViewMatrix * vec4(p, 1.0);
      mv.xy += position.xy * size;
      return projectionMatrix * mv;
    }
  `;

  /*
   * Flames: each puff is born somewhere in the fire's footprint, licks
   * upward while drawing in towards the fire's axis (so the fire tapers to
   * tongues), sways, and cools from white through yellow and orange to a
   * dull red as it dies. A few puffs are embers that fly higher and wander,
   * and a few are a broad dim glow around the fire's heart.
   * Every puff loops forever on its own clock, so nothing is spawned on the
   * CPU; `aShape` is the fire's footprint radius, flame height, puff size
   * and strength (0 hides it).
   */
  const FLAME_VERTEX = /* glsl */ `${COMMON}
    varying float vEmber;
    varying float vGlow;
    void main() {
      float strength = aShape.w;
      float glow = step(0.8, aSeed.w) * (1.0 - step(0.92, aSeed.w));
      float life = mix(0.5, 0.95, aSeed.y) * (0.8 + 0.35 * aShape.y);
      float cycle = uTime / life + aSeed.x;
      float age = fract(cycle);
      float n = floor(cycle);
      float r1 = hash(n * 12.9898 + aSeed.z * 78.233);
      float r2 = hash(n * 39.3468 + aSeed.w * 11.135 + 3.7);
      float ember = step(0.92, aSeed.w);
      float angle = r1 * TAU;
      float radius = sqrt(r2) * aShape.x;
      vec3 start = aOrigin + vec3(cos(angle) * radius, 0.0, sin(angle) * radius);
      float height = aShape.y * (0.4 + 0.6 * strength);
      vec3 p = start;
      p.y += mix(age * (0.65 + 0.35 * age), age * 2.8, ember) * height * (1.0 - 0.6 * glow);
      p.xz = mix(start.xz, aOrigin.xz, (1.0 - ember) * age * 0.6);
      float wobble = aShape.x * 0.5 + 0.06;
      p.x += (sin(uTime * 9.0 + r1 * 40.0 + age * 5.0) + 0.5 * sin(uTime * 15.0 + r2 * 30.0)) * wobble * age * 0.6;
      p.z += cos(uTime * 8.0 + r2 * 40.0 + age * 4.0) * wobble * age * 0.6;
      p += uWind * age * age * height * (1.0 + ember * 2.5);
      float size = aShape.z * (0.5 + 0.5 * strength) * smoothstep(0.0, 0.12, age) * (1.0 - 0.6 * age);
      size *= mix(1.0, 0.16, ember) * (1.0 + 1.6 * glow) * step(0.001, strength);
      gl_Position = billboard(p, vec2(size, size * mix(1.55, 1.0, max(ember, glow))));
      vUv = uv;
      vAge = age;
      vEmber = ember;
      vGlow = glow;
      vStrength = strength;
    }
  `;

  const FLAME_FRAGMENT = /* glsl */ `
    varying vec2 vUv;
    varying float vAge;
    varying float vEmber;
    varying float vGlow;
    varying float vStrength;
    void main() {
      vec2 d = vUv - 0.5;
      if (vGlow > 0.5) {
        // The glow around the fire's heart: a soft orange haze that only adds light.
        float haze = clamp(1.0 - length(d) * 2.0, 0.0, 1.0);
        float a = haze * haze * 0.35 * (1.0 - vAge) * min(1.0, vStrength * 1.5);
        gl_FragColor = vec4(vec3(1.0, 0.5, 0.12) * a, 0.0);
        return;
      }
      // A tongue: rounded at the bottom, drawn to a point at the top.
      d.x *= 1.0 + vUv.y * 0.9;
      d.y *= 0.9;
      float shape = clamp(1.0 - length(d) * 2.0, 0.0, 1.0);
      shape = shape * shape * (3.0 - 2.0 * shape);
      vec3 white = vec3(1.0, 0.96, 0.8);
      vec3 yellow = vec3(1.0, 0.76, 0.22);
      vec3 orange = vec3(0.98, 0.38, 0.05);
      vec3 red = vec3(0.55, 0.08, 0.02);
      float t = vAge;
      vec3 color = t < 0.18 ? mix(white, yellow, t / 0.18) : t < 0.5 ? mix(yellow, orange, (t - 0.18) / 0.32) : mix(orange, red, (t - 0.5) / 0.5);
      color = mix(color, white, pow(shape, 3.0) * (1.0 - t) * 0.7);
      color = mix(color, vec3(1.0, 0.72, 0.28), vEmber);
      float alpha = min(1.0, shape * 1.35) * (1.0 - smoothstep(0.55, 1.0, t)) * min(1.0, vStrength * 1.5);
      alpha = mix(alpha, shape * (1.0 - t), vEmber);
      if (alpha < 0.01) discard;
      // Premultiplied: partly glowing light added to the scene, partly body that covers what is behind.
      float cover = mix(0.7, 0.0, vEmber) * (1.0 - 0.5 * t);
      gl_FragColor = vec4(color * alpha * 1.15, alpha * cover);
    }
  `;

  /*
   * Smoke: puffs rise from above the flames, swell, drift downwind and
   * thin out, dark where they leave the fire and paler as they climb.
   */
  const SMOKE_VERTEX = /* glsl */ `${COMMON}
    varying float vShade;
    void main() {
      float strength = aShape.w;
      float life = mix(3.0, 4.4, aSeed.y);
      float cycle = uTime / life + aSeed.x;
      float age = fract(cycle);
      float n = floor(cycle);
      float r1 = hash(n * 17.13 + aSeed.z * 51.7);
      float height = aShape.y * (0.5 + 0.5 * strength);
      vec3 p = aOrigin + vec3((r1 - 0.5) * aShape.x, height * 0.75, (hash(r1 * 9.1) - 0.5) * aShape.x);
      p.y += age * (0.9 + 1.6 * strength) * (1.0 + aShape.y);
      p += uWind * age * age * 5.0;
      p.x += sin(uTime * 0.9 + r1 * 20.0) * 0.08 * age;
      float size = aShape.z * (1.4 + 5.5 * age) * (0.55 + 0.45 * strength) * step(0.001, strength);
      gl_Position = billboard(p, vec2(size));
      vUv = uv;
      vAge = age;
      vStrength = strength * (0.6 + 0.4 * aSeed.w);
      vShade = r1;
    }
  `;

  const SMOKE_FRAGMENT = /* glsl */ `
    varying vec2 vUv;
    varying float vAge;
    varying float vStrength;
    varying float vShade;
    void main() {
      vec2 d = vUv - 0.5;
      // A cauliflower puff: a disc with two smaller lobes.
      float puff = max(max(1.0 - length(d) * 2.2, 1.0 - length(d - vec2(0.16, 0.12)) * 3.2), 1.0 - length(d + vec2(0.15, -0.08)) * 3.4);
      puff = clamp(puff, 0.0, 1.0);
      puff = puff * puff * (3.0 - 2.0 * puff);
      vec3 color = mix(vec3(0.16, 0.14, 0.13), vec3(0.5, 0.48, 0.46), smoothstep(0.0, 0.8, vAge)) * (0.85 + 0.3 * vShade);
      float alpha = puff * smoothstep(0.0, 0.12, vAge) * (1.0 - smoothstep(0.45, 1.0, vAge)) * 0.85 * vStrength;
      if (alpha < 0.01) discard;
      gl_FragColor = vec4(color * alpha, alpha);
    }
  `;

  function particles(count, perEmitter, vertexShader, fragmentShader, uniforms) {
    const quad = new THREE.PlaneGeometry(1, 1);
    const geometry = new THREE.InstancedBufferGeometry();
    geometry.index = quad.index;
    geometry.setAttribute('position', quad.attributes.position);
    geometry.setAttribute('uv', quad.attributes.uv);
    const total = count * perEmitter;
    const origin = new THREE.InstancedBufferAttribute(new Float32Array(total * 3), 3);
    const shape = new THREE.InstancedBufferAttribute(new Float32Array(total * 4), 4);
    const seed = new THREE.InstancedBufferAttribute(new Float32Array(total * 4), 4);
    origin.setUsage(THREE.DynamicDrawUsage);
    shape.setUsage(THREE.DynamicDrawUsage);
    for (let i = 0; i < total; i++) {
      // Fixed randomness per puff: clock offset, lifetime, and two seeds.
      seed.setXYZW(i, (i % perEmitter) / perEmitter + Math.random() * 0.05, Math.random(), Math.random(), Math.random());
    }
    geometry.setAttribute('aOrigin', origin);
    geometry.setAttribute('aShape', shape);
    geometry.setAttribute('aSeed', seed);
    geometry.instanceCount = total;
    const material = new THREE.ShaderMaterial({
      uniforms,
      vertexShader,
      fragmentShader,
      transparent: true,
      depthWrite: false,
      blending: THREE.CustomBlending,
      blendEquation: THREE.AddEquation,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneMinusSrcAlphaFactor,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.frustumCulled = false;
    return { mesh, origin, shape, perEmitter };
  }

  /**
   * Fires drawn as particles on the GPU: every fire in the game (burning
   * buildings, torches) in two draw calls, one for flames and embers, one
   * for smoke. `add` returns an emitter whose `position`, `radius` (its
   * footprint), `height` (of the flames), `size` (of a puff), `smoke`
   * (0–1) and `strength` (0–1, 0 puts it out) can be changed at any time;
   * `update(time)` uploads them and advances the flames to `time` seconds,
   * so fires freeze with whatever clock drives them.
   */
  class FireSystem {
    #emitters = [];
    #free = [];
    #uniforms = { uTime: { value: 0 }, uWind: { value: new THREE.Vector3(...WIND) } };

    constructor({ capacity = 48 } = {}) {
      this.capacity = capacity;
      this.flames = particles(capacity, FLAMES, FLAME_VERTEX, FLAME_FRAGMENT, this.#uniforms);
      this.smoke = particles(capacity, SMOKE, SMOKE_VERTEX, SMOKE_FRAGMENT, this.#uniforms);
      // Smoke first, so the flames show through the smoke they make.
      this.smoke.mesh.renderOrder = 4;
      this.flames.mesh.renderOrder = 5;
      this.group = new THREE.Group();
      this.group.add(this.smoke.mesh, this.flames.mesh);
      for (let i = capacity - 1; i >= 0; i--) this.#free.push(i);
    }

    /** A new fire; null when every slot burns already. */
    add({ position, radius = 0.15, height = 0.5, size = 0.16, smoke = 1, strength = 1 } = {}) {
      const slot = this.#free.pop();
      if (slot === undefined) return null;
      const emitter = { slot, position: position.clone(), radius, height, size, smoke, strength };
      this.#emitters.push(emitter);
      return emitter;
    }

    remove(emitter) {
      if (!emitter || !this.#emitters.includes(emitter)) return;
      this.#emitters = this.#emitters.filter((entry) => entry !== emitter);
      emitter.strength = 0;
      this.#write(emitter);
      this.#free.push(emitter.slot);
    }

    clear() {
      for (const emitter of [...this.#emitters]) this.remove(emitter);
    }

    /** Emitters burning now (strength above 0). */
    get burning() {
      return this.#emitters.filter((emitter) => emitter.strength > 0);
    }

    update(time) {
      this.#uniforms.uTime.value = time;
      for (const emitter of this.#emitters) this.#write(emitter);
      for (const layer of [this.flames, this.smoke]) {
        layer.origin.needsUpdate = true;
        layer.shape.needsUpdate = true;
      }
    }

    #write(emitter) {
      const { position, radius, height, size, strength, smoke } = emitter;
      for (const [layer, puff, amount] of [[this.flames, size, strength], [this.smoke, size * 0.9, strength * smoke]]) {
        const first = emitter.slot * layer.perEmitter;
        for (let i = first; i < first + layer.perEmitter; i++) {
          layer.origin.setXYZ(i, position.x, position.y, position.z);
          layer.shape.setXYZW(i, radius, height, puff, amount);
        }
      }
    }
  }

  Object.assign(Hold, { FireSystem });
})();
