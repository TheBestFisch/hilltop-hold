(() => {
  'use strict';

  const { modelKit } = Hold;
  const {
    mat, box, sphere, cylinder, cone, gable, octa, torus, disc, part, group, ring, door, shade, HUMAN, PALETTE,
  } = modelKit;

  /*
   * Towers at each upgrade level (0–2). Every level is a different building,
   * not just a taller one: timber at level 1, stone at level 2, a fortified
   * keep with heraldry at level 3. Each tower exposes `userData.turret`, the
   * part that turns to face its target, `userData.muzzle`, where its shots
   * start (relative to the tower), and `userData.height` for the gallery.
   *
   * Static parts stay within the tile (±0.5); the turret may overhang a
   * little (see tests/models.test.js).
   */

  /** Shared heraldry per level, so every tower reads the same way. */
  const LEVELS = [
    { banner: null, trim: PALETTE.woodDark, cloth: 0x6c9a4c, roof: PALETTE.thatch },
    { banner: PALETTE.banner, trim: PALETTE.banner, cloth: PALETTE.banner, roof: PALETTE.roofRed },
    { banner: PALETTE.crimson, trim: PALETTE.gold, cloth: PALETTE.crimson, roof: PALETTE.roofBlue },
  ];

  const iron = () => mat(PALETTE.iron, { shine: 0.45 });
  const brass = () => mat(PALETTE.brass, { shine: 0.6 });
  const goldMat = () => mat(PALETTE.gold, { shine: 0.6 });

  // Shared pieces

  /** Flag on a pole; the cloth flutters. Level 3 gets a second, longer pennant. */
  function banner(level, at, height = 0.5) {
    const style = LEVELS[level];
    if (!style.banner) return group();
    const pole = part(box(0.035, height, 0.035), mat(PALETTE.woodDark), { at: [0, height / 2, 0] });
    // The cloth hangs off the pole and pivots around it when it flutters.
    const flag = group(part(box(0.22, 0.13, 0.02), mat(style.banner), { at: [0.12, 0, 0] }));
    flag.position.set(0, height - 0.08, 0);
    flag.userData.flutter = { amplitude: 0.25, speed: 5, phase: at[0] * 3 };
    const finial = part(sphere(0), level === 2 ? goldMat() : mat(PALETTE.woodDark), { at: [0, height + 0.02, 0], scale: 0.03 });
    const result = group(pole, flag, finial);
    if (level === 2) {
      const stripe = part(box(0.22, 0.04, 0.022), goldMat(), { at: [0.12, -0.045, 0] });
      flag.add(stripe);
    }
    result.position.set(...at);
    return result;
  }

  /** Stone footing shared by every tower; wider and trimmed at higher levels. */
  function footing(level, color = PALETTE.stone) {
    const result = group(
      part(cylinder(0.44, 0.48, 8), mat(color), { at: [0, 0.05, 0], scale: [1, 0.1, 1] }),
    );
    if (level >= 1) {
      result.add(part(cylinder(0.47, 0.49, 8), mat(shade(color, 0.85)), { at: [0, 0.03, 0], scale: [1, 0.06, 1] }));
    }
    if (level === 2) {
      result.add(ring(8, 0.45, () => part(box(0.06, 0.06, 0.06), goldMat()), { y: 0.12, offset: Math.PI / 8 }));
    }
    return result;
  }

  /** A little archer; faces +Z and holds a bow in front. */
  function archerFigure(level) {
    const tunic = mat(LEVELS[level].cloth);
    const figure = group(
      part(box(0.06, 0.12, 0.06), mat(PALETTE.woodDark), { at: [-0.04, 0.06, 0] }),
      part(box(0.06, 0.12, 0.06), mat(PALETTE.woodDark), { at: [0.04, 0.06, 0] }),
      part(cylinder(0.085, 0.1, 6), tunic, { at: [0, 0.22, 0], scale: [1, 0.22, 1] }),
      part(box(0.19, 0.03, 0.19), mat(PALETTE.woodDark), { at: [0, 0.16, 0] }),
      part(sphere(0), mat(PALETTE.skin), { at: [0, 0.41, 0], scale: 0.08 }),
      // Arms reaching to the bow.
      part(box(0.04, 0.04, 0.16), tunic, { at: [-0.07, 0.3, 0.08] }),
      part(box(0.04, 0.04, 0.12), tunic, { at: [0.06, 0.3, 0.03] }),
      // Bow, string and a nocked arrow.
      part(torus(0.17, 0.014, 10, Math.PI), mat(PALETTE.woodDark), { at: [-0.07, 0.3, 0.17], rotation: [0, 0, Math.PI / 2] }),
      part(box(0.006, 0.33, 0.006), mat(0xe8e2d2), { at: [-0.07, 0.3, 0.17] }),
      part(box(0.012, 0.012, 0.3), mat(PALETTE.woodLight), { at: [-0.06, 0.3, 0.1] }),
      // Quiver on the back.
      part(cylinder(0.03, 0.03, 6), mat(PALETTE.wood), { at: [0.06, 0.26, -0.08], scale: [1, 0.2, 1], rotation: [0.3, 0, 0.3] }),
      part(box(0.01, 0.1, 0.01), mat(0xe8e2d2), { at: [0.08, 0.39, -0.11] }),
      part(box(0.01, 0.1, 0.01), mat(0xe8e2d2), { at: [0.1, 0.38, -0.1] }),
    );
    if (level === 0) {
      figure.add(part(cone(6), mat(shade(LEVELS[0].cloth, 0.8)), { at: [0, 0.49, 0], scale: [0.09, 0.12, 0.09] }));
    } else {
      figure.add(part(sphere(1), mat(PALETTE.metal, { shine: 0.5 }), { at: [0, 0.44, 0], scale: [0.085, 0.07, 0.085] }));
      figure.add(part(box(0.02, 0.07, 0.02), mat(PALETTE.metal, { shine: 0.5 }), { at: [0, 0.41, 0.08] }));
    }
    if (level === 2) {
      figure.add(part(box(0.03, 0.1, 0.1), mat(PALETTE.crimson), { at: [0, 0.53, -0.02] }));
    }
    // Scale to human size so doors and figures agree (see HUMAN in kit.js).
    const height = new THREE.Box3().setFromObject(figure).max.y;
    const scaled = group(figure);
    figure.scale.setScalar(HUMAN.figure / height);
    scaled.name = 'figure';
    return scaled;
  }

  // Archer tower

  function buildArcher(level) {
    const style = LEVELS[level];
    const deck = [0.85, 1.15, 1.5][level];
    const tower = group(footing(level));
    const wood = mat(PALETTE.wood);
    const woodDark = mat(PALETTE.woodDark);

    if (level === 0) {
      // Timber watch post: four splayed legs with cross braces.
      for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        tower.add(part(box(0.08, deck, 0.08), wood, {
          at: [x * 0.24, deck / 2 + 0.08, z * 0.24], rotation: [z * -0.06, 0, x * 0.06],
        }));
      }
      for (const side of [-1, 1]) {
        tower.add(part(box(0.03, 0.62, 0.03), woodDark, { at: [side * 0.27, deck * 0.45, 0], rotation: [0.95, 0, 0] }));
        tower.add(part(box(0.03, 0.62, 0.03), woodDark, { at: [side * 0.27, deck * 0.45, 0], rotation: [-0.95, 0, 0] }));
        tower.add(part(box(0.03, 0.62, 0.03), woodDark, { at: [0, deck * 0.45, side * 0.27], rotation: [0, 0, 0.95] }));
        tower.add(part(box(0.03, 0.62, 0.03), woodDark, { at: [0, deck * 0.45, side * 0.27], rotation: [0, 0, -0.95] }));
      }
      // Ladder on the front.
      tower.add(part(box(0.02, deck * 0.8, 0.02), woodDark, { at: [-0.07, deck * 0.45, 0.3] }));
      tower.add(part(box(0.02, deck * 0.8, 0.02), woodDark, { at: [0.07, deck * 0.45, 0.3] }));
      for (let i = 0; i < 4; i++) tower.add(part(box(0.14, 0.02, 0.02), woodDark, { at: [0, 0.25 + i * 0.17, 0.3] }));
    } else if (level === 1) {
      // Stone lower storey with timber upper frame.
      tower.add(part(cylinder(0.34, 0.38, 8), mat(PALETTE.stone), { at: [0, 0.1 + 0.3, 0], scale: [1, 0.6, 1] }));
      tower.add(part(cylinder(0.36, 0.36, 8), mat(PALETTE.stoneDark), { at: [0, 0.69, 0], scale: [1, 0.05, 1] }));
      const entrance = door(0.2, 0.52, { frame: PALETTE.stoneDark });
      entrance.position.set(0, 0.1, 0.365);
      tower.add(entrance);
      for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        tower.add(part(box(0.08, deck - 0.4, 0.08), wood, { at: [x * 0.25, (deck + 0.4) / 2, z * 0.25] }));
      }
      for (const side of [-1, 1]) {
        tower.add(part(box(0.03, 0.6, 0.03), woodDark, { at: [side * 0.27, 0.78, 0], rotation: [0.98, 0, 0] }));
        tower.add(part(box(0.03, 0.6, 0.03), woodDark, { at: [side * 0.27, 0.78, 0], rotation: [-0.98, 0, 0] }));
      }
      tower.add(part(box(0.56, 0.04, 0.56), woodDark, { at: [0, 0.72, 0] }));
    } else {
      // Full stone tower with corbels and arrow slits.
      tower.add(part(cylinder(0.33, 0.38, 8), mat(PALETTE.stone), { at: [0, 0.1 + (deck - 0.2) / 2, 0], scale: [1, deck - 0.2, 1] }));
      tower.add(part(cylinder(0.37, 0.37, 8), mat(PALETTE.stoneDark), { at: [0, 0.76, 0], scale: [1, 0.06, 1] }));
      tower.add(part(cylinder(0.355, 0.355, 8), mat(PALETTE.stoneDark), { at: [0, 1.22, 0], scale: [1, 0.06, 1] }));
      tower.add(ring(8, 0.36, () => part(box(0.08, 0.1, 0.1), mat(PALETTE.stoneLight)), { y: deck - 0.12, offset: Math.PI / 8 }));
      for (const angle of [0, Math.PI / 2, -Math.PI / 2]) {
        tower.add(part(box(0.05, 0.16, 0.03), mat(PALETTE.soilDark), {
          at: [Math.sin(angle) * 0.35, 0.99, Math.cos(angle) * 0.35], rotation: [0, angle, 0],
        }));
      }
      const entrance = door(0.24, 0.56, { frame: PALETTE.stoneLight, arch: true });
      entrance.position.set(0, 0.1, 0.372);
      tower.add(entrance);
    }

    // Deck and parapet.
    const deckSize = level === 2 ? 0.8 : 0.72;
    tower.add(part(box(deckSize, 0.07, deckSize), level === 2 ? mat(PALETTE.stoneLight) : mat(PALETTE.plank), { at: [0, deck, 0] }));
    if (level === 0) {
      for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        tower.add(part(box(0.04, 0.22, 0.04), woodDark, { at: [x * 0.34, deck + 0.13, z * 0.34] }));
      }
      for (const side of [-1, 1]) {
        tower.add(part(box(0.7, 0.025, 0.025), woodDark, { at: [0, deck + 0.2, side * 0.34] }));
        tower.add(part(box(0.025, 0.025, 0.7), woodDark, { at: [side * 0.34, deck + 0.2, 0] }));
      }
    } else if (level === 1) {
      // Pointed plank palisade around the deck.
      for (let i = -3; i <= 3; i++) {
        for (const side of [-1, 1]) {
          tower.add(part(box(0.08, 0.2, 0.03), mat(PALETTE.plank), { at: [i * 0.1, deck + 0.12, side * 0.36] }));
          tower.add(part(cone(4), mat(PALETTE.plank), { at: [i * 0.1, deck + 0.25, side * 0.36], scale: [0.045, 0.06, 0.02], rotation: [0, Math.PI / 4, 0] }));
          if (Math.abs(i) < 3) {
            tower.add(part(box(0.03, 0.2, 0.08), mat(PALETTE.plank), { at: [side * 0.36, deck + 0.12, i * 0.1] }));
          }
        }
      }
    } else {
      // Stone merlons with gold caps.
      for (let i = -2; i <= 2; i++) {
        for (const side of [-1, 1]) {
          tower.add(part(box(0.1, 0.16, 0.08), mat(PALETTE.stone), { at: [i * 0.16, deck + 0.1, side * 0.38] }));
          tower.add(part(box(0.08, 0.16, 0.1), mat(PALETTE.stone), { at: [side * 0.38, deck + 0.1, i * 0.16] }));
        }
      }
      tower.add(part(box(0.82, 0.03, 0.82), goldMat(), { at: [0, deck + 0.03, 0] }));
    }

    // Canopy on the back half so the archer stays visible from above.
    const roofHeight = [0.38, 0.46, 0.62][level];
    const canopy = group();
    canopy.position.set(0, deck, -0.2);
    if (level < 2) {
      for (const x of [-0.3, 0.3]) canopy.add(part(box(0.05, roofHeight, 0.05), woodDark, { at: [x, roofHeight / 2, -0.1] }));
      canopy.add(part(gable(), mat(style.roof), { at: [0, roofHeight + 0.02, -0.08], scale: [0.82, 0.22, 0.28] }));
      canopy.add(part(box(0.84, 0.03, 0.03), woodDark, { at: [0, roofHeight - 0.04, 0.12] }));
      if (level === 1) canopy.add(part(box(0.86, 0.04, 0.06), goldMat(), { at: [0, roofHeight + 0.24, -0.08] }));
    } else {
      // Slate tourelle on the back corner with a gold finial.
      const tourelle = group(
        part(cylinder(0.14, 0.14, 6), mat(PALETTE.stone), { at: [0, 0.2, 0], scale: [1, 0.4, 1] }),
        part(cone(6), mat(style.roof), { at: [0, 0.63, 0], scale: [0.19, 0.46, 0.19] }),
        part(sphere(0), goldMat(), { at: [0, 0.88, 0], scale: 0.035 }),
      );
      tourelle.position.set(-0.26, 0.04, -0.06);
      canopy.add(tourelle);
    }
    tower.add(canopy);

    // Archers.
    const turret = group();
    if (level === 2) {
      const left = archerFigure(level);
      left.position.x = -0.13;
      const right = archerFigure(level);
      right.position.x = 0.13;
      turret.add(left, right);
    } else {
      turret.add(archerFigure(level));
    }
    turret.position.set(0, deck + 0.035, 0.04);
    tower.add(turret);

    tower.add(banner(level, [0.32, deck + 0.04, -0.3], 0.5 + level * 0.1));
    turret.userData.role = 'turret';
    tower.userData.turret = turret;
    tower.userData.muzzle = [0, deck + 0.35, 0.2];
    tower.userData.height = deck + roofHeight + 0.35;
    return tower;
  }

  // Cannon

  function cannonBarrel(level) {
    const length = [0.5, 0.62, 0.74][level];
    const radius = [0.075, 0.09, 0.105][level];
    const barrel = group(
      part(cylinder(radius, radius * 1.25, 10), mat(PALETTE.ironDark, { shine: 0.5 }), { at: [0, 0, length / 2], scale: [1, length, 1], rotation: [Math.PI / 2, 0, 0] }),
      part(torus(radius * 1.08, radius * 0.25, 10), level === 0 ? iron() : brass(), { at: [0, 0, length - 0.03] }),
      part(torus(radius * 1.22, radius * 0.28, 10), level === 0 ? iron() : brass(), { at: [0, 0, length * 0.3] }),
      part(sphere(0), mat(PALETTE.ironDark, { shine: 0.5 }), { at: [0, 0, 0.02], scale: radius * 1.2 }),
      part(disc(radius * 0.7, 10), mat(0x151517), { at: [0, 0, length], rotation: [Math.PI / 2, 0, 0] }),
    );
    if (level >= 1) barrel.add(part(torus(radius * 1.22, radius * 0.28, 10), brass(), { at: [0, 0, length * 0.6] }));
    if (level === 2) {
      // Muzzle brake and a rivet collar.
      barrel.add(part(cylinder(radius * 1.3, radius * 1.3, 8), iron(), { at: [0, 0, length - 0.1], scale: [1, 0.08, 1], rotation: [Math.PI / 2, 0, 0] }));
      const rivets = ring(6, radius * 1.25, () => part(sphere(0), goldMat(), { scale: 0.018 }));
      rivets.rotation.x = Math.PI / 2;
      rivets.position.z = length * 0.45;
      barrel.add(rivets);
    }
    return barrel;
  }

  function cannonballs(count, at) {
    const ball = mat(PALETTE.ironDark, { shine: 0.5 });
    const pile = group();
    const spots = [[0, 0], [0.09, 0], [0.045, 0.08], [0.135, 0.08], [0.09, 0.16]];
    for (let i = 0; i < Math.min(count, 3); i++) pile.add(part(sphere(1), ball, { at: [spots[i][0] - 0.06, 0.045, spots[i][1] - 0.05], scale: 0.045 }));
    if (count > 3) pile.add(part(sphere(1), ball, { at: [-0.015, 0.115, 0], scale: 0.045 }));
    pile.position.set(...at);
    return pile;
  }

  function buildCannon(level) {
    const height = [0.42, 0.58, 0.74][level];
    const tower = group(footing(level, PALETTE.stoneDark));
    const stone = mat(PALETTE.stone);

    // Bastion body.
    tower.add(part(cylinder(0.36, 0.42, 8), stone, { at: [0, 0.1 + height / 2, 0], scale: [1, height, 1] }));
    if (level === 0) {
      // Sandbags around the rim.
      tower.add(ring(8, 0.37, () => part(sphere(1), mat(PALETTE.straw), { scale: [0.1, 0.055, 0.07] }), { y: height + 0.12, offset: Math.PI / 8 }));
    } else if (level === 1) {
      // Timber bracing with iron bands.
      tower.add(ring(8, 0.39, () => part(box(0.09, height - 0.08, 0.05), mat(PALETTE.woodDark)), { y: 0.1 + height / 2, offset: Math.PI / 8 }));
      tower.add(part(cylinder(0.41, 0.41, 8), iron(), { at: [0, 0.3, 0], scale: [1, 0.04, 1] }));
      tower.add(part(cylinder(0.41, 0.41, 8), iron(), { at: [0, height - 0.02, 0], scale: [1, 0.04, 1] }));
      tower.add(ring(8, 0.38, () => part(cone(4), mat(PALETTE.plank), { scale: [0.05, 0.22, 0.05], rotation: [0.5, 0, 0] }), { y: height + 0.2, offset: Math.PI / 8 }));
    } else {
      // Iron-plated fortress with crenellations.
      tower.add(part(cylinder(0.4, 0.4, 8), mat(PALETTE.stoneDark), { at: [0, 0.1 + height * 0.5, 0], scale: [1, 0.06, 1] }));
      tower.add(ring(8, 0.38, () => part(box(0.14, height * 0.55, 0.03), iron()), { y: 0.1 + height * 0.45, offset: Math.PI / 8 }));
      tower.add(ring(8, 0.4, () => part(box(0.14, 0.14, 0.1), stone), { y: height + 0.18, offset: Math.PI / 8 }));
      tower.add(part(cylinder(0.43, 0.43, 8), goldMat(), { at: [0, height + 0.1, 0], scale: [1, 0.03, 1] }));
    }
    // Deck.
    const deck = height + 0.1;
    tower.add(part(cylinder(0.34, 0.34, 8), mat(PALETTE.plank), { at: [0, deck, 0], scale: [1, 0.05, 1] }));

    // Ordnance on a wheeled carriage.
    const carriage = group(
      part(box(0.18, 0.1, 0.34), mat(PALETTE.woodDark), { at: [0, 0.08, -0.02] }),
      part(box(0.26, 0.03, 0.03), iron(), { at: [0, 0.1, 0.06] }),
    );
    for (const side of [-1, 1]) {
      carriage.add(part(cylinder(0.1, 0.1, 8), mat(PALETTE.wood), { at: [side * 0.12, 0.1, 0.06], scale: [1, 0.04, 1], rotation: [0, 0, Math.PI / 2] }));
      carriage.add(part(cylinder(0.03, 0.03, 6), iron(), { at: [side * 0.14, 0.1, 0.06], scale: [1, 0.02, 1], rotation: [0, 0, Math.PI / 2] }));
    }
    const turret = group(carriage);
    if (level === 2) {
      for (const side of [-1, 1]) {
        const barrel = cannonBarrel(1);
        barrel.position.set(side * 0.1, 0.2, -0.08);
        barrel.rotation.x = -0.22;
        turret.add(barrel);
      }
      turret.add(part(box(0.3, 0.08, 0.12), iron(), { at: [0, 0.2, -0.1] }));
    } else {
      const barrel = cannonBarrel(level);
      barrel.position.set(0, 0.18 + level * 0.01, -0.08);
      barrel.rotation.x = -0.22;
      turret.add(barrel);
    }
    turret.position.set(0, deck + 0.02, 0);
    tower.add(turret);

    // Shot pile and powder keg stay put while the cannon turns.
    tower.add(cannonballs(level === 0 ? 3 : 4, [-0.3, deck + 0.02, 0.22]));
    if (level >= 1) {
      tower.add(part(cylinder(0.06, 0.06, 8), mat(PALETTE.wood), { at: [0.31, deck + 0.1, 0.2], scale: [1, 0.16, 1] }));
      tower.add(part(cylinder(0.065, 0.065, 8), iron(), { at: [0.31, deck + 0.1, 0.2], scale: [1, 0.03, 1] }));
    }
    tower.add(banner(level, [-0.3, deck + 0.02, -0.26], 0.5 + level * 0.08));

    const muzzleLength = [0.5, 0.62, 0.62][level];
    turret.userData.role = 'turret';
    tower.userData.turret = turret;
    tower.userData.muzzle = [0, deck + 0.26, muzzleLength - 0.1];
    tower.userData.height = deck + 0.7 + level * 0.1;
    return tower;
  }

  // Frost spire

  function buildFrost(level) {
    const height = [0.7, 1.0, 1.3][level];
    const glow = [0x1b4a5e, 0x2f86b3, 0x4aa8e0][level];
    const ice = mat([0x9fdcf2, 0x8fd6f5, 0x7fcdf7][level], { shine: 0.7, glow, glowStrength: 0.9 + level * 0.4 });
    const iceClear = mat(0xd6f3ff, { shine: 0.8, glow, opacity: 0.75 });
    const pale = mat(0xdde7ee);
    const paleDark = mat(0xb9c8d3);
    const tower = group(footing(level, 0xa9b6c2));

    // Hexagonal pedestal with a rune ring.
    tower.add(part(cylinder(0.3, 0.36, 6), pale, { at: [0, 0.2, 0], scale: [1, 0.2, 1] }));
    tower.add(part(torus(0.3, 0.015, 6), mat(0x7fd7ff, { glow: 0x3fa5d9, glowStrength: 1.5 }), { at: [0, 0.31, 0], rotation: [Math.PI / 2, 0, 0] }));
    if (level === 2) {
      tower.add(part(disc(0.48, 6), mat(PALETTE.snow, { shine: 0.2 }), { at: [0, 0.105, 0] }));
    }

    // Spire: stacked, rotated prisms that narrow upwards.
    const segments = level + 2;
    const segmentHeight = (height - 0.1) / segments;
    for (let i = 0; i < segments; i++) {
      const radiusBottom = 0.17 - i * 0.025;
      tower.add(part(cylinder(radiusBottom - 0.025, radiusBottom, 6), i % 2 ? paleDark : pale, {
        at: [0, 0.3 + segmentHeight * (i + 0.5), 0], scale: [1, segmentHeight, 1], rotation: [0, (i * Math.PI) / 6, 0],
      }));
      if (i > 0) {
        tower.add(part(torus(radiusBottom + 0.01, 0.012, 6), level === 2 ? goldMat() : mat(PALETTE.metal, { shine: 0.5 }), {
          at: [0, 0.3 + segmentHeight * i, 0], rotation: [Math.PI / 2, 0, 0],
        }));
      }
    }

    // Ice shards leaning out from the base.
    const shardCount = 2 + level * 2;
    tower.add(ring(shardCount, 0.3, (i) => part(cone(5), i % 2 ? ice : iceClear, {
      at: [0, 0.16 + (i % 2) * 0.05, 0], scale: [0.07, 0.32 + level * 0.06 + (i % 2) * 0.08, 0.07], rotation: [0.35, 0, 0],
    }), { y: 0.3, offset: 0.4 }));

    // Orbiting shards around the spire (level 2+), counter-rotating at level 3.
    if (level >= 1) {
      const orbit = ring(3, 0.28, () => part(octa(), iceClear, { scale: [0.04, 0.09, 0.04] }), { y: 0 });
      orbit.position.y = 0.3 + height * 0.55;
      orbit.userData.spin = { axis: 'y', speed: 1.6 };
      tower.add(orbit);
      tower.add(part(torus(0.26, 0.012, 12), level === 2 ? goldMat() : mat(PALETTE.metal, { shine: 0.5 }), { at: [0, orbit.position.y, 0], rotation: [Math.PI / 2, 0, 0] }));
    }
    if (level === 2) {
      const orbit = ring(5, 0.36, () => part(octa(), ice, { scale: [0.035, 0.08, 0.035] }), { y: 0 });
      orbit.position.y = 0.3 + height * 0.85;
      orbit.userData.spin = { axis: 'y', speed: -1.1 };
      tower.add(orbit);
      tower.add(part(torus(0.34, 0.012, 12), goldMat(), { at: [0, orbit.position.y, 0], rotation: [Math.PI / 2, 0, 0] }));
      // Icicles hanging from the upper ring.
      tower.add(ring(6, 0.34, () => part(cone(4), iceClear, { at: [0, -0.08, 0], scale: [0.02, 0.14, 0.02], rotation: [Math.PI, 0, 0] }), { y: orbit.position.y }));
    }

    // The crystal that aims: a main crystal with a focus shard pointing forward.
    const crystalHeight = [0.26, 0.36, 0.48][level];
    const crystal = group(
      part(octa(), ice, { at: [0, 0, 0], scale: [0.14 + level * 0.03, crystalHeight, 0.14 + level * 0.03] }),
      part(cone(4), mat(0xeafaff, { glow: 0x7fd7ff, glowStrength: 1.6 }), { at: [0, -0.02, 0.2], scale: [0.035, 0.14, 0.035], rotation: [Math.PI / 2, 0, 0] }),
    );
    if (level >= 1) {
      crystal.add(part(octa(), iceClear, { at: [0.11, -0.06, -0.06], scale: [0.06, 0.16, 0.06], rotation: [0, 0, -0.5] }));
      crystal.add(part(octa(), iceClear, { at: [-0.1, -0.05, -0.05], scale: [0.05, 0.14, 0.05], rotation: [0, 0, 0.5] }));
    }
    if (level === 2) {
      crystal.add(part(octa(), iceClear, { at: [0, -0.02, -0.13], scale: [0.06, 0.18, 0.06], rotation: [-0.5, 0, 0] }));
      crystal.add(part(sphere(1), mat(0xffffff, { glow: 0x9fe9ff, glowStrength: 3 }), { scale: 0.07, shadow: false }));
      const halo = part(torus(0.22, 0.01, 16), mat(0xbff0ff, { glow: 0x7fd7ff, glowStrength: 2 }), { rotation: [Math.PI / 2, 0, 0], shadow: false });
      halo.userData.spin = { axis: 'z', speed: 2 };
      crystal.add(halo);
    }
    crystal.position.y = 0.3 + height + crystalHeight * 0.6;
    crystal.userData.hover = { amplitude: 0.03, speed: 2.2 };
    const turret = group(crystal);
    tower.add(turret);

    tower.add(banner(level, [0.33, 0.1, -0.3], 0.45 + level * 0.1));

    turret.userData.role = 'turret';
    tower.userData.turret = turret;
    tower.userData.muzzle = [0, crystal.position.y, 0.2];
    tower.userData.height = crystal.position.y + crystalHeight + 0.05;
    return tower;
  }

  const BUILDERS = { archer: buildArcher, cannon: buildCannon, frost: buildFrost };

  function buildTower(type, level) {
    return BUILDERS[type](level);
  }

  Object.assign(Hold, { towerModels: { buildTower, LEVELS } });
})();
