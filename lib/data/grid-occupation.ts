/**
 * Grid occupation system — single source of truth for spatial queries.
 * All placement, move, and validation logic should route through this module.
 */

import { DEFENSES } from "./defenses";
import { NEUTRAL_BUILDINGS } from "./neutral-buildings";

export const GRID_SIZE = 44;

export type EntityKind = "defense" | "building" | "wall";

export interface OccupiedTile {
  entityId: string;
  kind: EntityKind;
}

/** Tile key "x,y" → occupant metadata. */
export type OccupationMap = Map<string, OccupiedTile>;

// ── Size lookup ──────────────────────────────────────────────────────────────

/** Returns the footprint side length for any entity type id. */
export function entitySize(typeId: string): number {
  return (
    DEFENSES.find((d) => d.id === typeId)?.size ??
    NEUTRAL_BUILDINGS.find((b) => b.id === typeId)?.size ??
    1
  );
}

// ── Map manipulation ─────────────────────────────────────────────────────────

/** Registers all size×size tiles of a footprint in the map. */
export function occupyTiles(
  map: OccupationMap,
  entityId: string,
  kind: EntityKind,
  x: number,
  y: number,
  size: number,
): void {
  for (let dy = 0; dy < size; dy++)
    for (let dx = 0; dx < size; dx++)
      map.set(`${x + dx},${y + dy}`, { entityId, kind });
}

/** Removes all tiles belonging to `entityId`. */
export function freeTiles(map: OccupationMap, entityId: string): void {
  for (const [k, v] of map) if (v.entityId === entityId) map.delete(k);
}

// ── Build from state ─────────────────────────────────────────────────────────

/**
 * Builds a fresh OccupationMap from the current village state.
 * Call this whenever placed/buildings/walls change.
 */
export function buildOccupation(
  defenses:  { instanceId: string; defenseId: string;  x: number; y: number }[],
  buildings: { instanceId: string; buildingId: string; x: number; y: number }[],
  walls:     { instanceId: string; x: number; y: number }[],
): OccupationMap {
  const map: OccupationMap = new Map();
  for (const d of defenses)
    occupyTiles(map, d.instanceId, "defense",  d.x, d.y, entitySize(d.defenseId));
  for (const b of buildings)
    occupyTiles(map, b.instanceId, "building", b.x, b.y, entitySize(b.buildingId));
  for (const w of walls)
    map.set(`${w.x},${w.y}`, { entityId: w.instanceId, kind: "wall" });
  return map;
}

// ── Spatial queries ──────────────────────────────────────────────────────────

/** True if every tile of the footprint is free (or belongs to `excludeId`). */
export function isFree(
  map: OccupationMap,
  x: number,
  y: number,
  size: number,
  excludeId?: string,
): boolean {
  for (let dy = 0; dy < size; dy++)
    for (let dx = 0; dx < size; dx++) {
      const t = map.get(`${x + dx},${y + dy}`);
      if (t && t.entityId !== excludeId) return false;
    }
  return true;
}

/** True if the footprint fits fully within the grid. */
export function inBounds(x: number, y: number, size: number): boolean {
  return x >= 0 && y >= 0 && x + size <= GRID_SIZE && y + size <= GRID_SIZE;
}

/** Returns all distinct entityIds whose tiles overlap the given footprint (excluding `excludeId`). */
export function occupantsOf(
  map: OccupationMap,
  x: number,
  y: number,
  size: number,
  excludeId?: string,
): string[] {
  const ids = new Set<string>();
  for (let dy = 0; dy < size; dy++)
    for (let dx = 0; dx < size; dx++) {
      const t = map.get(`${x + dx},${y + dy}`);
      if (t && t.entityId !== excludeId) ids.add(t.entityId);
    }
  return [...ids];
}

// ── Debug snapshot ───────────────────────────────────────────────────────────

export interface TileSnapshot {
  x: number;
  y: number;
  kind: EntityKind;
  entityId: string;
}

/** Flat array of all occupied tiles — used by the debug overlay. */
export function occupiedSnapshot(map: OccupationMap): TileSnapshot[] {
  const out: TileSnapshot[] = [];
  for (const [key, v] of map) {
    const comma = key.indexOf(",");
    out.push({ x: +key.slice(0, comma), y: +key.slice(comma + 1), kind: v.kind, entityId: v.entityId });
  }
  return out;
}
