(() => {
  'use strict';

  /**
   * Camera presets and placement, shared by the game and the tests (which
   * check that nothing in the scenery blocks the player's view of the
   * battlefield). The camera looks at `target` from `direction` and backs
   * off until the whole battlefield (map plus cave and village, `fit` in
   * world units) is visible for the window's shape; `margin` leaves room for
   * the HUD. Presets other than `default` are for the debug menu.
   */
  const CAMERA_PRESETS = {
    default: { fov: 40, direction: [0, 11, 9.5], target: [1.3, 0.3, 1.1], fit: { width: 28, depth: 13.5 }, margin: 1.08 },
    low: { fov: 40, direction: [0.5, 5.5, 9.5], target: [1.3, 0.4, 1.2], fit: { width: 25, depth: 14 }, margin: 1.05 },
    top: { fov: 40, direction: [0, 20, 3], target: [1.3, 0, 0.8], fit: { width: 24, depth: 14 }, margin: 1.05 },
    approach: { fov: 40, direction: [-5, 6, 10], target: [9, -0.6, 9], fit: { width: 13, depth: 10 }, margin: 1.05 },
    village: { fov: 40, direction: [-3, 7, 9], target: [9.5, 0.9, 0.6], fit: { width: 10, depth: 6 }, margin: 1.05 },
    cave: { fov: 40, direction: [3, 6, 9], target: [-8, 0.8, -1], fit: { width: 9, depth: 6 }, margin: 1.05 },
    /** The gate and the village behind it, from the road: where the game turns when the village falls. */
    siege: { fov: 40, direction: [-3, 8, 7.5], target: [9.1, 0.9, 4.0], fit: { width: 12, depth: 8.5 }, margin: 1.05 },
  };

  const lerp = (a, b, t) => a + (b - a) * t;

  /** A preset `t` (0–1) of the way from `a` to `b`, for gliding the camera between them. */
  function blendPresets(a, b, t) {
    return {
      fov: lerp(a.fov, b.fov, t),
      direction: a.direction.map((value, i) => lerp(value, b.direction[i], t)),
      target: a.target.map((value, i) => lerp(value, b.target[i], t)),
      fit: { width: lerp(a.fit.width, b.fit.width, t), depth: lerp(a.fit.depth, b.fit.depth, t) },
      margin: lerp(a.margin, b.margin, t),
    };
  }

  /** Positions and aims `camera` (a PerspectiveCamera with its aspect set) for `preset`. */
  function placeCamera(camera, preset) {
    const halfV = THREE.MathUtils.degToRad(preset.fov / 2);
    const halfH = Math.atan(Math.tan(halfV) * camera.aspect);
    const distance = preset.margin * Math.max(
      preset.fit.width / 2 / Math.tan(halfH),
      preset.fit.depth / 2 / Math.tan(halfV),
    );
    const target = new THREE.Vector3(...preset.target);
    camera.fov = preset.fov;
    camera.position.copy(target).addScaledVector(new THREE.Vector3(...preset.direction).normalize(), distance);
    camera.lookAt(target);
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
    return camera;
  }

  Object.assign(Hold, { CAMERA_PRESETS, placeCamera, blendPresets });
})();
