(() => {
  'use strict';

  /*
   * Animation hooks. A model marks parts in `userData` and whoever draws it
   * (UnitsView, MapView, the gallery) drives them with a clock of its choice:
   *
   *   spin:    { axis: 'y', speed }               rotates continuously (rad/s)
   *   hover:   { amplitude, speed, phase }        bobs up and down
   *   flutter: { amplitude, speed, axis: 'y' }    waves like a flag
   *   flicker: { speed, amount }                  pulses its scale (flames)
   *   sway:    { amplitude, speed, axis: 'z' }    gentle lean (trees, smoke)
   *   limb:    { axis: 'x', amplitude, phase }    swings with the walk cycle
   *
   * `collect` gathers the hooked parts once; `apply` drives them from
   * `time` (seconds) and `walk` (walk-cycle phase in radians).
   */

  const HOOKS = ['spin', 'hover', 'flutter', 'flicker', 'sway', 'limb'];

  function collect(root) {
    const parts = [];
    root.traverse((node) => {
      const hooks = HOOKS.filter((hook) => node.userData[hook]);
      if (!hooks.length) return;
      parts.push({
        node,
        hooks,
        base: { position: node.position.clone(), rotation: node.rotation.clone(), scale: node.scale.clone() },
      });
    });
    return parts;
  }

  function apply(parts, { time = 0, walk = 0 } = {}) {
    for (const { node, hooks, base } of parts) {
      const data = node.userData;
      for (const hook of hooks) {
        const options = data[hook];
        switch (hook) {
          case 'spin':
            node.rotation[options.axis ?? 'y'] = base.rotation[options.axis ?? 'y'] + time * (options.speed ?? 1);
            break;
          case 'hover':
            node.position.y = base.position.y + Math.sin(time * (options.speed ?? 2) + (options.phase ?? 0)) * (options.amplitude ?? 0.05);
            break;
          case 'flutter': {
            const axis = options.axis ?? 'y';
            node.rotation[axis] = base.rotation[axis] + Math.sin(time * (options.speed ?? 6) + (options.phase ?? 0)) * (options.amplitude ?? 0.2);
            break;
          }
          case 'flicker': {
            const wobble = 1 + (options.amount ?? 0.15) * (0.5 * Math.sin(time * (options.speed ?? 14)) + 0.5 * Math.sin(time * (options.speed ?? 14) * 1.7 + 1.3));
            node.scale.set(base.scale.x * wobble, base.scale.y * (2 - wobble), base.scale.z * wobble);
            break;
          }
          case 'sway': {
            const axis = options.axis ?? 'z';
            node.rotation[axis] = base.rotation[axis] + Math.sin(time * (options.speed ?? 1.2) + (options.phase ?? 0)) * (options.amplitude ?? 0.04);
            break;
          }
          case 'limb': {
            const axis = options.axis ?? 'x';
            node.rotation[axis] = base.rotation[axis] + Math.sin(walk + (options.phase ?? 0)) * (options.amplitude ?? 0.6);
            break;
          }
          default:
            break;
        }
      }
    }
  }

  /** Resets hooked parts to the pose they were built in. */
  function reset(parts) {
    for (const { node, base } of parts) {
      node.position.copy(base.position);
      node.rotation.copy(base.rotation);
      node.scale.copy(base.scale);
    }
  }

  Object.assign(Hold, { animation: { collect, apply, reset, HOOKS } });
})();
