(() => {
  'use strict';

  const { modelKit } = Hold;
  const {
    mat, box, sphere, cylinder, cone, gable, dodeca, octa, torus, part, group, door, shade, PALETTE,
  } = modelKit;

  /*
   * Map scenery: nature props, the cave the invaders pour out of, and the
   * hilltop village they march on. Everything faces +Z. Static scenery is
   * baked by the map view, so only parts with animation hooks (flames,
   * smoke, windmill sails, flags) stay separate meshes.
   */

  const wood = () => mat(PALETTE.wood);
  const woodDark = () => mat(PALETTE.woodDark);
  const stone = () => mat(PALETTE.stone);
  const goldMat = () => mat(PALETTE.gold, { shine: 0.6 });

  /** A torch flame: glowing, flickering. */
  function flame(scale = 1) {
    const fire = part(cone(5), mat(0xffb347, { glow: 0xff7a1a, glowStrength: 2.2 }), { at: [0, 0.06 * scale, 0], scale: [0.05 * scale, 0.14 * scale, 0.05 * scale], shadow: false });
    fire.userData.flicker = { speed: 13, amount: 0.25 };
    const core = part(cone(5), mat(0xfff1b0, { glow: 0xffd36b, glowStrength: 2.6 }), { at: [0, 0.04 * scale, 0], scale: [0.025 * scale, 0.08 * scale, 0.025 * scale], shadow: false });
    core.userData.flicker = { speed: 17, amount: 0.3 };
    return group(fire, core);
  }

  function torch(at, scale = 1) {
    const result = group(
      part(cylinder(0.015 * scale, 0.02 * scale, 5), woodDark(), { at: [0, 0.15 * scale, 0], scale: [1, 0.3 * scale, 1] }),
      part(cylinder(0.03 * scale, 0.02 * scale, 6), mat(PALETTE.iron, { shine: 0.4 }), { at: [0, 0.31 * scale, 0], scale: [1, 0.05 * scale, 1] }),
    );
    const fire = flame(scale);
    fire.position.y = 0.33 * scale;
    result.add(fire);
    result.position.set(...at);
    return result;
  }

  /** Rising, swaying chimney smoke. */
  function smoke(at) {
    const puffs = group();
    for (let i = 0; i < 3; i++) {
      const puff = part(sphere(0), mat(0xf4f1ec, { opacity: 0.55 - i * 0.12 }), { at: [i * 0.05, i * 0.14, 0], scale: 0.05 + i * 0.03, shadow: false });
      puff.userData.hover = { amplitude: 0.03, speed: 1.5 + i * 0.3, phase: i };
      puffs.add(puff);
    }
    puffs.userData.sway = { amplitude: 0.25, speed: 0.8, axis: 'z' };
    puffs.position.set(...at);
    return puffs;
  }

  // Nature

  function buildTree(variant = 0) {
    const kind = variant % 3;
    if (kind === 0) {
      // Pine: three tiers of needles with a lighter tip, on a dark trunk.
      const leaf = mat(PALETTE.leafDark);
      const leafLight = mat(PALETTE.leaf);
      return group(
        part(cylinder(0.07, 0.11, 6), woodDark(), { at: [0, 0.25, 0], scale: [1, 0.5, 1] }),
        part(cone(7), leaf, { at: [0, 0.7, 0], scale: [0.46, 0.6, 0.46] }),
        part(cone(7), leafLight, { at: [0, 1.05, 0], scale: [0.36, 0.55, 0.36], rotation: [0, 0.4, 0] }),
        part(cone(7), leaf, { at: [0, 1.38, 0], scale: [0.24, 0.5, 0.24], rotation: [0, 0.8, 0] }),
      );
    }
    if (kind === 1) {
      // Oak: a fat trunk with a clustered crown in two greens.
      const crown = mat(PALETTE.leafLight);
      const crownDark = mat(PALETTE.leaf);
      return group(
        part(cylinder(0.09, 0.14, 7), woodDark(), { at: [0, 0.3, 0], scale: [1, 0.6, 1] }),
        part(cylinder(0.04, 0.05, 5), woodDark(), { at: [0.14, 0.6, 0.05], scale: [1, 0.3, 1], rotation: [0, 0, -0.7] }),
        part(dodeca(), crownDark, { at: [0, 0.95, 0], scale: [0.45, 0.4, 0.45] }),
        part(dodeca(), crown, { at: [-0.22, 1.08, 0.12], scale: [0.3, 0.28, 0.3], rotation: [0.3, 0.5, 0] }),
        part(dodeca(), crown, { at: [0.24, 1.12, -0.08], scale: [0.32, 0.3, 0.32], rotation: [0.6, 0.1, 0.2] }),
        part(dodeca(), crownDark, { at: [0.02, 1.32, 0.1], scale: [0.3, 0.27, 0.3], rotation: [0.2, 0.9, 0.1] }),
      );
    }
    // Birch in autumn colours: pale trunk with dark marks and warm foliage.
    const leaf = mat(PALETTE.autumn);
    const leafLight = mat(0xf0b24a);
    const bark = mat(0xe9e4d8);
    return group(
      part(cylinder(0.06, 0.09, 6), bark, { at: [0, 0.4, 0], scale: [1, 0.8, 1] }),
      part(box(0.05, 0.03, 0.12), mat(0x3a3a3a), { at: [0.05, 0.3, 0.04], rotation: [0, 0.4, 0] }),
      part(box(0.05, 0.03, 0.12), mat(0x3a3a3a), { at: [-0.05, 0.55, -0.02], rotation: [0, -0.6, 0] }),
      part(octa(), leaf, { at: [0, 1.0, 0], scale: [0.36, 0.5, 0.36] }),
      part(octa(), leafLight, { at: [0.18, 0.92, 0.1], scale: [0.22, 0.3, 0.22], rotation: [0, 0.5, 0] }),
      part(octa(), leafLight, { at: [-0.16, 1.12, -0.06], scale: [0.2, 0.28, 0.2], rotation: [0, 0.9, 0] }),
    );
  }

  function buildRock(variant = 0) {
    const kind = variant % 3;
    const rock = mat(PALETTE.rock);
    const rockDark = mat(PALETTE.rockDark);
    const moss = mat(PALETTE.leafLight);
    if (kind === 0) {
      return group(
        part(dodeca(), rock, { at: [0, 0.2, 0], scale: [0.38, 0.26, 0.32], rotation: [0.3, 0.6, 0] }),
        part(dodeca(), rockDark, { at: [0.26, 0.1, 0.16], scale: [0.16, 0.12, 0.14], rotation: [0.8, 0.2, 0] }),
        part(dodeca(), moss, { at: [-0.06, 0.38, -0.04], scale: [0.2, 0.07, 0.18], rotation: [0.1, 0.3, 0] }),
        part(dodeca(), rockDark, { at: [-0.3, 0.08, -0.12], scale: [0.1, 0.08, 0.1], rotation: [0.4, 1.2, 0] }),
      );
    }
    if (kind === 1) {
      return group(
        part(dodeca(), rockDark, { at: [-0.1, 0.26, 0.02], scale: [0.28, 0.34, 0.26], rotation: [0.2, 0.3, 0.3] }),
        part(dodeca(), rock, { at: [0.22, 0.16, -0.06], scale: [0.22, 0.2, 0.2], rotation: [0.9, 0.2, 0] }),
        part(dodeca(), rock, { at: [0.1, 0.1, 0.26], scale: [0.12, 0.1, 0.12], rotation: [0.4, 1.1, 0.6] }),
      );
    }
    return group(
      part(dodeca(), rock, { at: [0, 0.14, 0], scale: [0.3, 0.18, 0.34], rotation: [0.1, 0.9, 0.1] }),
      part(dodeca(), moss, { at: [0.06, 0.26, 0.02], scale: [0.2, 0.06, 0.22], rotation: [0.1, 0.9, 0.1] }),
      part(dodeca(), rockDark, { at: [0.3, 0.08, -0.2], scale: [0.1, 0.09, 0.1], rotation: [0.7, 0.4, 0.2] }),
      part(dodeca(), rockDark, { at: [-0.28, 0.07, 0.2], scale: [0.09, 0.07, 0.09], rotation: [0.2, 0.4, 0.9] }),
    );
  }

  function buildBush(variant = 0) {
    const leaf = mat(variant % 2 ? PALETTE.leafLight : PALETTE.leaf);
    const leafDark = mat(PALETTE.leafDark);
    const bush = group(
      part(dodeca(), leafDark, { at: [0, 0.16, 0], scale: [0.26, 0.2, 0.24], rotation: [0.2, 0.4, 0] }),
      part(dodeca(), leaf, { at: [-0.14, 0.14, 0.1], scale: [0.16, 0.14, 0.16], rotation: [0.5, 0.1, 0.2] }),
      part(dodeca(), leaf, { at: [0.16, 0.12, -0.04], scale: [0.15, 0.13, 0.15], rotation: [0.1, 0.9, 0.3] }),
    );
    if (variant % 2) {
      for (const [x, z] of [[-0.1, 0.18], [0.12, 0.14], [0.02, -0.18]]) {
        bush.add(part(sphere(0), mat(0xf25c5c), { at: [x, 0.27, z], scale: 0.03 }));
      }
    }
    return bush;
  }

  function buildStump() {
    return group(
      part(cylinder(0.16, 0.2, 8), woodDark(), { at: [0, 0.12, 0], scale: [1, 0.24, 1] }),
      part(cylinder(0.14, 0.14, 8), mat(PALETTE.woodLight), { at: [0, 0.245, 0], scale: [1, 0.01, 1] }),
      part(torus(0.08, 0.012, 8), woodDark(), { at: [0, 0.25, 0], rotation: [Math.PI / 2, 0, 0] }),
      part(box(0.12, 0.06, 0.06), woodDark(), { at: [0.22, 0.03, 0.08], rotation: [0, 0.5, 0] }),
      part(dodeca(), mat(PALETTE.leafLight), { at: [-0.16, 0.04, -0.1], scale: [0.08, 0.05, 0.08] }),
    );
  }

  function buildMushrooms() {
    const stem = mat(0xf3ecd9);
    const cap = mat(0xd9463e);
    const spots = mat(0xffffff);
    const result = group();
    for (const [x, z, s] of [[0, 0, 1], [0.14, 0.08, 0.7], [-0.1, 0.12, 0.55]]) {
      result.add(
        part(cylinder(0.035 * s, 0.045 * s, 6), stem, { at: [x, 0.06 * s, z], scale: [1, 0.12 * s, 1] }),
        part(sphere(1), cap, { at: [x, 0.12 * s, z], scale: [0.09 * s, 0.06 * s, 0.09 * s] }),
        part(sphere(0), spots, { at: [x + 0.03 * s, 0.16 * s, z + 0.04 * s], scale: 0.015 }),
        part(sphere(0), spots, { at: [x - 0.04 * s, 0.15 * s, z - 0.02 * s], scale: 0.012 }),
      );
    }
    return result;
  }

  function buildFlowers(variant = 0) {
    const result = group();
    const colors = PALETTE.flower;
    const positions = [[0, 0], [0.14, 0.06], [-0.12, 0.1], [0.04, -0.14], [-0.08, -0.08]];
    positions.forEach(([x, z], i) => {
      const color = colors[(i + variant) % colors.length];
      result.add(
        part(box(0.015, 0.12, 0.015), mat(PALETTE.leaf), { at: [x, 0.06, z], shadow: false }),
        part(sphere(0), mat(color), { at: [x, 0.13, z], scale: 0.03, shadow: false }),
        part(sphere(0), mat(0xffe27a), { at: [x, 0.14, z], scale: 0.012, shadow: false }),
      );
    });
    result.add(part(cone(4), mat(PALETTE.leaf), { at: [0.08, 0.06, -0.1], scale: [0.03, 0.14, 0.03], shadow: false }));
    result.add(part(cone(4), mat(PALETTE.leafLight), { at: [-0.14, 0.05, -0.02], scale: [0.03, 0.12, 0.03], shadow: false }));
    return result;
  }

  /** Low-poly cloud, meant to float far above the map. Casts a soft drifting shadow. */
  function buildCloud(variant = 0) {
    const puff = mat(0xffffff);
    const shadeMat = mat(0xe8eef5);
    const cloud = group(
      part(sphere(1), puff, { at: [0, 0.3, 0], scale: [0.9, 0.5, 0.7] }),
      part(sphere(1), puff, { at: [0.8, 0.25, 0.1], scale: [0.6, 0.4, 0.5] }),
      part(sphere(1), puff, { at: [-0.75, 0.2, -0.05], scale: [0.55, 0.35, 0.5] }),
      part(sphere(1), shadeMat, { at: [0.2, 0.05, 0.2], scale: [0.9, 0.2, 0.6] }),
    );
    if (variant % 2) cloud.add(part(sphere(1), puff, { at: [0.3, 0.55, -0.1], scale: [0.45, 0.35, 0.4] }));
    cloud.scale.setScalar(1 + (variant % 3) * 0.3);
    return cloud;
  }

  // The cave: a rocky massif with a tunnel mouth where the rival army musters. Faces +Z.

  function buildCave() {
    const rock = mat(0x7f766c);
    const rockDark = mat(0x625a52);
    const rockLight = mat(0x968c80);
    const grass = mat(PALETTE.grassDark);
    const cave = group(
      // Main massif: overlapping boulders stacked into a mound.
      part(dodeca(), rock, { at: [0, 0.8, -0.5], scale: [1.7, 1.2, 1.3], rotation: [0.2, 0.3, 0.1] }),
      part(dodeca(), rockDark, { at: [-1.0, 0.5, -0.2], scale: [0.9, 0.8, 0.9], rotation: [0.4, 0.8, 0.2] }),
      part(dodeca(), rockLight, { at: [1.05, 0.55, -0.3], scale: [0.95, 0.85, 0.9], rotation: [0.1, 1.3, 0.4] }),
      part(dodeca(), rock, { at: [0.3, 1.6, -0.9], scale: [0.9, 0.8, 0.8], rotation: [0.6, 0.2, 0.3] }),
      part(dodeca(), rockDark, { at: [-0.5, 1.5, -1.0], scale: [0.7, 0.7, 0.7], rotation: [0.9, 0.5, 0.1] }),
      part(cone(6), rockLight, { at: [0.1, 2.3, -0.9], scale: [0.55, 0.9, 0.55], rotation: [0.1, 0.3, 0.05] }),
      part(cone(6), rock, { at: [-0.9, 1.9, -0.8], scale: [0.4, 0.7, 0.4], rotation: [-0.1, 0.5, 0.2] }),
      // Grass tufts on the ledges.
      part(dodeca(), grass, { at: [0.9, 1.2, -0.5], scale: [0.35, 0.12, 0.3] }),
      part(dodeca(), grass, { at: [-0.9, 1.05, -0.6], scale: [0.3, 0.1, 0.28] }),
      part(cone(5), mat(PALETTE.leafDark), { at: [1.3, 1.55, -0.9], scale: [0.22, 0.55, 0.22] }),
      // The mouth: a dark arch cut into the front face.
      part(cylinder(0.55, 0.6, 10), mat(0x14121a), { at: [0, 0.45, 0.35], scale: [1, 1.0, 0.6], rotation: [Math.PI / 2, 0, 0] }),
      part(box(1.3, 0.5, 0.5), mat(0x14121a), { at: [0, 0.2, 0.35] }),
      // Rocky lintel and jambs around the mouth.
      part(dodeca(), rockLight, { at: [0, 1.15, 0.45], scale: [0.75, 0.3, 0.4], rotation: [0.1, 0.2, 0] }),
      part(dodeca(), rock, { at: [-0.75, 0.4, 0.45], scale: [0.32, 0.5, 0.35], rotation: [0, 0.4, 0.1] }),
      part(dodeca(), rock, { at: [0.75, 0.4, 0.45], scale: [0.32, 0.5, 0.35], rotation: [0, 0.9, -0.1] }),
      // Stalactites hanging in the entrance.
      part(cone(4), rockLight, { at: [-0.2, 0.85, 0.45], scale: [0.06, 0.3, 0.06], rotation: [Math.PI, 0, 0] }),
      part(cone(4), rockLight, { at: [0.15, 0.9, 0.5], scale: [0.05, 0.24, 0.05], rotation: [Math.PI, 0, 0] }),
      part(cone(4), rockLight, { at: [0.38, 0.8, 0.42], scale: [0.04, 0.18, 0.04], rotation: [Math.PI, 0, 0] }),
      // Timber props holding up the entrance, as if dug out.
      part(box(0.08, 1.0, 0.08), woodDark(), { at: [-0.58, 0.5, 0.75] }),
      part(box(0.08, 1.0, 0.08), woodDark(), { at: [0.58, 0.5, 0.75] }),
      part(box(1.3, 0.08, 0.1), woodDark(), { at: [0, 1.02, 0.75] }),
    );
    // The rival army's camp at the tunnel mouth: torches, its war banner, a weapon rack and supplies.
    cave.add(torch([-0.85, 0.0, 1.0], 1.2), torch([0.85, 0.0, 1.0], 1.2));
    const livery = Hold.unitModels.LIVERY;
    const flag = group(
      part(box(0.34, 0.5, 0.02), mat(livery.primary), { at: [0.18, -0.2, 0] }),
      part(box(0.18, 0.04, 0.025), mat(livery.trim), { at: [0.12, -0.18, 0], rotation: [0, 0, -0.6] }),
      part(box(0.18, 0.04, 0.025), mat(livery.trim), { at: [0.24, -0.18, 0], rotation: [0, 0, 0.6] }),
      part(box(0.34, 0.04, 0.025), mat(livery.trim), { at: [0.18, -0.45, 0] }),
    );
    flag.position.set(-1.15, 1.55, 0.85);
    flag.userData.flutter = { amplitude: 0.2, speed: 3 };
    cave.add(
      part(box(0.05, 1.6, 0.05), woodDark(), { at: [-1.15, 0.8, 0.85] }),
      part(box(0.4, 0.04, 0.04), woodDark(), { at: [-0.97, 1.56, 0.85] }),
      part(cone(4), mat(PALETTE.gold, { shine: 0.6 }), { at: [-1.15, 1.65, 0.85], scale: [0.04, 0.1, 0.04] }),
      flag,
    );
    // Weapon rack with spears.
    const rack = group(
      part(box(0.5, 0.04, 0.04), woodDark(), { at: [0, 0.42, 0] }),
      part(box(0.04, 0.45, 0.04), woodDark(), { at: [-0.23, 0.22, 0] }),
      part(box(0.04, 0.45, 0.04), woodDark(), { at: [0.23, 0.22, 0] }),
    );
    for (const x of [-0.15, -0.05, 0.05, 0.15]) {
      rack.add(part(box(0.015, 0.7, 0.015), wood(), { at: [x, 0.35, 0.03], rotation: [0.15, 0, 0] }));
      rack.add(part(cone(4), mat(PALETTE.metal, { shine: 0.5 }), { at: [x, 0.73, 0.085], scale: [0.02, 0.07, 0.012], rotation: [0.15, 0, 0] }));
    }
    rack.position.set(0.95, 0, 0.75);
    rack.rotation.y = -0.5;
    cave.add(rack);
    // Supply crates and a barrel.
    cave.add(
      part(box(0.24, 0.22, 0.24), mat(PALETTE.plank), { at: [1.25, 0.11, 1.05], rotation: [0, 0.4, 0] }),
      part(box(0.18, 0.16, 0.18), mat(PALETTE.wood), { at: [1.2, 0.3, 1.0], rotation: [0, 0.9, 0] }),
      part(cylinder(0.1, 0.1, 8), mat(PALETTE.wood), { at: [-1.3, 0.13, 1.15], scale: [1, 0.26, 1] }),
    );
    return cave;
  }

  // The village

  /** Places a door (see kit.door) at `at`, facing +Z unless rotated. */
  function doorAt(at, width, height, options, rotation = 0) {
    const result = door(width, height, options);
    result.position.set(...at);
    result.rotation.y = rotation;
    return result;
  }

  const glass = () => mat(0x9ed0e6, { shine: 0.6 });

  // What is left when a building burns down

  const CHARRED = 0x2f2620;
  const ASH = 0x6e6760;
  const SCORCHED_PLASTER = 0xa89a86;

  /**
   * Marks what fire brings down in a building, so it survives baking and
   * the village view can collapse it (see VillageView): the `roof` falls in,
   * the `upper` storey of timber and plaster crumbles, each of the `spires`
   * (turret roofs with their finials and flags, a windmill's sails) topples,
   * and the `ruin` (charred stubs, fallen beams and rubble, hidden until
   * then) is what is left. Each pivots about its own middle, a spire about
   * its foot. Stone storeys stay standing.
   */
  function structure(building, { roof = [], upper = [], spires = [], ruin = [] }) {
    const pivoted = (role, parts, foot = false) => {
      const holder = group(...parts);
      holder.updateMatrixWorld(true);
      const bounds = new THREE.Box3().setFromObject(holder);
      const pivot = bounds.getCenter(new THREE.Vector3());
      if (foot) pivot.y = bounds.min.y;
      for (const child of parts) child.position.sub(pivot);
      holder.position.copy(pivot);
      holder.userData.role = role;
      building.add(holder);
      return holder;
    };
    if (roof.length) pivoted('roof', roof);
    if (upper.length) pivoted('upper', upper);
    spires.forEach((parts, index) => {
      const spire = pivoted(`spire${index}`, parts, true);
      // Which way it falls (in the building's frame): as its first part says, or straight out from the middle.
      const fall = parts[0].userData.fall ?? [spire.position.x, spire.position.z];
      const length = Math.hypot(fall[0], fall[1]) || 1;
      spire.userData.fall = [fall[0] / length, fall[1] / length];
    });
    if (ruin.length) pivoted('ruin', ruin).visible = false;
    return building;
  }

  function charredBeam(at, length, rotation = [0, 0, 0]) {
    return part(box(0.05, 0.05, length), mat(CHARRED), { at, rotation });
  }

  /** A heap of fallen rubble, ash and a few glowing coals around `at`, `radius` across, with pieces of `tint` (roof tiles, stone). */
  function rubble(at, radius, count, tint = PALETTE.stone) {
    const heap = group(part(dodeca(), mat(ASH), { scale: [radius, radius * 0.3, radius * 0.85], rotation: [0.1, 0.6, 0] }));
    for (let i = 0; i < count; i++) {
      const angle = i * 2.4;
      const out = radius * (0.35 + 0.5 * ((i * 0.618) % 1));
      heap.add(part(dodeca(), mat(i % 3 === 0 ? CHARRED : tint), {
        at: [Math.cos(angle) * out, radius * 0.2, Math.sin(angle) * out],
        scale: [radius * 0.28, radius * 0.2, radius * 0.24],
        rotation: [angle, angle * 0.5, 0.3],
      }));
    }
    heap.add(part(dodeca(), mat(0x8a3a12, { glow: 0xff5a1a, glowStrength: 1.4 }), { at: [radius * 0.2, radius * 0.22, -radius * 0.1], scale: radius * 0.14, shadow: false }));
    heap.position.set(...at);
    return heap;
  }

  /** A turret's roof lying where it fell, broken, on its side. */
  function brokenSpire(at, yaw, color = PALETTE.roofRed, size = 0.3) {
    const spire = group(
      part(cone(8), mat(color), { at: [0, size * 0.5, 0], scale: [size * 0.9, size * 1.3, size * 0.9], rotation: [0, 0, 1.4] }),
      part(dodeca(), mat(color), { at: [size * 1.1, size * 0.15, size * 0.3], scale: size * 0.25, rotation: [0.4, 0.2, 0.7] }),
      part(dodeca(), mat(CHARRED), { at: [-size * 0.6, size * 0.1, -size * 0.2], scale: size * 0.2 }),
    );
    spire.position.set(...at);
    spire.rotation.y = yaw;
    return spire;
  }

  /** Burnt-down walls: stubs along the sides of a `width` × `depth` footprint, jagged, `high` at most. */
  function wallStubs(width, depth, high, color, base = 0) {
    const stubs = group();
    const sides = [[0, depth / 2, width, true], [0, -depth / 2, width, true], [width / 2, 0, depth, false], [-width / 2, 0, depth, false]];
    sides.forEach(([x, z, length, alongX], side) => {
      const pieces = 4;
      for (let i = 0; i < pieces; i++) {
        const height = high * (0.25 + 0.75 * ((side * 3 + i * 7) % 5) / 4);
        const offset = -length / 2 + (i + 0.5) * (length / pieces);
        stubs.add(part(box(alongX ? length / pieces : 0.06, height, alongX ? 0.06 : length / pieces), mat(color), {
          at: [alongX ? offset : x, base + height / 2, alongX ? z : offset],
        }));
      }
    });
    return stubs;
  }

  function buildHouse(variant = 0) {
    const kind = variant % 3;
    if (kind === 0) {
      // Thatched cottage with timber framing; it burns down to stubs of wall.
      const wall = 0.68;
      const house = group(part(box(0.94, 0.06, 0.84), woodDark(), { at: [0, 0.03, 0] }));
      const upper = [
        part(box(0.9, wall, 0.8), mat(PALETTE.plaster), { at: [0, 0.03 + wall / 2, 0] }),
        doorAt([0.12, 0.03, 0.41], 0.24, 0.54, { frame: PALETTE.woodDark, leaf: 0x8a5a3b }),
        part(box(0.18, 0.16, 0.04), glass(), { at: [-0.24, 0.42, 0.41] }),
        part(box(0.2, 0.02, 0.05), woodDark(), { at: [-0.24, 0.51, 0.42] }),
        part(box(0.02, 0.18, 0.05), woodDark(), { at: [-0.24, 0.42, 0.42] }),
        part(box(0.22, 0.03, 0.07), woodDark(), { at: [-0.24, 0.33, 0.43] }),
        part(box(0.18, 0.16, 0.04), glass(), { at: [0, 0.42, -0.41] }),
        // Timber frame beams.
        part(box(0.05, wall, 0.06), woodDark(), { at: [-0.44, 0.03 + wall / 2, 0.4] }),
        part(box(0.05, wall, 0.06), woodDark(), { at: [0.44, 0.03 + wall / 2, 0.4] }),
        part(box(0.9, 0.05, 0.06), woodDark(), { at: [0, 0.03 + wall, 0.4] }),
        part(box(0.05, wall, 0.06), woodDark(), { at: [-0.05, 0.03 + wall / 2, -0.4], rotation: [0, 0, -0.5] }),
      ];
      return structure(house, {
        roof: [
          part(gable(), mat(PALETTE.thatch), { at: [0, wall + 0.16, 0], scale: [1.08, 0.42, 0.52] }),
          part(box(1.12, 0.05, 0.06), mat(shade(PALETTE.thatch, 0.85)), { at: [0, wall + 0.56, 0] }),
        ],
        upper,
        ruin: [
          wallStubs(0.9, 0.8, 0.3, SCORCHED_PLASTER, 0.06),
          part(box(0.05, 0.5, 0.06), mat(CHARRED), { at: [-0.44, 0.31, 0.4] }),
          part(box(0.05, 0.36, 0.06), mat(CHARRED), { at: [0.44, 0.24, -0.4], rotation: [0, 0, 0.2] }),
          charredBeam([0.05, 0.22, 0], 0.95, [0.35, 0.3, 0]),
          charredBeam([-0.15, 0.16, 0.1], 0.8, [-0.2, -0.9, 0.15]),
          rubble([0, 0.06, 0], 0.3, 5, 0x9a7a3a),
        ],
      });
    }
    if (kind === 1) {
      // Two-storey townhouse: the stone ground floor survives the fire, the plastered upper floor does not.
      const ground = 0.62;
      const upperHeight = 0.5;
      const roof = mat(PALETTE.roofRed);
      const top = ground + upperHeight;
      const house = group(
        part(box(0.8, ground, 0.75), mat(PALETTE.stone), { at: [0, ground / 2, 0] }),
        doorAt([0.12, 0, 0.376], 0.24, 0.54, { frame: PALETTE.stoneDark, arch: true }),
        part(box(0.14, 0.12, 0.04), glass(), { at: [-0.22, 0.36, 0.376] }),
        part(box(0.16, 0.5 + upperHeight, 0.16), mat(PALETTE.stoneDark), { at: [0.3, top + 0.2 - upperHeight / 2, -0.12] }),
        part(box(0.2, 0.05, 0.2), mat(PALETTE.stone), { at: [0.3, top + 0.47, -0.12] }),
      );
      house.add(smoke([0.3, top + 0.51, -0.12]));
      const upper = [
        part(box(0.9, upperHeight, 0.85), mat(0xeedfc0), { at: [0, ground + upperHeight / 2, 0] }),
        part(box(0.94, 0.05, 0.89), woodDark(), { at: [0, ground + 0.02, 0] }),
        part(box(0.16, 0.16, 0.04), glass(), { at: [-0.25, ground + 0.25, 0.44] }),
        part(box(0.16, 0.16, 0.04), glass(), { at: [0.2, ground + 0.25, 0.44] }),
        part(box(0.16, 0.16, 0.04), glass(), { at: [0, ground + 0.25, -0.44] }),
        part(box(0.2, 0.03, 0.08), woodDark(), { at: [-0.25, ground + 0.16, 0.45] }),
        part(box(0.2, 0.03, 0.08), woodDark(), { at: [0.2, ground + 0.16, 0.45] }),
      ];
      // Shutters.
      for (const x of [-0.36, -0.14, 0.09, 0.31]) upper.push(part(box(0.04, 0.18, 0.03), mat(0x5a73a8), { at: [x, ground + 0.25, 0.45] }));
      return structure(house, {
        roof: [
          part(gable(), roof, { at: [0, top + 0.16, 0], scale: [1.0, 0.4, 0.56] }),
          part(box(1.04, 0.04, 0.05), mat(shade(PALETTE.roofRed, 0.8)), { at: [0, top + 0.54, 0] }),
        ],
        upper,
        ruin: [
          wallStubs(0.84, 0.79, 0.22, SCORCHED_PLASTER, ground),
          charredBeam([0, ground + 0.04, 0.2], 0.98, [0, Math.PI / 2, 0]),
          charredBeam([0, ground + 0.04, -0.2], 0.98, [0, Math.PI / 2, 0.1]),
          charredBeam([0.12, ground + 0.2, 0.05], 0.7, [0.5, 0.4, 0]),
          rubble([-0.1, ground, 0.05], 0.3, 5, PALETTE.roofRed),
        ],
      });
    }
    // Stone house with a slate roof and a round window: the walls stand, the roof burns away.
    const wall = 0.7;
    const house = group(
      part(box(0.95, wall, 0.8), mat(PALETTE.stoneLight), { at: [0, wall / 2, 0] }),
      part(box(0.99, 0.08, 0.84), mat(PALETTE.stoneDark), { at: [0, 0.04, 0] }),
      doorAt([-0.2, 0.04, 0.41], 0.26, 0.56, { frame: PALETTE.stoneDark, arch: true }),
      part(cylinder(0.09, 0.09, 8), glass(), { at: [0.24, 0.44, 0.41], scale: [1, 0.04, 1], rotation: [Math.PI / 2, 0, 0] }),
      part(torus(0.09, 0.015, 8), woodDark(), { at: [0.24, 0.44, 0.42] }),
      part(box(0.18, 0.16, 0.04), glass(), { at: [0.1, 0.44, -0.41] }),
      part(box(0.16, 0.5, 0.16), mat(PALETTE.stoneDark), { at: [-0.3, wall + 0.4, 0.1] }),
      part(cylinder(0.06, 0.06, 6), mat(PALETTE.wood), { at: [0.5, 0.08, 0.3], scale: [1, 0.16, 1] }),
      part(cylinder(0.06, 0.06, 6), mat(PALETTE.wood), { at: [0.5, 0.08, 0.16], scale: [1, 0.16, 1] }),
    );
    house.add(smoke([-0.3, wall + 0.68, 0.1]));
    return structure(house, {
      roof: [
        part(gable(), mat(PALETTE.roofSlate), { at: [0, wall + 0.18, 0], scale: [1.1, 0.38, 0.54] }),
        part(box(1.14, 0.04, 0.05), mat(shade(PALETTE.roofSlate, 0.8)), { at: [0, wall + 0.54, 0] }),
      ],
      ruin: [
        charredBeam([0, wall + 0.03, 0.15], 1.0, [0, Math.PI / 2, 0.05]),
        charredBeam([0.1, wall - 0.05, -0.1], 0.9, [0.3, Math.PI / 2 + 0.3, 0.25]),
        rubble([0.05, wall - 0.15, 0], 0.32, 5, PALETTE.roofSlate),
        rubble([0.55, 0.02, -0.3], 0.16, 3, PALETTE.roofSlate),
      ],
    });
  }

  /**
   * The Hold itself: a square keep with corner turrets and the lord's banner
   * (`userData.banner`). Set alight, its roof falls in, its battlements
   * crumble and the turrets' spires topple; the stone shell stands.
   */
  function buildKeep() {
    const wall = mat(PALETTE.stoneLight);
    const wallDark = mat(PALETTE.stone);
    const keep = group(
      part(box(1.3, 1.7, 1.3), wall, { at: [0, 0.85, 0] }),
      part(box(1.4, 0.1, 1.4), wallDark, { at: [0, 0.05, 0] }),
      part(box(1.4, 0.08, 1.4), wallDark, { at: [0, 1.0, 0] }),
      part(box(1.45, 0.12, 1.45), wallDark, { at: [0, 1.7, 0] }),
      doorAt([0, 0.1, 0.665], 0.36, 0.66, { frame: PALETTE.stone, arch: true }),
      part(box(0.1, 0.22, 0.04), mat(PALETTE.soilDark), { at: [-0.4, 1.25, 0.66] }),
      part(box(0.1, 0.22, 0.04), mat(PALETTE.soilDark), { at: [0.4, 1.25, 0.66] }),
      part(box(0.1, 0.22, 0.04), mat(PALETTE.soilDark), { at: [0, 1.3, 0.66] }),
      part(box(0.04, 0.22, 0.1), mat(PALETTE.soilDark), { at: [0.66, 1.25, 0.2] }),
      part(box(0.04, 0.22, 0.1), mat(PALETTE.soilDark), { at: [-0.66, 1.25, -0.2] }),
    );
    // Crenellations along the top edge.
    const battlements = [];
    for (let i = -2; i <= 2; i++) {
      for (const side of [-1, 1]) {
        battlements.push(part(box(0.14, 0.16, 0.12), wall, { at: [i * 0.28, 1.84, side * 0.68] }));
        battlements.push(part(box(0.12, 0.16, 0.14), wall, { at: [side * 0.68, 1.84, i * 0.28] }));
      }
    }
    // Corner turrets with slate caps.
    const corners = [[-0.6, -0.6], [0.6, -0.6], [-0.6, 0.6], [0.6, 0.6]];
    const spires = [];
    for (const [x, z] of corners) {
      keep.add(part(cylinder(0.2, 0.22, 8), wall, { at: [x, 1.1, z], scale: [1, 2.2, 1] }));
      keep.add(part(cylinder(0.24, 0.24, 8), wallDark, { at: [x, 2.1, z], scale: [1, 0.08, 1] }));
      spires.push([
        part(cone(8), mat(PALETTE.roofBlue), { at: [x, 2.45, z], scale: [0.26, 0.6, 0.26] }),
        part(sphere(0), goldMat(), { at: [x, 2.78, z], scale: 0.04 }),
      ]);
    }
    // The great banner on the central mast.
    keep.add(part(box(0.05, 1.3, 0.05), woodDark(), { at: [0, 2.8, 0] }));
    const cloth = group(
      part(box(0.5, 0.32, 0.03), mat(PALETTE.crimson), { at: [0.27, 0, 0] }),
      part(box(0.5, 0.06, 0.035), goldMat(), { at: [0.27, -0.1, 0] }),
      part(cone(3), goldMat(), { at: [0.27, 0.05, 0.0], scale: [0.08, 0.12, 0.04], rotation: [Math.PI / 2, 0, 0] }),
    );
    cloth.position.set(0, 3.25, 0);
    cloth.userData.flutter = { amplitude: 0.3, speed: 4 };
    // Tagged so the fall of the village can lower it (see VillageView).
    cloth.userData.role = 'banner';
    keep.add(cloth, part(sphere(0), goldMat(), { at: [0, 3.47, 0], scale: 0.05 }));
    keep.userData.banner = cloth;
    keep.add(torch([-0.34, 0.34, 0.7], 0.9), torch([0.34, 0.34, 0.7], 0.9));
    // What is left: broken battlements, charred rafters and rubble on the top, the spires fallen at the foot.
    const broken = [];
    for (let i = -2; i <= 2; i++) {
      for (const side of [-1, 1]) {
        const keepIt = (i + side * 2 + 7) % 3 !== 0;
        if (!keepIt) continue;
        const height = 0.05 + 0.11 * (((i + 3) * (side + 2)) % 4) / 3;
        broken.push(part(box(0.14, height, 0.12), wall, { at: [i * 0.28, 1.76 + height / 2, side * 0.68] }));
        broken.push(part(box(0.12, height * 0.8, 0.14), wall, { at: [side * 0.68, 1.76 + height * 0.4, -i * 0.28] }));
      }
    }
    return structure(keep, {
      roof: [part(gable(), mat(PALETTE.roofBlue), { at: [0, 1.95, 0], scale: [0.7, 0.45, 0.45], rotation: [0, Math.PI / 2, 0] })],
      upper: battlements,
      spires,
      ruin: [
        ...broken,
        charredBeam([0.1, 1.82, 0.2], 1.1, [0.1, 0.5, 0.1]),
        charredBeam([-0.2, 1.8, -0.15], 0.9, [-0.15, -0.7, 0]),
        rubble([0, 1.76, 0], 0.4, 6, PALETTE.roofBlue),
        brokenSpire([-0.95, 0.02, 0.7], 0.6, PALETTE.roofBlue, 0.26),
        brokenSpire([0.95, 0.02, 0.75], -0.4, PALETTE.roofBlue, 0.26),
        brokenSpire([0.9, 0.02, -0.85], 2.6, PALETTE.roofBlue, 0.26),
        brokenSpire([-0.9, 0.02, -0.9], -2.2, PALETTE.roofBlue, 0.26),
        rubble([0.4, 0.06, 0.9], 0.18, 4),
      ],
    });
  }

  // The gatehouse

  /**
   * The gate's door: two leaves under an arch, hinged on the jambs. `z` is
   * where the leaves hang; their outer face is `z + depth / 2` from the
   * gatehouse centre (ASSAULT.gateFace in src/data/enemies.js is measured
   * from the same face; tests/village.test.js keeps the two in step).
   */
  const GATE_DOOR = { width: 0.56, height: 0.76, depth: 0.04, z: 0.17, planks: 4 };
  /** How far the leaves swing inward when open, and how far a battered gate buckles. */
  const GATE_SWING = { open: 1.45, bow: 0.16 };
  const RAW_WOOD = 0xe6c48e;
  const SPLIT_WOOD = 0xd9b27a;
  const DARK_GAP = 0x17110c;
  /**
   * How the door is beaten in, as the share of the gate destroyed (lives
   * lost): planks scarred, then smashed through, from the middle of the door
   * outwards, one leaf then the other, so almost every blow breaks something
   * new; the iron bands snap late. [leaf (-1 left, 1 right), plank from the
   * hinge, scarred at, smashed at].
   */
  const PLANK_BREAKS = [
    [-1, 3, 0.05, 0.3], [1, 3, 0.1, 0.38], [-1, 2, 0.15, 0.48], [1, 2, 0.2, 0.56],
    [-1, 1, 0.27, 0.66], [1, 1, 0.34, 0.74], [-1, 0, 0.42, 0.84], [1, 0, 0.5, 0.92],
  ];
  /** The iron bands snap: [leaf, band (0 low, 1 high), at]. */
  const BAND_BREAKS = [[-1, 0, 0.6], [1, 0, 0.7], [-1, 1, 0.8], [1, 1, 0.88]];

  /** Shows a part only while the gate's damage is between `from` and `until` (0–1). Tagged so it survives baking. */
  function whileDamaged(from, until, role, ...children) {
    const result = group(...children);
    if (from !== null) result.userData.damage = from;
    if (until !== null) result.userData.intact = until;
    result.userData.role = role;
    return result;
  }

  /** Upper quarter of the arch for one leaf (`side` -1 left, +1 right), a disc slice facing +Z after rotating. */
  const archQuarter = (side) => modelKit.geo(`archQuarter:${side}`, () => new THREE.CylinderGeometry(
    GATE_DOOR.width / 2, GATE_DOOR.width / 2, 1, 6, 1, false, side < 0 ? Math.PI : Math.PI / 2, Math.PI / 2,
  ));

  /** The masonry over the passage: a block with an arched underside, so the passage is open right through. */
  const archSpandrel = () => modelKit.geo('archSpandrel', () => {
    const r = GATE_DOOR.width / 2;
    const shape = new THREE.Shape();
    shape.moveTo(-r, 0);
    shape.lineTo(-r, r + 0.12);
    shape.lineTo(r, r + 0.12);
    shape.lineTo(r, 0);
    shape.absarc(0, 0, r, 0, Math.PI, false);
    return new THREE.ExtrudeGeometry(shape, { depth: 0.36, bevelEnabled: false, curveSegments: 10 });
  });

  /** Splinters and broken plank ends on the ground: [x, z, length, angle] in the gate's frame. */
  function debris(pieces) {
    const result = group();
    pieces.forEach(([x, z, length, angle], i) => {
      result.add(part(box(0.024, 0.014, length), mat(i % 2 ? SPLIT_WOOD : RAW_WOOD), { at: [x, 0.008, z], rotation: [0, angle, 0] }));
    });
    return result;
  }

  /** An arrow or a spear stuck in the door, pointing back the way it came (+Z). */
  function stuck(at, { length = 0.18, spear = false, tilt = [0.35, 0.2] } = {}) {
    const shaft = group(
      part(box(spear ? 0.014 : 0.008, spear ? 0.014 : 0.008, length), mat(PALETTE.wood), { at: [0, 0, length / 2] }),
    );
    if (spear) shaft.add(part(box(0.05, 0.012, 0.012), mat(Hold.unitModels.LIVERY.primary), { at: [0, 0, length * 0.8] }));
    else shaft.add(part(box(0.004, 0.03, 0.04), mat(0xf2f2f2), { at: [0, 0, length - 0.02] }));
    shaft.position.set(...at);
    shaft.rotation.set(tilt[0], tilt[1], 0);
    return shaft;
  }

  /**
   * One leaf of the gate, hinged on its jamb: `side` -1 is the left leaf, +1
   * the right. Planks on the outside over cross battens on the inside; each
   * plank is whole, then scarred, then smashed through to stubs with
   * splintered ends (PLANK_BREAKS), and the iron bands snap (BAND_BREAKS).
   */
  function gateLeaf(side) {
    const { width, depth, planks } = GATE_DOOR;
    const w = width / 2;
    const straight = GATE_DOOR.height - w;
    const inward = -side;
    const plank = w / planks;
    const wood = mat(PALETTE.woodDark);
    const iron = mat(PALETTE.iron, { shine: 0.4 });
    const batten = mat(0x5a3a22);
    const front = depth / 2;
    const leaf = group(
      // The arched top, and the battens and brace behind the planks that hold the leaf together.
      part(archQuarter(side), wood, { at: [inward * w, straight, 0], scale: [1, depth, 1], rotation: [Math.PI / 2, 0, 0] }),
      part(box(w * 0.96, 0.05, 0.016), batten, { at: [(inward * w) / 2, straight * 0.22, -front + 0.004] }),
      part(box(w * 0.96, 0.05, 0.016), batten, { at: [(inward * w) / 2, straight * 0.78, -front + 0.004] }),
      part(box(0.035, straight * 0.62, 0.016), batten, { at: [(inward * w) / 2, straight * 0.5, -front + 0.004], rotation: [0, 0, side * 0.52] }),
    );
    const f = front + 0.004;
    for (const [leafSide, index, scarredAt, smashedAt] of PLANK_BREAKS) {
      if (leafSide !== side) continue;
      const x = inward * (index + 0.5) * plank;
      // Planks butt together; a dark seam runs down the edge of each.
      const whole = () => group(
        part(box(plank, straight, depth * 0.7), wood, { at: [x, straight / 2, 0.004] }),
        part(box(0.006, straight * 0.96, 0.004), mat(PALETTE.soilDark), { at: [x + (plank / 2) * side, straight / 2, front + 0.001] }),
      );
      const seed = index * 1.7 + side;
      leaf.add(
        whileDamaged(null, scarredAt, `plank${side}${index}`, whole()),
        whileDamaged(scarredAt, smashedAt, `scarred${side}${index}`,
          whole(),
          part(box(0.012, 0.12, 0.01), mat(DARK_GAP), { at: [x, straight * (0.35 + 0.1 * Math.sin(seed)), f], rotation: [0, 0, 0.5 * Math.sign(Math.sin(seed * 3))] }),
          part(box(0.018, 0.05, 0.012), mat(RAW_WOOD), { at: [x + 0.01, straight * 0.5, f + 0.002], rotation: [0, 0, 0.9] }),
        ),
        whileDamaged(smashedAt, null, `smashed${side}${index}`,
          // What is left of the plank: a stub at the top and one at the bottom, with splintered ends.
          part(box(plank - 0.004, straight * 0.34, depth * 0.7), wood, { at: [x, straight * (0.83 + 0.03 * Math.sin(seed)), 0.004] }),
          part(box(plank - 0.004, straight * 0.2, depth * 0.7), wood, { at: [x, straight * 0.1, 0.004] }),
          part(box(0.022, 0.07, 0.014), mat(RAW_WOOD), { at: [x - 0.015, straight * 0.64, 0.008], rotation: [0.3, 0, 0.35] }),
          part(box(0.02, 0.06, 0.014), mat(SPLIT_WOOD), { at: [x + 0.016, straight * 0.63, 0.01], rotation: [-0.2, 0, -0.4] }),
          part(box(0.02, 0.06, 0.014), mat(RAW_WOOD), { at: [x, straight * 0.22, 0.01], rotation: [0.4, 0, 0.5 * Math.sign(Math.sin(seed))] }),
        ),
      );
    }
    for (const [leafSide, band, snapsAt] of BAND_BREAKS) {
      if (leafSide !== side) continue;
      const y = straight * (band ? 0.8 : 0.28);
      leaf.add(
        whileDamaged(null, snapsAt, `band${side}${band}`, part(box(w * 0.94, 0.024, depth + 0.012), iron, { at: [(inward * w) / 2, y, 0.004] })),
        whileDamaged(snapsAt, null, `snapped${side}${band}`,
          part(box(w * 0.4, 0.024, 0.016), iron, { at: [inward * w * 0.2, y, f + 0.006] }),
          part(box(w * 0.45, 0.024, 0.016), iron, { at: [inward * w * 0.62, y - 0.05, f + 0.02], rotation: [0.3, 0, side * 0.55] }),
        ),
      );
    }
    if (side > 0) leaf.add(part(torus(0.02, 0.006, 6), mat(PALETTE.gold, { shine: 0.6 }), { at: [-0.05, straight * 0.5, front + 0.01] }));
    // Weapons left stuck in the door.
    if (side < 0) {
      leaf.add(
        whileDamaged(0.25, null, 'stuckL0', stuck([0.07, 0.42, f], { spear: true, length: 0.3, tilt: [0.3, -0.25] })),
        whileDamaged(0.55, null, 'stuckL1', stuck([0.2, 0.5, f], { tilt: [0.4, -0.3] })),
      );
    } else {
      leaf.add(
        whileDamaged(0.35, null, 'stuckR0', stuck([-0.17, 0.52, f], { tilt: [0.45, 0.25] })),
        whileDamaged(0.75, null, 'stuckR1', stuck([-0.06, 0.62, f], { spear: true, length: 0.28, tilt: [0.2, 0.3] })),
      );
    }
    leaf.position.set(side * w, 0, GATE_DOOR.z);
    leaf.userData.role = side < 0 ? 'leafLeft' : 'leafRight';
    return leaf;
  }

  /** The alarm bell in its bell-cote on the gatehouse ridge; the bell swings on its beam. */
  function alarmBell() {
    const bronze = mat(0xc08a3e, { shine: 0.6 });
    const bell = group(
      part(cylinder(0.032, 0.058, 8), bronze, { at: [0, -0.05, 0], scale: [1, 0.08, 1] }),
      part(sphere(1), bronze, { at: [0, -0.012, 0], scale: [0.034, 0.02, 0.034] }),
      part(torus(0.058, 0.008, 8), bronze, { at: [0, -0.09, 0], rotation: [Math.PI / 2, 0, 0] }),
      part(sphere(0), mat(PALETTE.iron), { at: [0, -0.1, 0], scale: 0.015 }),
    );
    bell.position.set(0, 1.97, 0);
    bell.userData.role = 'bell';
    const cote = group(
      part(box(0.03, 0.28, 0.03), woodDark(), { at: [-0.1, 1.86, 0] }),
      part(box(0.03, 0.28, 0.03), woodDark(), { at: [0.1, 1.86, 0] }),
      part(box(0.26, 0.03, 0.04), woodDark(), { at: [0, 1.99, 0] }),
      part(gable(), mat(PALETTE.roofRed), { at: [0, 2.05, 0], scale: [0.16, 0.07, 0.09] }),
      bell,
    );
    return { cote, bell };
  }

  /**
   * Gatehouse: two drum towers flanking an arched passage closed by a
   * double door. The road arrives from +Z. The leaves (`userData.leafLeft`,
   * `leafRight`) swing inward on their hinges, the alarm bell
   * (`userData.bell`) swings on the ridge, and the door is beaten in plank by
   * plank, shown by `poseGate`: `variant` 0 is intact, 1 battered, 2
   * splintered and 3 broken down. Set alight, its timber roof and the
   * towers' spires come down (see `structure`).
   */
  function buildGate(variant = 0) {
    const wall = mat(PALETTE.stone);
    const wallLight = mat(PALETTE.stoneLight);
    const r = GATE_DOOR.width / 2;
    const straight = GATE_DOOR.height - r;
    const frame = mat(PALETTE.stoneLight);
    const door = group(
      gateLeaf(-1),
      gateLeaf(1),
      part(box(GATE_DOOR.width + 0.06, 0.035, 0.06), frame, { at: [0, 0.0175, GATE_DOOR.z + 0.005] }),
      part(box(0.035, straight, 0.06), frame, { at: [-r - 0.0175, straight / 2, GATE_DOOR.z + 0.005] }),
      part(box(0.035, straight, 0.06), frame, { at: [r + 0.0175, straight / 2, GATE_DOOR.z + 0.005] }),
      part(torus(r + 0.018, 0.022, 10, Math.PI), frame, { at: [0, straight, GATE_DOOR.z + 0.005] }),
    );
    door.name = 'door';
    door.userData.doorHeight = GATE_DOOR.height;
    const [leafLeft, leafRight] = door.children;
    const { cote, bell } = alarmBell();
    const gate = group(
      // Walkway over the passage, the jambs either side of it and the arched masonry above the door.
      part(box(1.0, 0.55, 0.5), wall, { at: [0, 1.15, 0] }),
      part(box(1.0, 0.06, 0.56), mat(PALETTE.stoneDark), { at: [0, 0.88, 0] }),
      part(box(0.2, 0.88, 0.36), wall, { at: [-0.38, 0.44, -0.02] }),
      part(box(0.2, 0.88, 0.36), wall, { at: [0.38, 0.44, -0.02] }),
      part(archSpandrel(), wall, { at: [0, straight, -0.2] }),
      door,
    );
    for (const x of [-0.3, 0, 0.3]) gate.add(part(box(0.14, 0.12, 0.5), wall, { at: [x, 1.48, 0] }));
    const spires = [];
    for (const x of [-0.62, 0.62]) {
      gate.add(part(cylinder(0.26, 0.3, 8), wallLight, { at: [x, 0.7, 0], scale: [1, 1.4, 1] }));
      gate.add(part(cylinder(0.3, 0.3, 8), mat(PALETTE.stoneDark), { at: [x, 1.42, 0] , scale: [1, 0.08, 1] }));
      gate.add(part(box(0.06, 0.16, 0.04), mat(PALETTE.soilDark), { at: [x, 1.0, 0.29] }));
      const flag = group(part(box(0.2, 0.12, 0.02), mat(PALETTE.banner), { at: [0.11, 0, 0] }));
      flag.position.set(x, 2.3, 0);
      flag.userData.flutter = { amplitude: 0.3, speed: 5, phase: x };
      spires.push([
        part(cone(8), mat(PALETTE.roofRed), { at: [x, 1.78, 0], scale: [0.34, 0.64, 0.34] }),
        part(sphere(0), goldMat(), { at: [x, 2.12, 0], scale: 0.04 }),
        part(box(0.03, 0.5, 0.03), woodDark(), { at: [x, 2.25, 0] }),
        flag,
      ]);
    }
    gate.add(torch([-0.38, 0.45, 0.3], 0.8), torch([0.38, 0.45, 0.3], 0.8));
    // Splintered wood piling up at the foot of the door as it is beaten in.
    [
      [0.1, [[-0.12, 0.3, 0.1, 0.4], [0.06, 0.36, 0.08, 2.1]]],
      [0.25, [[0.18, 0.27, 0.12, 1.2], [-0.2, 0.44, 0.07, 2.6]]],
      [0.4, [[-0.05, 0.55, 0.14, 0.9], [0.26, 0.5, 0.1, 2.4], [0.02, 0.24, 0.06, 1.7]]],
      [0.55, [[0.12, 0.66, 0.09, 1.6], [-0.28, 0.32, 0.12, 0.2], [-0.1, 0.42, 0.05, 2.9]]],
      [0.7, [[-0.22, 0.7, 0.16, 0.5], [0.3, 0.78, 0.12, 2.8], [0.08, 0.45, 0.1, 0.7]]],
      [0.85, [[-0.02, 0.82, 0.15, 1.1], [0.22, 0.36, 0.13, 2.2], [-0.3, 0.56, 0.09, 1.4], [0.14, 0.58, 0.2, 0.3]]],
    ].forEach(([from, pieces], i) => gate.add(whileDamaged(from, null, `debris${i}`, debris(pieces))));
    structure(gate, {
      roof: [part(gable(), mat(PALETTE.roofRed), { at: [0, 1.55, 0], scale: [1.05, 0.22, 0.3] }), cote],
      spires,
      ruin: [
        // Fallen rafters across the walkway and the broken spires at the towers' feet.
        charredBeam([-0.1, 1.45, 0.05], 0.9, [0.1, 0.3, 0.12]),
        charredBeam([0.15, 1.45, -0.1], 0.7, [-0.15, -0.4, 0.1]),
        rubble([0, 1.44, 0], 0.3, 4, PALETTE.roofRed),
        rubble([-0.95, 0.03, 0.25], 0.22, 4, PALETTE.roofRed),
        rubble([0.95, 0.03, -0.2], 0.22, 4, PALETTE.roofRed),
        brokenSpire([-1.0, 0.08, 0.35], 0.8),
        brokenSpire([1.0, 0.08, -0.35], -2.4),
      ],
    });
    Object.assign(gate.userData, { leafLeft, leafRight, bell });
    poseGate(gate, { damage: [0, 0.35, 0.7, 1][Math.min(3, variant)], broken: variant >= 3 ? 1 : 0 });
    return gate;
  }

  /**
   * Poses a gate (built or baked): shows how far the door has been beaten in
   * for `damage` 0–1 (the share of the gate destroyed) and hangs the leaves.
   * `open` 0–1 swings them inward, `shudder` (radians) jolts them with a
   * blow, and `broken` 0–1 tears them down: the left leaf falls flat into
   * the passage, the right hangs askew from one hinge. The masonry never
   * moves.
   */
  function poseGate(gate, { damage = 0, open = 0, shudder = 0, broken = 0 } = {}) {
    // A hair over, so that losing 2 lives of 20 (0.0999…) counts as the 0.1 it is.
    const beaten = damage + 1e-9;
    gate.traverse((node) => {
      const { damage: from, intact: until } = node.userData;
      if (from === undefined && until === undefined) return;
      node.visible = (from === undefined || beaten >= from) && (until === undefined || beaten < until);
    });
    const { leafLeft, leafRight } = gate.userData;
    const swing = (open * GATE_SWING.open + damage * damage * GATE_SWING.bow + shudder) * (1 - broken);
    leafLeft.rotation.set(-broken * (Math.PI / 2 - 0.05), swing + broken * 0.3, 0);
    leafLeft.position.y = broken * 0.025;
    leafRight.rotation.set(0, -(swing + broken * 1.25), broken * 0.12);
    leafRight.position.y = broken * 0.03;
  }

  // The village's people: the garrison on the walls and the villagers in the square.

  /**
   * A person of the village, facing +Z: `userData.body` (jumps and leans),
   * `userData.armLeft` / `armRight` (shoulder pivots; rotate x to raise,
   * negative is forwards and up) and, if it `walks`, `legLeft` / `legRight`
   * (otherwise the legs are part of the body, one less thing to draw). The
   * figure itself is human-sized; what the arms hold may rise above it.
   */
  function person({ clothes, legs, skin = PALETTE.skin, hat = null, skirt = false, scale = 1, held = {}, walks = true }) {
    const cloth = mat(clothes);
    const legMat = mat(legs);
    const legPivots = [-1, 1].map((side) => {
      const pivot = group(
        part(box(0.05, 0.13, 0.05), legMat, { at: [0, -0.065, 0] }),
        part(box(0.055, 0.03, 0.075), mat(PALETTE.woodDark), { at: [0, -0.13, 0.012] }),
      );
      pivot.position.set(side * 0.034, 0.145, 0);
      if (walks) pivot.userData.role = side < 0 ? 'legLeft' : 'legRight';
      return pivot;
    });
    const figure = group(
      part(cylinder(0.072, 0.088, 6), cloth, { at: [0, 0.235, 0], scale: [1, 0.18, 1] }),
      part(cylinder(0.09, 0.09, 6), mat(PALETTE.woodDark), { at: [0, 0.17, 0], scale: [1, 0.022, 1] }),
      part(sphere(1), mat(skin), { at: [0, 0.375, 0], scale: [0.058, 0.062, 0.058] }),
      part(sphere(0), mat(0x2a1f1a), { at: [-0.02, 0.382, 0.052], scale: 0.008 }),
      part(sphere(0), mat(0x2a1f1a), { at: [0.02, 0.382, 0.052], scale: 0.008 }),
    );
    if (skirt) figure.add(part(cone(7), cloth, { at: [0, 0.1, 0], scale: [0.1, 0.2, 0.1] }));
    if (hat) figure.add(hat);
    const arms = [-1, 1].map((side) => {
      const pivot = group(
        part(box(0.04, 0.125, 0.04), cloth, { at: [0, -0.062, 0] }),
        part(sphere(0), mat(skin), { at: [0, -0.135, 0], scale: 0.022 }),
      );
      const thing = side < 0 ? held.left : held.right;
      if (thing) {
        thing.position.y -= 0.135;
        pivot.add(thing);
      }
      pivot.position.set(side * 0.092, 0.305, 0);
      pivot.rotation.z = side * 0.12;
      pivot.userData.role = side < 0 ? 'armLeft' : 'armRight';
      return pivot;
    });
    figure.name = 'figure';
    const body = group(figure, ...arms, ...(skirt ? [] : legPivots));
    body.userData.role = 'body';
    body.scale.setScalar(scale);
    const root = group(body);
    root.userData.body = body;
    [root.userData.armLeft, root.userData.armRight] = arms;
    if (!skirt && walks) [root.userData.legLeft, root.userData.legRight] = legPivots;
    return root;
  }

  /**
   * A man of the garrison in the lord's colours: blue tunic, crimson
   * tabard, steel kettle hat. `variant` 0 holds a spear and shield, 1 a bow.
   */
  function buildGuard(variant = 0) {
    const steelMat = mat(PALETTE.metal, { shine: 0.5 });
    const hat = group(
      part(sphere(1), steelMat, { at: [0, 0.4, 0], scale: [0.063, 0.042, 0.063] }),
      part(cylinder(0.088, 0.088, 10), steelMat, { at: [0, 0.398, 0], scale: [1, 0.01, 1] }),
    );
    const held = variant % 2
      ? {
        left: group(
          part(torus(0.15, 0.012, 10, Math.PI), mat(PALETTE.woodDark), { rotation: [0, Math.PI / 2, Math.PI / 2] }),
          part(box(0.005, 0.3, 0.005), mat(0xe8e2d2), {}),
        ),
      }
      : {
        right: group(
          part(box(0.014, 0.5, 0.014), mat(PALETTE.wood), { at: [0, 0.1, 0] }),
          part(cone(4), mat(PALETTE.metal, { shine: 0.6 }), { at: [0, 0.38, 0], scale: [0.02, 0.07, 0.012] }),
        ),
        left: group(
          part(cylinder(0.075, 0.075, 10), mat(PALETTE.crimson), { at: [0, 0.02, 0.03], scale: [1, 0.018, 1], rotation: [Math.PI / 2, 0, 0] }),
          part(box(0.12, 0.02, 0.02), goldMat(), { at: [0, 0.02, 0.04] }),
        ),
      };
    const guard = person({ clothes: PALETTE.banner, legs: 0x4a5a78, hat, held });
    const figure = guard.getObjectByName('figure');
    figure.add(
      part(box(0.11, 0.15, 0.012), mat(PALETTE.crimson), { at: [0, 0.245, 0.078] }),
      part(box(0.11, 0.02, 0.014), goldMat(), { at: [0, 0.29, 0.08] }),
    );
    return guard;
  }

  /** Villagers in everyday clothes: 0 a farmer in a green cap, 1 a woman in a long dress and headscarf, 2 a child. */
  function buildVillager(variant = 0) {
    const kind = variant % 3;
    if (kind === 1) {
      const scarf = part(sphere(1), mat(PALETTE.plaster), { at: [0, 0.392, -0.006], scale: [0.064, 0.058, 0.064] });
      const villager = person({ clothes: 0xc96f5a, legs: PALETTE.woodDark, skin: 0xe8b98f, hat: scarf, skirt: true });
      villager.getObjectByName('figure').add(part(box(0.09, 0.14, 0.012), mat(PALETTE.cream), { at: [0, 0.2, 0.08] }));
      return villager;
    }
    if (kind === 2) {
      const hair = part(sphere(1), mat(0x8a5a34), { at: [0, 0.395, -0.01], scale: [0.06, 0.045, 0.06] });
      return person({ clothes: 0xe0a84a, legs: 0x5b4a3a, hat: hair, scale: 0.72 });
    }
    const cap = group(
      part(sphere(1), mat(0x6c9a4c), { at: [0, 0.405, 0], scale: [0.06, 0.035, 0.06] }),
      part(box(0.05, 0.01, 0.04), mat(0x6c9a4c), { at: [0, 0.395, 0.055] }),
    );
    return person({ clothes: 0x9a6b3f, legs: 0x5b4a3a, skin: 0xd49a6a, hat: cap });
  }

  /** The invaders' war banner, raised over a fallen village: the livery on a short crossbar (`userData.cloth` flutters). */
  function buildWarBanner() {
    const { LIVERY } = Hold.unitModels;
    const cloth = group(
      part(box(0.5, 0.34, 0.03), mat(LIVERY.primary), { at: [0.27, 0, 0] }),
      part(box(0.24, 0.05, 0.035), mat(LIVERY.trim), { at: [0.2, 0.02, 0], rotation: [0, 0, -0.55] }),
      part(box(0.24, 0.05, 0.035), mat(LIVERY.trim), { at: [0.34, 0.02, 0], rotation: [0, 0, 0.55] }),
      part(box(0.5, 0.05, 0.035), mat(LIVERY.trim), { at: [0.27, -0.15, 0] }),
    );
    cloth.userData.flutter = { amplitude: 0.3, speed: 4 };
    cloth.userData.role = 'cloth';
    cloth.position.y = 0.9;
    const pole = part(box(0.05, 1.1, 0.05), woodDark(), { at: [0, 0.55, 0] });
    pole.userData.role = 'pole';
    return group(pole, cloth);
  }

  /** Height of the wall walk on top of a curtain wall, where the garrison stands. */
  const WALL_WALK = 0.975;

  /** One tile of curtain wall running along X, with a walkway and merlons. */
  function buildWall() {
    const wall = mat(PALETTE.stone);
    const segment = group(
      part(box(1.0, 0.9, 0.36), wall, { at: [0, 0.45, 0] }),
      part(box(1.0, 0.06, 0.42), mat(PALETTE.stoneDark), { at: [0, 0.9, 0] }),
      part(box(1.0, 0.05, 0.3), mat(PALETTE.plank), { at: [0, 0.95, -0.02] }),
    );
    for (const x of [-0.36, -0.12, 0.12, 0.36]) segment.add(part(box(0.14, 0.16, 0.1), wall, { at: [x, 1.0, 0.16] }));
    return segment;
  }

  /** Timber archway over a road: two posts, a shingled lintel, lanterns and a hanging sign. Road runs along Z. */
  function buildArch() {
    const arch = group(
      part(box(1.1, 0.08, 0.16), woodDark(), { at: [0, 0.92, 0] }),
      part(gable(), mat(PALETTE.roofRed), { at: [0, 1.0, 0], scale: [0.62, 0.14, 0.16] }),
      part(box(0.36, 0.16, 0.03), mat(PALETTE.plank), { at: [0, 0.76, 0.06] }),
      part(box(0.02, 0.08, 0.02), woodDark(), { at: [-0.12, 0.86, 0.06] }),
      part(box(0.02, 0.08, 0.02), woodDark(), { at: [0.12, 0.86, 0.06] }),
      part(box(0.14, 0.03, 0.035), mat(PALETTE.crimson), { at: [0, 0.77, 0.075] }),
    );
    for (const x of [-0.48, 0.48]) {
      arch.add(part(box(0.1, 0.96, 0.1), wood(), { at: [x, 0.48, 0] }));
      arch.add(part(box(0.14, 0.06, 0.14), mat(PALETTE.stoneDark), { at: [x, 0.03, 0] }));
      arch.add(part(box(0.16, 0.03, 0.03), woodDark(), { at: [x + Math.sign(x) * 0.05, 0.7, 0.06] }));
      arch.add(torch([x + Math.sign(x) * 0.12, 0.62, 0.06], 0.7));
    }
    return arch;
  }

  function buildWell() {
    return group(
      part(cylinder(0.26, 0.28, 8), stone(), { at: [0, 0.18, 0], scale: [1, 0.36, 1] }),
      part(cylinder(0.18, 0.18, 8), mat(0x2f5d7a), { at: [0, 0.34, 0], scale: [1, 0.04, 1] }),
      part(cylinder(0.29, 0.29, 8), mat(PALETTE.stoneDark), { at: [0, 0.37, 0], scale: [1, 0.05, 1] }),
      part(box(0.05, 0.7, 0.05), woodDark(), { at: [-0.2, 0.7, 0] }),
      part(box(0.05, 0.7, 0.05), woodDark(), { at: [0.2, 0.7, 0] }),
      part(gable(), mat(PALETTE.roofRed), { at: [0, 1.08, 0], scale: [0.36, 0.18, 0.26] }),
      part(cylinder(0.025, 0.025, 6), woodDark(), { at: [0, 0.8, 0], scale: [1, 0.44, 1], rotation: [0, 0, Math.PI / 2] }),
      part(cylinder(0.05, 0.05, 6), wood(), { at: [0.25, 0.8, 0], scale: [1, 0.06, 1], rotation: [0, 0, Math.PI / 2] }),
      part(box(0.02, 0.3, 0.02), mat(0x8a8a8a), { at: [0, 0.62, 0] }),
      part(cylinder(0.06, 0.05, 6), wood(), { at: [0, 0.45, 0], scale: [1, 0.1, 1] }),
    );
  }

  /** Windmill with slowly turning sails. Set alight, its cap falls in, the sails come down and the tower burns to its stone base. */
  function buildWindmill() {
    const body = mat(PALETTE.plaster);
    const mill = group(
      part(cylinder(0.36, 0.4, 8), mat(PALETTE.stone), { at: [0, 0.35, 0], scale: [1, 0.7, 1] }),
      doorAt([0, 0, 0.385], 0.22, 0.54, { frame: PALETTE.stoneDark, arch: true }, 0),
    );
    const upper = [
      part(cylinder(0.28, 0.34, 8), body, { at: [0, 1.15, 0], scale: [1, 0.9, 1] }),
      part(box(0.14, 0.14, 0.04), mat(0x9ed0e6, { shine: 0.6 }), { at: [0.05, 1.2, 0.33] }),
      part(cylinder(0.05, 0.05, 6), woodDark(), { at: [0, 1.55, 0.3], scale: [1, 0.3, 1], rotation: [Math.PI / 2, 0, 0] }),
    ];
    const sails = group(part(sphere(0), woodDark(), { scale: 0.07 }));
    for (let i = 0; i < 4; i++) {
      const arm = group(
        part(box(0.04, 0.95, 0.04), woodDark(), { at: [0, 0.45, 0] }),
        part(box(0.2, 0.7, 0.02), mat(0xf7f1e3), { at: [0.12, 0.55, 0.01] }),
        part(box(0.02, 0.7, 0.03), woodDark(), { at: [0.02, 0.55, 0.012] }),
      );
      arm.rotation.z = (i * Math.PI) / 2;
      sails.add(arm);
    }
    sails.position.set(0, 1.55, 0.46);
    sails.userData.spin = { axis: 'z', speed: -0.9 };
    // The sails come down sideways, clear of the keep in front of the mill.
    sails.userData.fall = [1, 0.2];
    return structure(mill, {
      roof: [part(cone(8), mat(PALETTE.thatch), { at: [0, 1.82, 0], scale: [0.38, 0.5, 0.38] })],
      upper,
      spires: [[sails]],
      ruin: [
        part(cylinder(0.3, 0.34, 8), mat(CHARRED), { at: [0, 0.78, 0], scale: [1, 0.16, 1] }),
        wallStubs(0.5, 0.5, 0.25, SCORCHED_PLASTER, 0.7),
        charredBeam([0.55, 0.05, 0.15], 0.9, [0, 0.3, 0]),
        charredBeam([0.6, 0.06, -0.1], 0.7, [0, 1.2, 0.05]),
        part(box(0.18, 0.02, 0.5), mat(0x8f877c), { at: [0.75, 0.02, 0.05], rotation: [0, 0.3, 0.05] }),
        rubble([0, 0.7, 0], 0.22, 4, 0x9a7a3a),
      ],
    });
  }

  function buildHay() {
    const hay = mat(PALETTE.straw);
    return group(
      part(cylinder(0.2, 0.2, 9), hay, { at: [0, 0.2, 0], scale: [1, 0.34, 1], rotation: [0, 0, Math.PI / 2] }),
      part(torus(0.2, 0.015, 9), woodDark(), { at: [0.08, 0.2, 0], rotation: [0, Math.PI / 2, 0] }),
      part(torus(0.2, 0.015, 9), woodDark(), { at: [-0.08, 0.2, 0], rotation: [0, Math.PI / 2, 0] }),
      part(cylinder(0.17, 0.17, 9), hay, { at: [0.16, 0.17, 0.36], scale: [1, 0.3, 1], rotation: [0, 0.6, Math.PI / 2] }),
    );
  }

  /** One tile of picket fence along X. */
  function buildFence() {
    const fence = group(
      part(box(1.0, 0.03, 0.03), wood(), { at: [0, 0.28, 0] }),
      part(box(1.0, 0.03, 0.03), wood(), { at: [0, 0.14, 0] }),
    );
    for (const x of [-0.4, -0.2, 0, 0.2, 0.4]) {
      fence.add(part(box(0.05, 0.36, 0.04), woodDark(), { at: [x, 0.18, 0] }));
      fence.add(part(cone(4), woodDark(), { at: [x, 0.38, 0], scale: [0.035, 0.05, 0.03], rotation: [0, Math.PI / 4, 0] }));
    }
    return fence;
  }

  /** A hay cart. Set alight, the load and the bed burn away to a charred frame on its wheels. */
  function buildCart() {
    const cart = group(
      part(cylinder(0.16, 0.16, 8), woodDark(), { at: [0.1, 0.16, 0.23], scale: [1, 0.04, 1], rotation: [Math.PI / 2, 0, 0] }),
      part(cylinder(0.16, 0.16, 8), woodDark(), { at: [0.1, 0.16, -0.23], scale: [1, 0.04, 1], rotation: [Math.PI / 2, 0, 0] }),
      part(box(0.04, 0.04, 0.5), woodDark(), { at: [0.1, 0.16, 0] }),
    );
    return structure(cart, {
      roof: [
        part(sphere(1), mat(PALETTE.straw), { at: [0, 0.48, 0], scale: [0.26, 0.12, 0.16] }),
        part(sphere(0), mat(0xf25c5c), { at: [0.12, 0.52, 0.06], scale: 0.05 }),
        part(sphere(0), mat(0xf25c5c), { at: [-0.1, 0.52, -0.04], scale: 0.05 }),
      ],
      upper: [
        part(box(0.6, 0.2, 0.4), wood(), { at: [0, 0.32, 0] }),
        part(box(0.62, 0.04, 0.06), woodDark(), { at: [0, 0.44, 0.2] }),
        part(box(0.62, 0.04, 0.06), woodDark(), { at: [0, 0.44, -0.2] }),
        part(box(0.5, 0.04, 0.04), woodDark(), { at: [-0.5, 0.3, 0.1], rotation: [0, 0, 0.3] }),
      ],
      ruin: [
        part(box(0.56, 0.04, 0.05), mat(CHARRED), { at: [0, 0.24, 0.16], rotation: [0, 0, 0.08] }),
        part(box(0.5, 0.04, 0.05), mat(CHARRED), { at: [0.02, 0.22, -0.15], rotation: [0, 0.1, -0.1] }),
        part(box(0.45, 0.035, 0.04), mat(CHARRED), { at: [-0.45, 0.1, 0.08], rotation: [0, 0.2, 0.15] }),
        rubble([0, 0.05, 0], 0.2, 3, 0x9a7a3a),
      ],
    });
  }

  /** Lantern post with a warm glow. */
  function buildLamp() {
    const lamp = group(
      part(cylinder(0.03, 0.05, 6), mat(PALETTE.iron, { shine: 0.4 }), { at: [0, 0.45, 0], scale: [1, 0.9, 1] }),
      part(box(0.16, 0.03, 0.03), mat(PALETTE.iron, { shine: 0.4 }), { at: [0.06, 0.9, 0] }),
      part(box(0.12, 0.14, 0.12), mat(0xfff0b8, { glow: 0xffc04d, glowStrength: 1.8, opacity: 0.9 }), { at: [0.12, 0.8, 0], shadow: false }),
      part(cone(4), mat(PALETTE.iron, { shine: 0.4 }), { at: [0.12, 0.9, 0], scale: [0.1, 0.06, 0.1], rotation: [0, Math.PI / 4, 0] }),
    );
    const glow = lamp.children[2];
    glow.userData.flicker = { speed: 6, amount: 0.06 };
    return lamp;
  }

  function buildSignpost() {
    return group(
      part(box(0.05, 0.7, 0.05), woodDark(), { at: [0, 0.35, 0] }),
      part(box(0.36, 0.1, 0.03), mat(PALETTE.plank), { at: [0.12, 0.6, 0], rotation: [0, 0, 0.05] }),
      part(cone(4), mat(PALETTE.plank), { at: [0.31, 0.6, 0], scale: [0.06, 0.06, 0.03], rotation: [0, 0, -Math.PI / 2] }),
      part(box(0.3, 0.1, 0.03), mat(PALETTE.plank), { at: [-0.1, 0.45, 0], rotation: [0, 0, -0.05] }),
    );
  }

  function buildBarrels() {
    const barrel = (at, tilt = 0) => group(
      part(cylinder(0.1, 0.1, 8), wood(), { at: [0, 0.13, 0], scale: [1, 0.26, 1] }),
      part(cylinder(0.105, 0.105, 8), mat(PALETTE.iron, { shine: 0.4 }), { at: [0, 0.06, 0], scale: [1, 0.03, 1] }),
      part(cylinder(0.105, 0.105, 8), mat(PALETTE.iron, { shine: 0.4 }), { at: [0, 0.2, 0], scale: [1, 0.03, 1] }),
    ).translateX(at[0]).translateZ(at[1]).rotateZ(tilt);
    return group(
      barrel([0, 0]),
      barrel([0.22, 0.08]),
      barrel([0.1, -0.2]),
      part(box(0.22, 0.22, 0.22), mat(PALETTE.plank), { at: [-0.22, 0.11, -0.06] }),
      part(box(0.24, 0.02, 0.24), woodDark(), { at: [-0.22, 0.22, -0.06] }),
    );
  }

  Object.assign(Hold, {
    sceneryModels: {
      buildTree, buildRock, buildBush, buildStump, buildMushrooms, buildFlowers, buildCloud,
      buildCave, buildHouse, buildKeep, buildGate, buildArch, buildWall, buildWell, buildWindmill, buildHay,
      buildFence, buildCart, buildLamp, buildSignpost, buildBarrels, buildGuard, buildVillager, buildWarBanner,
      flame, torch, smoke, poseGate, GATE_DOOR, PLANK_BREAKS, WALL_WALK,
    },
  });
})();
