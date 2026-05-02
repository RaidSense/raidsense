/**
 * Weighted Dijkstra pathfinding for wall avoidance.
 *
 * Costs:
 *   straight move   = 1.0
 *   diagonal move   = 1.4  (≈ √2, more realistic than BFS uniform cost)
 *
 * Corner-clip prevention: a diagonal step is blocked if BOTH orthogonal
 * neighbours of the diagonal are themselves blocked.
 */

export interface GridPos  { x: number; y: number }
export interface PathResult { path: GridPos[]; cost: number }

const DIRS = [
  { x:  1, y:  0, c: 1.0 },
  { x: -1, y:  0, c: 1.0 },
  { x:  0, y:  1, c: 1.0 },
  { x:  0, y: -1, c: 1.0 },
  { x:  1, y:  1, c: 1.4 },
  { x: -1, y:  1, c: 1.4 },
  { x:  1, y: -1, c: 1.4 },
  { x: -1, y: -1, c: 1.4 },
] as const;

// ── Min-heap helpers ────────────────────────────────────────────────────────

interface HeapEntry { k: string; x: number; y: number; c: number }

function heapPush(h: HeapEntry[], e: HeapEntry): void {
  h.push(e);
  let i = h.length - 1;
  while (i > 0) {
    const p = (i - 1) >> 1;
    if (h[p].c <= h[i].c) break;
    [h[p], h[i]] = [h[i], h[p]];
    i = p;
  }
}

function heapPop(h: HeapEntry[]): HeapEntry {
  const top = h[0];
  const last = h.pop()!;
  if (h.length) {
    h[0] = last;
    let i = 0;
    for (;;) {
      let s = i;
      const l = 2*i+1, r = 2*i+2;
      if (l < h.length && h[l].c < h[s].c) s = l;
      if (r < h.length && h[r].c < h[s].c) s = r;
      if (s === i) break;
      [h[i], h[s]] = [h[s], h[i]];
      i = s;
    }
  }
  return top;
}

// ── Main pathfinding function ───────────────────────────────────────────────

/**
 * Dijkstra from `from` to the nearest tile in `goalTiles`.
 * Returns the path (excluding start) and total cost, or null if blocked.
 */
export function dijkstraPath(
  from:      GridPos,
  goalTiles: Set<string>,
  blocked:   Set<string>,
  gridSize:  number,
): PathResult | null {
  const key = (x: number, y: number) => `${x},${y}`;
  const fk  = key(from.x, from.y);

  if (goalTiles.has(fk)) return { path: [], cost: 0 };

  const dist = new Map<string, number>([[fk, 0]]);
  const prev = new Map<string, string | null>([[fk, null]]);
  const heap: HeapEntry[] = [];
  heapPush(heap, { k: fk, x: from.x, y: from.y, c: 0 });

  while (heap.length) {
    const cur = heapPop(heap);
    if ((dist.get(cur.k) ?? Infinity) < cur.c) continue; // stale entry

    if (goalTiles.has(cur.k)) {
      // Reconstruct path
      const path: GridPos[] = [];
      let k: string | null = cur.k;
      while (k !== null && k !== fk) {
        const [px, py] = k.split(",").map(Number);
        path.unshift({ x: px, y: py });
        k = prev.get(k) ?? null;
      }
      return { path, cost: cur.c };
    }

    for (const dir of DIRS) {
      const nx = cur.x + dir.x, ny = cur.y + dir.y;
      if (nx < 0 || ny < 0 || nx >= gridSize || ny >= gridSize) continue;
      const nk = key(nx, ny);
      if (blocked.has(nk)) continue;

      // Diagonal corner-clip prevention
      if (dir.x !== 0 && dir.y !== 0) {
        if (blocked.has(key(cur.x + dir.x, cur.y)) &&
            blocked.has(key(cur.x, cur.y + dir.y))) continue;
      }

      const newCost = cur.c + dir.c;
      if ((dist.get(nk) ?? Infinity) <= newCost) continue;

      dist.set(nk, newCost);
      prev.set(nk, cur.k);
      heapPush(heap, { k: nk, x: nx, y: ny, c: newCost });
    }
  }
  return null;
}

// ── Footprint helpers ───────────────────────────────────────────────────────

/**
 * Returns the set of tiles immediately adjacent to (and NOT inside)
 * a square footprint centered at (cx, cy) with given size.
 */
export function adjacentTilesForFootprint(
  cx: number, cy: number, size: number, gridSize: number,
): Set<string> {
  const tiles = new Set<string>();
  const x0 = Math.round(cx - size / 2);
  const y0 = Math.round(cy - size / 2);
  for (let ix = x0 - 1; ix <= x0 + size; ix++) {
    for (let iy = y0 - 1; iy <= y0 + size; iy++) {
      if (ix >= x0 && ix < x0 + size && iy >= y0 && iy < y0 + size) continue;
      if (ix >= 0 && iy >= 0 && ix < gridSize && iy < gridSize) {
        tiles.add(`${ix},${iy}`);
      }
    }
  }
  return tiles;
}
