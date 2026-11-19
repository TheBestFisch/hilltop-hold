(() => {
  'use strict';

  const { hash1, clamp } = Hold;

  /*
   * Height model of the hill. The battlefield is a stepped plateau: every
   * tile sits on a whole "tier" (TIER_HEIGHT apart) so towers always stand
   * on flat ground, while the road ramps smoothly between tiers so invaders
   * never pop up or down. A ragged ring of extra tiles surrounds the map and
   * drops as cliffs to the valley floor; the village terrace behind the gate
   * sits one tier above the road, whose last tile climbs to the terrace so
   * the gate's sill meets it, and the cave massif rests beside the spawn.
   *
   * Pure data, no rendering: the map view builds meshes from it, the views
   * use it to place things, the game uses it to pick tiles, and the tests
   * check it in Node. Coordinates are tile coordinates (x = column,
   * y = row), matching the simulation.
   */

  const TIER_HEIGHT = 0.35;
  const MAX_TIER = 3;
  const VALLEY_FLOOR = -3;
  const OUTER_RING = 3;
  const CAP = 0.16;
  const RING_CHANCE = [1, 0.7, 0.35];
  const VILLAGE = { depth: 5, halfWidth: 3 };
  const CAVE = { depth: 4, halfWidth: 2 };
  /** The hillside slopes from MOUND_TOP at the foot of the cliffs to the valley floor over MOUND_RADIUS tiles. */
  const MOUND_TOP = -0.75;
  const MOUND_RADIUS = 8;
  /**
   * The approach road: from the village's south gate down the hillside to
   * the valley, relative to the gate tile (x = columns east, y = rows south).
   * It starts level on the terrace lip, then descends to the valley floor.
   */
  const APPROACH = {
    points: [[2.8, 3.45], [2.8, 4.6], [3.9, 6.4], [3.5, 8.6], [1.6, 10.8], [-1.2, 13], [-3, 16.5], [-3.6, 24], [-3.4, 40]],
    level: 0.7,
    descent: 15,
    halfWidth: 0.45,
    clearance: 1.4,
  };
  const LAKE = { x: -2.5, y: 21.5, radius: 5 };

  function createTerrain(map) {
    const { columns, rows, spawn, gate, path } = map;
    const pathTiles = new Map(path.points.map(({ x, y }, index) => [`${x},${y}`, index]));

    /** Smooth, unquantised hill shape: rising to the north-east with a gentle roll. */
    const field = (col, row) =>
      0.55 * (1 - row / (rows - 1))
      + 0.45 * (col / (columns - 1))
      + 0.17 * Math.sin(col * 0.9 + 1.3) * Math.cos(row * 0.8 + 0.4);

    const quantise = (value) => clamp(Math.round(value / TIER_HEIGHT), 0, MAX_TIER);
    const inMap = (col, row) => col >= 0 && col < columns && row >= 0 && row < rows;

    // Approach road polyline in tile coordinates, with cumulative lengths.
    const approachPoints = APPROACH.points.map(([dx, dy]) => ({ x: gate.col + dx, y: gate.row + dy }));
    const approachLengths = [0];
    for (let i = 1; i < approachPoints.length; i++) {
      const a = approachPoints[i - 1];
      const b = approachPoints[i];
      approachLengths.push(approachLengths[i - 1] + Math.hypot(b.x - a.x, b.y - a.y));
    }
    const approachLength = approachLengths.at(-1);

    /** Nearest point on the approach road: distance along it and sideways gap. */
    function nearestOnApproach(x, y) {
      let best = { along: 0, gap: Infinity };
      for (let i = 1; i < approachPoints.length; i++) {
        const a = approachPoints[i - 1];
        const b = approachPoints[i];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const length = dx * dx + dy * dy;
        const t = clamp(((x - a.x) * dx + (y - a.y) * dy) / length, 0, 1);
        const gap = Math.hypot(x - (a.x + dx * t), y - (a.y + dy * t));
        if (gap < best.gap) best = { along: approachLengths[i - 1] + Math.sqrt(length) * t, gap };
      }
      return best;
    }

    /** Point and heading at `along` tiles down the approach road. */
    function approachAt(along) {
      const d = clamp(along, 0, approachLength);
      let i = 1;
      while (i < approachLengths.length - 1 && approachLengths[i] < d) i++;
      const a = approachPoints[i - 1];
      const b = approachPoints[i];
      const t = (d - approachLengths[i - 1]) / (approachLengths[i] - approachLengths[i - 1]);
      return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, heading: Math.atan2(b.x - a.x, b.y - a.y) };
    }

    const inVillage = (col, row) => col > gate.col && col <= gate.col + VILLAGE.depth && Math.abs(row - gate.row) <= VILLAGE.halfWidth;
    const inCave = (col, row) => col < spawn.col && col >= spawn.col - CAVE.depth && Math.abs(row - spawn.row) <= CAVE.halfWidth;

    /** Chebyshev distance from the map rectangle; 0 inside. */
    const ringDistance = (col, row) => Math.max(
      0, -col, col - (columns - 1), -row, row - (rows - 1),
    );

    const existsCache = new Map();
    function exists(col, row) {
      const key = `${col},${row}`;
      if (existsCache.has(key)) return existsCache.get(key);
      let result;
      const distance = ringDistance(col, row);
      if (distance === 0 || inVillage(col, row) || inCave(col, row)) {
        result = true;
      } else if (distance > OUTER_RING || nearestOnApproach(col, row).gap < APPROACH.clearance) {
        // Nothing beyond the ring, and nothing on the approach road's corridor.
        result = false;
      } else {
        // Ragged edge: a tile may only exist if the tile one step towards the map does.
        const towardCol = col < 0 ? col + 1 : col >= columns ? col - 1 : col;
        const towardRow = row < 0 ? row + 1 : row >= rows ? row - 1 : row;
        result = hash1(col * 131 + row * 7 + 1000, 5) < RING_CHANCE[distance - 1]
          && (distance === 1 || exists(towardCol, towardRow));
      }
      existsCache.set(key, result);
      return result;
    }

    const VILLAGE_TIER = Math.min(MAX_TIER + 1, quantise(field(gate.col, gate.row)) + 1);
    const beforeGate = path.points.at(-2);

    const tierCache = new Map();
    /** Whole tier of a tile, or null where there is no ground. */
    function tierAt(col, row) {
      const key = `${col},${row}`;
      if (tierCache.has(key)) return tierCache.get(key);
      let tier = null;
      if (exists(col, row)) {
        if (inVillage(col, row)) tier = VILLAGE_TIER;
        else if (inCave(col, row)) tier = quantise(field(spawn.col, spawn.row));
        else if (col === gate.col && row === gate.row && beforeGate) {
          // The last road tile climbs to the terrace, so the door sill meets the road and
          // invaders can reach the gate; never more than one tier above the tile before it.
          tier = Math.min(VILLAGE_TIER, quantise(field(beforeGate.x, beforeGate.y)) + 1);
        } else tier = quantise(field(col, row));
      }
      tierCache.set(key, tier);
      return tier;
    }

    const tileTop = (col, row) => {
      const tier = tierAt(col, row);
      return tier === null ? VALLEY_FLOOR : tier * TIER_HEIGHT;
    };

    const isPath = (col, row) => pathTiles.has(`${col},${row}`);

    // Road profile: piecewise linear between the tiers of consecutive path tiles.
    const pathTops = path.points.map(({ x, y }) => tileTop(x, y));
    function pathHeight(distance) {
      const d = clamp(distance, 0, path.length);
      let i = 1;
      while (i < path.lengths.length - 1 && path.lengths[i] < d) i++;
      const span = path.lengths[i] - path.lengths[i - 1];
      const t = span > 0 ? (d - path.lengths[i - 1]) / span : 0;
      return pathTops[i - 1] + (pathTops[i] - pathTops[i - 1]) * t;
    }

    const villageTop = VILLAGE_TIER * TIER_HEIGHT;

    /** Height of the approach road `along` tiles from the village gate: level on the terrace lip, then an eased descent. */
    function approachHeight(along) {
      const t = clamp((along - APPROACH.level) / APPROACH.descent, 0, 1);
      const eased = t * t * (3 - 2 * t);
      return villageTop + (VALLEY_FLOOR - villageTop) * eased;
    }

    // Cliff-foot tiles (those with a missing neighbour) are what the hillside is measured from.
    let edgeTiles = null;
    const edges = () => {
      if (!edgeTiles) {
        edgeTiles = [];
        for (let row = -OUTER_RING - 1; row <= rows + OUTER_RING; row++) {
          for (let col = -OUTER_RING - 1; col <= columns + Math.max(OUTER_RING, VILLAGE.depth); col++) {
            if (exists(col, row) && [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dc, dr]) => !exists(col + dc, row + dr))) edgeTiles.push({ col, row });
          }
        }
      }
      return edgeTiles;
    };

    /** Distance from (x, y) to the nearest tile footprint of the hill (0 on or inside it). */
    function distanceToHill(x, y) {
      let best = Infinity;
      for (const { col, row } of edges()) {
        const dx = Math.max(0, Math.abs(x - col) - 0.5);
        const dy = Math.max(0, Math.abs(y - row) - 0.5);
        best = Math.min(best, dx * dx + dy * dy);
      }
      return Math.sqrt(best);
    }

    const smooth = (t) => t * t * (3 - 2 * t);
    /** Low-frequency bumps for the hillside, fading out on the valley floor. */
    const bumps = (x, y) => 0.22 * Math.sin(x * 0.7 + 0.5) * Math.cos(y * 0.6 + 1.1) + 0.12 * Math.sin(x * 1.9 + y * 1.3);

    /**
     * Ground outside the plateau: a hillside sloping from the cliff foot to
     * the valley floor, an embankment carrying the approach road, and a
     * basin for the lake. Always below every tile top (see the tests).
     */
    function hillside(x, y) {
      const slope = 1 - smooth(clamp(distanceToHill(x, y) / MOUND_RADIUS, 0, 1));
      let height = VALLEY_FLOOR + (MOUND_TOP - VALLEY_FLOOR) * slope + bumps(x, y) * slope * (1 - slope) * 2;
      const road = nearestOnApproach(x, y);
      const bed = approachHeight(road.along) - 0.06;
      height = Math.max(height, bed - Math.max(0, road.gap - APPROACH.halfWidth - 0.2) * 0.85);
      const lake = Math.hypot(x - LAKE.x, y - LAKE.y);
      height = Math.min(height, VALLEY_FLOOR - 0.45 + Math.max(0, lake - LAKE.radius) * 0.5);
      return height;
    }

    /** Distance along the road of the point nearest to (x, y), considering only segments touching the tile. */
    function pathDistanceNear(index, x, y) {
      let best = { distance: path.lengths[index], gap: Infinity };
      for (const i of [index, index + 1]) {
        if (i < 1 || i >= path.points.length) continue;
        const a = path.points[i - 1];
        const b = path.points[i];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const length = dx * dx + dy * dy;
        const t = length > 0 ? clamp(((x - a.x) * dx + (y - a.y) * dy) / length, 0, 1) : 0;
        const px = a.x + dx * t;
        const py = a.y + dy * t;
        const gap = Math.hypot(x - px, y - py);
        if (gap < best.gap) best = { distance: path.lengths[i - 1] + Math.sqrt(length) * t, gap };
      }
      return best.distance;
    }

    /** Ground height at any point: road surface on path tiles, tile top elsewhere, the hillside beyond. */
    function heightAt(x, y, tile = null) {
      const col = tile ? tile.col : Math.round(x);
      const row = tile ? tile.row : Math.round(y);
      const index = pathTiles.get(`${col},${row}`);
      if (index !== undefined) return pathHeight(pathDistanceNear(index, x, y));
      if (!exists(col, row)) return hillside(x, y);
      return tileTop(col, row);
    }

    /** Heights of a tile's top at its four corners [x-,y-], [x+,y-], [x-,y+], [x+,y+]. */
    function cornerHeights(col, row) {
      return [[-0.5, -0.5], [0.5, -0.5], [-0.5, 0.5], [0.5, 0.5]].map(([dx, dy]) => heightAt(col + dx, row + dy, { col, row }));
    }

    const bounds = {
      minCol: -OUTER_RING, maxCol: columns - 1 + Math.max(OUTER_RING, VILLAGE.depth),
      minRow: -OUTER_RING, maxRow: rows - 1 + OUTER_RING,
    };

    function* tiles() {
      for (let row = bounds.minRow; row <= bounds.maxRow; row++) {
        for (let col = bounds.minCol; col <= bounds.maxCol; col++) {
          if (exists(col, row)) yield { col, row, tier: tierAt(col, row), top: tileTop(col, row), path: isPath(col, row), inMap: inMap(col, row), village: inVillage(col, row), cave: inCave(col, row) };
        }
      }
    }

    return {
      TIER_HEIGHT, VALLEY_FLOOR, CAP, MOUND_TOP, bounds,
      exists, tierAt, tileTop, isPath, inMap, inVillage, inCave, pathHeight, heightAt, cornerHeights, tiles,
      hillside, distanceToHill,
      approach: { points: approachPoints, length: approachLength, halfWidth: APPROACH.halfWidth, at: approachAt, height: approachHeight, nearest: nearestOnApproach },
      lake: { x: LAKE.x, y: LAKE.y, radius: LAKE.radius, level: VALLEY_FLOOR - 0.12 },
      villageTier: tierAt(gate.col + 1, gate.row),
      caveTier: tierAt(spawn.col - 1, spawn.row),
    };
  }

  Object.assign(Hold, { createTerrain, TERRAIN: { TIER_HEIGHT, VALLEY_FLOOR, CAP, OUTER_RING, MOUND_TOP } });
})();
