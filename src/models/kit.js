(() => {
  'use strict';

  /*
   * Shared building blocks for every model. Geometries and materials are
   * cached, so models are cheap to build and removing one never needs a
   * dispose. Models stand on y = 0, centred on x/z, and face +Z (towards the
   * camera in the map view). Every part casts and receives shadows.
   *
   * Models never touch the DOM or load files, so they build in Node for the
   * tests and straight from file:// in the browser.
   */

  const materialCache = new Map();
  const geometryCache = new Map();

  /**
   * Flat-shaded material. `shine` (0–1) makes it glossier, `glow` adds an
   * emissive colour, `opacity` below 1 makes it transparent.
   */
  function mat(color, { shine = 0, glow = 0x000000, glowStrength = 1, opacity = 1, emissive, side } = {}) {
    const emissiveColor = emissive ?? glow;
    const key = `${color}:${shine}:${emissiveColor}:${glowStrength}:${opacity}:${side ?? ''}`;
    if (!materialCache.has(key)) {
      materialCache.set(key, new THREE.MeshStandardMaterial({
        color,
        emissive: emissiveColor,
        emissiveIntensity: glowStrength,
        flatShading: true,
        roughness: 1 - shine * 0.65,
        metalness: shine * 0.35,
        transparent: opacity < 1,
        opacity,
        side: side ?? THREE.FrontSide,
      }));
    }
    return materialCache.get(key);
  }

  function geo(key, create) {
    if (!geometryCache.has(key)) geometryCache.set(key, create());
    return geometryCache.get(key);
  }

  const box = (w, h, d) => geo(`box:${w}:${h}:${d}`, () => new THREE.BoxGeometry(w, h, d));
  const sphere = (detail = 1) => geo(`sphere:${detail}`, () => new THREE.IcosahedronGeometry(1, detail));
  /** Unit-height cylinder; scale y for height. */
  const cylinder = (top, bottom, segments = 8) =>
    geo(`cyl:${top}:${bottom}:${segments}`, () => new THREE.CylinderGeometry(top, bottom, 1, segments));
  /** Unit cone (radius 1, height 1, base at y = -0.5). */
  const cone = (segments = 8) => geo(`cone:${segments}`, () => new THREE.ConeGeometry(1, 1, segments));
  /** Triangular prism with its ridge along X, apex at y = 1, base at y = -0.5. */
  const gable = () => geo('gable', () => new THREE.CylinderGeometry(1, 1, 1, 3).rotateX(-Math.PI / 2).rotateY(Math.PI / 2));
  const octa = () => geo('octa', () => new THREE.OctahedronGeometry(1, 0));
  const dodeca = () => geo('dodeca', () => new THREE.DodecahedronGeometry(1, 0));
  const tetra = () => geo('tetra', () => new THREE.TetrahedronGeometry(1, 0));
  const torus = (radius, tube, segments = 8, arc = Math.PI * 2) =>
    geo(`torus:${radius}:${tube}:${segments}:${arc}`, () => new THREE.TorusGeometry(radius, tube, 4, segments, arc));
  /** Flat disc in the XZ plane, facing up. */
  const disc = (radius, segments = 12) => geo(`disc:${radius}:${segments}`, () => new THREE.CircleGeometry(radius, segments).rotateX(-Math.PI / 2));
  /** Flat ring in the XZ plane, facing up. */
  const flatRing = (inner, outer, segments = 24) =>
    geo(`ring:${inner}:${outer}:${segments}`, () => new THREE.RingGeometry(inner, outer, segments).rotateX(-Math.PI / 2));
  /**
   * Box whose top can slope: `corners` are the heights of the top face at
   * [x-,z-], [x+,z-], [x-,z+], [x+,z+]; the bottom stays at y = 0.
   */
  function rampBox(w, d, corners) {
    const [a, b, c, e] = corners;
    const geometry = new THREE.BoxGeometry(w, 1, d);
    const position = geometry.attributes.position;
    for (let i = 0; i < position.count; i++) {
      const x = position.getX(i);
      const y = position.getY(i);
      const z = position.getZ(i);
      if (y > 0) {
        const top = x < 0 ? (z < 0 ? a : c) : (z < 0 ? b : e);
        position.setY(i, top);
      } else {
        position.setY(i, 0);
      }
    }
    geometry.computeVertexNormals();
    return geometry;
  }

  /**
   * Creates a mesh. `scale` may be a number or `[x, y, z]`; `rotation` is `[x, y, z]` in radians.
   */
  function part(geometry, material, { at = [0, 0, 0], scale = 1, rotation = [0, 0, 0], shadow = true } = {}) {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(...at);
    if (Array.isArray(scale)) mesh.scale.set(...scale);
    else mesh.scale.setScalar(scale);
    mesh.rotation.set(...rotation);
    mesh.castShadow = shadow;
    mesh.receiveShadow = shadow;
    return mesh;
  }

  function group(...children) {
    const result = new THREE.Group();
    if (children.length) result.add(...children);
    return result;
  }

  /**
   * Human scale shared by every model: figures (the archers) stand at most
   * `figure` tall, and every door is at least `door` tall so people fit
   * through it. tests/models.test.js checks both.
   */
  const HUMAN = { figure: 0.46, door: 0.52 };

  /**
   * A door facing +Z with its bottom at y = 0: a planked leaf with iron
   * bands and a ring handle in a frame, optionally arched. Named 'door' so
   * the scale test can find it.
   */
  function door(width, height, { frame = PALETTE.stoneDark, leaf = PALETTE.woodDark, arch = false, depth = 0.04 } = {}) {
    if (height < HUMAN.door) throw new Error(`A door of ${height} is shorter than a person (${HUMAN.door})`);
    const leafMat = mat(leaf);
    const frameMat = mat(frame);
    const iron = mat(PALETTE.iron, { shine: 0.4 });
    const straight = arch ? height - width / 2 : height;
    const result = group(
      part(box(width, straight, depth), leafMat, { at: [0, straight / 2, 0] }),
      part(box(width + 0.06, 0.035, depth + 0.02), frameMat, { at: [0, 0.0175, 0.005] }),
      part(box(0.035, straight, depth + 0.02), frameMat, { at: [-width / 2 - 0.0175, straight / 2, 0.005] }),
      part(box(0.035, straight, depth + 0.02), frameMat, { at: [width / 2 + 0.0175, straight / 2, 0.005] }),
      part(box(width * 0.96, 0.02, depth + 0.012), iron, { at: [0, straight * 0.28, 0.004] }),
      part(box(width * 0.96, 0.02, depth + 0.012), iron, { at: [0, straight * 0.72, 0.004] }),
      part(torus(0.018, 0.005, 6), mat(PALETTE.gold, { shine: 0.6 }), { at: [width * 0.28, straight * 0.5, depth / 2 + 0.01] }),
      part(box(0.01, straight * 0.96, depth + 0.006), mat(PALETTE.soilDark), { at: [0, straight / 2, 0.002] }),
    );
    if (arch) {
      result.add(part(cylinder(width / 2, width / 2, 10), leafMat, { at: [0, straight, 0], scale: [1, depth, 1], rotation: [Math.PI / 2, 0, 0] }));
      result.add(part(torus(width / 2 + 0.018, 0.022, 10, Math.PI), frameMat, { at: [0, straight, 0.005] }));
    } else {
      result.add(part(box(width + 0.07, 0.04, depth + 0.03), frameMat, { at: [0, height + 0.02, 0.005] }));
    }
    result.name = 'door';
    result.userData.doorHeight = height;
    return result;
  }

  /** Places `count` copies of `build(i, angle)` evenly on a circle of `radius`. */
  function ring(count, radius, build, { y = 0, offset = 0 } = {}) {
    const result = group();
    for (let i = 0; i < count; i++) {
      const angle = offset + (i / count) * Math.PI * 2;
      const child = build(i, angle);
      child.position.set(Math.sin(angle) * radius, y, Math.cos(angle) * radius);
      child.rotation.y = angle;
      result.add(child);
    }
    return result;
  }

  const scratch = new THREE.Color();

  /** Lightens (factor > 1) or darkens (factor < 1) a hex colour. */
  function shade(color, factor) {
    scratch.setHex(color);
    scratch.r = Math.min(1, scratch.r * factor);
    scratch.g = Math.min(1, scratch.g * factor);
    scratch.b = Math.min(1, scratch.b * factor);
    return scratch.getHex();
  }

  function mix(a, b, t) {
    scratch.setHex(a).lerp(new THREE.Color(b), t);
    return scratch.getHex();
  }

  /** Shared palette so the whole game reads as one cozy set. */
  const PALETTE = {
    soil: 0x8a5a3b,
    soilWet: 0x5e3b26,
    soilDark: 0x4a3020,
    path: 0xd8b98c,
    pathLight: 0xe6cba3,
    grass: 0x8fcc66,
    grassDark: 0x79b455,
    grassLight: 0xa6d873,
    grassDry: 0xb9c95f,
    rock: 0x8f8a84,
    rockDark: 0x6f6a66,
    rockLight: 0xa8a39b,
    cliff: 0x7d6b5b,
    cliffDark: 0x5f5044,
    wood: 0xb07a4a,
    woodDark: 0x7a4e2e,
    woodLight: 0xd2a06e,
    plank: 0xc48b5a,
    metal: 0xb8c2c8,
    iron: 0x3a3d44,
    ironDark: 0x26282e,
    straw: 0xe8c96a,
    thatch: 0xd9b45a,
    cream: 0xf6ecd6,
    plaster: 0xf2e6cf,
    roofRed: 0xc2533f,
    roofBlue: 0x5a73a8,
    roofSlate: 0x6d7383,
    stone: 0x9a968e,
    stoneLight: 0xb5b0a6,
    stoneDark: 0x7b776f,
    gold: 0xe9b93c,
    brass: 0xd1a04a,
    banner: 0x4f7cc9,
    crimson: 0xc2533f,
    ice: 0x9fdcf2,
    iceDeep: 0x4aa3c9,
    snow: 0xf4fbff,
    leaf: 0x4f9a45,
    leafLight: 0x6fb954,
    leafDark: 0x3c7d3a,
    autumn: 0xe0923a,
    skin: 0xf0c7a0,
    water: 0x5fb3d9,
    flower: [0xf25c5c, 0xf7d14c, 0xffffff, 0xc97ce0],
  };

  /**
   * Bakes an object tree into as few meshes as possible: opaque parts merge
   * into one vertex-coloured mesh, transparent or glowing parts stay as they
   * are, and every subtree with an animation hook (see animation.js) is
   * baked on its own so it can still move (or be shown and hidden). Hidden
   * static parts are left out. Static scenery is baked so a whole village
   * costs a handful of draw calls. The original is not reused.
   */
  function bake(root) {
    root.updateMatrixWorld(true);
    // A fresh model has no parent, so its world matrix is its own transform and survives the bake.
    const result = bakeNode(root);
    resolveRoles(result);
    return result;
  }

  /**
   * Parts a model exposes by reference (`userData.turret`, `userData.body`)
   * are tagged with `userData.role` so they survive baking and cloning;
   * this re-points the references at the tagged nodes.
   */
  function resolveRoles(root) {
    root.traverse((node) => {
      if (node !== root && node.userData.role) root.userData[node.userData.role] = node;
    });
    return root;
  }

  const HOOK_KEYS = ['spin', 'hover', 'flutter', 'flicker', 'sway', 'limb'];
  const hasHook = (node) => HOOK_KEYS.some((key) => node.userData[key]) || Boolean(node.userData.role);
  const isSpecial = (mesh) => mesh.material.transparent || (mesh.material.emissive?.getHex() ?? 1) !== 0;

  function bakeNode(node) {
    const inverse = new THREE.Matrix4().copy(node.matrixWorld).invert();
    const matrix = new THREE.Matrix4();
    const chunks = [];
    const kept = [];
    const hooked = [];
    const visit = (current) => {
      for (const child of current.children) {
        if (hasHook(child)) {
          hooked.push(child);
          continue;
        }
        // Hidden static parts stay hidden: merged, they could never be hidden again.
        if (!child.visible) continue;
        if (child.isMesh) {
          if (isSpecial(child)) kept.push(child);
          else chunks.push(transformed(child.geometry, matrix.multiplyMatrices(inverse, child.matrixWorld), child.material.color));
        }
        visit(child);
      }
    };
    if (node.isMesh) {
      if (isSpecial(node)) kept.push(node);
      else chunks.push(transformed(node.geometry, matrix.identity(), node.material.color));
    }
    visit(node);

    const result = group();
    result.userData = { ...node.userData };
    node.matrixWorld.decompose(result.position, result.quaternion, result.scale);
    if (chunks.length) {
      const mesh = new THREE.Mesh(mergeChunks(chunks), bakedMaterial());
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      result.add(mesh);
    }
    // Glowing and see-through parts keep their own material, but parts sharing one merge into one mesh.
    const byMaterial = new Map();
    for (const mesh of kept) {
      if (!byMaterial.has(mesh.material)) byMaterial.set(mesh.material, []);
      byMaterial.get(mesh.material).push(mesh);
    }
    for (const [material, meshes] of byMaterial) {
      const merged = new THREE.Mesh(
        mergeChunks(meshes.map((mesh) => transformed(mesh.geometry, matrix.multiplyMatrices(inverse, mesh.matrixWorld), material.color))),
        material,
      );
      merged.castShadow = meshes.some((mesh) => mesh.castShadow);
      merged.receiveShadow = meshes.some((mesh) => mesh.receiveShadow);
      result.add(merged);
    }
    for (const child of hooked) {
      const sub = bakeNode(child);
      matrix.multiplyMatrices(inverse, child.matrixWorld).decompose(sub.position, sub.quaternion, sub.scale);
      sub.visible = child.visible;
      result.add(sub);
    }
    return result;
  }

  function transformed(geometry, matrix, color) {
    const source = geometry.index ? geometry.toNonIndexed() : geometry;
    const position = source.attributes.position.clone().applyMatrix4(matrix);
    const count = position.count;
    const colors = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      colors[i * 3] = color.r;
      colors[i * 3 + 1] = color.g;
      colors[i * 3 + 2] = color.b;
    }
    return { position: position.array, colors, count };
  }

  function mergeChunks(chunks) {
    const total = chunks.reduce((sum, chunk) => sum + chunk.count, 0);
    const positions = new Float32Array(total * 3);
    const colors = new Float32Array(total * 3);
    let offset = 0;
    for (const chunk of chunks) {
      positions.set(chunk.position, offset * 3);
      colors.set(chunk.colors, offset * 3);
      offset += chunk.count;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geometry.computeVertexNormals();
    return geometry;
  }

  let baked = null;
  function bakedMaterial() {
    if (!baked) baked = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.95, metalness: 0 });
    return baked;
  }

  /** Geometry for a list of `{ geometry, matrix, color }` entries as one vertex-coloured buffer. */
  function mergeGeometry(entries) {
    return mergeChunks(entries.map(({ geometry, matrix, color }) => transformed(geometry, matrix, new THREE.Color(color))));
  }

  /**
   * Horizontal radius a tower's turret reaches at any aim (its widest
   * overhang from the pivot) and the pivot's height. Used by the gallery
   * overlay and the model tests.
   */
  function turretSweep(turret) {
    turret.updateWorldMatrix(true, true);
    const pivot = new THREE.Vector3().setFromMatrixPosition(turret.matrixWorld);
    const bounds = new THREE.Box3();
    let radius = 0;
    turret.traverse((node) => {
      if (!node.isMesh) return;
      bounds.setFromObject(node);
      for (const x of [bounds.min.x, bounds.max.x]) {
        for (const z of [bounds.min.z, bounds.max.z]) {
          radius = Math.max(radius, Math.hypot(x - pivot.x, z - pivot.z));
        }
      }
    });
    return { radius, y: pivot.y };
  }

  /** Bounding box of the parts of `object` that are shown (hidden parts, like a ruin waiting for a fire, do not count). */
  function visibleBounds(object, target = new THREE.Box3()) {
    target.makeEmpty();
    object.updateMatrixWorld(true);
    const part = new THREE.Box3();
    const visit = (node) => {
      if (!node.visible) return;
      if (node.isMesh) target.union(part.setFromObject(node, false));
      for (const child of node.children) visit(child);
    };
    visit(object);
    return target;
  }

  Object.assign(Hold, {
    modelKit: {
      mat, geo, box, sphere, cylinder, cone, gable, octa, dodeca, tetra, torus, disc, flatRing, rampBox,
      part, group, ring, door, shade, mix, bake, resolveRoles, bakedMaterial, mergeGeometry, turretSweep, visibleBounds, HUMAN, PALETTE,
    },
  });
})();
