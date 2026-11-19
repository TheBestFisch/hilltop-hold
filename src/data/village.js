(() => {
  'use strict';

  /**
   * The village behind the gate, shared by the simulation (where invaders
   * go to set it alight) and the views (what is built, who walks where).
   * Every position is in tiles from the gate tile: [east, south], the road
   * arriving from the west as on the standard map. Rotations are in radians
   * (0 = the model faces +Z, south, towards the camera).
   */
  const VILLAGE_PLAN = {
    /** What stands on the terrace. Buildings that can burn have a `name`. */
    buildings: [
      { id: 'scenery:keep', name: 'keep', at: [3.4, -0.2], rotation: -Math.PI / 2 },
      { id: 'scenery:house:1', name: 'townhouse', at: [1.6, -2.1], rotation: -Math.PI / 2 + 0.2 },
      { id: 'scenery:house:0', name: 'cottage', at: [1.45, 2.05], rotation: -Math.PI / 2 - 0.25 },
      { id: 'scenery:house:2', name: 'stonehouse', at: [4.45, 2.2], rotation: Math.PI + 0.3 },
      { id: 'scenery:house:0', name: 'farmhouse', at: [4.2, -2.4], rotation: Math.PI - 0.2 },
      { id: 'scenery:windmill', name: 'windmill', at: [4.75, 0.1], rotation: -Math.PI / 2 },
      { id: 'scenery:cart', name: 'cart', at: [2.15, 2.35], rotation: -Math.PI / 2 },
      { id: 'scenery:well', at: [1.85, 0.0], rotation: 0 },
      { id: 'scenery:hay', at: [2.05, 3.0], rotation: 0.4 },
      { id: 'scenery:barrels', at: [2.5, -1.3], rotation: 0.3 },
      { id: 'scenery:lamp', at: [1.0, -0.75], rotation: 0 },
      { id: 'scenery:lamp', at: [1.0, 0.75], rotation: Math.PI },
      { id: 'scenery:lamp', at: [3.35, 1.6], rotation: -Math.PI / 2 },
      { id: 'scenery:fence', at: [3.0, -3.0], rotation: 0 },
      { id: 'scenery:fence', at: [4.0, -3.0], rotation: 0 },
      { id: 'scenery:tree:1', at: [5.05, 3.05], rotation: 0.5 },
      { id: 'scenery:tree:2', at: [0.95, 3.05], rotation: 1.1 },
      { id: 'scenery:bush:1', at: [2.6, -2.9], rotation: 0 },
      { id: 'scenery:flowers:0', at: [3.3, 2.3], rotation: 0 },
      { id: 'scenery:flowers:1', at: [3.2, -1.2], rotation: 0 },
      { id: 'scenery:mushrooms', at: [1.0, 2.5], rotation: 0 },
      { id: 'scenery:arch', at: [2.8, 3.55], rotation: 0 },
    ],
    /** Cobbled lanes: gate to keep, and keep to the south archway. [east, south, length, width, along south]. */
    lanes: [[1.9, 0, 2.2, 0.8, false], [2.8, 2.1, 2.9, 0.7, true]],
    /** Curtain wall pieces along the terrace edge; the south wall leaves a gap for the archway. */
    walls: [
      { at: [0.25, -1], rotation: -Math.PI / 2 }, { at: [0.25, -2], rotation: -Math.PI / 2 }, { at: [0.25, -3], rotation: -Math.PI / 2 },
      { at: [0.25, 1], rotation: -Math.PI / 2 }, { at: [0.25, 2], rotation: -Math.PI / 2 }, { at: [0.25, 3], rotation: -Math.PI / 2 },
      { at: [1, -3.6], rotation: 0 }, { at: [2, -3.6], rotation: 0 },
      { at: [1, 3.62], rotation: Math.PI }, { at: [1.75, 3.62], rotation: Math.PI },
      { at: [3.85, 3.62], rotation: Math.PI }, { at: [4.85, 3.62], rotation: Math.PI },
    ],
    /**
     * The wall walks either side of the gate (`level`s of the path network)
     * and the stone stairs that climb to them from the terrace, running
     * along the inside of the wall from `foot` to `top`. A level is as high
     * as the walk of its `wall`.
     */
    stairs: [
      { level: 'north', wall: [0.25, -2], foot: [0.62, -1.15], top: [0.62, -2.15] },
      { level: 'south', wall: [0.25, 2], foot: [0.62, 1.2], top: [0.62, 1.8] },
    ],
    /**
     * Where people walk: named points and the straight legs between them,
     * each clear of every building and prop above (tests/village.test.js
     * checks). Points are on the ground unless given a `level` (a wall walk).
     * Everyone in the village goes by these: the garrison to and from its
     * posts, villagers to shelter and out through the archway, and invaders
     * to the buildings they burn.
     */
    paths: {
      points: {
        gate: [0.95, 0],
        square: [1.25, 0],
        squareN: [1.35, -0.5],
        squareS: [1.35, 0.5],
        wellN: [1.85, -0.55],
        wellS: [1.85, 0.55],
        keepN: [2.35, -0.5],
        keepS: [2.35, 0.5],
        keepDoor: [2.7, -0.2],
        lane: [2.8, 1.1],
        lane2: [2.8, 2.3],
        arch: [2.8, 3.45],
        east: [3.7, 1.25],
        mill: [4.35, 1.05],
        stairsN: [1.25, -1.1],
        footN: [0.62, -1.15],
        topN: { at: [0.62, -2.15], level: 'north' },
        walkN: { at: [0.3, -2.15], level: 'north' },
        stairsS: [1.2, 1.12],
        footS: [0.62, 1.2],
        topS: { at: [0.62, 1.8], level: 'south' },
        walkS: { at: [0.3, 1.8], level: 'south' },
      },
      links: [
        ['gate', 'square'], ['square', 'squareN'], ['square', 'squareS'], ['squareN', 'wellN'], ['squareS', 'wellS'],
        ['wellN', 'keepN'], ['wellS', 'keepS'], ['keepN', 'keepDoor'], ['keepS', 'keepDoor'],
        ['keepS', 'lane'], ['lane', 'lane2'], ['lane2', 'arch'], ['lane', 'east'], ['east', 'mill'],
        ['squareN', 'stairsN'], ['stairsN', 'footN'], ['footN', 'topN'], ['topN', 'walkN'],
        ['squareS', 'stairsS'], ['stairsS', 'footS'], ['footS', 'topS'], ['topS', 'walkS'],
      ],
    },
    /** Where invaders come in, where the garrison and the villagers shelter, and the way out to the hill road. */
    entrance: 'gate',
    shelter: 'keepDoor',
    exit: 'arch',
    /**
     * What the invaders set alight in a fallen village: they walk to `from`
     * on the paths, step to `stand` and hold their torches to the building
     * at `face`. Whoever fires the keep goes in through its door and raises
     * their banner (`enter`). The gatehouse is fired from inside, where its
     * timber roof is in reach. The farmhouse behind the keep has no way
     * through to it, so it is spared.
     */
    targets: [
      { name: 'gatehouse', from: 'square', stand: [1.05, -0.35], face: [0.72, -0.45] },
      { name: 'cart', from: 'keepS', stand: [2.15, 1.35], face: [2.15, 2.2] },
      { name: 'townhouse', from: 'stairsN', stand: [1.6, -1.38], face: [1.6, -2.1] },
      { name: 'cottage', from: 'stairsS', stand: [1.45, 1.35], face: [1.45, 2.05] },
      { name: 'keep', from: 'keepN', stand: [2.45, -0.2], face: [2.75, -0.2], enter: true },
      { name: 'stonehouse', from: 'east', stand: [4.3, 1.45], face: [4.45, 2.2] },
      { name: 'windmill', from: 'mill', stand: [4.65, 0.8], face: [4.75, 0.1] },
    ],
    /** Where invaders with nothing left to burn gather in the square to cheer. */
    square: [
      [1.2, 0], [1.05, -0.4], [1.05, 0.4], [1.5, -0.85], [1.5, 0.85], [2.3, -0.6],
      [2.3, 0.62], [1.85, -0.8], [1.85, 0.85], [1.6, 0.3], [1.6, -0.3], [2.6, 0.95],
    ],
    /** Garrison posts on the wall walks, on the path network's levels. The first of each side keeps watch in peacetime. */
    posts: [
      { at: [0.3, -1.14], level: 'north', variant: 0, sentry: true },
      { at: [0.3, 1.14], level: 'south', variant: 0, sentry: true },
      { at: [0.3, -1.42], level: 'north', variant: 1 },
      { at: [0.3, 1.42], level: 'south', variant: 1 },
      { at: [0.3, -1.95], level: 'north', variant: 1 },
      { at: [0.3, 1.98], level: 'south', variant: 0 },
    ],
    /** Villagers' strolls in peacetime: the loop each one walks, and how fast. */
    strolls: [
      { variant: 0, speed: 0.32, loop: [[1.3, -0.52], [2.28, -0.6], [2.3, -0.45], [1.35, -0.4]] },
      { variant: 1, speed: 0.28, loop: [[2.32, 0.55], [1.4, 0.48], [1.45, 0.35], [2.3, 0.4]] },
      { variant: 2, speed: 0.5, loop: [[1.3, 0], [1.85, -0.52], [2.4, 0], [1.85, 0.52]] },
      { variant: 0, speed: 0.3, loop: [[2.15, 1.0], [2.6, 1.05], [2.55, 0.85], [2.1, 0.82]] },
    ],
  };

  Object.assign(Hold, { VILLAGE_PLAN });
})();
