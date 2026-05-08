/**
 * Base presets + wall-building helpers for RaidSense.
 * All coordinates are top-left of the footprint on the 44×44 grid.
 */
import { type WallPlacement } from "./walls";
import { validateDefensesForTH } from "./townhall-limits";
import {
  buildOccupation, isFree, inBounds, entitySize, occupyTiles,
  type OccupationMap,
} from "./grid-occupation";

// ── PlacedDefense / PlacedBuilding shapes (mirrors SimulatorPanel's interfaces) ──
export interface PresetDefense {
  instanceId: string;
  defenseId:  string;
  level:      number;
  x:          number;
  y:          number;
  mode?:      string;
}
export interface PresetBuilding {
  instanceId: string;
  buildingId: string;
  level:      number;
  x:          number;
  y:          number;
}
export interface BasePreset {
  id:          string;
  name:        string;
  description: string;
  defenses:    PresetDefense[];
  buildings:   PresetBuilding[];
  walls:       WallPlacement[];
}

// Defense sizes (footprint side length)
const DEF_SIZE: Record<string, number> = {
  "cannon": 3, "archer-tower": 2, "mortar": 3, "air-defense": 3,
  "wizard-tower": 3, "x-bow": 3, "inferno-tower": 2,
  "eagle-artillery": 4, "scattershot": 3,
  "hidden-tesla": 2, "bomb-tower": 3, "air-sweeper": 2, "monolith": 3, "builder-hut": 3, "bomb": 1, "spring-trap": 1, "giant-bomb": 2, "air-bomb": 1, "tornado-trap": 1,
};

// Building sizes (footprint side length)
const BLDG_SIZE: Record<string, number> = {
  "army-camp": 4, "hero-hall": 4, "town-hall": 4,
  "barracks": 3, "dark-barracks": 3, "clan-castle": 3,
  "gold-mine": 3, "elixir-collector": 3, "dark-elixir-drill": 3,
  "gold-storage": 3, "elixir-storage": 3, "dark-elixir-storage": 3,
  "laboratory": 3, "spell-factory": 3, "dark-spell-factory": 3,
  "builder-hut": 3, "workshop": 3, "blacksmith": 3, "pet-house": 3,
};

// ── Footprint helpers ──────────────────────────────────────────────────────────

/** Tile key → instanceId of the occupant. */
type OccupiedMap = Map<string, string>;

/** All tile keys covered by a size×size footprint at (x, y). */
export function getFootprintTiles(x: number, y: number, size: number): string[] {
  const tiles: string[] = [];
  for (let dy = 0; dy < size; dy++)
    for (let dx = 0; dx < size; dx++)
      tiles.push(`${x + dx},${y + dy}`);
  return tiles;
}

/** True if every tile of the footprint is free in `occupied`. */
export function canPlaceFootprint(occupied: OccupiedMap, x: number, y: number, size: number): boolean {
  return getFootprintTiles(x, y, size).every(k => !occupied.has(k));
}

/** Mark all tiles of the footprint as owned by `id`. */
export function occupyFootprint(occupied: OccupiedMap, id: string, x: number, y: number, size: number): void {
  for (const k of getFootprintTiles(x, y, size))
    occupied.set(k, id);
}

/** True if (x, y) is not already occupied by a building footprint. */
export function canPlaceWall(occupied: OccupiedMap, x: number, y: number): boolean {
  return !occupied.has(`${x},${y}`);
}

// ── Wall helpers ───────────────────────────────────────────────────────────────

/** Horizontal or vertical line of walls. */
export function createWallLine(
  x1: number, y1: number,
  x2: number, y2: number,
  level: number,
  prefix: string,
): WallPlacement[] {
  const walls: WallPlacement[] = [];
  if (y1 === y2) {
    const [a, b] = x1 <= x2 ? [x1, x2] : [x2, x1];
    for (let x = a; x <= b; x++) walls.push({ instanceId: `${prefix}-${x}-${y1}`, x, y: y1, level });
  } else if (x1 === x2) {
    const [a, b] = y1 <= y2 ? [y1, y2] : [y2, y1];
    for (let y = a; y <= b; y++) walls.push({ instanceId: `${prefix}-${x1}-${y}`, x: x1, y, level });
  }
  return walls;
}

/** Rectangle of walls (perimeter only, interior empty). */
export function createWallRect(
  x: number, y: number,
  w: number, h: number,
  level: number,
  prefix: string,
): WallPlacement[] {
  const walls: WallPlacement[] = [];
  for (let ix = x; ix < x + w; ix++) {
    walls.push({ instanceId: `${prefix}-${ix}-${y}`,     x: ix, y,       level });
    walls.push({ instanceId: `${prefix}-${ix}-${y+h-1}`, x: ix, y: y+h-1, level });
  }
  for (let iy = y + 1; iy < y + h - 1; iy++) {
    walls.push({ instanceId: `${prefix}-${x}-${iy}`,     x,     y: iy, level });
    walls.push({ instanceId: `${prefix}-${x+w-1}-${iy}`, x: x+w-1, y: iy, level });
  }
  return walls;
}

/** Remove duplicate wall tiles (same x,y). */
export function dedupeWalls(walls: WallPlacement[]): WallPlacement[] {
  const seen = new Set<string>();
  return walls.filter((w) => {
    const k = `${w.x},${w.y}`;
    if (seen.has(k)) return false;
    seen.add(k); return true;
  });
}

/** Check all overlap types. Returns true if valid. Logs warnings but never auto-corrects. */
export function validatePreset(preset: BasePreset): boolean {
  let ok = true;
  const occupied: OccupiedMap = new Map();

  // ── 1. Defenses ────────────────────────────────────────────────────────────
  for (const d of preset.defenses) {
    const sz = DEF_SIZE[d.defenseId] ?? 1;
    if (!canPlaceFootprint(occupied, d.x, d.y, sz)) {
      const blocker = getFootprintTiles(d.x, d.y, sz).map(k => occupied.get(k)).find(Boolean) ?? "?";
      console.warn(`[${preset.id}] Defense/? overlap: ${d.defenseId}(${d.instanceId})@(${d.x},${d.y}) size=${sz} collides with ${blocker}`);
      ok = false;
    }
    occupyFootprint(occupied, `def:${d.instanceId}`, d.x, d.y, sz);
  }

  // ── 2. Buildings (includes defense/building collisions via shared map) ─────
  for (const b of preset.buildings) {
    const sz = BLDG_SIZE[b.buildingId] ?? 3;
    if (!canPlaceFootprint(occupied, b.x, b.y, sz)) {
      const blocker = getFootprintTiles(b.x, b.y, sz).map(k => occupied.get(k)).find(Boolean) ?? "?";
      console.warn(`[${preset.id}] Building/? overlap: ${b.buildingId}(${b.instanceId})@(${b.x},${b.y}) size=${sz} collides with ${blocker}`);
      ok = false;
    }
    occupyFootprint(occupied, `bld:${b.instanceId}`, b.x, b.y, sz);
  }

  // ── 3. Walls — duplicate check + overlap with any footprint ───────────────
  const wallSeen = new Set<string>();
  for (const w of preset.walls) {
    const k = `${w.x},${w.y}`;
    if (wallSeen.has(k)) {
      console.warn(`[${preset.id}] Duplicate wall at (${w.x},${w.y})`);
      ok = false;
      continue;
    }
    wallSeen.add(k);
    if (!canPlaceWall(occupied, w.x, w.y)) {
      const blocker = occupied.get(k) ?? "?";
      console.warn(`[${preset.id}] Wall (${w.x},${w.y}) overlaps ${blocker}`);
      ok = false;
    }
  }

  return ok;
}

// ── Strict validation — returns structured errors ─────────────────────────────

export type PresetErrorType =
  | "out-of-bounds"
  | "overlap"
  | "duplicate-wall"
  | "wall-on-entity";

export interface PresetError {
  type: PresetErrorType;
  message: string;
}

/**
 * Full validation returning a structured list of errors.
 * Uses grid-occupation for authoritative size lookups.
 * Returns [] when the preset is valid.
 */
export function validatePresetStrict(preset: BasePreset): PresetError[] {
  const errors: PresetError[] = [];
  const G = 44;

  // ── 1. Out-of-bounds ──────────────────────────────────────────────────────
  for (const d of preset.defenses) {
    const sz = entitySize(d.defenseId);
    if (!inBounds(d.x, d.y, sz))
      errors.push({ type: "out-of-bounds",
        message: `Défense hors grille: ${d.defenseId}(${d.instanceId})@(${d.x},${d.y}) size=${sz}` });
  }
  for (const b of preset.buildings) {
    const sz = entitySize(b.buildingId);
    if (!inBounds(b.x, b.y, sz))
      errors.push({ type: "out-of-bounds",
        message: `Bâtiment hors grille: ${b.buildingId}(${b.instanceId})@(${b.x},${b.y}) size=${sz}` });
  }
  for (const w of preset.walls) {
    if (w.x < 0 || w.y < 0 || w.x >= G || w.y >= G)
      errors.push({ type: "out-of-bounds", message: `Mur hors grille: (${w.x},${w.y})` });
  }

  // ── 2. Overlaps (incremental occupation) ─────────────────────────────────
  const occ: OccupationMap = new Map();

  for (const d of preset.defenses) {
    const sz = entitySize(d.defenseId);
    if (!isFree(occ, d.x, d.y, sz)) {
      let blocker = "?";
      outer: for (let dy = 0; dy < sz; dy++)
        for (let dx = 0; dx < sz; dx++) {
          const t = occ.get(`${d.x + dx},${d.y + dy}`);
          if (t) { blocker = t.entityId; break outer; }
        }
      errors.push({ type: "overlap",
        message: `Overlap défense: ${d.defenseId}(${d.instanceId})@(${d.x},${d.y}) ↔ ${blocker}` });
    }
    occupyTiles(occ, d.instanceId, "defense", d.x, d.y, sz);
  }

  for (const b of preset.buildings) {
    const sz = entitySize(b.buildingId);
    if (!isFree(occ, b.x, b.y, sz)) {
      let blocker = "?";
      outer: for (let dy = 0; dy < sz; dy++)
        for (let dx = 0; dx < sz; dx++) {
          const t = occ.get(`${b.x + dx},${b.y + dy}`);
          if (t) { blocker = t.entityId; break outer; }
        }
      errors.push({ type: "overlap",
        message: `Overlap bâtiment: ${b.buildingId}(${b.instanceId})@(${b.x},${b.y}) ↔ ${blocker}` });
    }
    occupyTiles(occ, b.instanceId, "building", b.x, b.y, sz);
  }

  // ── 3. Walls ─────────────────────────────────────────────────────────────
  const wallSeen = new Set<string>();
  for (const w of preset.walls) {
    const k = `${w.x},${w.y}`;
    if (wallSeen.has(k)) {
      errors.push({ type: "duplicate-wall", message: `Mur dupliqué: (${w.x},${w.y})` });
      continue;
    }
    wallSeen.add(k);
    const existing = occ.get(k);
    if (existing)
      errors.push({ type: "wall-on-entity",
        message: `Mur sur entité: (${w.x},${w.y}) ↔ ${existing.entityId} [${existing.kind}]` });
  }

  // ── 4. TH15 limit check (warn only — presets have no TH selector) ─────────
  for (const v of validateDefensesForTH(preset.defenses, 15)) {
    errors.push({ type: "overlap",
      message: `Limite HDV15 dépassée: ${v.defenseId} — ${v.placed} placés, max=${v.limit}` });
  }

  return errors;
}

// ── Short helpers for preset instances ────────────────────────────────────────
let _uid = 0;
const uid = (p: string) => `${p}-${++_uid}`;

// ── 10 Base Presets ────────────────────────────────────────────────────────────

/** Preset 1 — Base Test Simple */
const p1: BasePreset = {
  id: "test-simple", name: "1. Base Test Simple",
  description: "Un canon au centre entouré d'un anneau de murs. Validation moteur.",
  defenses: [
    { instanceId: uid("p1"), defenseId: "cannon", level: 8, x: 20, y: 19 },
  ],
  buildings: [],
  walls: dedupeWalls([
    ...createWallRect(19, 18, 6, 6, 8, "p1"),
  ]),
};

/** Preset 2 — Base Anti-Giant */
const p2: BasePreset = {
  id: "anti-giant", name: "2. Base Anti-Giant",
  description: "Trois défenses terrestres derrière une double barrière de murs.",
  defenses: [
    { instanceId: uid("p2"), defenseId: "cannon", level: 10, x: 15, y: 18 },
    { instanceId: uid("p2"), defenseId: "cannon", level: 10, x: 25, y: 18 },
    { instanceId: uid("p2"), defenseId: "mortar", level: 8,  x: 20, y: 19 },
  ],
  buildings: [],
  walls: dedupeWalls([
    ...createWallLine(13, 17, 30, 17, 9, "p2t"),   // barrière haut
    ...createWallLine(13, 22, 30, 22, 9, "p2b"),   // barrière bas
    ...createWallLine(13, 17, 13, 22, 9, "p2l"),   // côté gauche
    ...createWallLine(30, 17, 30, 22, 9, "p2r"),   // côté droit
  ]),
};

/** Preset 3 — Base Anti-Air Simple */
const p3: BasePreset = {
  id: "anti-air-simple", name: "3. Base Anti-Air Simple",
  description: "Deux Air Defenses protégées, Wizard Tower centrale.",
  defenses: [
    { instanceId: uid("p3"), defenseId: "air-defense",  level: 8, x: 13, y: 19 },
    { instanceId: uid("p3"), defenseId: "air-defense",  level: 8, x: 27, y: 19 },
    { instanceId: uid("p3"), defenseId: "wizard-tower", level: 7, x: 20, y: 19 },
    { instanceId: uid("p3"), defenseId: "archer-tower", level: 8, x: 20, y: 14 },
  ],
  buildings: [],
  walls: dedupeWalls([
    ...createWallRect(12, 18, 5, 5, 8, "p3a"),  // autour AD gauche
    ...createWallRect(26, 18, 5, 5, 8, "p3b"),  // autour AD droite
    ...createWallRect(19, 18, 5, 5, 8, "p3c"),  // autour Wizard Tower
  ]),
};

/** Preset 4 — Base Compartiments Croisés */
const p4: BasePreset = {
  id: "compartiments", name: "4. Base Compartiments Croisés",
  description: "3 compartiments indépendants pour tester le pathing BFS.",
  defenses: [
    { instanceId: uid("p4"), defenseId: "cannon",       level: 8, x: 13, y: 13 },
    { instanceId: uid("p4"), defenseId: "cannon",       level: 8, x: 25, y: 13 },
    { instanceId: uid("p4"), defenseId: "archer-tower", level: 8, x: 20, y: 25 },
  ],
  buildings: [],
  walls: dedupeWalls([
    ...createWallRect(12, 12, 5, 5, 8, "p4a"),
    ...createWallRect(24, 12, 5, 5, 8, "p4b"),
    ...createWallRect(19, 24, 4, 4, 8, "p4c"),
  ]),
};

/** Preset 5 — Base Core Central */
const p5: BasePreset = {
  id: "core-central", name: "5. Base Core Central",
  description: "Inferno Tower au cœur, Cannons aux quatre coins.",
  defenses: [
    { instanceId: uid("p5"), defenseId: "inferno-tower", level: 5, x: 19, y: 19, mode: "single" },
    { instanceId: uid("p5"), defenseId: "cannon",        level: 8, x: 11, y: 13 },
    { instanceId: uid("p5"), defenseId: "cannon",        level: 8, x: 29, y: 13 },
    { instanceId: uid("p5"), defenseId: "cannon",        level: 8, x: 11, y: 26 },
    { instanceId: uid("p5"), defenseId: "cannon",        level: 8, x: 29, y: 26 },
    { instanceId: uid("p5"), defenseId: "mortar",        level: 8, x: 19, y: 11 },
  ],
  buildings: [],
  walls: dedupeWalls([
    ...createWallRect(17, 17, 8, 8, 10, "p5c"),   // ring autour du core
    ...createWallLine(9, 11, 9, 30, 9, "p5l"),    // mur ouest
    ...createWallLine(34, 11, 34, 30, 9, "p5r"),  // mur est
  ]),
};

/** Preset 6 — Base Anti-E-Drag */
const p6: BasePreset = {
  id: "anti-edrag", name: "6. Base Anti-E-Drag",
  description: "Bâtiments espacés pour casser la chaîne (>1 tile bord-à-bord).",
  defenses: [
    { instanceId: uid("p6"), defenseId: "air-defense", level: 8, x: 8,  y: 8  },
    { instanceId: uid("p6"), defenseId: "air-defense", level: 8, x: 32, y: 8  },
    { instanceId: uid("p6"), defenseId: "air-defense", level: 8, x: 8,  y: 32 },
    { instanceId: uid("p6"), defenseId: "cannon",      level: 8, x: 20, y: 19 },
    { instanceId: uid("p6"), defenseId: "archer-tower",level: 8, x: 32, y: 32 },
  ],
  buildings: [],
  walls: dedupeWalls([
    ...createWallRect(7,  7,  5, 5, 8, "p6a"),
    ...createWallRect(31, 7,  5, 5, 8, "p6b"),
    ...createWallRect(7,  31, 5, 5, 8, "p6c"),
    ...createWallRect(19, 18, 5, 5, 8, "p6d"),
  ]),
};

/** Preset 7 — Base Anti-Scatter */
const p7: BasePreset = {
  id: "anti-scatter", name: "7. Base Anti-Scatter",
  description: "Scattershot protégé, troupes forcées dans la zone dangereuse.",
  defenses: [
    { instanceId: uid("p7"), defenseId: "scattershot", level: 3, x: 19, y: 18 },
    { instanceId: uid("p7"), defenseId: "cannon",      level: 8, x: 11, y: 19 },
    { instanceId: uid("p7"), defenseId: "cannon",      level: 8, x: 30, y: 19 },
  ],
  buildings: [],
  walls: dedupeWalls([
    ...createWallRect(17, 16, 8, 8, 10, "p7c"),   // ring autour Scattershot (19-22,18-21)
    ...createWallLine(9, 16, 9, 26, 9, "p7l"),    // mur gauche
    ...createWallLine(34, 16, 34, 26, 9, "p7r"),  // mur droit
    ...createWallLine(9, 16, 16, 16, 9, "p7tl"),  // jonction haut-gauche
    ...createWallLine(25, 16, 34, 16, 9, "p7tr"), // jonction haut-droite
    ...createWallLine(9, 26, 16, 26, 9, "p7bl"),  // jonction bas-gauche
    ...createWallLine(25, 26, 34, 26, 9, "p7br"), // jonction bas-droite
  ]),
};

/** Preset 8 — Base Funnel Trap */
const p8: BasePreset = {
  id: "funnel", name: "8. Base Funnel Trap",
  description: "Murs en entonnoir guidant les troupes vers la zone de feu.",
  defenses: [
    { instanceId: uid("p8"), defenseId: "wizard-tower", level: 8, x: 20, y: 13 },
    { instanceId: uid("p8"), defenseId: "mortar",       level: 8, x: 20, y: 25 },
    { instanceId: uid("p8"), defenseId: "cannon",       level: 8, x: 14, y: 19 },
    { instanceId: uid("p8"), defenseId: "cannon",       level: 8, x: 29, y: 19 },
  ],
  buildings: [],
  walls: dedupeWalls([
    // Entonnoir : largeur 20 en haut, rétrécie à 10 en bas
    ...createWallLine(9,  11, 9,  20, 9, "p8ll"),
    ...createWallLine(34, 11, 34, 20, 9, "p8rl"),
    ...createWallLine(12, 20, 12, 28, 9, "p8lr"),
    ...createWallLine(31, 20, 31, 28, 9, "p8rr"),
    ...createWallLine(9,  11, 34, 11, 9, "p8t"),  // plafond de l'entonnoir
    ...createWallLine(9,  28, 11, 28, 9, "p8bl"),
    ...createWallLine(32, 28, 34, 28, 9, "p8br"),
  ]),
};

/** Preset 9 — Base Défense Mixte */
const p9: BasePreset = {
  id: "mixte", name: "9. Base Défense Mixte",
  description: "Sol + air, compartiments multiples, test général.",
  defenses: [
    { instanceId: uid("p9"), defenseId: "cannon",      level: 10, x: 11, y: 13 },
    { instanceId: uid("p9"), defenseId: "cannon",      level: 10, x: 29, y: 13 },
    { instanceId: uid("p9"), defenseId: "air-defense", level: 8,  x: 11, y: 27 },
    { instanceId: uid("p9"), defenseId: "air-defense", level: 8,  x: 29, y: 27 },
    { instanceId: uid("p9"), defenseId: "wizard-tower",level: 8,  x: 20, y: 19 },
    { instanceId: uid("p9"), defenseId: "mortar",      level: 8,  x: 20, y: 12 },
    { instanceId: uid("p9"), defenseId: "archer-tower",level: 8,  x: 21, y: 27 },
  ],
  buildings: [],
  walls: dedupeWalls([
    ...createWallRect(9,  11, 7, 7, 9, "p9a"),  // compartiment cannon gauche
    ...createWallRect(27, 11, 7, 7, 9, "p9b"),  // compartiment cannon droit
    ...createWallRect(9,  25, 7, 7, 9, "p9c"),  // compartiment AD gauche
    ...createWallRect(27, 25, 7, 7, 9, "p9d"),  // compartiment AD droit
    ...createWallRect(18, 17, 7, 7, 9, "p9e"),  // core wizard
  ]),
};

/** Preset 10 — Base HDV15 Prototype */
const p10: BasePreset = {
  id: "hdv15", name: "10. Base HDV15 Prototype",
  description: "Eagle + Scattershot + Inferno, compartiments, layout symétrique.",
  defenses: [
    { instanceId: uid("p10"), defenseId: "eagle-artillery", level: 4, x: 19, y: 18 },
    { instanceId: uid("p10"), defenseId: "scattershot",     level: 3, x: 30, y: 13 },
    { instanceId: uid("p10"), defenseId: "inferno-tower",   level: 6, x: 10, y: 13, mode: "single" },
    { instanceId: uid("p10"), defenseId: "air-defense",     level: 10, x: 12, y: 27 },
    { instanceId: uid("p10"), defenseId: "air-defense",     level: 10, x: 29, y: 27 },
    { instanceId: uid("p10"), defenseId: "cannon",          level: 12, x: 8,  y: 20 },
    { instanceId: uid("p10"), defenseId: "cannon",          level: 12, x: 35, y: 20 },
    { instanceId: uid("p10"), defenseId: "wizard-tower",    level: 8,  x: 20, y: 10 },
    { instanceId: uid("p10"), defenseId: "mortar",          level: 8,  x: 20, y: 30 },
  ],
  buildings: [],
  walls: dedupeWalls([
    ...createWallRect(17, 16, 8, 8, 12, "p10c"),  // core Eagle (19-22,18-21) inside
    ...createWallRect(28, 11, 6, 6, 10, "p10s"),  // ring Scattershot
    ...createWallRect(8,  11, 6, 6, 10, "p10i"),  // ring Inferno
    ...createWallLine(7,  17, 7,  30, 10, "p10l"),  // mur ouest
    ...createWallLine(36, 17, 36, 30, 10, "p10r"),  // mur est
    ...createWallLine(7,  17, 16, 17, 10, "p10tl"), // jonction top-gauche
    ...createWallLine(25, 17, 36, 17, 10, "p10tr"), // jonction top-droite
    ...createWallLine(7,  30, 16, 30, 10, "p10bl"), // jonction bot-gauche
    ...createWallLine(25, 30, 36, 30, 10, "p10br"), // jonction bot-droite
  ]),
};

// ─────────────────────────────────────────────────────────────────────────────
// ═══════════════  BASES STRATÉGIQUES (construites par un base-builder) ════════
// ─────────────────────────────────────────────────────────────────────────────
//
//  Méthode :
//  1. Core défini (Eagle / Inferno / Scatter)
//  2. Ring(s) de murs autour du core
//  3. Défenses mid-layer entre rings
//  4. Compartiments / funnel extérieurs
//  5. Bâtiments neutres = ralentisseurs + faux objectifs
//  6. Ouverture(s) piège(s)
//
// ─────────────────────────────────────────────────────────────────────────────

// ── Base A : "Blindspot Core" ─────────────────────────────────────────────────
//
//  INTENTION :
//    L'Eagle Artillery est enfouie derrière 2 rings de murs asymétriques.
//    Il n'existe pas de ligne droite vers le core.
//    L'entrée "facile" (gap sud) mène en réalité sous le feu croisé de
//    l'Inferno Tower et de la Scattershot avant même d'atteindre le premier ring.
//
//  FLOW D'ATTAQUE :
//    Troupes déployées en bas → voient des Gold Mines et Army Camp au sud →
//    s'approchent par le gap sud → traversent la zone de Scattershot (mid-layer) →
//    doivent briser le ring intérieur → Eagle Artillery et Inferno Tower achèvent.
//
//  PIÈGE PRINCIPAL :
//    Le gap à x=19-22 (bas) semble mener droit au core.
//    En réalité, une Scattershot est positionnée à y=24 côté gauche.
//    Les troupes regroupées pour franchir le mur sont ravagées par le splash.

const pA: BasePreset = (() => {
  const D = (id: string, defenseId: string, level: number, x: number, y: number, mode?: string): PresetDefense =>
    ({ instanceId: `A-d-${id}`, defenseId, level, x, y, ...(mode ? { mode } : {}) });
  const B = (id: string, buildingId: string, level: number, x: number, y: number): PresetBuilding =>
    ({ instanceId: `A-b-${id}`, buildingId, level, x, y });

  const walls = dedupeWalls([
    // Ring intérieur (1 case de clearance autour de l'Eagle 4×4 à (19,17))
    // Eagle : x=19-22, y=17-20  →  ring : createWallRect(17,15,8,8)
    ...createWallRect(17, 15, 8, 8, 12, "A-ri"),

    // Ring extérieur — ouverture piège au bas centre (gap x=19-22)
    ...createWallLine(11, 10, 31, 10, 10, "A-rt"),   // top
    ...createWallLine(11, 10, 11, 30, 10, "A-rl"),   // left
    ...createWallLine(31, 10, 31, 30, 10, "A-rr"),   // right
    ...createWallLine(11, 30, 17, 30, 10, "A-rbl"),  // bottom-left  (gap x=18-22)
    ...createWallLine(23, 30, 31, 30, 10, "A-rbr"),  // bottom-right (gap x=18-22)

    // Chicane interne gauche : détournement après entrée du gap
    ...createWallLine(14, 26, 14, 23, 10, "A-cl"),
    ...createWallLine(14, 23, 17, 23, 10, "A-cl2"),
  ]);

  return {
    id: "blindspot-core", name: "A. Blindspot Core",
    description: "Eagle enterrée derrière 2 rings. L'entrée facile en bas cache une Scattershot. Toute troupe groupée y est anéantie.",
    defenses: [
      D("e",  "eagle-artillery", 4, 19, 17),         // CORE — Eagle 4×4 (19-22,17-20)
      D("it", "inferno-tower",   6, 25, 17, "single"),// mid-right — Inferno (25-27,17-19)
      D("ad1","air-defense",     9, 13, 17),          // mid-left  — AD (13-15,17-19)
      D("ad2","air-defense",     9, 19, 11),          // mid-top   — AD (19-21,11-13)
      D("sc", "scattershot",     3, 12, 24),          // mid-left  — Scatter (12-15,24-27)
      D("wt", "wizard-tower",    8, 25, 24),          // mid-right — Wizard (25-27,24-26)
      D("mo", "mortar",          8, 25, 11),          // mid-top-r — Mortar (25-27,11-13)
      D("ca", "cannon",          12,13, 11),          // mid-top-l — Cannon (13-15,11-13)
      D("at1","archer-tower",    10, 7, 18),          // périphérie gauche
      D("ca2","cannon",          10,34, 18),          // périphérie droite
    ],
    buildings: [
      B("ac", "army-camp",          4,  7,  7),   // coin NW — appât
      B("gm1","gold-mine",          6, 33,  7),   // coin NE
      B("gm2","gold-mine",          6,  7, 31),   // coin SW
      B("ec", "elixir-collector",   6, 33, 31),   // coin SE
      B("ba", "barracks",           5,  7, 13),   // bord W nord
      B("db", "dark-barracks",      4, 34, 13),   // bord E nord
      B("cl", "clan-castle",        5,  7, 25),   // bord W sud
      B("gs", "gold-storage",       7, 34, 25),   // bord E sud
      B("bh", "builder-hut",        1, 28, 11),   // mid-layer coin haut-droit
      B("la", "laboratory",         6, 28, 26),   // mid-layer coin bas-droit
    ],
    walls,
  };
})();

// ── Base B : "The Corral" ──────────────────────────────────────────────────────
//
//  INTENTION :
//    Funnel en forme de U ouvert au bas. Les bâtiments-appâts (Gold Mines,
//    Army Camp) au sud attirent les troupes dans le couloir. La Scattershot
//    et le Wizard Tower les attendent en haut du funnel.
//
//  FLOW D'ATTAQUE :
//    Troupes déployées en bas → visent les ressources (Gold Mine, Army Camp) →
//    avancent dans le couloir → murs latéraux les compriment → Scatter + Wizard
//    dévastent l'amas dans le funnel → Eagle/Inferno finissent le reste en hauteur.
//
//  PIÈGE PRINCIPAL :
//    Le bas est totalement ouvert mais le couloir rétrécit à x=17-25.
//    Les troupes qui entrent groupées se retrouvent dans le rayon splash
//    de la Scattershot à 50% de la course.

const pB: BasePreset = (() => {
  const D = (id: string, defenseId: string, level: number, x: number, y: number, mode?: string): PresetDefense =>
    ({ instanceId: `B-d-${id}`, defenseId, level, x, y, ...(mode ? { mode } : {}) });
  const B = (id: string, buildingId: string, level: number, x: number, y: number): PresetBuilding =>
    ({ instanceId: `B-b-${id}`, buildingId, level, x, y });

  const walls = dedupeWalls([
    // Bras gauche du funnel : grande paroi verticale + crochet intérieur
    ...createWallLine(10, 30, 10, 13, 10, "B-fl"),   // x=10, y=13-30
    ...createWallLine(10, 13, 18, 13, 10, "B-ftl"),  // y=13, x=10-17 (crochet haut gauche)

    // Bras droit du funnel
    ...createWallLine(33, 30, 33, 13, 10, "B-fr"),
    ...createWallLine(25, 13, 33, 13, 10, "B-ftr"),  // y=13, x=25-33

    // Box intérieure (kill zone) : Scatter + Wizard à l'intérieur
    ...createWallRect(17, 8, 9, 6, 12, "B-kz"),     // x=17-25, y=8-13 (kill-zone walls)

    // Mur de compartiment secondaire (Eagle/Inferno derrière)
    ...createWallRect(19, 5, 5, 4, 12, "B-core"),   // x=19-23, y=5-8

    // Chicane au tiers du funnel pour briser la ligne droite
    ...createWallLine(14, 21, 19, 21, 10, "B-chL"),
    ...createWallLine(24, 21, 29, 21, 10, "B-chR"),
  ]);

  return {
    id: "the-corral", name: "B. The Corral",
    description: "Funnel ouvert au sud. Ressources-appâts attirent les troupes dans le couloir. Scattershot les attend au centre.",
    defenses: [
      D("sc",  "scattershot",     3, 18, 14),          // kill zone — Scatter (18-21,14-17)
      D("wt",  "wizard-tower",    8, 22, 15),          // kill zone — Wizard (22-24,15-17)
      D("ea",  "eagle-artillery", 4, 19,  5),          // deep core — Eagle (19-22,5-8)
      D("it",  "inferno-tower",   6, 26, 14, "multi"), // right of kz — Inferno (26-28,14-16)
      D("ca1", "cannon",          12,13, 14),          // left of kz — Cannon (13-15,14-16)
      D("ad1", "air-defense",     9, 13,  8),          // upper-left — AD (13-15,8-10)
      D("ad2", "air-defense",     9, 25,  8),          // upper-right — AD (25-27,8-10)
      D("mo",  "mortar",          8, 13, 25),          // funnel-left — Mortar
      D("ca2", "cannon",          12,27, 25),          // funnel-right
      D("at1", "archer-tower",    10, 7, 16),          // outside funnel left
      D("at2", "archer-tower",    10,35, 16),          // outside funnel right
    ],
    buildings: [
      // Appâts dans le funnel (attirent les troupes)
      B("gm1","gold-mine",        6, 14, 31),
      B("gm2","gold-mine",        6, 25, 31),
      B("ec1","elixir-collector", 6, 19, 33),
      B("ac", "army-camp",        4,  7, 31),   // grand appât côté gauche
      // Côtés extérieurs du funnel
      B("db", "dark-barracks",    4,  7,  8),
      B("ba", "barracks",         5, 35,  8),
      B("gs", "gold-storage",     7, 35, 26),
      B("ds", "dark-elixir-storage",5, 7,26),
      // Core area (entre bras et kill-zone)
      B("cl", "clan-castle",      5,  7, 22),
      B("bh", "builder-hut",      1, 35, 22),
    ],
    walls,
  };
})();

// ── Base C : "Air Grid" ────────────────────────────────────────────────────────
//
//  INTENTION :
//    Conçue pour résister aux Dragons, Baby Dragons et E-Dragons.
//    3 Air Defenses en triangle avec couverture de portée croisée.
//    Les bâtiments sont espacés pour briser les chaînes de l'Electro Dragon
//    (>1 tile entre les footprints).
//    Les Army Camps en périphérie forcent les unités aériennes à s'approcher
//    des AD avant de pouvoir atteindre le core.
//
//  FLOW D'ATTAQUE :
//    Dragons deployés en périphérie → visent les Army Camps ou buildings proches →
//    s'approchent → entrent dans la portée des 3 AD → Eagle Artillery cible
//    les gros HP → les Archers terminent les rescapés.
//
//  PIÈGE PRINCIPAL :
//    Les 3 AD forment un triangle offensif : attaquer l'une d'elles signifie
//    être dans la portée des deux autres. Il n'existe pas de position "safe" sur la base.

const pC: BasePreset = (() => {
  const D = (id: string, defenseId: string, level: number, x: number, y: number, mode?: string): PresetDefense =>
    ({ instanceId: `C-d-${id}`, defenseId, level, x, y, ...(mode ? { mode } : {}) });
  const B = (id: string, buildingId: string, level: number, x: number, y: number): PresetBuilding =>
    ({ instanceId: `C-b-${id}`, buildingId, level, x, y });

  const walls = dedupeWalls([
    // Ring autour de l'Eagle central
    ...createWallRect(18, 17, 7, 7, 12, "C-core"),   // Eagle (19-22,18-21) avec 1 case clearance

    // Petits rings protégeant chaque AD
    ...createWallRect(9,  9,  5, 5, 10, "C-ad1"),    // AD1 (10-12,10-12) ring autour
    ...createWallRect(29, 9,  5, 5, 10, "C-ad2"),    // AD2 (30-32,10-12) ring autour
    ...createWallRect(19, 28, 5, 5, 10, "C-ad3"),    // AD3 (20-22,29-31) ring autour

    // Liaisons entre rings pour forcer le détour
    ...createWallLine(14,  9, 14, 14, 10, "C-l1"),
    ...createWallLine(29,  9, 29, 14, 10, "C-l2"),
    ...createWallLine(14, 14, 18, 14, 10, "C-l3"),
    ...createWallLine(25, 14, 28, 14, 10, "C-l4"),
  ]);

  return {
    id: "air-grid", name: "C. Air Grid",
    description: "3 Air Defenses en triangle à couverture croisée. Aucune position safe en dehors du triangle. E-Dragon chaîne impossible grâce aux gaps.",
    defenses: [
      D("ea",  "eagle-artillery", 4, 19, 18),          // CORE — Eagle (19-22,18-21)
      D("ad1", "air-defense",    10, 10, 10),           // triangle NW — AD (10-12,10-12)
      D("ad2", "air-defense",    10, 30, 10),           // triangle NE — AD (30-32,10-12)
      D("ad3", "air-defense",    10, 20, 29),           // triangle S  — AD (20-22,29-31)
      D("it",  "inferno-tower",   6, 15, 18, "multi"),  // mid-left — Inferno (15-17,18-20)
      D("wt",  "wizard-tower",    8, 25, 18),           // mid-right — Wizard (25-27,18-20)
      D("ca1", "cannon",          12,15, 24),           // lower-left
      D("ca2", "cannon",          12,25, 24),           // lower-right
      D("at1", "archer-tower",    10, 7, 19),           // far left
      D("at2", "archer-tower",    10,35, 19),           // far right
      D("mo",  "mortar",           8, 19, 14),          // central north
    ],
    buildings: [
      // Army Camps : appâts extérieurs pour air units
      B("ac1","army-camp",        4,  7,  7),   // coin NW  (taille 4×4)
      B("ac2","army-camp",        4, 32,  7),   // coin NE
      B("ac3","army-camp",        4,  7, 31),   // coin SW
      B("ac4","army-camp",        4, 32, 31),   // coin SE
      // Buildings entre compartiments (briseurs de chaîne E-Dragon)
      B("gm1","gold-mine",        6, 16, 14),   // entre core et AD NW
      B("gm2","gold-mine",        6, 25, 14),   // entre core et AD NE
      B("bh1","builder-hut",      1, 16, 26),   // entre core et AD S gauche
      B("bh2","builder-hut",      1, 25, 26),   // entre core et AD S droite
      B("cl", "clan-castle",      5, 19, 24),   // devant AD S (force ciblage)
      B("gs", "gold-storage",     7, 15,  8),   // zone NW mid
      B("ec", "elixir-collector", 6, 27,  8),   // zone NE mid
    ],
    walls,
  };
})();

// ── Base D : "Labyrinth" ───────────────────────────────────────────────────────
//
//  INTENTION :
//    5 compartiments hermétiques. Chaque compartiment contient une défense et
//    est scellé par des murs. Pour avancer, les troupes doivent casser au moins
//    1 mur par section. Elles perdent 20-30 secondes de simulation par compartiment.
//
//  FLOW D'ATTAQUE :
//    Troupes en périphérie → attaquent compartiment 1 (Cannon) → cassent le mur →
//    avancent → Mortar tire depuis compartiment 2 → new wall → etc.
//    Eagle Artillery au centre (compartiment 5) est la dernière cible.
//
//  PIÈGE PRINCIPAL :
//    Le Scattershot est positionné dans le compartiment 3 (central droite).
//    Les troupes qui ont cassé les murs des compartiments 1 et 2 arrivent
//    regroupées — parfait pour le splash Scattershot.

const pD: BasePreset = (() => {
  const D = (id: string, defenseId: string, level: number, x: number, y: number, mode?: string): PresetDefense =>
    ({ instanceId: `D-d-${id}`, defenseId, level, x, y, ...(mode ? { mode } : {}) });
  const B = (id: string, buildingId: string, level: number, x: number, y: number): PresetBuilding =>
    ({ instanceId: `D-b-${id}`, buildingId, level, x, y });

  const walls = dedupeWalls([
    // Compartiment 1 — NW (Cannon) : ring 7×7 autour de (11,10)
    ...createWallRect(9, 9, 7, 7, 9, "D-c1"),        // (9-15,9-15) — Cannon à (11,11) = 11-13,11-13

    // Compartiment 2 — NE (Air Defense) : ring autour de (27,10)
    ...createWallRect(26, 9, 7, 7, 9, "D-c2"),       // (26-32,9-15) — AD à (28,11) = 28-30,11-13

    // Compartiment 3 — E  (Scattershot) : ring 8×8
    ...createWallRect(27, 17, 8, 8, 10, "D-c3"),     // (27-34,17-24) — Scatter à (28,18)=28-31,18-21

    // Compartiment 4 — SW (Mortar + Wizard)
    ...createWallRect(8, 18, 8, 8, 9, "D-c4"),       // (8-15,18-25) — Mortar à (10,20)

    // Compartiment 5 — CORE (Eagle + Inferno)
    ...createWallRect(17, 17, 9, 9, 12, "D-c5"),     // (17-25,17-25) — Eagle à (19,19) 4×4 = 19-22,19-22

    // Couloirs entre compartiments (connexions)
    ...createWallLine(15, 12, 26, 12, 9, "D-con1"),  // liaison C1-C2
    ...createWallLine(17, 15, 17, 17, 9, "D-con2"),  // liaison C1-CORE gauche
    ...createWallLine(25, 15, 25, 17, 9, "D-con3"),  // liaison C2-CORE droite
    ...createWallLine(15, 25, 15, 27, 9, "D-con4"),  // liaison C4-bas
    ...createWallLine(25, 25, 27, 25, 9, "D-con5"),  // liaison CORE-C3 bas
  ]);

  return {
    id: "labyrinth", name: "D. Labyrinth",
    description: "5 compartiments hermétiques. Chaque salle coûte 20-30s. Eagle au centre = dernière cible. Scattershot piège les troupes groupées au compartiment 3.",
    defenses: [
      D("ca1","cannon",          12,11, 11),          // C1 NW — Cannon (11-13,11-13)
      D("ad", "air-defense",      9,28, 11),          // C2 NE — AD (28-30,11-13)
      D("sc", "scattershot",      3,28, 18),          // C3 E  — Scatter (28-31,18-21)
      D("mo", "mortar",           8,10, 20),          // C4 SW — Mortar (10-12,20-22)
      D("ea", "eagle-artillery",  4,19, 19),          // C5 CORE — Eagle (19-22,19-22)
      D("it", "inferno-tower",    6,19, 11, "single"),// entre C1/C2 — Inferno (19-21,11-13)
      D("wt", "wizard-tower",     8,10, 12),          // C4 nord — Wizard (10-12,12-14)
      D("ca2","cannon",          12,34, 20),          // périphérie E
      D("at1","archer-tower",    10, 7,  7),          // coin NW extérieur
      D("at2","archer-tower",    10,35,  7),          // coin NE extérieur
    ],
    buildings: [
      B("ac1","army-camp",        4,  7, 27),   // bord W bas — appât
      B("ac2","army-camp",        4, 32, 27),   // bord E bas
      B("gm1","gold-mine",        6,  7, 17),   // bord W mid (hors C4)
      B("gm2","gold-mine",        6, 35, 12),   // bord E haut
      B("ec1","elixir-collector", 6, 19, 33),   // bas centre — appât
      B("ec2","elixir-collector", 6,  9, 31),   // bas gauche
      B("cl", "clan-castle",      5, 27, 31),   // bas droit
      B("gs", "gold-storage",     7, 33, 31),   // coin SE
      B("bh1","builder-hut",      1, 16,  9),   // entre C1-C2 haut
      B("bh2","builder-hut",      1, 35, 27),   // bord E bas
      B("la", "laboratory",       6,  7, 33),   // coin SW
    ],
    walls,
  };
})();

// ── Base E : "The Hybrid" ──────────────────────────────────────────────────────
//
//  INTENTION :
//    Base réaliste de type War/Legend League HDV14.
//    Core central protégé par 1 ring solide avec Eagle + Inferno.
//    Air Defenses placées en cross (N, S, E, W du ring) pour couverture totale.
//    Bâtiments neutres répartis naturellement comme une vraie base.
//    Funnel partiel au nord crée un piège pour les troupes terrestres.
//
//  FLOW D'ATTAQUE :
//    Troupes terrestres : attaquent les buildings au sud → mur extérieur →
//    contournent vers l'est (funnel nord) → Scattershot en haut couvre l'entrée →
//    les survivants font face au core Eagle + Inferno.
//    Troupes aériennes : 4 AD en cross signifie toujours être sous le feu d'au moins 2.
//
//  PIÈGE PRINCIPAL :
//    Le mur funnel nord guide les attaquants terrestres vers la Scattershot.
//    La base semble "ouverte" à l'est mais c'est une zone couverte par Wizard + AD.

const pE: BasePreset = (() => {
  const D = (id: string, defenseId: string, level: number, x: number, y: number, mode?: string): PresetDefense =>
    ({ instanceId: `E-d-${id}`, defenseId, level, x, y, ...(mode ? { mode } : {}) });
  const B = (id: string, buildingId: string, level: number, x: number, y: number): PresetBuilding =>
    ({ instanceId: `E-b-${id}`, buildingId, level, x, y });

  const walls = dedupeWalls([
    // Ring core (Eagle + Inferno inside)
    // Eagle 4×4 à (19,19) = 19-22,19-22 ; Inferno 3×3 à (23,20) = 23-25,20-22
    // Clearance de 1 autour des deux = ring de (17,18) à (27,23) → createWallRect(17,18,11,6)
    ...createWallRect(17, 18, 11, 6, 12, "E-core"),  // (17-27, 18-23)

    // Compartiment nord (Scattershot piège)
    ...createWallRect(16, 9, 11, 10, 10, "E-north"),  // (16-26,9-18) autour du Scatter

    // Mur EST séparant la zone mid-east
    ...createWallLine(28, 10, 28, 32, 10, "E-emid"),

    // Demi-ring SUD (compartiment ressources)
    ...createWallLine(11, 32, 11, 27, 9, "E-sl"),
    ...createWallLine(11, 32, 32, 32, 9, "E-sb"),
    ...createWallLine(32, 32, 32, 27, 9, "E-sr"),

    // Jonctions NW-NE pour guider les troupes vers le funnel nord
    ...createWallLine(11, 10, 11, 18, 9, "E-fnw"),  // bord NW vertical
    ...createWallLine(11, 10, 16, 10, 9, "E-fnt"),  // jonction vers ring nord
  ]);

  return {
    id: "the-hybrid", name: "E. The Hybrid",
    description: "Base War réaliste HDV14. Core Eagle + Inferno. 4 AD en cross. Funnel nord piège vers Scattershot. Ouverture est = zone couverte par Wizard + AD.",
    defenses: [
      D("ea",  "eagle-artillery",  4, 19, 19),          // CORE — Eagle (19-22,19-22)
      D("it",  "inferno-tower",    6, 23, 20, "single"), // CORE — Inferno (23-25,20-22)
      D("sc",  "scattershot",      3, 18, 10),          // funnel nord — Scatter (18-21,10-13)
      D("ad1", "air-defense",     10, 19, 14),          // N du core — AD (19-21,14-16)
      D("ad2", "air-defense",     10, 19, 25),          // S du core — AD (19-21,25-27)
      D("ad3", "air-defense",     10, 12, 20),          // W du core — AD (12-14,20-22)
      D("ad4", "air-defense",     10, 29, 20),          // E du core (zone "ouverte") — AD
      D("wt",  "wizard-tower",     8, 29, 14),          // NE — Wizard (29-31,14-16)
      D("mo",  "mortar",           8, 12, 25),          // SW
      D("ca1", "cannon",          12, 12, 14),          // NW
      D("ca2", "cannon",          12, 29, 26),          // SE
      D("at1", "archer-tower",    10,  7, 20),          // far W
      D("at2", "archer-tower",    10, 35, 20),          // far E
    ],
    buildings: [
      // Sud (appâts principaux pour troupes terrestres)
      B("ac1","army-camp",        4, 12, 34),
      B("ac2","army-camp",        4, 26, 34),
      B("gm1","gold-mine",        6, 19, 34),
      B("ec1","elixir-collector", 6,  7, 27),
      B("ec2","elixir-collector", 6, 35, 27),
      // Nord (derrière le ring nord, briseurs de ligne)
      B("db", "dark-barracks",    4,  7,  9),
      B("ba", "barracks",         5, 33,  9),
      B("cl", "clan-castle",      5, 13,  9),
      B("la", "laboratory",       6, 29,  9),
      // Mid-east (zone "ouverte" mais couverte par AD4 + Wizard)
      B("gs", "gold-storage",     7, 30,  9),
      B("ds", "dark-elixir-storage",5,  7,33),
      B("bh", "builder-hut",      1, 33, 33),
    ],
    walls,
  };
})();

// ── Base F : "Core Défensif Symétrique" ──────────────────────────────────────
//
//  Symétrie stricte gauche/droite (axe x=22).
//  Eagle Artillery 4×4 au centre exact (20-23, 20-23).
//  Ring intérieur de murs + 2 piliers extérieurs canalisant les troupes.
//  Cannons et Wizard Towers symétriques couvrent les couloirs d'approche.
//  12 bâtiments-appâts en périphérie et mid-layer.

const pF: BasePreset = (() => {
  const D = (id: string, defenseId: string, level: number, x: number, y: number, mode?: string): PresetDefense =>
    ({ instanceId: `F-d-${id}`, defenseId, level, x, y, ...(mode ? { mode } : {}) });
  const B = (id: string, buildingId: string, level: number, x: number, y: number): PresetBuilding =>
    ({ instanceId: `F-b-${id}`, buildingId, level, x, y });

  const walls = dedupeWalls([
    ...createWallRect(18, 18, 8, 8, 10, "pF-ring"),  // ring intérieur (18-25, 18-25)
    ...createWallLine(11, 17, 11, 28, 8, "pF-wl"),   // pilier gauche  x=11, y=17-28
    ...createWallLine(32, 17, 32, 28, 8, "pF-wr"),   // pilier droit   x=32, y=17-28
  ]);

  return {
    id:   "core-defensif-sym",
    name: "F. Core Défensif Symétrique",
    description: "Eagle Artillery au cœur (22,22), 4 défenses symétriques G/D. Ring intérieur + piliers extérieurs. Bâtiments-appâts en périphérie.",
    defenses: [
      D("ea",  "eagle-artillery",  4, 20, 20),   // CORE — (20-23, 20-23)
      D("ca1", "cannon",          10, 12, 20),   // gauche      — (12-14, 20-22)
      D("ca2", "cannon",          10, 29, 20),   // droite      — (29-31, 20-22)
      D("wt1", "wizard-tower",     8, 12, 28),   // gauche bas  — (12-14, 28-30)
      D("wt2", "wizard-tower",     8, 29, 28),   // droite bas  — (29-31, 28-30)
    ],
    buildings: [
      B("gm1", "gold-mine",        6,  7, 20),   // appât gauche milieu    — (7-9,  20-22)
      B("gm2", "gold-mine",        6, 34, 20),   // appât droit milieu     — (34-36, 20-22)
      B("ec1", "elixir-collector", 6,  7, 25),   // appât gauche bas       — (7-9,  25-27)
      B("ec2", "elixir-collector", 6, 34, 25),   // appât droit bas        — (34-36, 25-27)
      B("gs1", "gold-storage",     7,  7, 14),   // flanc gauche haut      — (7-9,  14-16)
      B("gs2", "gold-storage",     7, 34, 14),   // flanc droit haut       — (34-36, 14-16)
      B("ba1", "barracks",         8, 14, 14),   // mid gauche haut        — (14-16, 14-16)
      B("ba2", "barracks",         8, 27, 14),   // mid droit haut         — (27-29, 14-16)
      B("ac1", "army-camp",        7,  7,  7),   // coin NW (4×4)          — (7-10,  7-10)
      B("ac2", "army-camp",        7, 33,  7),   // coin NE (4×4)          — (33-36, 7-10)
      B("db1", "dark-barracks",    6, 14, 33),   // bas gauche             — (14-16, 33-35)
      B("db2", "dark-barracks",    6, 27, 33),   // bas droit              — (27-29, 33-35)
    ],
    walls,
  };
})();

// Presets retirés — échouent validatePresetStrict (overlaps mur/bâtiment/défense) :
//   p4  compartiments   — 5 wall-on-entity
//   p8  funnel          — 2 wall-on-entity
//   p10 hdv15           — 3 wall-on-entity
//   pA  blindspot-core  — 3 wall-on-entity
//   pB  the-corral      — 13 wall-on-entity
//   pC  air-grid        — 18 overlaps + wall-on-entity
//   pD  labyrinth       — 12 overlaps + wall-on-entity
//   pE  the-hybrid      — 4 overlaps + wall-on-entity
// Les déclarations restent pour référence historique.

export const BASE_PRESETS: BasePreset[] = [p1, p2, p3, p5, p6, p7, p9, pF];

// Validate all presets on module load (dev-time strict check)
if (process.env.NODE_ENV !== "production") {
  let totalErrors = 0;
  for (const p of BASE_PRESETS) {
    const errs = validatePresetStrict(p);
    if (errs.length > 0) {
      totalErrors += errs.length;
      console.error(`[${p.id}] ${errs.length} erreur(s):`);
      errs.forEach((e) => console.error(`  ${e.type}: ${e.message}`));
    }
  }
  if (totalErrors === 0) console.log("[base-presets] validatePresetStrict: 0 erreur — tous les presets valides");
}
