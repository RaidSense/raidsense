/**
 * Parse Claude Vision output into PlacedDefense[] / PlacedBuilding[] format.
 * Validates IDs against our known lists, clamps coordinates to the 44×44 grid.
 */
import { DEFENSES } from "../data/defenses";
import { NEUTRAL_BUILDINGS } from "../data/neutral-buildings";

const VALID_DEFENSE_IDS  = new Set<string>(DEFENSES.map((d) => d.id));
const VALID_BUILDING_IDS = new Set<string>(NEUTRAL_BUILDINGS.map((b) => b.id));

export interface RawBuilding {
  id:    string;
  x:     number;
  y:     number;
  level: number;
}

export interface RecognitionResult {
  defenses:  { id: string; x: number; y: number; level: number }[];
  buildings: { id: string; x: number; y: number; level: number }[];
  /** Total items returned by Claude. */
  rawCount:   number;
  /** Items whose ID matched our known lists. */
  validCount: number;
  /** Items skipped (unknown IDs). */
  skipped:    string[];
}

export function parseRecognitionOutput(raw: RawBuilding[]): RecognitionResult {
  const defenses:  RecognitionResult["defenses"]  = [];
  const buildings: RecognitionResult["buildings"] = [];
  const skipped:   string[] = [];

  for (const b of raw) {
    const id    = String(b.id ?? "").trim();
    const x     = Math.max(0, Math.min(43, Math.round(Number(b.x)     || 0)));
    const y     = Math.max(0, Math.min(43, Math.round(Number(b.y)     || 0)));
    const level = Math.max(1, Math.min(20, Math.round(Number(b.level) || 1)));

    if (VALID_DEFENSE_IDS.has(id)) {
      defenses.push({ id, x, y, level });
    } else if (VALID_BUILDING_IDS.has(id)) {
      buildings.push({ id, x, y, level });
    } else {
      skipped.push(id);
    }
  }

  return {
    defenses,
    buildings,
    rawCount:   raw.length,
    validCount: defenses.length + buildings.length,
    skipped,
  };
}
