(() => {
  'use strict';

  const NEIGHBORS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  const PATH_TILES = new Set(['#', 'E']);

  /**
   * Parses map rows into a grid and traces the enemy path from `S` to `E`.
   * Throws if the path is broken or branches, so a bad map fails loudly.
   */
  function parseMap(rows) {
    const columns = rows[0].length;
    if (rows.some((row) => row.length !== columns)) throw new Error('Map rows must all have the same length');
    const tileAt = (col, row) => rows[row]?.[col];

    let spawn = null;
    rows.forEach((line, row) => {
      const col = line.indexOf('S');
      if (col !== -1) spawn = { col, row };
    });
    if (!spawn) throw new Error('Map has no spawn (S)');

    const points = [spawn];
    const visited = new Set([`${spawn.col},${spawn.row}`]);
    let current = spawn;
    while (tileAt(current.col, current.row) !== 'E') {
      const next = NEIGHBORS
        .map(([dc, dr]) => ({ col: current.col + dc, row: current.row + dr }))
        .filter(({ col, row }) => PATH_TILES.has(tileAt(col, row)) && !visited.has(`${col},${row}`));
      if (next.length !== 1) {
        throw new Error(`Path ${next.length ? 'branches' : 'breaks'} at column ${current.col}, row ${current.row}`);
      }
      [current] = next;
      visited.add(`${current.col},${current.row}`);
      points.push(current);
    }

    return {
      columns,
      rows: rows.length,
      tileAt,
      path: new Path(points),
      spawn,
      gate: current,
    };
  }

  /** A polyline through tile centres, measured in tiles. */
  class Path {
    constructor(points) {
      this.points = points.map(({ col, row }) => ({ x: col, y: row }));
      this.lengths = [0];
      for (let i = 1; i < this.points.length; i++) {
        const a = this.points[i - 1];
        const b = this.points[i];
        this.lengths.push(this.lengths[i - 1] + Math.hypot(b.x - a.x, b.y - a.y));
      }
      this.length = this.lengths.at(-1);
    }

    /** Position and heading (radians, 0 = +y) at `distance` tiles along the path. */
    positionAt(distance, target = { x: 0, y: 0, heading: 0 }) {
      const d = Math.min(Math.max(distance, 0), this.length);
      let i = 1;
      while (i < this.lengths.length - 1 && this.lengths[i] < d) i++;
      const a = this.points[i - 1];
      const b = this.points[i];
      const span = this.lengths[i] - this.lengths[i - 1];
      const t = span > 0 ? (d - this.lengths[i - 1]) / span : 0;
      target.x = a.x + (b.x - a.x) * t;
      target.y = a.y + (b.y - a.y) * t;
      target.heading = Math.atan2(b.x - a.x, b.y - a.y);
      return target;
    }
  }

  /**
   * Routes over a network of named points and straight legs (see
   * VILLAGE_PLAN.paths). A point is `[x, y]` on the ground, or
   * `{ at: [x, y], level }` on a raised level such as a wall walk.
   */
  class PathNetwork {
    constructor({ points, links }) {
      this.points = new Map(Object.entries(points).map(([name, point]) => [name, Array.isArray(point)
        ? { name, x: point[0], y: point[1], level: 'ground' }
        : { name, x: point.at[0], y: point.at[1], level: point.level }]));
      this.links = new Map([...this.points.keys()].map((name) => [name, []]));
      for (const [a, b] of links) {
        if (!this.points.has(a) || !this.points.has(b)) throw new Error(`Path link ${a}–${b} names an unknown point`);
        this.links.get(a).push(b);
        this.links.get(b).push(a);
      }
    }

    point(name) {
      return this.points.get(name);
    }

    /** The point nearest (x, y) on the same level. */
    nearest(x, y, level = 'ground') {
      let best = null;
      let bestDistance = Infinity;
      for (const point of this.points.values()) {
        if (point.level !== level) continue;
        const distance = Math.hypot(point.x - x, point.y - y);
        if (distance < bestDistance) {
          best = point;
          bestDistance = distance;
        }
      }
      return best;
    }

    /** The shortest route from one named point to another: the points in order, both ends included. */
    route(from, to) {
      const distance = new Map([[from, 0]]);
      const previous = new Map();
      const open = new Set([from]);
      while (open.size) {
        let current = null;
        for (const name of open) if (current === null || distance.get(name) < distance.get(current)) current = name;
        open.delete(current);
        if (current === to) break;
        const here = this.points.get(current);
        for (const next of this.links.get(current)) {
          const there = this.points.get(next);
          const through = distance.get(current) + Math.hypot(there.x - here.x, there.y - here.y);
          if (through < (distance.get(next) ?? Infinity)) {
            distance.set(next, through);
            previous.set(next, current);
            open.add(next);
          }
        }
      }
      if (!distance.has(to)) return null;
      const route = [to];
      while (route[0] !== from) route.unshift(previous.get(route[0]));
      return route.map((name) => this.points.get(name));
    }

    /** Length of the shortest route between two named points. */
    distance(from, to) {
      const route = this.route(from, to);
      if (!route) return Infinity;
      let total = 0;
      for (let i = 1; i < route.length; i++) total += Math.hypot(route[i].x - route[i - 1].x, route[i].y - route[i - 1].y);
      return total;
    }
  }

  Object.assign(Hold, { parseMap, Path, PathNetwork });
})();
