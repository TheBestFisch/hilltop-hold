(() => {
  'use strict';

  const { modelKit } = Hold;
  const { mat, box, sphere, cylinder, cone, octa, dodeca, torus, part, group, shade, PALETTE } = modelKit;

  /*
   * Invaders and projectiles. Invaders face +Z and expose `userData.body`,
   * the part that bobs while walking, and `userData.height`, where the
   * health bar floats. Legs and arms carry `limb` hooks so they swing with
   * the walk cycle (see animation.js).
   *
   * At the village gate they fight: `userData.weaponArm` is the arm that
   * swings the weapon and `userData.attack` describes the blow (angles are
   * the arm's x rotation; negative is forwards and up). The arm goes from
   * `rest` back to `raise` while winding up and comes down to `hit` as the
   * blow lands, the body leaning `lean` radians and lunging `lunge` tiles
   * into it; `cheer` is the range the arm pumps through when the village
   * falls. The warlord's horse instead rears `rear` radians about its hind
   * legs (`pivot` [y, z]) and strikes with its forelegs (`userData.forehand`).
   * `userData.offArm` is the other arm, which carries a torch in a fallen
   * village.
   */

  /** Tags the arm that swings the weapon so it survives baking (see UnitsView). */
  const weaponArm = (pivot) => {
    pivot.userData.role = 'weaponArm';
    return pivot;
  };

  /** Tags the other arm: in a fallen village it carries a torch (see UnitsView). */
  const offArm = (pivot) => {
    pivot.userData.role = 'offArm';
    return pivot;
  };


  /*
   * The invaders are the soldiers of a rival lord, all in his livery
   * (purple with an ochre chevron) so they read as one army and never as
   * the player's own blue, crimson and gold. They are ordinary medieval
   * fighters: human faces, real arms and armour, nothing that glows.
   * Foot soldiers are human-sized (see HUMAN in kit.js): the top of the head
   * sits near the archers' height, only helmets and weapons rise above it.
   */
  const LIVERY = { primary: 0x5e3f8c, dark: 0x402a63, trim: 0xd9a441 };
  const STEEL = 0xaab4bd;
  const SKIN = [0xe8b98f, 0xd49a6a, 0xc08457];
  const HAIR = [0x5a3a22, 0x2e2219, 0x8a5a34];

  const steel = () => mat(STEEL, { shine: 0.55 });
  const steelDark = () => mat(0x6d7782, { shine: 0.5 });
  const leather = () => mat(0x6b4a2f);
  const wood = () => mat(PALETTE.wood);

  const limb = (mesh, amplitude, phase, axis = 'x') => {
    mesh.userData.limb = { axis, amplitude, phase };
    return mesh;
  };

  /** A leg hanging from the hip, with a boot; swings with the walk cycle. */
  function leg(material, { at, length = 0.17, width = 0.055, phase = 0, amplitude = 0.7, boot = leather() }) {
    const pivot = group(
      part(box(width, length, width), material, { at: [0, -length / 2, 0] }),
      part(box(width * 1.15, width * 0.7, width * 1.6), boot, { at: [0, -length + width * 0.3, width * 0.25] }),
    );
    pivot.position.set(...at);
    return limb(pivot, amplitude, phase);
  }

  /** An arm hanging from the shoulder with a hand; `held` is attached at the hand. */
  function arm(sleeve, skin, { at, phase, amplitude = 0.5, raise = 0, held = null, gauntlet = null }) {
    const pivot = group(
      part(box(0.045, 0.15, 0.045), sleeve, { at: [0, -0.075, 0] }),
      part(sphere(0), gauntlet ?? skin, { at: [0, -0.16, 0], scale: 0.03 }),
    );
    if (held) {
      held.position.y += -0.16;
      pivot.add(held);
    }
    pivot.position.set(...at);
    pivot.rotation.x = raise;
    return limb(pivot, amplitude, phase);
  }

  /** A plain human face: small dark eyes, level brows, a nose and an optional beard. */
  function head({ skin, hair, beard = false, y = 0.41 }) {
    const skinMat = mat(skin);
    const hairMat = mat(hair);
    const dark = mat(0x2a1f1a);
    const result = group(
      part(sphere(1), skinMat, { at: [0, y, 0], scale: [0.055, 0.06, 0.055] }),
      part(sphere(0), dark, { at: [-0.021, y + 0.008, 0.05], scale: 0.008 }),
      part(sphere(0), dark, { at: [0.021, y + 0.008, 0.05], scale: 0.008 }),
      part(box(0.022, 0.006, 0.006), hairMat, { at: [-0.021, y + 0.023, 0.051], rotation: [0, 0, 0.12] }),
      part(box(0.022, 0.006, 0.006), hairMat, { at: [0.021, y + 0.023, 0.051], rotation: [0, 0, -0.12] }),
      part(box(0.012, 0.022, 0.014), mat(shade(skin, 0.9)), { at: [0, y - 0.004, 0.056] }),
    );
    if (beard) result.add(part(sphere(0), hairMat, { at: [0, y - 0.035, 0.03], scale: [0.045, 0.035, 0.035] }));
    else result.add(part(box(0.02, 0.004, 0.004), dark, { at: [0, y - 0.026, 0.054] }));
    result.name = 'head';
    return result;
  }

  /** Torso in a tunic with the livery tabard (chevron front and back) and a belt. */
  function torso(tunic, { tabard = true, long = false } = {}) {
    const trim = mat(LIVERY.trim);
    const body = group(
      part(cylinder(0.095, 0.115, 6), tunic, { at: [0, 0.27, 0], scale: [1, 0.2, 1] }),
      part(cylinder(0.115, 0.13, 6), tunic, { at: [0, 0.18, 0], scale: [1, 0.07, 1] }),
      part(cylinder(0.118, 0.118, 6), leather(), { at: [0, 0.22, 0], scale: [1, 0.025, 1] }),
      part(sphere(0), mat(PALETTE.brass, { shine: 0.5 }), { at: [0, 0.22, 0.115], scale: 0.014 }),
      part(cylinder(0.03, 0.035, 6), tunic, { at: [0, 0.36, 0], scale: [1, 0.04, 1] }),
    );
    if (tabard) {
      const height = long ? 0.26 : 0.2;
      for (const side of [1, -1]) {
        body.add(part(box(0.15, height, 0.015), mat(LIVERY.primary), { at: [0, 0.37 - height / 2, side * 0.105] }));
        body.add(part(box(0.09, 0.018, 0.016), trim, { at: [-0.03, 0.3, side * 0.107], rotation: [0, 0, -0.6] }));
        body.add(part(box(0.09, 0.018, 0.016), trim, { at: [0.03, 0.3, side * 0.107], rotation: [0, 0, 0.6] }));
      }
    }
    return body;
  }

  /** Round wooden shield painted in the livery, facing +Z, centred on its own origin. */
  function roundShield(radius = 0.1) {
    return group(
      part(cylinder(radius, radius, 10), mat(LIVERY.primary), { scale: [1, 0.02, 1], rotation: [Math.PI / 2, 0, 0] }),
      part(torus(radius, 0.01, 10), mat(LIVERY.trim), { at: [0, 0, 0.004] }),
      part(box(radius * 1.6, 0.016, 0.012), mat(LIVERY.trim), { at: [0, 0, 0.008], rotation: [0, 0, 0.5] }),
      part(sphere(0), steel(), { at: [0, 0, 0.014], scale: radius * 0.25 }),
    );
  }

  /** Kite shield: a rounded top tapering to a point, livery with a chevron. */
  function kiteShield() {
    const face = mat(LIVERY.primary);
    const trim = mat(LIVERY.trim);
    return group(
      part(box(0.15, 0.12, 0.018), face, { at: [0, 0.03, 0] }),
      part(cylinder(0.075, 0.075, 8), face, { at: [0, 0.09, 0], scale: [1, 0.018, 1], rotation: [Math.PI / 2, 0, 0] }),
      part(cone(4), face, { at: [0, -0.09, 0], scale: [0.105, 0.13, 0.013], rotation: [Math.PI, Math.PI / 4, 0] }),
      part(box(0.1, 0.02, 0.02), trim, { at: [-0.035, 0.02, 0.008], rotation: [0, 0, -0.65] }),
      part(box(0.1, 0.02, 0.02), trim, { at: [0.035, 0.02, 0.008], rotation: [0, 0, 0.65] }),
    );
  }

  function spear(length = 0.66) {
    const weapon = group(
      part(box(0.016, length, 0.016), wood(), { at: [0, length / 2 - 0.2, 0] }),
      part(cone(4), steel(), { at: [0, length - 0.16, 0], scale: [0.022, 0.08, 0.012] }),
      part(box(0.04, 0.01, 0.01), steel(), { at: [0, length - 0.205, 0] }),
    );
    weapon.name = 'weapon';
    return weapon;
  }

  function shortsword() {
    const weapon = group(
      part(box(0.014, 0.05, 0.014), leather(), { at: [0, 0, 0] }),
      part(box(0.06, 0.012, 0.016), mat(PALETTE.brass, { shine: 0.5 }), { at: [0, -0.03, 0] }),
      part(box(0.022, 0.16, 0.006), steel(), { at: [0, -0.11, 0] }),
      part(cone(4), steel(), { at: [0, -0.2, 0], scale: [0.016, 0.03, 0.005], rotation: [Math.PI, Math.PI / 4, 0] }),
    );
    weapon.name = 'weapon';
    return weapon;
  }

  function mace() {
    const weapon = group(
      part(box(0.016, 0.2, 0.016), leather(), { at: [0, -0.02, 0] }),
      part(dodeca(), steelDark(), { at: [0, -0.14, 0], scale: 0.038 }),
    );
    for (const [x, z] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      weapon.add(part(box(0.012, 0.05, 0.012), steelDark(), { at: [x * 0.035, -0.14, z * 0.035] }));
    }
    weapon.name = 'weapon';
    return weapon;
  }

  function withBody(body, { height, bob = 0.025, ...rest } = {}) {
    const root = group(body);
    body.userData.role = 'body';
    root.userData.body = body;
    root.userData.height = height;
    root.userData.bob = bob;
    Object.assign(root.userData, rest);
    return root;
  }

  // Footman: a levied spearman in a padded coat, kettle hat and the lord's tabard.

  function buildFootman() {
    const gambeson = mat(0xcdb58a);
    const skin = SKIN[0];
    const body = group(
      torso(gambeson),
      head({ skin, hair: HAIR[0], beard: true }),
      // Kettle hat: a steel dome with a broad brim.
      part(sphere(1), steel(), { at: [0, 0.44, 0], scale: [0.062, 0.045, 0.062] }),
      part(cylinder(0.1, 0.1, 10), steel(), { at: [0, 0.44, 0], scale: [1, 0.012, 1] }),
    );
    const shield = roundShield(0.1);
    shield.position.set(-0.15, 0.27, 0.07);
    shield.rotation.y = -0.45;
    body.add(shield);
    body.add(
      weaponArm(arm(gambeson, mat(skin), { at: [0.125, 0.35, 0], phase: 0, amplitude: 0.35, raise: -0.35, held: spear() })),
      offArm(arm(gambeson, mat(skin), { at: [-0.125, 0.35, 0], phase: Math.PI, amplitude: 0.15, raise: -0.5 })),
    );
    // A spear thrust: the arm draws back with the point levelled at the door, then drives it home.
    const root = withBody(body, { height: 0.7, attack: { rest: -0.35, raise: 0.95, hit: 1.45, lean: 0.1, lunge: 0.07, cheer: [-0.35, -1.1] } });
    const trousers = mat(0x7a5a3a);
    root.add(
      leg(trousers, { at: [-0.045, 0.2, 0], phase: 0 }),
      leg(trousers, { at: [0.045, 0.2, 0], phase: Math.PI }),
    );
    return root;
  }

  // Scout: a quick, hooded skirmisher in leather with a shortsword and a buckler.

  function buildScout() {
    const jerkin = mat(0x8a5a34);
    const cloak = mat(0x5d6b3a);
    const skin = SKIN[1];
    // The upper body leans into the run.
    const upper = group(
      torso(jerkin, { tabard: false }),
      // A livery baldric across the chest.
      part(box(0.2, 0.028, 0.012), mat(LIVERY.primary), { at: [0, 0.29, 0.104], rotation: [0, 0, 0.7] }),
      part(box(0.2, 0.028, 0.012), mat(LIVERY.primary), { at: [0, 0.29, -0.104], rotation: [0, 0, -0.7] }),
      head({ skin, hair: HAIR[2] }),
      // Hood pulled over the head, its point falling back, and a short cloak.
      part(sphere(1), cloak, { at: [0, 0.425, -0.012], scale: [0.064, 0.068, 0.062] }),
      part(cone(5), cloak, { at: [0, 0.43, -0.08], scale: [0.035, 0.1, 0.035], rotation: [-1.9, 0, 0] }),
      part(cylinder(0.1, 0.12, 7), cloak, { at: [0, 0.35, -0.005], scale: [1, 0.04, 1] }),
      part(box(0.17, 0.2, 0.014), cloak, { at: [0, 0.26, -0.115], rotation: [-0.18, 0, 0] }),
    );
    const buckler = roundShield(0.055);
    buckler.position.set(0, -0.06, 0.03);
    upper.add(
      weaponArm(arm(jerkin, mat(skin), { at: [0.125, 0.35, 0], phase: Math.PI, amplitude: 0.7, raise: -0.7, held: shortsword() })),
      offArm(arm(jerkin, mat(skin), { at: [-0.125, 0.35, 0], phase: 0, amplitude: 0.7, raise: -0.3, held: buckler })),
    );
    upper.rotation.x = 0.22;
    upper.position.z = -0.04;
    const body = group(upper);
    const root = withBody(body, { height: 0.66, bob: 0.035, attack: { rest: -0.7, raise: -2.7, hit: -1.0, lean: 0.14, lunge: 0.05, cheer: [-2.2, -3.0] } });
    const trousers = mat(0x4d3a2a);
    root.add(
      leg(trousers, { at: [-0.045, 0.2, 0], phase: 0, amplitude: 1.0 }),
      leg(trousers, { at: [0.045, 0.2, 0], phase: Math.PI, amplitude: 1.0 }),
    );
    return root;
  }

  // Knight: a man-at-arms in plate under a livery surcoat, great helm with a plume, kite shield and mace.

  function buildKnight() {
    const plate = steel();
    const skin = mat(SKIN[2]);
    const body = group(
      torso(plate, { long: true }),
      // Great helm with a visor slit and breaths, crowned by a livery plume.
      part(cylinder(0.064, 0.066, 8), plate, { at: [0, 0.42, 0], scale: [1, 0.12, 1] }),
      part(sphere(1), plate, { at: [0, 0.48, 0], scale: [0.064, 0.03, 0.064] }),
      part(box(0.09, 0.01, 0.006), mat(0x1c1f24), { at: [0, 0.43, 0.065] }),
      part(box(0.008, 0.05, 0.008), mat(0x9aa3ad), { at: [0, 0.4, 0.066] }),
      // A livery crest sweeping back from a brass finial.
      part(box(0.018, 0.05, 0.13), mat(LIVERY.primary), { at: [0, 0.52, -0.04], rotation: [0.35, 0, 0] }),
      part(box(0.016, 0.035, 0.08), mat(LIVERY.dark), { at: [0, 0.5, -0.1], rotation: [0.7, 0, 0] }),
      part(sphere(0), mat(LIVERY.trim), { at: [0, 0.505, 0.02], scale: 0.016 }),
      // Rounded pauldrons.
      part(sphere(1), plate, { at: [-0.12, 0.355, 0], scale: [0.05, 0.04, 0.055] }),
      part(sphere(1), plate, { at: [0.12, 0.355, 0], scale: [0.05, 0.04, 0.055] }),
    );
    // The helm hides the face; the head underneath still gives the figure its human size.
    const face = head({ skin: SKIN[2], hair: HAIR[1], beard: true });
    face.scale.setScalar(0.98);
    body.add(face);
    const shield = kiteShield();
    shield.position.set(-0.15, 0.25, 0.07);
    shield.rotation.y = -0.4;
    body.add(shield);
    body.add(
      weaponArm(arm(plate, skin, { at: [0.125, 0.35, 0], phase: 0, amplitude: 0.4, raise: -0.2, held: mace(), gauntlet: steelDark() })),
      offArm(arm(plate, skin, { at: [-0.125, 0.35, 0], phase: Math.PI, amplitude: 0.12, raise: -0.5, gauntlet: steelDark() })),
    );
    body.scale.setScalar(1.1);
    // An overhead blow with the mace.
    const root = withBody(body, { height: 0.78, bob: 0.018, attack: { rest: -0.2, raise: -2.8, hit: -0.9, lean: 0.12, lunge: 0.04, cheer: [-2.2, -3.0] } });
    const greaves = steel();
    root.add(
      leg(greaves, { at: [-0.05, 0.22, 0], length: 0.19, width: 0.06, phase: 0, amplitude: 0.5, boot: steelDark() }),
      leg(greaves, { at: [0.05, 0.22, 0], length: 0.19, width: 0.06, phase: Math.PI, amplitude: 0.5, boot: steelDark() }),
    );
    return root;
  }

  // Warlord: the enemy lord himself on a barded warhorse, under his war banner.

  function buildWarlord() {
    const coat = mat(0xcfc8bd);
    const mane = mat(0x4a4038);
    const cloth = mat(LIVERY.primary);
    const trim = mat(LIVERY.trim);
    const plate = steel();
    const gold = mat(PALETTE.gold, { shine: 0.6 });
    const horse = group(
      // Barrel, chest and hindquarters.
      part(sphere(1), coat, { at: [0, 0.66, -0.02], scale: [0.18, 0.2, 0.42] }),
      part(sphere(1), coat, { at: [0, 0.7, 0.24], scale: [0.17, 0.19, 0.18] }),
      part(sphere(1), coat, { at: [0, 0.7, -0.3], scale: [0.18, 0.19, 0.17] }),
      // Caparison: the livery draped low over the flanks, chest left open, ochre hem and chevrons.
      part(box(0.4, 0.2, 0.62), cloth, { at: [0, 0.56, -0.08] }),
      part(box(0.41, 0.03, 0.63), trim, { at: [0, 0.46, -0.08] }),
      part(box(0.012, 0.024, 0.12), trim, { at: [0.206, 0.6, -0.12], rotation: [0.6, 0, 0] }),
      part(box(0.012, 0.024, 0.12), trim, { at: [0.206, 0.6, -0.02], rotation: [-0.6, 0, 0] }),
      part(box(0.012, 0.024, 0.12), trim, { at: [-0.206, 0.6, -0.12], rotation: [0.6, 0, 0] }),
      part(box(0.012, 0.024, 0.12), trim, { at: [-0.206, 0.6, -0.02], rotation: [-0.6, 0, 0] }),
      // Neck rising from the chest, a dark mane, and a head angled down with a steel chanfron.
      part(box(0.13, 0.36, 0.17), coat, { at: [0, 0.92, 0.37], rotation: [0.42, 0, 0] }),
      part(box(0.04, 0.34, 0.07), mane, { at: [0, 0.96, 0.3], rotation: [0.42, 0, 0] }),
      part(box(0.12, 0.13, 0.3), coat, { at: [0, 1.06, 0.56], rotation: [0.95, 0, 0] }),
      part(box(0.125, 0.03, 0.2), plate, { at: [0, 1.12, 0.56], rotation: [0.95, 0, 0] }),
      part(box(0.09, 0.08, 0.06), mat(0x8f877c), { at: [0, 0.95, 0.66], rotation: [0.95, 0, 0] }),
      part(cone(4), coat, { at: [-0.04, 1.2, 0.47], scale: [0.02, 0.06, 0.02], rotation: [-0.2, 0, 0] }),
      part(cone(4), coat, { at: [0.04, 1.2, 0.47], scale: [0.02, 0.06, 0.02], rotation: [-0.2, 0, 0] }),
      part(sphere(0), mat(0x1a1410), { at: [-0.061, 1.09, 0.53], scale: 0.013 }),
      part(sphere(0), mat(0x1a1410), { at: [0.061, 1.09, 0.53], scale: 0.013 }),
      part(cone(5), mane, { at: [0, 0.6, -0.5], scale: [0.05, 0.32, 0.06], rotation: [-2.75, 0, 0] }),
      // Saddle and reins.
      part(box(0.22, 0.05, 0.24), leather(), { at: [0, 0.86, -0.04] }),
      part(box(0.22, 0.08, 0.04), leather(), { at: [0, 0.9, -0.15] }),
      part(box(0.13, 0.012, 0.3), leather(), { at: [0, 0.98, 0.3], rotation: [0.4, 0, 0] }),
    );
    // The lord: plate under a livery surcoat, a crowned helm, a long cape and the war banner.
    const rider = group(
      torso(plate, { long: true }),
      part(cylinder(0.064, 0.066, 8), plate, { at: [0, 0.42, 0], scale: [1, 0.12, 1] }),
      part(sphere(1), plate, { at: [0, 0.48, 0], scale: [0.064, 0.03, 0.064] }),
      part(box(0.09, 0.01, 0.02), mat(0x1c1f24), { at: [0, 0.43, 0.062] }),
      part(torus(0.066, 0.012, 8), gold, { at: [0, 0.48, 0], rotation: [Math.PI / 2, 0, 0] }),
      part(sphere(1), plate, { at: [-0.12, 0.355, 0], scale: [0.055, 0.045, 0.06] }),
      part(sphere(1), plate, { at: [0.12, 0.355, 0], scale: [0.055, 0.045, 0.06] }),
      part(box(0.24, 0.34, 0.02), cloth, { at: [0, 0.22, -0.12], rotation: [0.28, 0, 0] }),
      part(box(0.24, 0.03, 0.022), trim, { at: [0, 0.06, -0.165], rotation: [0.28, 0, 0] }),
      // Legs astride the horse.
      part(box(0.05, 0.06, 0.16), plate, { at: [-0.13, 0.18, 0.05] }),
      part(box(0.05, 0.06, 0.16), plate, { at: [0.13, 0.18, 0.05] }),
      part(box(0.05, 0.16, 0.05), plate, { at: [-0.15, 0.1, 0.11] }),
      part(box(0.05, 0.16, 0.05), plate, { at: [0.15, 0.1, 0.11] }),
    );
    for (const angle of [0, 1.26, 2.51, 3.77, 5.03]) {
      rider.add(part(cone(4), gold, { at: [Math.sin(angle) * 0.066, 0.505, Math.cos(angle) * 0.066], scale: [0.012, 0.03, 0.012] }));
    }
    const face = head({ skin: SKIN[0], hair: HAIR[1], beard: true });
    rider.add(face);
    // Banner arm: the war banner on a tall pole, fluttering.
    const pole = group(
      part(box(0.022, 1.0, 0.022), wood(), { at: [0, 0.3, 0] }),
      part(cone(4), gold, { at: [0, 0.83, 0], scale: [0.02, 0.06, 0.02] }),
    );
    const flag = group(
      part(box(0.26, 0.2, 0.012), cloth, { at: [0.13, 0, 0] }),
      part(box(0.12, 0.024, 0.014), trim, { at: [0.09, 0.01, 0], rotation: [0, 0, -0.6] }),
      part(box(0.12, 0.024, 0.014), trim, { at: [0.17, 0.01, 0], rotation: [0, 0, 0.6] }),
    );
    flag.position.set(0.01, 0.68, 0);
    flag.userData.flutter = { amplitude: 0.3, speed: 4 };
    pole.add(flag);
    pole.name = 'weapon';
    rider.add(
      weaponArm(arm(plate, mat(SKIN[0]), { at: [0.125, 0.35, 0], phase: 0, amplitude: 0.08, raise: -0.4, held: pole, gauntlet: steelDark() })),
      offArm(arm(plate, mat(SKIN[0]), { at: [-0.125, 0.35, 0], phase: Math.PI, amplitude: 0.1, raise: -0.9, gauntlet: steelDark() })),
    );
    rider.scale.setScalar(1.15);
    rider.position.set(0, 0.69, -0.06);
    horse.add(rider);
    // At the gate the warhorse rears on its hind legs and batters the door with its forehooves, the lord waving his banner on.
    const root = withBody(horse, {
      height: 1.98, bob: 0.03,
      attack: { rest: -0.4, raise: -0.9, hit: -0.2, rear: 0.42, pivot: [0.46, -0.3], lean: 0, lunge: 0.04, cheer: [-0.1, -0.8] },
    });
    // The forelegs hang from a forehand that rears with the body; the hind legs stay planted.
    const forehand = group();
    forehand.userData.role = 'forehand';
    root.add(forehand);
    root.userData.forehand = forehand;
    // Four legs in a walking gait: diagonal pairs move together.
    for (const [x, z, phase] of [[-0.1, 0.28, 0], [0.1, -0.28, 0], [0.1, 0.28, Math.PI], [-0.1, -0.28, Math.PI]]) {
      const legPivot = group(
        part(box(0.07, 0.4, 0.08), coat, { at: [0, -0.2, 0] }),
        part(box(0.075, 0.05, 0.09), mane, { at: [0, -0.42, 0.005] }),
        part(box(0.078, 0.04, 0.085), trim, { at: [0, -0.34, 0] }),
      );
      legPivot.position.set(x, 0.46, z * 1.05);
      (z > 0 ? forehand : root).add(limb(legPivot, 0.45, phase));
    }
    return root;
  }

  const ENEMY_BUILDERS = { footman: buildFootman, scout: buildScout, knight: buildKnight, warlord: buildWarlord };

  function buildEnemy(type) {
    return ENEMY_BUILDERS[type]();
  }

  // Projectiles fly along +Z.

  const PROJECTILE_BUILDERS = {
    archer: () => group(
      part(box(0.025, 0.025, 0.42), mat(PALETTE.woodLight)),
      part(cone(4), mat(PALETTE.metal, { shine: 0.6 }), { at: [0, 0, 0.24], scale: [0.035, 0.09, 0.035], rotation: [Math.PI / 2, 0, 0] }),
      part(box(0.012, 0.06, 0.08), mat(0xf2f2f2), { at: [0, 0, -0.16] }),
      part(box(0.06, 0.012, 0.08), mat(PALETTE.crimson), { at: [0, 0, -0.16] }),
    ),
    cannon: () => group(
      part(sphere(1), mat(PALETTE.ironDark, { shine: 0.5 }), { scale: 0.11 }),
      part(sphere(0), mat(0xffb347, { glow: 0xff7a1a, glowStrength: 2 }), { at: [0, 0.08, -0.08], scale: 0.035 }),
    ),
    frost: () => {
      const shard = group(
        part(octa(), mat(0xbfeaff, { glow: 0x2a6b8a, glowStrength: 1.4 }), { scale: [0.07, 0.14, 0.07], rotation: [Math.PI / 2, 0, 0] }),
        part(octa(), mat(0xe6f8ff, { glow: 0x4aa3c9, opacity: 0.7 }), { at: [0.05, 0.02, -0.1], scale: [0.03, 0.07, 0.03], rotation: [Math.PI / 2, 0, 0] }),
        part(octa(), mat(0xe6f8ff, { glow: 0x4aa3c9, opacity: 0.7 }), { at: [-0.04, -0.03, -0.13], scale: [0.025, 0.06, 0.025], rotation: [Math.PI / 2, 0, 0] }),
      );
      shard.userData.spin = { axis: 'z', speed: 9 };
      return group(shard);
    },
  };

  function buildProjectile(towerType) {
    return PROJECTILE_BUILDERS[towerType]();
  }

  Object.assign(Hold, { unitModels: { buildEnemy, buildProjectile, LIVERY } });
})();
