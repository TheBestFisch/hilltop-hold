(() => {
  'use strict';

  /*
   * Lighting shared by the game and the gallery, so an asset looks the same
   * in both: a warm sun with soft shadows, a sky/ground hemisphere fill and
   * a gradient sky dome.
   */

  const SKY = {
    top: 0x5aa7e6,
    horizon: 0xcfe6f5,
    bottom: 0x8fbf7a,
    fog: 0xc9e2f2,
  };

  /**
   * Where the sun sits relative to what it lights (direction only; distance
   * is set by the fit): low in the west, a little towards the camera, so
   * shadows are long enough to read and every model's front stays lit.
   */
  const SUN_DIRECTION = [-0.75, 0.62, 0.24];

  /**
   * Creates the sun and fill lights. The sun is the only shadow caster; the
   * fill is kept low so shadows stay deep enough to read, and slightly blue
   * so shaded sides look cool against the warm sun. `bounds` is the world
   * box the sun's shadow map must cover (see fitShadow).
   */
  function createLights({ shadows = true, bounds = new THREE.Box3(new THREE.Vector3(-4, 0, -4), new THREE.Vector3(4, 3, 4)), shadowSize = 2048 } = {}) {
    const sun = new THREE.DirectionalLight(0xffe9c7, 3.1);
    sun.castShadow = shadows;
    if (shadows) {
      sun.shadow.mapSize.set(shadowSize, shadowSize);
      sun.shadow.bias = -0.00025;
      sun.shadow.normalBias = 0.02;
      sun.shadow.radius = 2;
    }
    fitShadow(sun, bounds);
    const fill = new THREE.HemisphereLight(0xc6dcff, 0x5b6b44, 0.75);
    const bounce = new THREE.DirectionalLight(0xaecbff, 0.3);
    bounce.position.set(7, 5, -9);
    const group = new THREE.Group();
    group.add(sun, sun.target, fill, bounce);
    return { group, sun, fill, bounce };
  }

  /**
   * Places the sun along `direction` and fits its orthographic shadow
   * camera tightly around `bounds` as seen from the light, so every texel of
   * the shadow map lands on the scene instead of empty space.
   */
  function fitShadow(sun, bounds, direction = SUN_DIRECTION) {
    const centre = bounds.getCenter(new THREE.Vector3());
    const radius = bounds.getSize(new THREE.Vector3()).length() / 2;
    sun.target.position.copy(centre);
    sun.position.copy(centre).addScaledVector(new THREE.Vector3(...direction).normalize(), radius + 5);
    sun.target.updateMatrixWorld();
    sun.updateMatrixWorld();
    // The shadow camera sits at the sun looking at its target; measure the box in that view.
    const view = new THREE.Matrix4().lookAt(sun.position, sun.target.position, new THREE.Vector3(0, 1, 0));
    view.setPosition(sun.position);
    view.invert();
    const box = new THREE.Box3();
    const corner = new THREE.Vector3();
    for (const x of [bounds.min.x, bounds.max.x]) {
      for (const y of [bounds.min.y, bounds.max.y]) {
        for (const z of [bounds.min.z, bounds.max.z]) box.expandByPoint(corner.set(x, y, z).applyMatrix4(view));
      }
    }
    const camera = sun.shadow.camera;
    camera.left = box.min.x;
    camera.right = box.max.x;
    camera.bottom = box.min.y;
    camera.top = box.max.y;
    camera.near = Math.max(0.1, -box.max.z - 1);
    camera.far = -box.min.z + 1;
    camera.updateProjectionMatrix();
    sun.shadow.needsUpdate = true;
  }

  /** A huge inside-out sphere with a vertical colour gradient; ignores fog. */
  function createSkyDome(radius = 400) {
    const material = new THREE.ShaderMaterial({
      uniforms: {
        top: { value: new THREE.Color(SKY.top) },
        horizon: { value: new THREE.Color(SKY.horizon) },
        bottom: { value: new THREE.Color(SKY.bottom) },
      },
      vertexShader: `
        varying vec3 vWorld;
        void main() {
          vec4 world = modelMatrix * vec4(position, 1.0);
          vWorld = world.xyz;
          gl_Position = projectionMatrix * viewMatrix * world;
        }
      `,
      fragmentShader: `
        uniform vec3 top;
        uniform vec3 horizon;
        uniform vec3 bottom;
        varying vec3 vWorld;
        void main() {
          float h = normalize(vWorld).y;
          vec3 color = h > 0.0 ? mix(horizon, top, pow(h, 0.55)) : mix(horizon, bottom, pow(-h, 0.4));
          gl_FragColor = vec4(color, 1.0);
          #include <colorspace_fragment>
        }
      `,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
    });
    const dome = new THREE.Mesh(new THREE.SphereGeometry(radius, 24, 12), material);
    dome.frustumCulled = false;
    dome.renderOrder = -1;
    return dome;
  }

  /** Renderer settings shared by every page. */
  function configureRenderer(renderer, { shadows = true } = {}) {
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = shadows;
    // PCF with a sampling radius gives soft but defined edges at high resolution.
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;
  }

  /**
   * Shadow map resolution for this device: 4096² (crisp, ~64 MB) only on
   * desktop-class GPUs that support very large textures, 2048² otherwise.
   */
  function shadowMapSize(renderer) {
    return renderer.capabilities.maxTextureSize >= 16384 ? 4096 : 2048;
  }

  Object.assign(Hold, { lighting: { SKY, SUN_DIRECTION, createLights, fitShadow, shadowMapSize, createSkyDome, configureRenderer } });
})();
