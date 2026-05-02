/**
 * Base presets + wall-building helpers for RaidSense.
 * All coordinates are top-left of the footprint on the 44×44 grid.
 */
import { type WallPlacement } from "./walls";

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
  "wizard-tower": 3, "x-bow": 3, "inferno-tower": 3,
  "eagle-artillery": 4, "scattershot": 4,
};

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

/** Check for footprint overlaps and wall-over-defense overlaps. Returns true if valid. */
export function validatePreset(preset: BasePreset): boolean {
  let ok = true;
  const defs = preset.defenses;
  for (let i = 0; i < defs.length; i++) {
    const sz1 = DEF_SIZE[defs[i].defenseId] ?? 1;
    for (let j = i + 1; j < defs.length; j++) {
      const sz2 = DEF_SIZE[defs[j].defenseId] ?? 1;
      const overlapX = defs[i].x < defs[j].x + sz2 && defs[i].x + sz1 > defs[j].x;
      const overlapY = defs[i].y < defs[j].y + sz2 && defs[i].y + sz1 > defs[j].y;
      if (overlapX && overlapY) {
        console.warn(`[${preset.id}] Defense overlap: ${defs[i].defenseId}@(${defs[i].x},${defs[i].y}) ↔ ${defs[j].defenseId}@(${defs[j].x},${defs[j].y})`);
        ok = false;
      }
    }
  }
  for (const w of preset.walls) {
    for (const d of defs) {
      const sz = DEF_SIZE[d.defenseId] ?? 1;
      if (w.x >= d.x && w.x < d.x + sz && w.y >= d.y && w.y < d.y + sz) {
        console.warn(`[${preset.id}] Wall (${w.x},${w.y}) overlaps ${d.defenseId}@(${d.x},${d.y})`);
        ok = false;
      }
    }
  }
  return ok;
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

export const BASE_PRESETS: BasePreset[] = [p1, p2, p3, p4, p5, p6, p7, p8, p9, p10];

// Validate all presets on module load (dev-time warnings only)
if (process.env.NODE_ENV !== "production") {
  BASE_PRESETS.forEach(validatePreset);
}
