/**
 * BFS pathfinding for wall avoidance.
 * 8-directional movement with corner-clip prevention.
 */

export interface GridPos { x: number; y: number }

const DIRS = [
  { x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 },
  { x: 1, y: 1 }, { x: -1, y: 1 }, { x: 1, y: -1 }, { x: -1, y: -1 },
] as const;

/**
 * BFS from `from` toward any tile in `goalTiles`.
 * Returns the list of tile waypoints to follow (excluding start), or null if blocked.
 */
export function bfsPath(
  from:      GridPos,
  goalTiles: Set<string>,
  blocked:   Set<string>,   // "x,y" of impassable tiles
  gridSize:  number,
): GridPos[] | null {
  const key  = (x: number, y: number) => `${x},${y}`;
  const fk   = key(from.x, from.y);

  if (goalTiles.has(fk)) return []; // already at goal

  const prev = new Map<string, string | null>();
  prev.set(fk, null);
  const queue: GridPos[] = [{ ...from }];

  while (queue.length) {
    const cur = queue.shift()!;

    for (const dir of DIRS) {
      const nx = cur.x + dir.x;
      const ny = cur.y + dir.y;
      if (nx < 0 || ny < 0 || nx >= gridSize || ny >= gridSize) continue;
      const nk = key(nx, ny);
      if (prev.has(nk) || blocked.has(nk)) continue;

      // Diagonal corner-clip prevention
      if (dir.x !== 0 && dir.y !== 0) {
        if (blocked.has(key(cur.x + dir.x, cur.y)) &&
            blocked.has(key(cur.x, cur.y + dir.y))) continue;
      }

      prev.set(nk, key(cur.x, cur.y));

      if (goalTiles.has(nk)) {
        // Reconstruct
        const path: GridPos[] = [];
        let k: string | null = nk;
        while (k !== null && k !== fk) {
          const [px, py] = k.split(",").map(Number);
          path.unshift({ x: px, y: py });
          k = prev.get(k) ?? null;
        }
        return path;
      }
      queue.push({ x: nx, y: ny });
    }
  }
  return null;
}

/**
 * Returns a Set of "x,y" tiles adjacent to (and not inside) a square footprint.
 * cx/cy are the CENTER of the footprint (may be fractional).
 */
export function adjacentTilesForFootprint(
  cx: number, cy: number, size: number, gridSize: number,
): Set<string> {
  const tiles = new Set<string>();
  const x0 = Math.round(cx - size / 2); // top-left tile
  const y0 = Math.round(cy - size / 2);
  for (let ix = x0 - 1; ix <= x0 + size; ix++) {
    for (let iy = y0 - 1; iy <= y0 + size; iy++) {
      // Skip tiles inside the footprint
      if (ix >= x0 && ix < x0 + size && iy >= y0 && iy < y0 + size) continue;
      if (ix >= 0 && iy >= 0 && ix < gridSize && iy < gridSize) {
        tiles.add(`${ix},${iy}`);
      }
    }
  }
  return tiles;
}
