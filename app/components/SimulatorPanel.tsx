"use client";

import { useState, useRef, useMemo, useEffect } from "react";
import { TROOPS } from "../../lib/data/troops";
import { type WallPlacement, WALL_HP, MAX_WALL_LEVEL } from "../../lib/data/walls";
import { BASE_PRESETS, type BasePreset } from "../../lib/data/base-presets";
import { TOWN_HALL_DATA } from "../../lib/data/town-halls";
import {
  getDefenseLimit, getTotalDefenseLimit, TH_DEFENSE_LIMITS,
} from "../../lib/data/townhall-limits";
import {
  buildOccupation, isFree, inBounds, entitySize, occupantsOf, occupiedSnapshot,
  type OccupationMap,
} from "../../lib/data/grid-occupation";
import { DEFENSES } from "../../lib/data/defenses";
import { NEUTRAL_BUILDINGS } from "../../lib/data/neutral-buildings";
import { simulateAttack, PROJECTILE_SPEED } from "../../lib/engine/calculator";
import {
  createBestDeployment,
  scoreSimResult,
  type Strategy as OptStrategy,
  type TroopTemplate,
  type OptimizationResult,
} from "../../lib/engine/optimizer";
import type {
  SimulationResult,
  TroopDeployment,
  DefensePlacement,
  BuildingPlacement,
  Vec2,
  HealEvent,
  HealTickEvent,
  ChainEvent,
  DeathLightningEvent,
  TroopFireEvent,
} from "../../lib/engine/calculator";

// ── Constants ──────────────────────────────────────────────────────────────

const GRID_SIZE      = 44;
const CELL           = 10; // fallback px/tile before ResizeObserver fires in BattleGrid
const DEPLOY_MARGIN  = 5;  // tiles from each edge that form the valid deployment zone
// Auto-drop zone along south border (used when placement mode is OFF)
const DROP_Y         = GRID_SIZE - 1;
const DROP_X_MIN     = DEPLOY_MARGIN;
const DROP_X_MAX     = GRID_SIZE - DEPLOY_MARGIN - 1;
const MAX_TROOP_SLOTS  = 5;
const MAX_DEFENSES     = 8;
const MAX_BUILDINGS    = 12;

// Category colour for neutral buildings on the grid
const BUILDING_FILL: Record<string, string> = {
  "resource": "#ca8a04",   // gold for resources
  "special":  "#6366f1",   // indigo for special (clan castle, hero hall…)
  "building": "#475569",   // slate for generic buildings
};

const BUILDING_PALETTE_LEVELS: Record<string, number> = {};
for (const b of NEUTRAL_BUILDINGS) BUILDING_PALETTE_LEVELS[b.id] = b.levels[b.levels.length - 1].level;

const TROOP_ABBREV: Record<string, string> = {
  "barbarian":      "Ba", "archer":         "Ar", "giant":    "Gi",
  "goblin":         "Go", "wall-breaker":   "WB", "balloon":  "Bl",
  "wizard":         "Wz", "healer":         "He", "dragon":   "Dr",
  "pekka":          "PK", "baby-dragon":    "BD", "miner":    "Mi",
  "electro-dragon": "ED",
};

const TROOP_COLORS = [
  "text-orange-400", "text-sky-400", "text-emerald-400",
  "text-violet-400", "text-rose-400",
] as const;

const TROOP_COLORS_HEX = [
  "#fb923c", "#38bdf8", "#34d399", "#a78bfa", "#fb7185",
] as const;

const DEFENSE_FILL: Record<string, string> = {
  "cannon":          "#ef4444",
  "archer-tower":    "#f97316",
  "mortar":          "#eab308",
  "air-defense":     "#3b82f6",
  "wizard-tower":    "#8b5cf6",
  "x-bow":           "#06b6d4",
  "inferno-tower":   "#f43f5e",
  "eagle-artillery": "#f59e0b",
  "scattershot":     "#ec4899",
};

const PALETTE_DEFAULTS: Record<string, number> = {
  "cannon": 10, "archer-tower": 10, "mortar": 8, "air-defense": 8,
  "wizard-tower": 8, "x-bow": 5, "inferno-tower": 4,
  "eagle-artillery": 3, "scattershot": 2,
};

// ── Types ──────────────────────────────────────────────────────────────────

interface TroopSlot {
  slotId: string;
  troopId: string;
  level: number;
  count: number;
}

interface PlacedTroop {
  instanceId: string;
  troopId:    string;
  level:      number;
  x:          number; // tile
  y:          number;
  deployAt:   number; // seconds delay before entering battle (0 = immediate)
}

interface PlacedDefense {
  instanceId: string;
  defenseId: string;
  level: number;
  x: number;
  y: number;
  /** "ground"|"both" for X-Bow, "single"|"multi" for Inferno Tower */
  mode?: string;
}

interface PlacedBuilding {
  instanceId: string;
  buildingId: string;
  level: number;
  x: number;
  y: number;
}

interface TroopMeta {
  instanceId: string;
  slotId: string;
  troopName: string;
  maxHp: number;
  label: string;
  color: string;
  colorHex: string;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function borderPositions(total: number): Vec2[] {
  if (total === 0) return [];
  if (total === 1) return [{ x: Math.floor(GRID_SIZE / 2), y: DROP_Y }];
  const span = DROP_X_MAX - DROP_X_MIN;
  return Array.from({ length: total }, (_, i) => ({
    x: Math.round((DROP_X_MIN + (i / (total - 1)) * span) * 10) / 10,
    y: DROP_Y,
  }));
}

function interpolatePosition(
  positions: Vec2[],
  t: number,
  destroyedAt: number | null,
): Vec2 | null {
  if (destroyedAt !== null && t >= destroyedAt) return null;
  if (positions.length === 0) return null;
  const s    = Math.floor(t);
  const frac = t - s;
  const p0   = positions[Math.min(s, positions.length - 1)];
  const p1   = positions[Math.min(s + 1, positions.length - 1)];
  return { x: p0.x + (p1.x - p0.x) * frac, y: p0.y + (p1.y - p0.y) * frac };
}

function buildDeployments(slots: TroopSlot[]): {
  deployments: TroopDeployment[];
  meta: TroopMeta[];
} {
  const positions = borderPositions(slots.reduce((s, sl) => s + sl.count, 0));
  const deployments: TroopDeployment[] = [];
  const meta: TroopMeta[]              = [];
  let pi = 0;

  slots.forEach((slot, si) => {
    const troop = TROOPS.find((t) => t.id === slot.troopId)!;
    const lData = troop.levels.find((l) => l.level === slot.level)!;
    const abbr  = TROOP_ABBREV[slot.troopId] ?? troop.name.slice(0, 2);
    const color    = TROOP_COLORS[si % TROOP_COLORS.length];
    const colorHex = TROOP_COLORS_HEX[si % TROOP_COLORS_HEX.length];

    for (let i = 0; i < slot.count; i++) {
      const id = `${slot.slotId}_${i}`;
      deployments.push({ instanceId: id, troopId: slot.troopId, level: slot.level, dropPosition: positions[pi++] });
      meta.push({ instanceId: id, slotId: slot.slotId, troopName: troop.name, maxHp: lData.hp, label: `${abbr}${i + 1}`, color, colorHex });
    }
  });

  return { deployments, meta };
}

/** Returns true if tile (x,y) is in the deployment perimeter and not covered by a defense. */
function isValidDeployTile(x: number, y: number, defenses: PlacedDefense[]): boolean {
  if (x < 0 || x >= GRID_SIZE || y < 0 || y >= GRID_SIZE) return false;
  const inPerimeter = x < DEPLOY_MARGIN || x >= GRID_SIZE - DEPLOY_MARGIN
                   || y < DEPLOY_MARGIN || y >= GRID_SIZE - DEPLOY_MARGIN;
  if (!inPerimeter) return false;
  return !defenses.some((d) => {
    const s = DEFENSES.find((def) => def.id === d.defenseId)?.size ?? 1;
    return x >= d.x && x < d.x + s && y >= d.y && y < d.y + s;
  });
}

function buildManualDeployments(
  placedTroops: PlacedTroop[],
  slots: TroopSlot[],
): { deployments: TroopDeployment[]; meta: TroopMeta[] } {
  const deployments: TroopDeployment[] = [];
  const meta: TroopMeta[]              = [];
  for (const pt of placedTroops) {
    const troop = TROOPS.find((t) => t.id === pt.troopId);
    if (!troop) continue;
    const lData = troop.levels.find((l) => l.level === pt.level);
    if (!lData) continue;
    const slotIdx  = slots.findIndex((s) => s.troopId === pt.troopId);
    const idx      = Math.max(0, slotIdx) % TROOP_COLORS.length;
    const abbr     = TROOP_ABBREV[pt.troopId] ?? troop.name.slice(0, 2);
    deployments.push({
      instanceId:   pt.instanceId,
      troopId:      pt.troopId,
      level:        pt.level,
      dropPosition: { x: pt.x, y: pt.y },
      deployAt:     pt.deployAt,
    });
    meta.push({
      instanceId: pt.instanceId,
      slotId:     pt.troopId,
      troopName:  troop.name,
      maxHp:      lData.hp,
      label:      abbr,
      color:      TROOP_COLORS[idx],
      colorHex:   TROOP_COLORS_HEX[idx],
    });
  }
  return { deployments, meta };
}

function buildDefensePlacements(placed: PlacedDefense[]): DefensePlacement[] {
  return placed.map((d) => {
    const size = DEFENSES.find((def) => def.id === d.defenseId)?.size ?? 1;
    return {
      instanceId: d.instanceId,
      defenseId:  d.defenseId,
      level:      d.level,
      position:   { x: d.x + size / 2, y: d.y + size / 2 },
      mode:       d.mode,
    };
  });
}

function buildNeutralBuildingPlacements(placed: PlacedBuilding[]): BuildingPlacement[] {
  return placed.map((b) => {
    const size = NEUTRAL_BUILDINGS.find((nb) => nb.id === b.buildingId)?.size ?? 1;
    return {
      instanceId: b.instanceId,
      buildingId: b.buildingId,
      level:      b.level,
      position:   { x: b.x + size / 2, y: b.y + size / 2 },
    };
  });
}

// ── SimulatorPanel ─────────────────────────────────────────────────────────

// ── Wall SVG rendering ──────────────────────────────────────────────────────

function renderWallSvg(level: number, px: number, py: number, sz: number): React.ReactNode {
  const p = 1; // padding
  const W = sz - p * 2;
  const H = sz - p * 2;
  const x = px + p;
  const y = py + p;
  const cx = x + W / 2;
  const rx = 2;

  const configs: Record<number, { base: string; border: string; hi: string; detail: React.ReactNode }> = {
    1:  { base:"#92400e", border:"#78350f", hi:"#b45309",
          detail:<line x1={cx-1} y1={y+1} x2={cx-1} y2={y+H-1} stroke="#78350f" strokeWidth={0.6}/> },
    2:  { base:"#9ca3af", border:"#6b7280", hi:"#d1d5db",
          detail:<line x1={x+2} y1={y+H/2} x2={x+W-1} y2={y+H/2+1} stroke="#6b7280" strokeWidth={0.5}/> },
    3:  { base:"#6b7280", border:"#4b5563", hi:"#9ca3af",
          detail:<rect x={x+1} y={y+1} width={2} height={2} fill="#4b5563" rx={0.5}/> },
    4:  { base:"#4b5563", border:"#374151", hi:"#6b7280",
          detail:<><rect x={x} y={y} width={2} height={2} fill="#374151"/><rect x={x+W-2} y={y+H-2} width={2} height={2} fill="#374151"/></> },
    5:  { base:"#d97706", border:"#b45309", hi:"#fbbf24",
          detail:<path d={`M ${cx-2} ${y+1} L ${cx} ${y-1} L ${cx+2} ${y+1}`} fill="#fef08a" stroke="#f59e0b" strokeWidth={0.5}/> },
    6:  { base:"#1f2937", border:"#111827", hi:"#374151",
          detail:<path d={`M ${cx} ${y} L ${cx-1.5} ${y+4} L ${cx+1.5} ${y+4} Z`} fill="#f472b6" opacity={0.9}/> },
    7:  { base:"#1f2937", border:"#111827", hi:"#374151",
          detail:<path d={`M ${cx} ${y-1} L ${cx-1.5} ${y+5} L ${cx+1.5} ${y+5} Z`} fill="#a78bfa" opacity={0.9}/> },
    8:  { base:"#111827", border:"#030712", hi:"#1f2937",
          detail:<ellipse cx={cx} cy={y+3} rx={1.5} ry={2.5} fill="#60a5fa" opacity={0.8}/> },
    9:  { base:"#374151", border:"#1f2937", hi:"#4b5563",
          detail:<rect x={x+1} y={y+1} width={W-2} height={2} fill="#1f2937" rx={0.5}/> },
    10: { base:"#1f2937", border:"#111827", hi:"#374151",
          detail:<><line x1={x} y1={y+H} x2={x+W} y2={y} stroke="#6b7280" strokeWidth={0.6} opacity={0.7}/></>},
    11: { base:"#111827", border:"#030712", hi:"#1f2937",
          detail:<><line x1={x+1} y1={y+H-1} x2={cx} y2={y+2} stroke="#f97316" strokeWidth={0.8} opacity={0.9}/><line x1={cx} y1={y+H-2} x2={x+W-1} y2={y+3} stroke="#fb923c" strokeWidth={0.6} opacity={0.7}/></> },
    12: { base:"#e5e7eb", border:"#f59e0b", hi:"#ffffff",
          detail:<rect x={x} y={y} width={W} height={H} fill="none" stroke="#f59e0b" strokeWidth={0.8} rx={1}/> },
    13: { base:"#1f2937", border:"#111827", hi:"#374151",
          detail:<><ellipse cx={cx} cy={y+H/2} rx={2} ry={2.5} fill="#3b82f6" opacity={0.5}/><ellipse cx={cx} cy={y+H/2} rx={0.8} ry={1} fill="#93c5fd" opacity={0.9}/></> },
    14: { base:"#0f172a", border:"#020617", hi:"#1e293b",
          detail:<rect x={x+1} y={y} width={W-2} height={3} fill="#bfdbfe" rx={0.5}/> },
    15: { base:"#0f172a", border:"#b45309", hi:"#1e293b",
          detail:<><path d={`M ${x} ${y} L ${x+W} ${y} L ${x+W} ${y+2} L ${x} ${y+2} Z`} fill="#b45309"/><path d={`M ${x} ${y+H} L ${x+W} ${y+H} L ${x+W} ${y+H-2} L ${x} ${y+H-2} Z`} fill="#92400e"/></> },
    16: { base:"#0f172a", border:"#1e1b4b", hi:"#1e293b",
          detail:<><line x1={x} y1={y+H} x2={x+W} y2={y} stroke="#7c3aed" strokeWidth={0.7} opacity={0.8}/><line x1={x} y1={y} x2={x+W} y2={y+H} stroke="#3b82f6" strokeWidth={0.5} opacity={0.6}/><ellipse cx={cx} cy={y+H/2} rx={1.2} ry={1.2} fill="#818cf8" opacity={0.7}/></> },
  };

  const cfg = configs[Math.min(Math.max(level, 1), 16)];
  return (
    <g key={`wall-${px}-${py}`}>
      <rect x={x} y={y} width={W} height={H} fill={cfg.base} stroke={cfg.border} strokeWidth={0.75} rx={rx} />
      {/* highlight */}
      <rect x={x+0.5} y={y+0.5} width={W/2} height={1.2} fill={cfg.hi} opacity={0.5} rx={0.5}/>
      {/* shadow */}
      <rect x={x} y={y+H-1.5} width={W} height={1.5} fill={cfg.border} opacity={0.5} rx={rx}/>
      {cfg.detail}
    </g>
  );
}

// ── Test Scenarios ─────────────────────────────────────────────────────────
// À supprimer après validation des mécaniques.

interface TestScenario {
  name:                string;
  useManualPlacement?: boolean;
  troopSlots:          TroopSlot[];
  placed:              PlacedDefense[];
  placedBuildings?:    PlacedBuilding[];
  placedTroops?:       PlacedTroop[];
}

const _d = (id: string, defenseId: string, level: number, x: number, y: number, mode?: string): PlacedDefense =>
  ({ instanceId: id, defenseId, level, x, y, ...(mode ? { mode } : {}) });

const TEST_SCENARIOS: TestScenario[] = [
  {
    name: "Giant + Healers vs Canon",
    troopSlots: [
      { slotId: "s1", troopId: "giant",  level: 6, count: 4 },
      { slotId: "s2", troopId: "healer", level: 3, count: 2 },
    ],
    placed: [_d("d1", "cannon", 10, 21, 20)],
  },
  {
    name: "Dragon vs Défense Anti-Air",
    troopSlots: [{ slotId: "s1", troopId: "dragon", level: 3, count: 2 }],
    placed: [_d("d1", "air-defense", 8, 21, 20)],
  },
  {
    name: "E-Dragon — chaîne bâtiments collés",
    troopSlots: [{ slotId: "s1", troopId: "electro-dragon", level: 3, count: 1 }],
    placed: [
      _d("d1", "cannon", 8, 16, 20),
      _d("d2", "cannon", 8, 19, 20),
      _d("d3", "cannon", 8, 22, 20),
      _d("d4", "cannon", 8, 25, 20),
    ],
  },
  {
    name: "E-Dragon — chaîne bâtiments espacés",
    troopSlots: [{ slotId: "s1", troopId: "electro-dragon", level: 3, count: 1 }],
    placed: [
      _d("d1", "cannon", 8, 12, 20),
      _d("d2", "cannon", 8, 21, 20),
      _d("d3", "cannon", 8, 30, 20),
    ],
  },
  {
    name: "Miner vs Canon",
    troopSlots: [{ slotId: "s1", troopId: "miner", level: 5, count: 4 }],
    placed: [_d("d1", "cannon", 10, 21, 20)],
  },
  {
    name: "Baby Dragon seul (enragé)",
    troopSlots: [{ slotId: "s1", troopId: "baby-dragon", level: 5, count: 1 }],
    placed: [_d("d1", "cannon", 10, 21, 20)],
  },
  {
    name: "Baby Dragon + Dragon proche (non enragé)",
    useManualPlacement: true,
    troopSlots: [
      { slotId: "s1", troopId: "baby-dragon", level: 5, count: 1 },
      { slotId: "s2", troopId: "dragon",      level: 3, count: 1 },
    ],
    placed: [_d("d1", "air-defense", 8, 21, 20)],
    placedTroops: [
      { instanceId: "pt1", troopId: "baby-dragon", level: 5, x: 2, y: 20, deployAt: 0 },
      { instanceId: "pt2", troopId: "dragon",      level: 3, x: 2, y: 22, deployAt: 0 },
    ],
  },
  {
    name: "Scattershot vs groupe de troupes",
    troopSlots: [
      { slotId: "s1", troopId: "giant",     level: 6, count: 6 },
      { slotId: "s2", troopId: "barbarian", level: 8, count: 4 },
    ],
    placed: [_d("d1", "scattershot", 3, 20, 19)],
  },
  {
    name: "Eagle Artillery — salve verrouillée",
    troopSlots: [
      { slotId: "s1", troopId: "giant",  level: 6, count: 4 },
      { slotId: "s2", troopId: "wizard", level: 5, count: 3 },
    ],
    placed: [_d("d1", "eagle-artillery", 3, 20, 19)],
  },
  {
    name: "Wizard Tower — splash vs troupes",
    troopSlots: [
      { slotId: "s1", troopId: "giant",     level: 5, count: 6 },
      { slotId: "s2", troopId: "barbarian", level: 7, count: 6 },
    ],
    placed: [_d("d1", "wizard-tower", 8, 21, 20)],
  },

  // ── Scattershot tests ────────────────────────────────────────────────────
  {
    name: "Scatter — troupes hors zone morte",
    troopSlots: [{ slotId: "s1", troopId: "giant", level: 6, count: 6 }],
    placed: [_d("d1", "scattershot", 3, 20, 19)],
    // Giants auto-déployés sur le bord → distance > minRange → doivent être ciblés
  },
  {
    name: "Scatter — troupes dans zone morte (ignorées)",
    useManualPlacement: true,
    troopSlots: [{ slotId: "s1", troopId: "giant", level: 6, count: 4 }],
    placed: [_d("d1", "scattershot", 3, 20, 19)],
    // Scattershot 4x4 centré en (22,21). minRange=4. Troupes placées à 2 tiles du centre → ignorées.
    placedTroops: [
      { instanceId: "pt1", troopId: "giant", level: 6, x: 21, y: 22, deployAt: 0 },
      { instanceId: "pt2", troopId: "giant", level: 6, x: 22, y: 22, deployAt: 0 },
      { instanceId: "pt3", troopId: "giant", level: 6, x: 21, y: 21, deployAt: 0 },
      { instanceId: "pt4", troopId: "giant", level: 6, x: 23, y: 22, deployAt: 0 },
    ],
  },
  {
    name: "Scatter — cône arrière + avant",
    troopSlots: [
      { slotId: "s1", troopId: "giant",     level: 6, count: 4 },
      { slotId: "s2", troopId: "barbarian", level: 8, count: 8 },
    ],
    placed: [_d("d1", "scattershot", 3, 20, 20), _d("d2", "cannon", 8, 20, 10)],
  },

  // ── Baby Dragon rage tests ────────────────────────────────────────────────
  {
    name: "Baby Dragon seul → enragé ✓",
    troopSlots: [{ slotId: "s1", troopId: "baby-dragon", level: 5, count: 1 }],
    placed: [_d("d1", "cannon", 10, 21, 20)],
  },
  {
    name: "Baby Dragon + Dragon → toujours enragé ✓",
    useManualPlacement: true,
    troopSlots: [
      { slotId: "s1", troopId: "baby-dragon", level: 5, count: 1 },
      { slotId: "s2", troopId: "dragon",      level: 3, count: 1 },
    ],
    placed: [_d("d1", "air-defense", 8, 21, 20)],
    placedTroops: [
      { instanceId: "pt1", troopId: "baby-dragon", level: 5, x: 2, y: 20, deployAt: 0 },
      { instanceId: "pt2", troopId: "dragon",      level: 3, x: 2, y: 21, deployAt: 0 },
    ],
  },
  {
    name: "2 Baby Dragons proches → non enragés ✓",
    useManualPlacement: true,
    troopSlots: [
      { slotId: "s1", troopId: "baby-dragon", level: 5, count: 2 },
    ],
    placed: [_d("d1", "cannon", 10, 21, 20)],
    placedTroops: [
      { instanceId: "pt1", troopId: "baby-dragon", level: 5, x: 2, y: 20, deployAt: 0 },
      { instanceId: "pt2", troopId: "baby-dragon", level: 5, x: 2, y: 22, deployAt: 0 },
    ],
  },

  // ── Electro Dragon tests ─────────────────────────────────────────────────
  {
    name: "E-Dragon — chaîne 5 cibles (chainMaxTargets=5)",
    troopSlots: [{ slotId: "s1", troopId: "electro-dragon", level: 4, count: 1 }],
    placed: [
      _d("d1", "cannon", 6, 16, 20),
      _d("d2", "cannon", 6, 19, 20),
      _d("d3", "cannon", 6, 22, 20),
      _d("d4", "cannon", 6, 25, 20),
      _d("d5", "cannon", 6, 28, 20),
    ],
  },
  {
    name: "E-Dragon — mort électrisante (6 éclairs)",
    troopSlots: [{ slotId: "s1", troopId: "electro-dragon", level: 2, count: 1 }],
    placed: [
      _d("d1", "cannon", 12, 16, 18),
      _d("d2", "cannon", 12, 22, 18),
      _d("d3", "cannon", 12, 28, 18),
      _d("d4", "air-defense", 8, 19, 23),
    ],
  },

  // ── Miner ────────────────────────────────────────────────────────────────
  {
    name: "Miner — invulnérable sous terre",
    troopSlots: [{ slotId: "s1", troopId: "miner", level: 5, count: 3 }],
    placed: [_d("d1", "cannon", 10, 21, 20), _d("d2", "archer-tower", 8, 15, 20)],
  },

  // ── Divers ───────────────────────────────────────────────────────────────
  {
    name: "Giant + 3 Healers vs Canon",
    troopSlots: [
      { slotId: "s1", troopId: "giant",  level: 7, count: 5 },
      { slotId: "s2", troopId: "healer", level: 4, count: 3 },
    ],
    placed: [_d("d1", "cannon", 12, 21, 20)],
  },
  {
    name: "Dragon splash 0.3 — bâtiments collés",
    troopSlots: [{ slotId: "s1", troopId: "dragon", level: 4, count: 2 }],
    placed: [
      _d("d1", "cannon", 8, 19, 20),
      _d("d2", "cannon", 8, 22, 20),
      _d("d3", "cannon", 8, 25, 20),
    ],
  },
  {
    name: "Air Defense vs Dragon (unité aérienne)",
    troopSlots: [{ slotId: "s1", troopId: "dragon", level: 4, count: 3 }],
    placed: [_d("d1", "air-defense", 10, 21, 20)],
  },
  {
    name: "Eagle Artillery — salve + 3 impacts au même endroit",
    troopSlots: [
      { slotId: "s1", troopId: "giant",  level: 5, count: 5 },
      { slotId: "s2", troopId: "archer", level: 6, count: 5 },
    ],
    placed: [_d("d1", "eagle-artillery", 4, 20, 19)],
  },
];

export default function SimulatorPanel() {
  const [troopSlots, setTroopSlots] = useState<TroopSlot[]>([
    { slotId: "ts-0", troopId: "giant", level: 5, count: 5 },
  ]);
  const [placed, setPlaced] = useState<PlacedDefense[]>([
    { instanceId: "di-0", defenseId: "cannon",       level: 10, x: 22, y: 15 },
    { instanceId: "di-1", defenseId: "archer-tower", level:  8, x: 30, y: 22 },
    { instanceId: "di-2", defenseId: "mortar",       level:  6, x: 14, y: 28 },
  ]);
  const [palLevels, setPalLevels] = useState<Record<string, number>>(PALETTE_DEFAULTS);
  const [placedBuildings, setPlacedBuildings] = useState<PlacedBuilding[]>([]);
  const [palBuildingLevels, setPalBuildingLevels] = useState<Record<string, number>>(BUILDING_PALETTE_LEVELS);
  const [result, setResult]       = useState<SimulationResult | null>(null);
  const [meta, setMeta]           = useState<TroopMeta[]>([]);
  const [cellSize, setCellSize]   = useState<number>(CELL);

  // ── Troop placement state ────────────────────────────────────────────────
  const [placementMode,  setPlacementMode]  = useState<boolean>(false);
  const [selectedSlotId, setSelectedSlotId] = useState<string | null>(null);
  const [placedTroops,   setPlacedTroops]   = useState<PlacedTroop[]>([]);

  // ── Replay state ────────────────────────────────────────────────────────────
  const [showReplay,      setShowReplay]      = useState<boolean>(false);
  // Wall placement
  const [placedWalls,  setPlacedWalls]  = useState<WallPlacement[]>([]);
  const [wallLevel,    setWallLevel]    = useState<number>(1);
  const [wallMode,     setWallMode]     = useState<boolean>(false);
  const [wallDragging, setWallDragging] = useState<boolean>(false);
  const [globalWallLevel, setGlobalWallLevel] = useState<number>(1);

  // Selection
  const [selectedId,   setSelectedId]   = useState<string | null>(null);
  const [selectedType, setSelectedType] = useState<"defense" | "building" | null>(null);

  // Drag ghost preview size (set when dragging from palette)
  const [dragItemSize, setDragItemSize] = useState<number>(1);

  const [showRanges,      setShowRanges]      = useState<boolean>(false);
  const [showHeatmap,     setShowHeatmap]     = useState<boolean>(false);
  const [debugMode,       setDebugMode]       = useState<boolean>(false);
  const [selectedTH,      setSelectedTH]      = useState<number>(15);
  const [placementError,  setPlacementError]  = useState<string | null>(null);
  const placementErrorTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Optimizer
  const [isOptimizing,       setIsOptimizing]       = useState<boolean>(false);
  const [optIterations,      setOptIterations]      = useState<number>(50);
  const [optStrategy,        setOptStrategy]        = useState<OptStrategy>("random");
  const [optimizationResult, setOptimizationResult] = useState<OptimizationResult | null>(null);
  const [replayPlaying,   setReplayPlaying]   = useState<boolean>(false);
  const [replayTime,      setReplayTime]      = useState<number>(0);
  const [replaySpeed,     setReplaySpeed]     = useState<1 | 2>(1);
  const [hpOnDamageOnly,  setHpOnDamageOnly]  = useState<boolean>(false);
  const rafRef       = useRef<number>(0);
  const lastTsRef    = useRef<number>(0);
  const speedRef     = useRef(replaySpeed);
  const durationRef  = useRef(0);

  useEffect(() => { speedRef.current = replaySpeed; }, [replaySpeed]);

  useEffect(() => {
    if (!replayPlaying) { cancelAnimationFrame(rafRef.current); return; }
    lastTsRef.current = 0;
    const tick = (ts: number) => {
      if (lastTsRef.current > 0) {
        const delta = (ts - lastTsRef.current) / 1000;
        setReplayTime((prev) => {
          const next = prev + delta * speedRef.current;
          if (next >= durationRef.current) { setReplayPlaying(false); return durationRef.current; }
          return next;
        });
      }
      lastTsRef.current = ts;
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [replayPlaying]);

  // Troop dots: position interpolated continuously; HP updated every 0.1 s (tick resolution).
  const replayDots = useMemo(() => {
    if (!showReplay || !result || !meta.length) return undefined;
    // Quantise to simulation tick (0.1 s) so HP changes are discrete, not gradual.
    const tickTime = Math.floor(replayTime * 10) / 10;
    return meta.flatMap((m) => {
      const tr = result.troops[m.instanceId];
      if (!tr) return [];
      const pos = interpolatePosition(tr.positionPerSecond, replayTime, tr.destroyedAt);
      if (!pos) return [];
      let hp = m.maxHp;
      for (const shot of result.shots) {
        if (shot.time > tickTime) break;
        const dx          = shot.troopPos.x - shot.defPos.x;
        const dy          = shot.troopPos.y - shot.defPos.y;
        const impactTime  = shot.time + Math.sqrt(dx * dx + dy * dy) / PROJECTILE_SPEED;
        if (impactTime > tickTime) continue;
        // Primary hit
        if (shot.targetInstId === m.instanceId) {
          hp -= shot.damage;
        }
        // Splash hit (mortar, wizard-tower, eagle-artillery, scattershot primary zone…)
        else if (shot.hitTargets.includes(m.instanceId)) {
          hp -= shot.damage;
        }
        // Scattershot residual cone (own travel time from impact point)
        if (shot.residualProjectiles) {
          for (const rp of shot.residualProjectiles) {
            if (rp.targetInstId !== m.instanceId) continue;
            const rdx = rp.to.x - rp.from.x;
            const rdy = rp.to.y - rp.from.y;
            const rpImpact = impactTime + Math.sqrt(rdx * rdx + rdy * rdy) / PROJECTILE_SPEED;
            if (rpImpact <= tickTime) hp -= rp.damage;
          }
        }
      }
      // Healing — applied at the exact tick it occurred in the simulation
      for (const ev of result.healEvents ?? []) {
        if (ev.time > tickTime) break;
        if (ev.targetInstId === m.instanceId) hp = Math.min(hp + ev.amount, m.maxHp);
      }
      const hpPct        = m.maxHp > 0 ? Math.max(0, Math.min(1, hp / m.maxHp)) : 0;
      const sIdx         = Math.floor(replayTime);
      const isUnderground = tr.undergroundPerSecond?.[sIdx] ?? false;
      let trailCx: number | undefined;
      let trailCy: number | undefined;
      if (isUnderground) {
        const trailStart = tr.positionPerSecond[sIdx];
        if (trailStart) {
          trailCx = (trailStart.x + 0.5) * cellSize;
          trailCy = (trailStart.y + 0.5) * cellSize;
        }
      }
      const isEnraged = tr.enragedPerSecond?.[sIdx] ?? false;
      return [{ id: m.instanceId, cx: (pos.x + 0.5) * cellSize, cy: (pos.y + 0.5) * cellSize, fill: m.colorHex, label: m.label, hpPct, isUnderground, trailCx, trailCy, isEnraged }];
    });
  }, [showReplay, result, meta, replayTime, cellSize]);

  // Set of defense instanceIds destroyed before current replay time
  const replayDestroyedIds = useMemo(() => {
    if (!showReplay || !result) return undefined;
    const ids = new Set<string>();
    for (const [id, dr] of Object.entries(result.defenses)) {
      if (dr.destroyedAt !== null && replayTime >= dr.destroyedAt) ids.add(id);
    }
    return ids;
  }, [showReplay, result, replayTime]);

  // Heal orbs in flight at replayTime
  const activeHealOrbs = useMemo(() => {
    if (!showReplay || !result?.heals?.length) return undefined;
    const out: { x: number; y: number }[] = [];
    for (const heal of result.heals) {
      if (heal.time > replayTime) break;
      const elapsed = replayTime - heal.time;
      const dx = heal.targetPos.x - heal.healerPos.x;
      const dy = heal.targetPos.y - heal.healerPos.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist === 0) continue;
      const travelTime = dist / PROJECTILE_SPEED;
      if (elapsed >= travelTime) continue;
      const t = elapsed / travelTime;
      out.push({
        x: (heal.healerPos.x + dx * t) * cellSize,
        y: (heal.healerPos.y + dy * t) * cellSize,
      });
    }
    return out.length ? out : undefined;
  }, [showReplay, result, replayTime, cellSize]);

  // Heal halos: expanding green ring at target position after orb impact
  const HEAL_HALO_DURATION = 0.35;
  const healHalos = useMemo(() => {
    if (!showReplay || !result?.heals?.length) return undefined;
    const out: { x: number; y: number; alpha: number }[] = [];
    for (const heal of result.heals) {
      if (heal.time > replayTime) break;
      const elapsed = replayTime - heal.time;
      const dx = heal.targetPos.x - heal.healerPos.x;
      const dy = heal.targetPos.y - heal.healerPos.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist === 0) continue;
      const afterImpact = elapsed - dist / PROJECTILE_SPEED;
      if (afterImpact < 0 || afterImpact > HEAL_HALO_DURATION) continue;
      out.push({
        x:     heal.targetPos.x * cellSize,
        y:     heal.targetPos.y * cellSize,
        alpha: 1 - afterImpact / HEAL_HALO_DURATION,
      });
    }
    return out.length ? out : undefined;
  }, [showReplay, result, replayTime, cellSize]);

  // Electro Dragon death lightning bolts
  const DEATH_BOLT_DURATION = 0.28;
  const activeDeathLightning = useMemo(() => {
    if (!showReplay || !result?.deathLightningEvents?.length) return undefined;
    const out: { x: number; y: number; topY: number; alpha: number; seed: number }[] = [];
    for (const ev of result.deathLightningEvents) {
      if (ev.time > replayTime) break;
      const age = replayTime - ev.time;
      if (age > DEATH_BOLT_DURATION) continue;
      const alpha = 1 - age / DEATH_BOLT_DURATION;
      out.push({
        x:    ev.position.x * cellSize,
        y:    ev.position.y * cellSize,
        topY: Math.max(0, (ev.position.y - 5) * cellSize), // bolt from 5 tiles above
        alpha,
        seed: ev.time * 200 + out.length * 17,
      });
    }
    return out.length ? out : undefined;
  }, [showReplay, result, replayTime, cellSize]);

  // Baby Dragon fireballs in flight
  const activeTroopFireballs = useMemo(() => {
    if (!showReplay || !result?.troopFireEvents?.length) return undefined;
    const out: { x: number; y: number }[] = [];
    for (const ev of result.troopFireEvents) {
      if (ev.time > replayTime) break;
      const elapsed = replayTime - ev.time;
      const dx = ev.to.x - ev.from.x;
      const dy = ev.to.y - ev.from.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist === 0) continue;
      const travelTime = dist / PROJECTILE_SPEED;
      if (elapsed >= travelTime) continue;
      const t = elapsed / travelTime;
      out.push({
        x: (ev.from.x + dx * t) * cellSize,
        y: (ev.from.y + dy * t) * cellSize,
      });
    }
    return out.length ? out : undefined;
  }, [showReplay, result, replayTime, cellSize]);

  // Electro Dragon chain links visible for ~0.35 s after firing
  const CHAIN_DURATION = 0.35;
  const activeChainLinks = useMemo(() => {
    if (!showReplay || !result?.chainEvents?.length) return undefined;
    const out: { x1: number; y1: number; x2: number; y2: number; alpha: number }[] = [];
    for (const ev of result.chainEvents) {
      if (ev.time > replayTime) break;
      const age = replayTime - ev.time;
      if (age > CHAIN_DURATION) continue;
      const alpha = 1 - age / CHAIN_DURATION;
      for (const link of ev.links) {
        out.push({
          x1: link.from.x * cellSize, y1: link.from.y * cellSize,
          x2: link.to.x   * cellSize, y2: link.to.y   * cellSize,
          alpha,
        });
      }
    }
    return out.length ? out : undefined;
  }, [showReplay, result, replayTime, cellSize]);

  // Projectiles currently in flight at replayTime
  const activeProjectiles = useMemo(() => {
    if (!showReplay || !result?.shots?.length) return undefined;
    const out: {
      x: number; y: number;
      color: string; defenseId: string;
      progress: number; angle: number;
    }[] = [];
    for (const shot of result.shots) {
      if (shot.time > replayTime) break;
      const elapsed = replayTime - shot.time;
      // Eagle Artillery: projectiles fall from the sky above the impact point.
      const startPos = shot.defenseId === "eagle-artillery"
        ? { x: shot.troopPos.x - 1, y: shot.troopPos.y - 7 }
        : shot.defPos;
      const dx  = shot.troopPos.x - startPos.x;
      const dy  = shot.troopPos.y - startPos.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist === 0) continue;
      const travelTime = dist / PROJECTILE_SPEED;
      if (elapsed >= travelTime) continue;
      const t = elapsed / travelTime;
      out.push({
        x:         (startPos.x + dx * t) * cellSize,
        y:         (startPos.y + dy * t) * cellSize,
        color:     DEFENSE_FILL[shot.defenseId] ?? "#ffffff",
        defenseId: shot.defenseId,
        progress:  t,
        angle:     Math.atan2(dy, dx) * (180 / Math.PI),
      });
    }
    return out;
  }, [showReplay, result, replayTime, cellSize]);

  // Impact flashes: ring that expands and fades at the moment a shot lands
  const FLASH_DURATION = 0.15; // simulation seconds
  const impactFlashes = useMemo(() => {
    if (!showReplay || !result?.shots?.length) return undefined;
    const out: { x: number; y: number; color: string; defenseId: string; alpha: number }[] = [];
    for (const shot of result.shots) {
      if (shot.time > replayTime) break;
      const elapsed    = replayTime - shot.time;
      const dx         = shot.troopPos.x - shot.defPos.x;
      const dy         = shot.troopPos.y - shot.defPos.y;
      const dist       = Math.sqrt(dx * dx + dy * dy);
      if (dist === 0) continue;
      const travelTime = dist / PROJECTILE_SPEED;
      const afterImpact = elapsed - travelTime;
      if (afterImpact < 0 || afterImpact > FLASH_DURATION) continue;
      out.push({
        x:         shot.troopPos.x * cellSize,
        y:         shot.troopPos.y * cellSize,
        color:     DEFENSE_FILL[shot.defenseId] ?? "#ffffff",
        defenseId: shot.defenseId,
        alpha:     1 - afterImpact / FLASH_DURATION,
      });
    }
    return out.length ? out : undefined;
  }, [showReplay, result, replayTime, cellSize]);

  // Inferno Tower beams: one entry per target per active Inferno Tower
  const infernoBeams = useMemo(() => {
    if (!showReplay || !result?.shots?.length) return undefined;
    const INFERNO_BEAM_TTL = 0.3; // s — beam disappears after this long without a shot
    const beams: { x1: number; y1: number; x2: number; y2: number; stage: 0|1|2 }[] = [];

    // Group shots by defense instance, look for recent Inferno activity
    const lastShotByDef = new Map<string, { shot: (typeof result.shots)[0]; lockDuration: number }>();
    for (const shot of result.shots) {
      if (shot.time > replayTime) break;
      if (shot.defenseId !== "inferno-tower") continue;
      const prev = lastShotByDef.get(shot.defInstId);
      if (!prev || prev.shot.targetInstId !== shot.targetInstId) {
        // Target changed: reset lock
        lastShotByDef.set(shot.defInstId, { shot, lockDuration: 0.128 });
      } else {
        lastShotByDef.set(shot.defInstId, { shot, lockDuration: prev.lockDuration + 0.128 });
      }
    }

    for (const [, { shot, lockDuration }] of lastShotByDef) {
      if (replayTime - shot.time > INFERNO_BEAM_TTL) continue; // beam expired
      // Troop current position
      const tr = result.troops[shot.targetInstId];
      if (!tr) continue;
      const troopPos = interpolatePosition(tr.positionPerSecond, replayTime, tr.destroyedAt);
      if (!troopPos) continue;
      const stage: 0|1|2 = lockDuration >= 5.25 ? 2 : lockDuration >= 1.5 ? 1 : 0;
      beams.push({
        x1: shot.defPos.x  * cellSize,
        y1: shot.defPos.y  * cellSize,
        x2: (troopPos.x + 0.5) * cellSize,
        y2: (troopPos.y + 0.5) * cellSize,
        stage,
      });
    }
    return beams.length ? beams : undefined;
  }, [showReplay, result, replayTime, cellSize]);

  // Lines from each alive troop to its current target defense during replay
  const targetLines = useMemo(() => {
    if (!showReplay || !result || !meta.length) return undefined;
    const s = Math.floor(replayTime);
    return meta.flatMap((m) => {
      const tr = result.troops[m.instanceId];
      if (!tr) return [];
      const pos = interpolatePosition(tr.positionPerSecond, replayTime, tr.destroyedAt);
      if (!pos) return [];
      const targetDefId = tr.targetPerSecond[Math.min(s, tr.targetPerSecond.length - 1)];
      if (!targetDefId) return [];
      const defense = placed.find((d) => d.instanceId === targetDefId);
      if (!defense) return [];
      const size = DEFENSES.find((def) => def.id === defense.defenseId)?.size ?? 1;
      return [{
        x1: (pos.x + 0.5) * cellSize,
        y1: (pos.y + 0.5) * cellSize,
        x2: (defense.x + size / 2) * cellSize,
        y2: (defense.y + size / 2) * cellSize,
        color: m.colorHex,
      }];
    });
  }, [showReplay, result, meta, placed, replayTime, cellSize]);

  const totalTroops = troopSlots.reduce((s, sl) => s + sl.count, 0);

  // ── Heatmap DPS : un Float32Array normalisé [0..1] par case ──────────────
  const heatmapData = useMemo((): Float32Array | null => {
    if (!showHeatmap || !placed.length) return null;
    const N = GRID_SIZE;
    const grid = new Float32Array(N * N);
    let maxVal = 0;
    for (const d of placed) {
      const defData = DEFENSES.find((x) => x.id === d.defenseId);
      if (!defData) continue;
      const lvl = defData.levels.find((l) => l.level === d.level);
      if (!lvl) continue;
      const sz = defData.size ?? 1;
      const cx = d.x + sz / 2;
      const cy = d.y + sz / 2;
      const { maxRange, minRange, dps } = lvl as { maxRange: number; minRange: number; dps: number };
      const r0 = Math.max(0, Math.floor(cy - maxRange));
      const r1 = Math.min(N - 1, Math.ceil(cy + maxRange));
      const c0 = Math.max(0, Math.floor(cx - maxRange));
      const c1 = Math.min(N - 1, Math.ceil(cx + maxRange));
      for (let ty = r0; ty <= r1; ty++) {
        for (let tx = c0; tx <= c1; tx++) {
          const dist = Math.hypot(tx + 0.5 - cx, ty + 0.5 - cy);
          if (dist >= minRange && dist <= maxRange) {
            const v = grid[ty * N + tx] + dps;
            grid[ty * N + tx] = v;
            if (v > maxVal) maxVal = v;
          }
        }
      }
    }
    if (maxVal === 0) return null;
    for (let i = 0; i < grid.length; i++) grid[i] /= maxVal;
    return grid;
  }, [showHeatmap, placed]);

  // ── Analyse post-simulation ───────────────────────────────────────────────
  const analysisStats = useMemo(() => {
    if (!result) return null;
    const defsByDamage = Object.entries(result.defenses)
      .filter(([, dr]) => dr.totalDamageDealt > 0)
      .map(([id, dr]) => {
        const p = placed.find((d) => d.instanceId === id);
        const name = p ? (DEFENSES.find((d) => d.id === p.defenseId)?.name ?? p.defenseId) : id;
        return { id, name, damage: Math.round(dr.totalDamageDealt) };
      })
      .sort((a, b) => b.damage - a.damage);

    const targetCounts: Record<string, number> = {};
    for (const tc of result.targetChanges) {
      if (tc.newTargetId) targetCounts[tc.newTargetId] = (targetCounts[tc.newTargetId] ?? 0) + 1;
    }
    const mostTargetedId = Object.entries(targetCounts).sort((a, b) => b[1] - a[1])[0]?.[0];
    const mostTargetedMeta = meta.find((m) => m.instanceId === mostTargetedId);

    const deadTroops = Object.entries(result.troops)
      .filter(([, tr]) => tr.destroyedAt !== null)
      .map(([id, tr]) => ({ label: meta.find((m) => m.instanceId === id)?.label ?? id, time: tr.destroyedAt! }))
      .sort((a, b) => a.time - b.time);

    const avgDeathTime = deadTroops.length
      ? Math.round((deadTroops.reduce((s, x) => s + x.time, 0) / deadTroops.length) * 10) / 10
      : null;

    return { defsByDamage, mostTargeted: mostTargetedMeta ? { name: mostTargetedMeta.label, count: targetCounts[mostTargetedId!] } : null, deadTroops, avgDeathTime, totalDead: deadTroops.length, totalTroopsCount: Object.keys(result.troops).length };
  }, [result, placed, meta]);

  function clearResult() {
    setResult(null); setMeta([]);
    setShowReplay(false); setReplayPlaying(false); setReplayTime(0);
  }

  function showError(msg: string) {
    setPlacementError(msg);
    if (placementErrorTimer.current) clearTimeout(placementErrorTimer.current);
    placementErrorTimer.current = setTimeout(() => setPlacementError(null), 3000);
  }

  // Single source of truth for occupied tiles — rebuilt on every layout change.
  const occupation = useMemo(
    () => buildOccupation(placed, placedBuildings, placedWalls),
    [placed, placedBuildings, placedWalls],
  );

  function handleSelect(id: string | null, type: "defense" | "building" | null) {
    setSelectedId(id);
    setSelectedType(type);
  }

  function handleDeleteSelected() {
    if (!selectedId) return;
    if (selectedType === "defense") {
      setPlaced((p) => p.filter((d) => d.instanceId !== selectedId));
    } else if (selectedType === "building") {
      setPlacedBuildings((p) => p.filter((b) => b.instanceId !== selectedId));
    }
    setSelectedId(null);
    setSelectedType(null);
    clearResult();
  }

  function handleSelectedLevelChange(newLevel: number) {
    if (!selectedId) return;
    if (selectedType === "defense") {
      setPlaced((p) => p.map((d) => d.instanceId === selectedId ? { ...d, level: newLevel } : d));
    } else if (selectedType === "building") {
      setPlacedBuildings((p) => p.map((b) => b.instanceId === selectedId ? { ...b, level: newLevel } : b));
    }
    clearResult();
  }

  function handleApplyGlobalWallLevel() {
    setPlacedWalls((prev) => prev.map((w) => ({ ...w, level: globalWallLevel })));
    clearResult();
  }

  function handleLoadPreset(preset: BasePreset) {
    if (placed.length > 0 || placedBuildings.length > 0 || placedWalls.length > 0) {
      if (!window.confirm(`Charger "${preset.name}" ? La base actuelle sera effacée.`)) return;
    }
    setPlaced(preset.defenses.map((d) => ({
      instanceId: d.instanceId,
      defenseId:  d.defenseId,
      level:      d.level,
      x:          d.x,
      y:          d.y,
      ...(d.mode ? { mode: d.mode } : {}),
    })));
    setPlacedBuildings(preset.buildings.map((b) => ({
      instanceId: b.instanceId,
      buildingId: b.buildingId,
      level:      b.level,
      x:          b.x,
      y:          b.y,
    })));
    setPlacedWalls(preset.walls);
    setSelectedId(null);
    setSelectedType(null);
    clearResult();
  }

  function loadScenario(s: TestScenario) {
    setTroopSlots(s.troopSlots);
    setPlaced(s.placed);
    setPlacedBuildings(s.placedBuildings ?? []);
    setPlacedTroops(s.placedTroops ?? []);
    setPlacementMode(s.useManualPlacement ?? false);
    clearResult();
  }

  function handlePlaceTroop(x: number, y: number) {
    if (!selectedSlotId) return;
    if (!isValidDeployTile(x, y, placed)) return;
    // Check tile not already occupied by another placed troop
    if (placedTroops.some((t) => t.x === x && t.y === y)) return;
    const slot = troopSlots.find((s) => s.slotId === selectedSlotId);
    if (!slot) return;
    setPlacedTroops((prev) => [...prev, {
      instanceId: `pt-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      troopId:    slot.troopId,
      level:      slot.level,
      x, y,
      deployAt: 0,
    }]);
    clearResult();
  }

  function handleRemovePlacedTroop(instanceId: string) {
    setPlacedTroops((prev) => prev.filter((t) => t.instanceId !== instanceId));
    clearResult();
  }

  function handleUpdateTroopTiming(instanceId: string, deployAt: number) {
    setPlacedTroops((prev) => prev.map((t) =>
      t.instanceId === instanceId ? { ...t, deployAt: Math.max(0, deployAt) } : t
    ));
    clearResult();
  }

  // Troop handlers
  function updateTroopSlot(slotId: string, patch: Partial<Omit<TroopSlot, "slotId">>) {
    setTroopSlots((prev) => prev.map((s) => {
      if (s.slotId !== slotId) return s;
      const next = { ...s, ...patch };
      if (patch.troopId && patch.troopId !== s.troopId) {
        const t = TROOPS.find((t) => t.id === patch.troopId)!;
        next.level = Math.min(s.level, t.levels.length);
      }
      return next;
    }));
    clearResult();
  }

  function addTroopSlot() {
    if (troopSlots.length >= MAX_TROOP_SLOTS) return;
    setTroopSlots((p) => [...p, { slotId: `ts-${Date.now()}`, troopId: "barbarian", level: 1, count: 3 }]);
    clearResult();
  }

  function removeTroopSlot(slotId: string) {
    if (troopSlots.length <= 1) return;
    setTroopSlots((p) => p.filter((s) => s.slotId !== slotId));
    clearResult();
  }

  // Defense handlers
  function handlePlace(x: number, y: number, defenseId: string, level: number) {
    const size = entitySize(defenseId);
    if (!inBounds(x, y, size) || !isFree(occupation, x, y, size)) return;
    if (placed.length >= getTotalDefenseLimit(selectedTH)) return;
    // TH-level limit check
    const limit   = getDefenseLimit(selectedTH, defenseId);
    const current = placed.filter((d) => d.defenseId === defenseId).length;
    if (limit === 0) {
      const name = DEFENSES.find((d) => d.id === defenseId)?.name ?? defenseId;
      showError(`${name} non disponible au HDV ${selectedTH}`);
      return;
    }
    if (current >= limit) {
      const name = DEFENSES.find((d) => d.id === defenseId)?.name ?? defenseId;
      showError(`Limite atteinte : ${current}/${limit} ${name} pour HDV ${selectedTH}`);
      return;
    }
    const defaultMode =
      defenseId === "inferno-tower" ? "multi" :
      defenseId === "x-bow"         ? "ground" : undefined;
    setPlaced((prev) => [...prev, { instanceId: `d-${Date.now()}`, defenseId, level, x, y, mode: defaultMode }]);
    clearResult();
  }

  function handleModeToggle(instanceId: string) {
    setPlaced((prev) => prev.map((d) => {
      if (d.instanceId !== instanceId) return d;
      if (d.defenseId === "inferno-tower") {
        return { ...d, mode: d.mode === "single" ? "multi" : "single" };
      }
      if (d.defenseId === "x-bow") {
        return { ...d, mode: d.mode === "both" ? "ground" : "both" };
      }
      return d;
    }));
    clearResult();
  }

  function handleRemove(instanceId: string) {
    setPlaced((p) => p.filter((d) => d.instanceId !== instanceId));
    clearResult();
  }

  function handlePlaceBuilding(x: number, y: number, buildingId: string, level: number) {
    const size = entitySize(buildingId);
    if (!inBounds(x, y, size) || !isFree(occupation, x, y, size)) return;
    if (placedBuildings.length >= MAX_BUILDINGS) return;
    setPlacedBuildings((prev) => [...prev, { instanceId: `nb-${Date.now()}`, buildingId, level, x, y }]);
    clearResult();
  }

  function handleRemoveBuilding(instanceId: string) {
    setPlacedBuildings((p) => p.filter((b) => b.instanceId !== instanceId));
    clearResult();
  }

  function handleMoveBuilding(instanceId: string, toX: number, toY: number) {
    const bld = placedBuildings.find((b) => b.instanceId === instanceId);
    if (!bld) return;
    const size = entitySize(bld.buildingId);
    if (!inBounds(toX, toY, size)) return;

    // Occupation excluding the moving building
    const mapWithout = buildOccupation(placed, placedBuildings.filter((b) => b.instanceId !== instanceId), placedWalls);

    if (isFree(mapWithout, toX, toY, size)) {
      setPlacedBuildings((prev) => prev.map((b) => b.instanceId === instanceId ? { ...b, x: toX, y: toY } : b));
    } else {
      // Swap with a single building occupant
      const occs = occupantsOf(mapWithout, toX, toY, size);
      if (occs.length !== 1) return;
      const otherId  = occs[0];
      const other    = placedBuildings.find((b) => b.instanceId === otherId);
      if (!other) return; // occupied by defense or wall — no swap
      const otherSize = entitySize(other.buildingId);
      const mapWithoutBoth = buildOccupation(
        placed,
        placedBuildings.filter((b) => b.instanceId !== instanceId && b.instanceId !== otherId),
        placedWalls,
      );
      if (!inBounds(bld.x, bld.y, otherSize) || !isFree(mapWithoutBoth, bld.x, bld.y, otherSize)) return;
      setPlacedBuildings((prev) => prev.map((b) => {
        if (b.instanceId === instanceId) return { ...b, x: toX,  y: toY  };
        if (b.instanceId === otherId)    return { ...b, x: bld.x, y: bld.y };
        return b;
      }));
    }
    setReplayPlaying(false); setShowReplay(false); setResult(null); setMeta([]);
  }

  function handleMove(instanceId: string, toX: number, toY: number) {
    const defense = placed.find((d) => d.instanceId === instanceId);
    if (!defense) return;
    const size = entitySize(defense.defenseId);
    if (!inBounds(toX, toY, size)) return;

    // Occupation excluding the moving defense
    const mapWithout = buildOccupation(placed.filter((d) => d.instanceId !== instanceId), placedBuildings, placedWalls);

    if (isFree(mapWithout, toX, toY, size)) {
      setPlaced((prev) => prev.map((d) => d.instanceId === instanceId ? { ...d, x: toX, y: toY } : d));
    } else {
      // Swap with a single defense occupant
      const occs = occupantsOf(mapWithout, toX, toY, size);
      if (occs.length !== 1) return;
      const otherId   = occs[0];
      const other     = placed.find((d) => d.instanceId === otherId);
      if (!other) return; // occupied by building or wall — no swap
      const otherSize = entitySize(other.defenseId);
      const mapWithoutBoth = buildOccupation(
        placed.filter((d) => d.instanceId !== instanceId && d.instanceId !== otherId),
        placedBuildings, placedWalls,
      );
      if (!inBounds(defense.x, defense.y, otherSize) || !isFree(mapWithoutBoth, defense.x, defense.y, otherSize)) return;
      setPlaced((prev) => prev.map((d) => {
        if (d.instanceId === instanceId) return { ...d, x: toX,      y: toY      };
        if (d.instanceId === otherId)    return { ...d, x: defense.x, y: defense.y };
        return d;
      }));
    }
    setReplayPlaying(false); setShowReplay(false); setResult(null); setMeta([]);
  }

  function handleSimulate() {
    if (!placed.length && !placedBuildings.length) return;
    setShowReplay(false);
    setReplayPlaying(false);
    setReplayTime(0);
    let deployments; let m;
    if (placementMode) {
      if (!placedTroops.length) return;
      ({ deployments, meta: m } = buildManualDeployments(placedTroops, troopSlots));
    } else {
      if (!totalTroops) return;
      ({ deployments, meta: m } = buildDeployments(troopSlots));
    }
    setMeta(m);
    const r = simulateAttack(
      deployments,
      buildDefensePlacements(placed),
      buildNeutralBuildingPlacements(placedBuildings),
      placedWalls,
    );
    durationRef.current = r.durationSeconds;
    setResult(r);
  }

  async function handleOptimize() {
    if ((!placed.length && !placedBuildings.length) || !totalTroops) return;
    setIsOptimizing(true);
    setOptimizationResult(null);
    // Yield to React so the spinner renders before the blocking loop
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    try {
      const templates: TroopTemplate[] = troopSlots.flatMap((slot) =>
        Array.from({ length: slot.count }, (_, i) => ({
          instanceId: `opt-${slot.slotId}-${i}`,
          troopId:    slot.troopId,
          level:      slot.level,
        })),
      );
      const optResult = createBestDeployment(
        templates,
        buildDefensePlacements(placed),
        buildNeutralBuildingPlacements(placedBuildings),
        { iterations: optIterations, strategy: optStrategy },
        placedWalls,
      );
      setOptimizationResult(optResult);
      // Apply best deployment as manual placement
      const bestTroops: PlacedTroop[] = optResult.best.deployments.map((d) => ({
        instanceId: d.instanceId,
        troopId:    d.troopId,
        level:      d.level,
        x:          d.dropPosition.x,
        y:          d.dropPosition.y,
        deployAt:   d.deployAt ?? 0,
      }));
      setPlacedTroops(bestTroops);
      setPlacementMode(true);
      clearResult();
    } finally {
      setIsOptimizing(false);
    }
  }

  function startReplay() {
    setReplayTime(0);
    setReplayPlaying(true);
    setShowReplay(true);
  }

  const survivors = result
    ? Object.values(result.troops).filter((t) => t.destroyedAt === null).length
    : 0;

  return (
    <div className="mx-auto max-w-6xl px-6 py-10 space-y-8">

      {/* Header */}
      <header className="space-y-1">
        <h1 className="text-4xl font-bold tracking-tight text-cyan-400">RaidSense</h1>
        <p className="text-sm text-slate-400">Simulateur d&apos;attaque Clash of Clans</p>
      </header>

      {/* Grid + sidebar */}
      <div className="flex flex-col gap-6 lg:flex-row lg:items-start">

        {/* Grid */}
        <div className="min-w-0 flex-1 space-y-2" style={{ maxWidth: 560 }}>
          <p className="text-xs text-slate-500">
            {wallMode
              ? "Mode mur : cliquer/glisser pour poser · cliquer sur mur existant pour supprimer"
              : "Glisser une défense depuis le panneau → poser sur la grille · Cliquer pour supprimer"}
          </p>
          {/* View toggles */}
          <div className="flex gap-1.5 flex-wrap">
            {([
              { key: "ranges",  label: "◎ Portées",  active: showRanges,  set: setShowRanges,  color: "blue"   },
              { key: "heatmap", label: "▦ Heatmap",  active: showHeatmap, set: setShowHeatmap, color: "red"    },
              { key: "debug",   label: "⚙ Debug",    active: debugMode,   set: setDebugMode,   color: "yellow" },
            ] as const).map(({ key, label, active, set, color }) => (
              <button key={key} onClick={() => set((v) => !v)}
                className={`px-2.5 py-1 rounded-lg border text-xs font-medium transition-colors ${
                  active
                    ? color === "blue"   ? "border-blue-500/60 bg-blue-500/15 text-blue-300"
                    : color === "red"    ? "border-red-500/60 bg-red-500/15 text-red-300"
                                        : "border-yellow-500/60 bg-yellow-500/15 text-yellow-300"
                    : "border-slate-700 text-slate-500 hover:text-slate-300"
                }`}
              >{label}</button>
            ))}
          </div>
          <BattleGrid
            placed={placed}
            onPlace={handlePlace}
            onRemove={handleRemove}
            onMove={handleMove}
            onModeToggle={handleModeToggle}
            placedBuildings={placedBuildings}
            onPlaceBuilding={handlePlaceBuilding}
            onRemoveBuilding={handleRemoveBuilding}
            onMoveBuilding={handleMoveBuilding}
            placementMode={placementMode}
            placedTroops={placedTroops}
            onPlaceTroop={handlePlaceTroop}
            onRemovePlacedTroop={handleRemovePlacedTroop}
            troopSlots={troopSlots}
            selectedSlotId={selectedSlotId}
            replayDots={replayDots}
            replayDestroyedIds={replayDestroyedIds}
            activeProjectiles={activeProjectiles}
            impactFlashes={impactFlashes}
            infernoBeams={infernoBeams}
            activeHealOrbs={activeHealOrbs}
            healHalos={healHalos}
            activeChainLinks={activeChainLinks}
            activeDeathLightning={activeDeathLightning}
            activeTroopFireballs={activeTroopFireballs}
            targetLines={targetLines}
            onCellSizeChange={setCellSize}
            result={result}
            replayTime={replayTime}
            hpOnDamageOnly={hpOnDamageOnly}
            showAllRanges={showRanges}
            heatmapData={heatmapData}
            debugMode={debugMode}
            selectedId={selectedId}
            onSelectElement={handleSelect}
            onDeleteSelected={handleDeleteSelected}
            dragGhostSize={dragItemSize}
            onDragEnd={() => setDragItemSize(1)}
            occupationMap={occupation}
            onDragEntityStart={(sz) => setDragItemSize(sz)}
            wallMode={wallMode}
            wallLevel={wallLevel}
            placedWalls={placedWalls}
            onPlaceWall={(x, y) => {
              // Unified check: occupation map already covers defenses + buildings + existing walls
              if (!isFree(occupation, x, y, 1)) return;
              // Troops are not in the occupation map — check separately
              if (placedTroops.some((t) => t.x === x && t.y === y)) return;
              const key = `${x},${y}`;
              setPlacedWalls((prev) => [...prev, { instanceId: `w-${key}-${Date.now()}`, x, y, level: wallLevel }]);
              clearResult();
            }}
            onRemoveWall={(id) => { setPlacedWalls((prev) => prev.filter((w) => w.instanceId !== id)); clearResult(); }}
            onWallDragState={setWallDragging}
          />
          {/* Selected element panel */}
          {selectedId && (() => {
            const def = placed.find((d) => d.instanceId === selectedId);
            const bld = !def ? placedBuildings.find((b) => b.instanceId === selectedId) : null;
            if (!def && !bld) return null;
            const name    = def ? (DEFENSES.find((d) => d.id === def.defenseId)?.name ?? def.defenseId) : (NEUTRAL_BUILDINGS.find((nb) => nb.id === bld!.buildingId)?.name ?? bld!.buildingId);
            const size    = def ? (DEFENSES.find((d) => d.id === def.defenseId)?.size ?? 1) : (NEUTRAL_BUILDINGS.find((nb) => nb.id === bld!.buildingId)?.size ?? 1);
            const curLv   = def ? def.level : bld!.level;
            const maxLv   = def ? (DEFENSES.find((d) => d.id === def.defenseId)?.levels.length ?? 1) : (NEUTRAL_BUILDINGS.find((nb) => nb.id === bld!.buildingId)?.levels.length ?? 1);
            const pos     = def ? `(${def.x},${def.y})` : `(${bld!.x},${bld!.y})`;
            return (
              <div className="rounded-xl border border-purple-500/40 bg-purple-950/20 px-3 py-2 text-xs flex items-center gap-3 flex-wrap">
                <span className="text-purple-300 font-semibold">✦ {name}</span>
                <span className="text-slate-400">{pos} · {size}×{size}</span>
                <span className="text-slate-500">Lv</span>
                <select
                  value={curLv}
                  onChange={(e) => handleSelectedLevelChange(Number(e.target.value))}
                  className="bg-[#0d0d1a] text-purple-200 border border-purple-700/50 rounded px-1.5 py-0.5"
                >
                  {Array.from({ length: maxLv }, (_, i) => i + 1).map((lv) => (
                    <option key={lv} value={lv}>{lv}</option>
                  ))}
                </select>
                <button onClick={handleDeleteSelected}
                  className="ml-auto text-red-400 hover:text-red-300 px-2 py-0.5 rounded border border-red-800/40 hover:border-red-600/60">
                  ✕ Supprimer
                </button>
                <button onClick={() => handleSelect(null, null)}
                  className="text-slate-500 hover:text-slate-300">✕</button>
              </div>
            );
          })()}
          <p className="text-xs text-slate-600">
            Grille {GRID_SIZE}×{GRID_SIZE} &nbsp;·&nbsp;
            {placementMode
              ? `zone dorée = déploiement · ${placedTroops.length} troupe${placedTroops.length !== 1 ? "s" : ""} placée${placedTroops.length !== 1 ? "s" : ""}`
              : `${placed.length}/${MAX_DEFENSES} défenses`}
          </p>
        </div>

        {/* Sidebar */}
        <div className="flex-1 space-y-4" style={{ minWidth: 300 }}>

          {/* HDV selector */}
          <section className="rounded-2xl border border-[#141a30] bg-[#06080f] p-4 space-y-2">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-300">Niveau HDV actif</h2>
              <span className="text-xs text-slate-500">{placed.length}/{getTotalDefenseLimit(selectedTH)} défenses</span>
            </div>
            <div className="flex flex-wrap gap-1">
              {Array.from({ length: 15 }, (_, i) => i + 1).map((lv) => (
                <button
                  key={lv}
                  onClick={() => { setSelectedTH(lv); setPlacementError(null); }}
                  className={`w-8 h-7 rounded text-xs font-bold transition-colors border ${
                    selectedTH === lv
                      ? "border-cyan-400/70 bg-cyan-500/20 text-cyan-200"
                      : "border-slate-700 text-slate-400 hover:text-slate-200 hover:border-slate-500"
                  }`}
                >{lv}</button>
              ))}
            </div>
            {/* Error message */}
            {placementError && (
              <p className="text-xs text-red-400 bg-red-950/30 border border-red-800/40 rounded px-2 py-1">
                ✕ {placementError}
              </p>
            )}
          </section>

          {/* Defense palette */}
          <section className="rounded-2xl border border-[#141a30] bg-[#06080f] p-5 space-y-3">
            <h2 className="text-base font-semibold text-slate-100">Défenses</h2>
            <DefensePalette
              palLevels={palLevels}
              onLevelChange={(id, lv) => setPalLevels((p) => ({ ...p, [id]: lv }))}
              cellSize={cellSize}
              onDragItemStart={(sz) => setDragItemSize(sz)}
              placedCounts={Object.fromEntries(
                DEFENSES.map((d) => [d.id, placed.filter((p) => p.defenseId === d.id).length])
              )}
              thLimits={TH_DEFENSE_LIMITS[selectedTH] as Record<string, number> ?? {}}
            />
          </section>

          {/* Neutral building palette */}
          <section className="rounded-2xl border border-[#141a30] bg-[#06080f] p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-slate-100">Bâtiments</h2>
              <span className="text-xs text-slate-500">{placedBuildings.length}/{MAX_BUILDINGS} sur la grille</span>
            </div>
            <BuildingPalette
              palLevels={palBuildingLevels}
              onLevelChange={(id, lv) => setPalBuildingLevels((p) => ({ ...p, [id]: lv }))}
              cellSize={cellSize}
              onDragItemStart={(sz) => setDragItemSize(sz)}
            />
          </section>

          {/* Wall placement */}
          <section className="rounded-2xl border border-[#141a30] bg-[#06080f] p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-slate-100">Murs</h2>
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-500">{placedWalls.length} posés</span>
                <button
                  onClick={() => { setWallMode((m) => !m); clearResult(); }}
                  className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition-colors ${
                    wallMode
                      ? "bg-amber-500/20 border border-amber-500/40 text-amber-300"
                      : "bg-slate-700/40 border border-slate-600/40 text-slate-400 hover:text-slate-200"
                  }`}
                >{wallMode ? "✓ Mode mur" : "Mode mur"}</button>
              </div>
            </div>
            {/* Level selector */}
            <div className="space-y-1">
              <p className="text-xs text-slate-500">Niveau ({wallLevel})</p>
              <div className="flex flex-wrap gap-1">
                {Array.from({ length: MAX_WALL_LEVEL }, (_, i) => i + 1).map((lv) => (
                  <button key={lv}
                    onClick={() => setWallLevel(lv)}
                    title={`Lv${lv} — ${WALL_HP[lv]} HP`}
                    className={`w-7 h-7 rounded text-xs font-bold transition-colors border ${
                      wallLevel === lv
                        ? "border-amber-400/60 bg-amber-500/20 text-amber-200"
                        : "border-slate-700 text-slate-400 hover:text-slate-200"
                    }`}
                  >{lv}</button>
                ))}
              </div>
            </div>
            {/* Niveau global */}
            {placedWalls.length > 0 && (
              <div className="flex items-center gap-2 pt-1 border-t border-slate-800">
                <span className="text-xs text-slate-500 flex-shrink-0">Appliquer Lv</span>
                <select
                  value={globalWallLevel}
                  onChange={(e) => setGlobalWallLevel(Number(e.target.value))}
                  className="text-xs bg-[#0d0d1a] text-amber-300 border border-slate-700 rounded px-1 py-0.5 flex-1"
                >
                  {Array.from({ length: MAX_WALL_LEVEL }, (_, i) => i + 1).map((lv) => (
                    <option key={lv} value={lv}>{lv}</option>
                  ))}
                </select>
                <button onClick={handleApplyGlobalWallLevel}
                  className="text-xs px-2 py-1 rounded bg-amber-800/40 hover:bg-amber-700/50 text-amber-300 border border-amber-700/40">
                  ↻ Tous
                </button>
                <button onClick={() => { setPlacedWalls([]); clearResult(); }}
                  className="text-xs text-red-400 hover:text-red-300">✕</button>
              </div>
            )}
          </section>

          {/* Troop composer */}
          <section className="rounded-2xl border border-[#141a30] bg-[#06080f] p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-slate-100">Troupes</h2>
              <button
                onClick={() => { setPlacementMode((p) => !p); setSelectedSlotId(null); clearResult(); }}
                className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition-colors ${
                  placementMode
                    ? "bg-cyan-500 text-black"
                    : "border border-[#1e2a45] text-slate-400 hover:border-slate-500"
                }`}
              >
                {placementMode ? "✓ Placement manuel" : "Placement manuel"}
              </button>
            </div>
            {!placementMode && (
              <TroopComposer
                slots={troopSlots}
                totalCount={totalTroops}
                onUpdate={updateTroopSlot}
                onAdd={addTroopSlot}
                onRemove={removeTroopSlot}
              />
            )}
            {placementMode && (
              <TroopPlacementPanel
                slots={troopSlots}
                selectedSlotId={selectedSlotId}
                onSelectSlot={setSelectedSlotId}
                placedTroops={placedTroops}
                onRemoveTroop={handleRemovePlacedTroop}
                onUpdateTiming={handleUpdateTroopTiming}
              />
            )}
          </section>

        </div>
      </div>

      {/* ── Optimiseur de placement ──────────────────────────────────────── */}
      {(placed.length > 0 || placedBuildings.length > 0) && totalTroops > 0 && (
        <div className="rounded-xl border border-purple-800/50 bg-purple-950/20 p-3 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-purple-300">⚡ Optimiseur de placement</span>
            <select
              value={optIterations}
              onChange={(e) => setOptIterations(Number(e.target.value))}
              className="text-xs bg-[#0d0d1a] text-purple-300 border border-purple-800/60 rounded px-1.5 py-0.5"
            >
              {[20, 50, 100, 200].map((n) => (
                <option key={n} value={n}>{n} iter.</option>
              ))}
            </select>
          </div>
          {/* Strategy selector */}
          <div className="flex gap-1">
            {(["random", "spread", "grouped"] as const).map((s) => (
              <button key={s} onClick={() => setOptStrategy(s)}
                className={`flex-1 text-xs py-1 rounded border transition-colors capitalize ${
                  optStrategy === s
                    ? "border-purple-500/70 bg-purple-500/20 text-purple-200"
                    : "border-slate-700/50 text-slate-500 hover:text-slate-300"
                }`}
              >{s}</button>
            ))}
          </div>
          <button
            onClick={handleOptimize}
            disabled={isOptimizing}
            className="w-full rounded-lg py-2 text-xs font-semibold bg-purple-700 hover:bg-purple-600 text-white disabled:opacity-40 transition-colors"
          >
            {isOptimizing ? `⏳ Optimisation en cours…` : "Suggérer le meilleur placement"}
          </button>
          {optimizationResult && (
            <div className="text-xs space-y-1 pt-1 border-t border-purple-800/40">
              <div className="flex justify-between">
                <span className="text-purple-400">Score</span>
                <span className="text-white font-bold">{Math.round(optimizationResult.best.score)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-purple-400">Défenses détruites</span>
                <span className="text-white">
                  {Object.values(optimizationResult.best.simResult.defenses).filter((d) => d.destroyedAt !== null).length
                   + Object.values(optimizationResult.best.simResult.buildings).filter((b) => b.destroyedAt !== null).length}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-purple-400">Troupes survivantes</span>
                <span className="text-white">
                  {Object.values(optimizationResult.best.simResult.troops).filter((t) => t.destroyedAt === null).length}
                </span>
              </div>
              <div className="flex justify-between text-slate-500">
                <span>{optimizationResult.testedCount} placements testés</span>
                <span>moy. {optimizationResult.avgScore}</span>
              </div>
              {optimizationResult.top3.length > 1 && (
                <div className="text-slate-600 text-xs">
                  Top 3 scores : {optimizationResult.top3.map((c) => Math.round(c.score)).join(" · ")}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Modèles de bases ────────────────────────────────────────────── */}
      <details className="rounded-xl border border-[#1e2a45] bg-[#06080f] px-3 py-2 text-xs">
        <summary className="cursor-pointer font-semibold text-slate-300 select-none">
          🏰 Modèles de bases ({BASE_PRESETS.length})
        </summary>
        <div className="mt-2 space-y-1">
          {BASE_PRESETS.map((p) => (
            <button key={p.id} onClick={() => handleLoadPreset(p)}
              className="w-full text-left rounded-lg px-3 py-1.5 bg-slate-800/40 hover:bg-slate-700/50 border border-slate-700/50 transition-colors">
              <span className="font-medium text-slate-200 text-xs">{p.name}</span>
              <span className="block text-slate-500 text-xs mt-0.5">{p.description}</span>
            </button>
          ))}
        </div>
      </details>

      {/* ── Scénarios de test (temporaire) ──────────────────────────────── */}
      <details className="rounded-xl border border-dashed border-yellow-600/40 bg-yellow-900/10 px-3 py-2 text-xs">
        <summary className="cursor-pointer font-semibold text-yellow-400 select-none">
          🧪 Scénarios de test
        </summary>
        <div className="mt-2 flex flex-wrap gap-1">
          {TEST_SCENARIOS.map((s) => (
            <button
              key={s.name}
              onClick={() => loadScenario(s)}
              className="rounded bg-yellow-800/50 px-2 py-1 text-yellow-200 hover:bg-yellow-700/60 transition-colors"
            >
              {s.name}
            </button>
          ))}
        </div>
      </details>

      {/* Simulate */}
      <button
        onClick={handleSimulate}
        disabled={(!placed.length && !placedBuildings.length) || (placementMode ? placedTroops.length === 0 : !totalTroops)}
        className="w-full rounded-xl bg-cyan-500 py-3 text-sm font-semibold text-black transition-colors hover:bg-cyan-400 active:bg-cyan-600 disabled:opacity-40 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:ring-offset-2 focus:ring-offset-black"
      >
        Simuler l&apos;attaque
      </button>

      {/* Replay controls */}
      {result && !showReplay && (
        <button
          onClick={startReplay}
          className="w-full rounded-xl border border-cyan-500/40 bg-cyan-500/10 py-2.5 text-sm font-semibold text-cyan-400 transition-colors hover:bg-cyan-500/20"
        >
          ▶ Voir le replay
        </button>
      )}
      {result && showReplay && (
        <>
          <ReplayControls
            durationSeconds={result.durationSeconds}
            replayTime={replayTime}
            playing={replayPlaying}
            speed={replaySpeed}
            onPlayPause={() => { lastTsRef.current = 0; setReplayPlaying((p) => !p); }}
            onSpeedToggle={() => setReplaySpeed((s) => (s === 1 ? 2 : 1))}
            onSeek={(t) => { lastTsRef.current = 0; setReplayTime(t); }}
            onClose={() => { setShowReplay(false); setReplayPlaying(false); }}
          />
          <button
            onClick={() => setHpOnDamageOnly((v) => !v)}
            className={`w-full rounded-xl border py-2 text-xs font-semibold transition-colors ${
              hpOnDamageOnly
                ? "border-amber-500/40 bg-amber-500/10 text-amber-400 hover:bg-amber-500/20"
                : "border-slate-500/40 bg-slate-500/10 text-slate-400 hover:bg-slate-500/20"
            }`}
          >
            {hpOnDamageOnly ? "HP : au contact uniquement" : "HP : toujours visibles"}
          </button>
        </>
      )}

      {/* Analysis panel */}
      {analysisStats && (
        <div className="rounded-2xl border border-[#141a30] bg-[#06080f] p-4 space-y-3">
          <h3 className="text-sm font-semibold text-slate-200">Analyse</h3>
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div className="space-y-0.5">
              <p className="text-slate-500">Défense la + dangereuse</p>
              <p className="text-white font-medium">{analysisStats.defsByDamage[0]?.name ?? "—"}</p>
              <p className="text-red-400">{analysisStats.defsByDamage[0]?.damage ?? 0} dégâts</p>
            </div>
            <div className="space-y-0.5">
              <p className="text-slate-500">Troupe la + ciblée</p>
              <p className="text-white font-medium">{analysisStats.mostTargeted?.name ?? "—"}</p>
              <p className="text-orange-400">{analysisStats.mostTargeted?.count ?? 0} fois</p>
            </div>
            <div className="space-y-0.5">
              <p className="text-slate-500">Pertes</p>
              <p className="text-white font-medium">{analysisStats.totalDead}/{analysisStats.totalTroopsCount} troupes</p>
              <p className="text-slate-400">mort moy. à {analysisStats.avgDeathTime ?? "—"}s</p>
            </div>
            {analysisStats.deadTroops[0] && (
              <div className="space-y-0.5">
                <p className="text-slate-500">Première mort</p>
                <p className="text-white font-medium">{analysisStats.deadTroops[0].label}</p>
                <p className="text-slate-400">à {analysisStats.deadTroops[0].time.toFixed(1)}s</p>
              </div>
            )}
          </div>
          {analysisStats.defsByDamage.length > 1 && (
            <div className="space-y-1">
              <p className="text-xs text-slate-500">Dégâts par défense</p>
              {analysisStats.defsByDamage.slice(0, 5).map((d, i) => {
                const pct = Math.round((d.damage / analysisStats.defsByDamage[0].damage) * 100);
                return (
                  <div key={d.id} className="flex items-center gap-2">
                    <span className="w-28 text-xs text-slate-300 truncate">{d.name}</span>
                    <div className="flex-1 h-1.5 rounded-full bg-slate-800">
                      <div className="h-full rounded-full bg-red-500/70" style={{ width: `${pct}%` }} />
                    </div>
                    <span className="text-xs text-slate-400 w-12 text-right">{d.damage}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Results */}
      {result && (
        <ResultsSection
          result={result}
          meta={meta}
          placed={placed}
          placedBuildings={placedBuildings}
          placedWalls={placedWalls}
          totalTroops={totalTroops}
          survivors={survivors}
        />
      )}

    </div>
  );
}

// ── BattleGrid ─────────────────────────────────────────────────────────────
// CSS background-image pour les lignes de grille (0 div par cellule).
// Défenses = divs absolus (max 8). SVG overlay = anneau + highlight.
// Event delegation sur le container pour drag & click.
// W et CELL sont calculés dynamiquement dans BattleGrid via ResizeObserver.

interface ReplayDot {
  id: string;
  cx: number;
  cy: number;
  fill: string;
  label: string;
  hpPct: number;       // 0–1, current HP / max HP
  isUnderground: boolean;
  trailCx?: number;    // trail start X in canvas coords (set when underground)
  trailCy?: number;
  isEnraged: boolean;
}

/** Fast deterministic pseudo-random in [-1, 1] for lightning jitter. */
function lightningRand(seed: number): number {
  return Math.sin(seed * 127.1 + 311.7) * 2 - 1;
}

/**
 * Generates a jagged SVG path between two points that looks like a lightning bolt.
 * `seed` should change each animation frame for a flickering effect.
 */
function generateLightningPath(
  x1: number, y1: number, x2: number, y2: number,
  seed: number,
): string {
  const dx   = x2 - x1;
  const dy   = y2 - y1;
  const dist = Math.sqrt(dx * dx + dy * dy);
  if (dist < 1) return `M ${x1} ${y1} L ${x2} ${y2}`;
  const invDist = 1 / dist;
  const perpX   = -dy * invDist;
  const perpY   =  dx * invDist;
  const segs    = Math.max(3, Math.ceil(dist / 22));
  const spread  = Math.min(14, dist * 0.15);
  const pts: string[] = [`${x1.toFixed(1)},${y1.toFixed(1)}`];
  for (let i = 1; i < segs; i++) {
    const t   = i / segs;
    const bx  = x1 + dx * t;
    const by  = y1 + dy * t;
    const off = lightningRand(seed + i * 7.3 + t * 53.1) * spread;
    pts.push(`${(bx + perpX * off).toFixed(1)},${(by + perpY * off).toFixed(1)}`);
  }
  pts.push(`${x2.toFixed(1)},${y2.toFixed(1)}`);
  return "M " + pts.join(" L ");
}

function BattleGrid({
  placed,
  onPlace,
  onRemove,
  replayDots,
  replayDestroyedIds,
  activeProjectiles,
  impactFlashes,
  infernoBeams,
  activeHealOrbs,
  healHalos,
  activeChainLinks,
  activeDeathLightning,
  activeTroopFireballs,
  targetLines,
  showAllRanges,
  heatmapData,
  debugMode,
  selectedId,
  onSelectElement,
  onDeleteSelected,
  dragGhostSize = 1,
  onDragEnd,
  wallMode,
  wallLevel,
  placedWalls,
  onPlaceWall,
  onRemoveWall,
  onWallDragState,
  onMove,
  onModeToggle,
  placedBuildings,
  onPlaceBuilding,
  onRemoveBuilding,
  onMoveBuilding,
  onCellSizeChange,
  result: replayResult,
  replayTime,
  placementMode,
  placedTroops,
  troopSlots: bgTroopSlots,
  selectedSlotId,
  onPlaceTroop,
  onRemovePlacedTroop,
  hpOnDamageOnly,
  occupationMap,
  onDragEntityStart,
}: {
  placed: PlacedDefense[];
  onPlace: (x: number, y: number, defenseId: string, level: number) => void;
  onRemove: (instanceId: string) => void;
  replayDots?: ReplayDot[];
  replayDestroyedIds?: Set<string>;
  activeProjectiles?: { x: number; y: number; color: string; defenseId: string; progress: number; angle: number }[];
  impactFlashes?:     { x: number; y: number; color: string; defenseId: string; alpha: number }[];
  infernoBeams?:      { x1: number; y1: number; x2: number; y2: number; stage: 0|1|2 }[];
  activeHealOrbs?:    { x: number; y: number }[];
  healHalos?:         { x: number; y: number; alpha: number }[];
  activeChainLinks?:    { x1: number; y1: number; x2: number; y2: number; alpha: number }[];
  activeDeathLightning?:  { x: number; y: number; topY: number; alpha: number; seed: number }[];
  activeTroopFireballs?:  { x: number; y: number }[];
  targetLines?:  { x1: number; y1: number; x2: number; y2: number; color: string }[];
  onMove?: (instanceId: string, toX: number, toY: number) => void;
  onModeToggle?: (instanceId: string) => void;
  placedBuildings?: PlacedBuilding[];
  onPlaceBuilding?: (x: number, y: number, buildingId: string, level: number) => void;
  onRemoveBuilding?: (instanceId: string) => void;
  onMoveBuilding?: (instanceId: string, toX: number, toY: number) => void;
  onCellSizeChange?: (size: number) => void;
  placementMode?: boolean;
  placedTroops?: PlacedTroop[];
  troopSlots?: TroopSlot[];
  selectedSlotId?: string | null;
  onPlaceTroop?: (x: number, y: number) => void;
  onRemovePlacedTroop?: (instanceId: string) => void;
  result?: import("../../lib/engine/calculator").SimulationResult | null;
  replayTime?: number;
  hpOnDamageOnly?: boolean;
  showAllRanges?: boolean;
  heatmapData?: Float32Array | null;
  debugMode?: boolean;
  selectedId?: string | null;
  onSelectElement?: (id: string, type: "defense" | "building") => void;
  onDeleteSelected?: () => void;
  dragGhostSize?: number;
  onDragEnd?: () => void;
  occupationMap?: OccupationMap;
  onDragEntityStart?: (size: number) => void;
  wallMode?: boolean;
  wallLevel?: number;
  placedWalls?: WallPlacement[];
  onPlaceWall?: (x: number, y: number) => void;
  onRemoveWall?: (instanceId: string) => void;
  onWallDragState?: (dragging: boolean) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dragCell,          setDragCell]          = useState<string | null>(null);
  const [dragEntityId,      setDragEntityId]      = useState<string | null>(null);
  const [hoveredDefenseId,  setHoveredDefenseId]  = useState<string | null>(null);
  const [hoveredBuildingId, setHoveredBuildingId] = useState<string | null>(null);
  const [cellPx, setCellPx] = useState<number>(CELL);

  // Delete key removes selected element
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Delete" || e.key === "Backspace") onDeleteSelected?.();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onDeleteSelected]);
  // Wall drag axis lock
  const [wallDragOrigin, setWallDragOrigin] = useState<{ x: number; y: number } | null>(null);
  const [wallDragAxis,   setWallDragAxis]   = useState<"x" | "y" | null>(null);

  // Heatmap: Float32Array → canvas → dataURL (single SVG <image> for perf)
  const heatmapSrc = useMemo((): string | null => {
    if (!heatmapData) return null;
    const N = GRID_SIZE;
    const canvas = document.createElement("canvas");
    canvas.width = N; canvas.height = N;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    const img = ctx.createImageData(N, N);
    for (let i = 0; i < N * N; i++) {
      const v = heatmapData[i];
      if (v < 0.02) continue;
      const r = Math.round(180 + v * 75);
      const g = Math.round((1 - v) * 140);
      const b = 0;
      const a = Math.round((0.12 + v * 0.32) * 255);
      img.data[i * 4]     = r;
      img.data[i * 4 + 1] = g;
      img.data[i * 4 + 2] = b;
      img.data[i * 4 + 3] = a;
    }
    ctx.putImageData(img, 0, 0);
    return canvas.toDataURL();
  }, [heatmapData]);

  // Measure container width → derive cell size; fire onCellSizeChange
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = (width: number) => {
      if (width <= 0) return;
      const cs = width / GRID_SIZE;
      setCellPx(cs);
      onCellSizeChange?.(cs);
    };
    update(el.clientWidth);
    const ro = new ResizeObserver(([entry]) => update(entry.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, [onCellSizeChange]);

  const W = cellPx * GRID_SIZE;

  function cellAt(e: { clientX: number; clientY: number }) {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return null;
    const x = Math.floor((e.clientX - rect.left) / cellPx);
    const y = Math.floor((e.clientY - rect.top)  / cellPx);
    return x >= 0 && x < GRID_SIZE && y >= 0 && y < GRID_SIZE ? { x, y } : null;
  }

  function defenseAt(tileX: number, tileY: number) {
    return placed.find((d) => {
      const size = DEFENSES.find((def) => def.id === d.defenseId)?.size ?? 1;
      return tileX >= d.x && tileX < d.x + size && tileY >= d.y && tileY < d.y + size;
    });
  }

  function onMouseMove(e: React.MouseEvent) {
    const c = cellAt(e);
    const id    = c ? (defenseAt(c.x, c.y)?.instanceId  ?? null) : null;
    const bldId = c ? (buildingAt(c.x, c.y)?.instanceId ?? null) : null;
    setHoveredDefenseId((prev)  => (prev === id    ? prev : id));
    setHoveredBuildingId((prev) => (prev === bldId ? prev : bldId));
  }

  function onDragOver(e: React.DragEvent) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
    const c = cellAt(e);
    if (c) setDragCell((p) => { const k = `${c.x},${c.y}`; return p === k ? p : k; });
  }

  function onDragLeave(e: React.DragEvent) {
    if (!containerRef.current?.contains(e.relatedTarget as Node | null)) {
      setDragCell(null);
      setDragEntityId(null);
    }
  }

  function buildingAt(tileX: number, tileY: number) {
    return placedBuildings?.find((b) => {
      const size = NEUTRAL_BUILDINGS.find((nb) => nb.id === b.buildingId)?.size ?? 1;
      return tileX >= b.x && tileX < b.x + size && tileY >= b.y && tileY < b.y + size;
    });
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    const c = cellAt(e);
    setDragCell(null);
    setDragEntityId(null);
    if (!c) return;
    try {
      const payload = JSON.parse(e.dataTransfer.getData("text/plain"));
      if (payload.existingBuildingInstanceId) {
        onMoveBuilding?.(payload.existingBuildingInstanceId, c.x, c.y);
      } else if (payload.existingInstanceId) {
        onMove?.(payload.existingInstanceId, c.x, c.y);
      } else if (payload.buildingId) {
        onPlaceBuilding?.(c.x, c.y, payload.buildingId, payload.level);
      } else {
        onPlace(c.x, c.y, payload.defenseId, payload.level);
      }
    } catch { /* bad payload */ }
  }

  function onClick(e: React.MouseEvent) {
    const c = cellAt(e);
    if (!c) return;
    if (wallMode) return; // géré entièrement par onMouseDown
    if (placementMode) {
      const existingTroop = placedTroops?.find((t) => t.x === c.x && t.y === c.y);
      if (existingTroop) { onRemovePlacedTroop?.(existingTroop.instanceId); return; }
      onPlaceTroop?.(c.x, c.y);
    } else {
      const b = buildingAt(c.x, c.y);
      if (b) { onRemoveBuilding?.(b.instanceId); return; }
      const d = defenseAt(c.x, c.y);
      if (d) { setHoveredDefenseId(null); onRemove(d.instanceId); }
    }
  }

  function onMouseDown(e: React.MouseEvent) {
    if (!wallMode) return;
    const c = cellAt(e);
    if (!c) return;
    // Clic sur mur existant → supprimer (pas de drag)
    const existing = placedWalls?.find((w) => w.x === c.x && w.y === c.y);
    if (existing) { onRemoveWall?.(existing.instanceId); return; }
    // Case vide → poser et démarrer le drag
    setWallDragOrigin({ x: c.x, y: c.y });
    setWallDragAxis(null);
    onWallDragState?.(true);
    onPlaceWall?.(c.x, c.y);
  }

  function onMouseMoveDrag(e: React.MouseEvent) {
    if (!wallMode || e.buttons === 0) return;
    const c = cellAt(e);
    if (!c) return;

    // Déterminer l'axe au premier mouvement significatif
    let axis = wallDragAxis;
    if (axis === null && wallDragOrigin) {
      const dx = Math.abs(c.x - wallDragOrigin.x);
      const dy = Math.abs(c.y - wallDragOrigin.y);
      if (dx > 0 || dy > 0) {
        axis = dx >= dy ? "x" : "y";
        setWallDragAxis(axis);
      }
    }

    // Contraindre à l'axe verrouillé
    const tx = axis === "y" && wallDragOrigin ? wallDragOrigin.x : c.x;
    const ty = axis === "x" && wallDragOrigin ? wallDragOrigin.y : c.y;

    if (!placedWalls?.find((w) => w.x === tx && w.y === ty)) onPlaceWall?.(tx, ty);
  }

  function onMouseUp() {
    setWallDragOrigin(null);
    setWallDragAxis(null);
    onWallDragState?.(false);
  }

  const isModeCapable = (defId: string) => defId === "x-bow" || defId === "inferno-tower";
  const modeLabel = (d: PlacedDefense) => {
    if (d.defenseId === "inferno-tower") return d.mode === "single" ? "S" : "M";
    if (d.defenseId === "x-bow")         return d.mode === "both"   ? "A" : "G";
    return "";
  };

  const defenseSquares = placed.map((d) => {
    const defData   = DEFENSES.find((def) => def.id === d.defenseId);
    const name      = defData?.name ?? d.defenseId;
    const size      = defData?.size ?? 1;
    const destroyed = replayDestroyedIds?.has(d.instanceId) ?? false;
    const hovered   = hoveredDefenseId === d.instanceId;
    const fill      = DEFENSE_FILL[d.defenseId] ?? "#ef4444";
    const pxSize    = size * cellPx - 2;
    const fontSize  = Math.max(6, Math.min(11, pxSize * 0.35));

    return (
      <div
        key={d.instanceId}
        draggable
        title={`${name} Lv${d.level} (${d.x},${d.y}) — clic: sélectionner · clic-droit: supprimer · glisser: déplacer`}
        onDragStart={(e) => defDragStart(e, d, size)}
        onClick={(e) => { e.stopPropagation(); onSelectElement?.(d.instanceId, "defense"); }}
        onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); onRemove(d.instanceId); if (selectedId === d.instanceId) { onSelectElement?.(null as unknown as string, null as unknown as "defense"); } }}
        style={{
          position:        "absolute",
          left:            d.x * cellPx + 1,
          top:             d.y * cellPx + 1,
          width:           pxSize,
          height:          pxSize,
          backgroundColor: fill,
          borderRadius:    3,
          cursor:          "grab",
          zIndex:          1,
          pointerEvents:   "auto",
          opacity:         destroyed ? 0.1 : 1,
          outline:         hovered ? `2px solid ${fill}` : "none",
          outlineOffset:   "2px",
          transition:      "opacity 0.2s, outline 0.1s",
          display:         "flex",
          alignItems:      "center",
          justifyContent:  "center",
          overflow:        "hidden",
        }}
      >
        {/* Level number */}
        <span style={{ color: "rgba(255,255,255,0.85)", fontWeight: 700, fontSize, lineHeight: 1, pointerEvents: "none", userSelect: "none" }}>
          {d.level}
        </span>
        {/* Mode toggle button (X-Bow / Inferno) */}
        {isModeCapable(d.defenseId) && (
          <button
            title={`Mode: ${d.mode} — clic pour basculer`}
            style={{
              position: "absolute", top: 1, right: 1,
              width: Math.max(8, fontSize + 2), height: Math.max(8, fontSize + 2),
              background: "rgba(0,0,0,0.55)", color: "#fff",
              border: "none", borderRadius: 2, cursor: "pointer",
              fontSize: Math.max(5, fontSize - 2), fontWeight: 700, lineHeight: 1,
              display: "flex", alignItems: "center", justifyContent: "center",
              pointerEvents: "auto", zIndex: 10, padding: 0,
            }}
            onClick={(e) => { e.stopPropagation(); onModeToggle?.(d.instanceId); }}
          >
            {modeLabel(d)}
          </button>
        )}
      </div>
    );
  });

  // Drag-start handler for already-placed defenses (move gesture)
  function defDragStart(e: React.DragEvent, d: PlacedDefense, size: number) {
    setDragEntityId(d.instanceId);
    onDragEntityStart?.(size);
    e.dataTransfer.setData("text/plain", JSON.stringify({ existingInstanceId: d.instanceId, defenseId: d.defenseId, level: d.level, mode: d.mode }));
    e.dataTransfer.effectAllowed = "move";
    const fill   = DEFENSE_FILL[d.defenseId] ?? "#ef4444";
    const tilePx = Math.round(cellPx * size);
    const ghost  = document.createElement("div");
    ghost.style.cssText = `width:${tilePx}px;height:${tilePx}px;background:${fill};border-radius:4px;opacity:0.85;position:fixed;top:-${tilePx*2}px;left:0;pointer-events:none;`;
    document.body.appendChild(ghost);
    e.dataTransfer.setDragImage(ghost, tilePx / 2, tilePx / 2);
    setTimeout(() => document.body.removeChild(ghost), 0);
  }

  // Squares for neutral buildings
  const buildingSquares = (placedBuildings ?? []).map((b) => {
    const bldData  = NEUTRAL_BUILDINGS.find((nb) => nb.id === b.buildingId);
    const name     = bldData?.name ?? b.buildingId;
    const size     = bldData?.size ?? 1;
    const category = bldData?.category ?? "building";
    const destroyed = replayDestroyedIds?.has(b.instanceId) ?? false;
    const fill      = BUILDING_FILL[category] ?? BUILDING_FILL["building"];
    const pxSize    = size * cellPx - 2;
    const fontSize  = Math.max(6, Math.min(11, pxSize * 0.30));
    return (
      <div
        key={b.instanceId}
        draggable
        title={`${name} Lv${b.level} (${b.x},${b.y}) — glisser: déplacer · clic: supprimer`}
        onDragStart={(e) => {
          setDragEntityId(b.instanceId);
          onDragEntityStart?.(size);
          e.dataTransfer.setData("text/plain", JSON.stringify({ existingBuildingInstanceId: b.instanceId, buildingId: b.buildingId, level: b.level }));
          e.dataTransfer.effectAllowed = "move";
          const tilePx = Math.round(cellPx * size);
          const ghost = document.createElement("div");
          ghost.style.cssText = `width:${tilePx}px;height:${tilePx}px;background:${fill};border-radius:4px;opacity:0.75;border:1px dashed rgba(255,255,255,0.4);position:fixed;top:-${tilePx*2}px;left:0;pointer-events:none;`;
          document.body.appendChild(ghost);
          e.dataTransfer.setDragImage(ghost, tilePx / 2, tilePx / 2);
          setTimeout(() => document.body.removeChild(ghost), 0);
        }}
        onClick={(e) => { e.stopPropagation(); onSelectElement?.(b.instanceId, "building"); }}
        onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); onRemoveBuilding?.(b.instanceId); }}
        style={{
          position:        "absolute",
          left:            b.x * cellPx + 1,
          top:             b.y * cellPx + 1,
          width:           pxSize,
          height:          pxSize,
          backgroundColor: fill,
          borderRadius:    2,
          border:          "1px dashed rgba(255,255,255,0.25)",
          cursor:          "grab",
          zIndex:          1,
          pointerEvents:   "auto",
          opacity:         destroyed ? 0.1 : 0.85,
          display:         "flex",
          alignItems:      "center",
          justifyContent:  "center",
          overflow:        "hidden",
        }}
      >
        <span style={{ color: "rgba(255,255,255,0.8)", fontWeight: 600, fontSize, lineHeight: 1, pointerEvents: "none", userSelect: "none" }}>
          {b.level}
        </span>
      </div>
    );
  });

  return (
    <div
      ref={containerRef}
      className="relative rounded-lg border border-[#1e2a45] overflow-hidden"
      style={{
        width:           "100%",
        aspectRatio:     "1 / 1",
        backgroundImage: [
          "linear-gradient(to right,  #0c1628 1px, transparent 1px)",
          "linear-gradient(to bottom, #0c1628 1px, transparent 1px)",
        ].join(","),
        backgroundSize:  `${cellPx}px ${cellPx}px`,
        backgroundColor: "#000000",
        cursor:          "crosshair",
      }}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={(e) => { onDrop(e); onDragEnd?.(); }}
      onDragEnd={() => onDragEnd?.()}
      onClick={onClick}
      onMouseDown={onMouseDown}
      onMouseMove={(e) => { onMouseMove(e); onMouseMoveDrag(e); }}
      onMouseUp={onMouseUp}
      onMouseLeave={() => { setHoveredDefenseId(null); setHoveredBuildingId(null); onWallDragState?.(false); }}
    >
      {/* Neutral buildings (behind defenses) */}
      {buildingSquares}
      {/* Defense markers */}
      {defenseSquares}

      {/* SVG: drop ring + drag highlight */}
      <svg className="absolute inset-0 pointer-events-none" style={{ zIndex: 2 }} width="100%" height="100%">
        {/* Heatmap DPS — couche la plus basse */}
        {heatmapSrc && (
          <image href={heatmapSrc} x={0} y={0} width={W} height={W}
            style={{ imageRendering: "pixelated" }} />
        )}
        {/* Deployment zone — full perimeter ring (evenodd donut) */}
        {(() => {
          const M = DEPLOY_MARGIN * cellPx;
          const G = GRID_SIZE * cellPx;
          return (
            <path
              fillRule="evenodd"
              fill={placementMode ? "rgba(251,191,36,0.1)" : "rgba(251,191,36,0.04)"}
              stroke="#f59e0b"
              strokeWidth={placementMode ? 1.5 : 0.75}
              strokeOpacity={placementMode ? 0.7 : 0.3}
              strokeDasharray="5 3"
              d={`M 0 0 H ${G} V ${G} H 0 Z M ${M} ${M} H ${G-M} V ${G-M} H ${M} Z`}
            />
          );
        })()}
        {/* Drag-over ghost — footprint réel, vérifié via occupation map unifiée */}
        {dragCell && (() => {
          const gx = parseInt(dragCell.split(",")[0]);
          const gy = parseInt(dragCell.split(",")[1]);
          const gs = Math.max(1, dragGhostSize);
          const withinBounds = inBounds(gx, gy, gs);
          const free = occupationMap
            ? isFree(occupationMap, gx, gy, gs, dragEntityId ?? undefined)
            : true;
          const canSwap = !free && occupationMap && dragEntityId
            ? occupantsOf(occupationMap, gx, gy, gs, dragEntityId).length === 1
            : false;
          const valid = withinBounds && free;
          const fill   = valid ? "rgba(34,197,94,0.15)"  : canSwap ? "rgba(251,191,36,0.15)" : "rgba(239,68,68,0.15)";
          const stroke = valid ? "#22c55e"                : canSwap ? "#fbbf24"               : "#ef4444";
          return (
            <>
              <rect
                x={gx * cellPx + 0.5} y={gy * cellPx + 0.5}
                width={gs * cellPx - 1} height={gs * cellPx - 1}
                fill={fill} stroke={stroke} strokeWidth={1.5} rx={2}
              />
              {canSwap && (
                <text
                  x={(gx + gs / 2) * cellPx} y={(gy + gs / 2) * cellPx + 4}
                  textAnchor="middle" fontSize={Math.max(7, gs * cellPx * 0.3)}
                  fill="#fbbf24" opacity={0.9} style={{ pointerEvents: "none", userSelect: "none" }}
                >⇄</text>
              )}
            </>
          );
        })()}
        {/* Range circle for hovered defense */}
        {(() => {
          if (!hoveredDefenseId) return null;
          const d         = placed.find((p) => p.instanceId === hoveredDefenseId);
          if (!d) return null;
          const defData   = DEFENSES.find((def) => def.id === d.defenseId);
          if (!defData) return null;
          const levelData = defData.levels.find((l) => l.level === d.level);
          if (!levelData) return null;
          const size      = defData.size ?? 1;
          const cx        = (d.x + size / 2) * cellPx;
          const cy        = (d.y + size / 2) * cellPx;
          // Effective range depends on mode
          const effectiveMax =
            d.defenseId === "x-bow"          && d.mode === "both"   ? 11.5 :
            d.defenseId === "inferno-tower"  && d.mode !== "single" ? 10   :
            levelData.maxRange;
          const maxR      = effectiveMax * cellPx;
          const minR      = levelData.minRange * cellPx;
          const color     = DEFENSE_FILL[d.defenseId] ?? "#ef4444";
          // Two-arc SVG circle path (works as compound path for evenodd donut)
          const arc = (r: number) =>
            `M ${cx - r} ${cy} a ${r} ${r} 0 1 0 ${2 * r} 0 a ${r} ${r} 0 1 0 ${-2 * r} 0`;
          return (
            <g>
              {/* Filled zone — donut if minRange > 0, full disk otherwise */}
              <path
                d={minR > 0 ? `${arc(maxR)} ${arc(minR)}` : arc(maxR)}
                fillRule="evenodd"
                fill={`${color}30`}
              />
              {/* Outer ring */}
              <circle cx={cx} cy={cy} r={maxR} fill="none" stroke={color} strokeWidth={1.5} strokeOpacity={0.65} />
              {/* Dead-zone ring (minRange) */}
              {minR > 0 && (
                <circle cx={cx} cy={cy} r={minR} fill="none" stroke={color} strokeWidth={1} strokeOpacity={0.55} strokeDasharray="5 3" />
              )}
            </g>
          );
        })()}
        {/* Range circle for hovered TH 12-15 (Giga Tesla / Giga Inferno) */}
        {/* TODO: confirm exact weapon range when real data available — V1 uses 10 */}
        {(() => {
          if (!hoveredBuildingId) return null;
          const b = (placedBuildings ?? []).find((b) => b.instanceId === hoveredBuildingId);
          if (!b || b.buildingId !== "town-hall" || b.level < 12) return null;
          const weapon = TOWN_HALL_DATA[b.level]?.weapon;
          if (!weapon) return null;
          const size  = 4; // town-hall footprint
          const cx    = (b.x + size / 2) * cellPx;
          const cy    = (b.y + size / 2) * cellPx;
          const maxR  = weapon.range * cellPx;
          const color = "#6366f1"; // indigo — matches "special" category
          const arc   = (r: number) =>
            `M ${cx - r} ${cy} a ${r} ${r} 0 1 0 ${2 * r} 0 a ${r} ${r} 0 1 0 ${-2 * r} 0`;
          return (
            <g>
              <path d={arc(maxR)} fillRule="evenodd" fill={`${color}28`} />
              <circle cx={cx} cy={cy} r={maxR}
                fill="none" stroke={color} strokeWidth={1.5} strokeOpacity={0.75} strokeDasharray="5 3" />
            </g>
          );
        })()}
        {/* Manually placed troops (pre-simulation, semi-transparent) */}
        {placementMode && placedTroops?.map((pt) => {
          const slotIdx = bgTroopSlots?.findIndex((s) => s.troopId === pt.troopId) ?? -1;
          const hex     = TROOP_COLORS_HEX[Math.max(0, slotIdx) % TROOP_COLORS_HEX.length];
          const abbr    = TROOP_ABBREV[pt.troopId] ?? "?";
          const cx      = (pt.x + 0.5) * cellPx;
          const cy      = (pt.y + 0.5) * cellPx;
          return (
            <g key={pt.instanceId} style={{ cursor: "pointer" }}>
              <circle cx={cx} cy={cy} r={5} fill={hex} fillOpacity={0.5} stroke="rgba(255,255,255,0.5)" strokeWidth={1} />
              <text x={cx} y={cy + 1} textAnchor="middle" dominantBaseline="middle"
                fontSize={4} fontFamily="monospace" fontWeight="bold"
                fill="rgba(0,0,0,0.8)" style={{ pointerEvents: "none", userSelect: "none" }}
              >{abbr}</text>
              {pt.deployAt > 0 && (
                <text x={cx} y={cy + 8} textAnchor="middle" dominantBaseline="middle"
                  fontSize={3.5} fill="rgba(251,191,36,0.85)" style={{ pointerEvents: "none", userSelect: "none" }}
                >{pt.deployAt}s</text>
              )}
            </g>
          );
        })}
        {/* Selection ring */}
        {selectedId && (() => {
          const def = placed.find((d) => d.instanceId === selectedId);
          if (def) {
            const sz = DEFENSES.find((d) => d.id === def.defenseId)?.size ?? 1;
            return (
              <rect x={def.x * cellPx - 1} y={def.y * cellPx - 1}
                width={sz * cellPx + 2} height={sz * cellPx + 2}
                fill="none" stroke="#f0abfc" strokeWidth={1.5} strokeDasharray="4 2" rx={2} />
            );
          }
          const bld = placedBuildings?.find((b) => b.instanceId === selectedId);
          if (bld) {
            const sz = NEUTRAL_BUILDINGS.find((nb) => nb.id === bld.buildingId)?.size ?? 1;
            return (
              <rect x={bld.x * cellPx - 1} y={bld.y * cellPx - 1}
                width={sz * cellPx + 2} height={sz * cellPx + 2}
                fill="none" stroke="#f0abfc" strokeWidth={1.5} strokeDasharray="4 2" rx={2} />
            );
          }
          return null;
        })()}
        {/* Portées de toutes les défenses (toggle) */}
        {showAllRanges && placed.map((d) => {
          const defData   = DEFENSES.find((def) => def.id === d.defenseId);
          if (!defData) return null;
          const levelData = defData.levels.find((l) => l.level === d.level);
          if (!levelData) return null;
          const sz    = defData.size ?? 1;
          const cx    = (d.x + sz / 2) * cellPx;
          const cy    = (d.y + sz / 2) * cellPx;
          const effectiveMax =
            d.defenseId === "x-bow"         && d.mode === "both"   ? 11.5 :
            d.defenseId === "inferno-tower" && d.mode !== "single" ? 10   :
            levelData.maxRange;
          const maxR  = effectiveMax * cellPx;
          const minR  = (levelData.minRange ?? 0) * cellPx;
          const color = DEFENSE_FILL[d.defenseId] ?? "#ef4444";
          const arc   = (r: number) =>
            `M ${cx - r} ${cy} a ${r} ${r} 0 1 0 ${2*r} 0 a ${r} ${r} 0 1 0 ${-2*r} 0`;
          return (
            <g key={`range-${d.instanceId}`} opacity={hoveredDefenseId === d.instanceId ? 0 : 1}>
              <path
                d={minR > 0 ? `${arc(maxR)} ${arc(minR)}` : arc(maxR)}
                fillRule="evenodd" fill={`${color}18`} />
              <circle cx={cx} cy={cy} r={maxR}
                fill="none" stroke={color} strokeWidth={0.75} strokeOpacity={0.5} strokeDasharray="4 3" />
              {minR > 0 && (
                <circle cx={cx} cy={cy} r={minR}
                  fill="none" stroke="#ef4444" strokeWidth={0.75} strokeOpacity={0.5} strokeDasharray="3 3" />
              )}
            </g>
          );
        })}
        {/* Murs placés */}
        {(placedWalls ?? []).map((w) =>
          renderWallSvg(w.level, w.x * cellPx, w.y * cellPx, cellPx)
        )}
        {/* Debug occupation overlay — tiles occupées par kind */}
        {debugMode && occupationMap && occupiedSnapshot(occupationMap).map(({ x, y, kind }) => {
          const fill   = kind === "defense"  ? "rgba(239,68,68,0.18)"
                       : kind === "building" ? "rgba(251,191,36,0.18)"
                       :                      "rgba(234,179,8,0.12)";
          const stroke = kind === "defense"  ? "rgba(239,68,68,0.5)"
                       : kind === "building" ? "rgba(251,191,36,0.5)"
                       :                      "rgba(234,179,8,0.35)";
          return (
            <rect key={`dbg-${x}-${y}`}
              x={x * cellPx} y={y * cellPx}
              width={cellPx} height={cellPx}
              fill={fill} stroke={stroke} strokeWidth={0.4}
            />
          );
        })}
        {/* Defense hitboxes — white outline on full size×size footprint */}
        {placed.map((d) => {
          const size = DEFENSES.find((def) => def.id === d.defenseId)?.size ?? 1;
          return (
            <rect key={`hb-${d.instanceId}`}
              x={d.x * cellPx + 0.5} y={d.y * cellPx + 0.5}
              width={size * cellPx - 1} height={size * cellPx - 1}
              fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth={0.75}
            />
          );
        })}
        {/* Target lines: troop → current defense (replay) */}
        {targetLines?.map((l, i) => (
          <line key={i} x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2}
            stroke={l.color} strokeWidth={0.75} strokeOpacity={0.5}
            strokeDasharray="3 2"
          />
        ))}
        {/* Defense HP bars (replay) — per-second base + chain sub-second precision */}
        {replayResult && placed.map((d) => {
          const defData = DEFENSES.find((def) => def.id === d.defenseId);
          if (!defData) return null;
          const size  = defData.size ?? 1;
          const maxHp = defData.levels.find((l) => l.level === d.level)?.hp ?? 1;
          const dr    = replayResult.defenses[d.instanceId];
          if (!dr) return null;
          const rt = replayTime ?? 0;
          const s  = Math.min(Math.floor(rt), dr.hpPerSecond.length - 1);
          let hp   = dr.hpPerSecond[s] ?? maxHp;
          // Chain sub-second damage
          for (const ev of replayResult.chainEvents ?? []) {
            if (ev.time > rt) break;
            if (ev.time <= s) continue;
            for (const link of ev.links) {
              if (link.targetInstId === d.instanceId) hp -= link.damage;
            }
          }
          // Baby Dragon fireball sub-second damage (same convention as chainEvents: at ev.time)
          for (const ev of replayResult.troopFireEvents ?? []) {
            if (ev.time > rt) break;
            if (ev.targetInstId !== d.instanceId) continue;
            if (ev.time > s && ev.time <= rt) hp -= ev.damage;
          }
          hp = Math.max(0, hp);
          const pct = Math.max(0, Math.min(1, hp / maxHp));
          if (hpOnDamageOnly && hp >= maxHp) return null;
          const BAR_W    = size * cellPx - 4;
          const BAR_H    = 2;
          const barX     = d.x * cellPx + 2;
          const barY     = (d.y + size) * cellPx - BAR_H - 1;
          const barColor = pct > 0.6 ? "#22c55e" : pct > 0.3 ? "#f59e0b" : "#ef4444";
          return (
            <g key={`hp-def-${d.instanceId}`}>
              <rect x={barX} y={barY} width={BAR_W} height={BAR_H} rx={1} fill="rgba(0,0,0,0.45)" />
              <rect x={barX} y={barY} width={BAR_W * pct} height={BAR_H} rx={1} fill={barColor} />
            </g>
          );
        })}
        {/* Building HP bars (replay) */}
        {replayResult && (placedBuildings ?? []).map((b) => {
          const bldData = NEUTRAL_BUILDINGS.find((nb) => nb.id === b.buildingId);
          if (!bldData) return null;
          const size  = bldData.size ?? 1;
          const maxHp = bldData.levels.find((l) => l.level === b.level)?.hp ?? 1;
          const br    = replayResult.buildings[b.instanceId];
          if (!br) return null;
          const rt = replayTime ?? 0;
          const s  = Math.min(Math.floor(rt), br.hpPerSecond.length - 1);
          let hp   = br.hpPerSecond[s] ?? maxHp;
          // Chain sub-second damage
          for (const ev of replayResult.chainEvents ?? []) {
            if (ev.time > rt) break;
            if (ev.time <= s) continue;
            for (const link of ev.links) {
              if (link.targetInstId === b.instanceId) hp -= link.damage;
            }
          }
          // Baby Dragon fireball sub-second damage (at ev.time, same as chainEvents)
          for (const ev of replayResult.troopFireEvents ?? []) {
            if (ev.time > rt) break;
            if (ev.targetInstId !== b.instanceId) continue;
            if (ev.time > s && ev.time <= rt) hp -= ev.damage;
          }
          hp = Math.max(0, hp);
          const pct = Math.max(0, Math.min(1, hp / maxHp));
          if (hpOnDamageOnly && hp >= maxHp) return null;
          const BAR_W    = size * cellPx - 4;
          const BAR_H    = 2;
          const barX     = b.x * cellPx + 2;
          const barY     = (b.y + size) * cellPx - BAR_H - 1;
          const barColor = pct > 0.6 ? "#22c55e" : pct > 0.3 ? "#f59e0b" : "#ef4444";
          return (
            <g key={`hp-bld-${b.instanceId}`}>
              <rect x={barX} y={barY} width={BAR_W} height={BAR_H} rx={1} fill="rgba(0,0,0,0.45)" />
              <rect x={barX} y={barY} width={BAR_W * pct} height={BAR_H} rx={1} fill={barColor} />
            </g>
          );
        })}
        {/* Wall HP bars (replay) */}
        {replayResult && (placedWalls ?? []).map((w) => {
          const maxHp = WALL_HP[w.level] ?? 100;
          const wr    = replayResult.walls?.[w.instanceId];
          if (!wr) return null;
          if (wr.destroyedAt !== null && (replayTime ?? 0) >= wr.destroyedAt) return null;
          const s   = Math.min(Math.floor(replayTime ?? 0), wr.hpPerSecond.length - 1);
          const hp  = wr.hpPerSecond[s] ?? maxHp;
          const pct = Math.max(0, Math.min(1, hp / maxHp));
          if (hpOnDamageOnly && hp >= maxHp) return null;
          const BAR_W    = cellPx - 4;
          const BAR_H    = 2;
          const barX     = w.x * cellPx + 2;
          const barY     = (w.y + 1) * cellPx - BAR_H - 1;
          const barColor = pct > 0.6 ? "#22c55e" : pct > 0.3 ? "#f59e0b" : "#ef4444";
          return (
            <g key={`hp-wall-${w.instanceId}`}>
              <rect x={barX} y={barY} width={BAR_W} height={BAR_H} rx={1} fill="rgba(0,0,0,0.55)" />
              <rect x={barX} y={barY} width={BAR_W * pct} height={BAR_H} rx={1} fill={barColor} />
            </g>
          );
        })}
        {/* Inferno Tower beams */}
        {infernoBeams?.map((b, i) => {
          const sw    = b.stage === 2 ? 3 : b.stage === 1 ? 2 : 1;
          const color = b.stage === 2 ? "#ffffff" : b.stage === 1 ? "#fbbf24" : "#f97316";
          return (
            <line key={i} x1={b.x1} y1={b.y1} x2={b.x2} y2={b.y2}
              stroke={color} strokeWidth={sw} strokeOpacity={0.85} strokeLinecap="round" />
          );
        })}
        {/* Electro Dragon chain lightning — zigzag path with glow */}
        {activeChainLinks?.map((link, i) => {
          // seed changes with replayTime → flicker effect each frame
          const seed = i * 137.5 + (replayTime ?? 0) * 40;
          const d    = generateLightningPath(link.x1, link.y1, link.x2, link.y2, seed);
          return (
            <g key={`chain-${i}`}>
              {/* outer glow */}
              <path d={d} fill="none" stroke="#80dfff" strokeWidth={9}
                opacity={link.alpha * 0.10} strokeLinecap="round" strokeLinejoin="round" />
              {/* mid glow */}
              <path d={d} fill="none" stroke="#a5f3fc" strokeWidth={4.5}
                opacity={link.alpha * 0.25} strokeLinecap="round" strokeLinejoin="round" />
              {/* core */}
              <path d={d} fill="none" stroke="#e0f7ff" strokeWidth={1.5}
                opacity={link.alpha * 0.95} strokeLinecap="round" strokeLinejoin="round" />
            </g>
          );
        })}
        {/* Baby Dragon fireballs */}
        {activeTroopFireballs?.map((f, i) => (
          <g key={`bd-fire-${i}`}>
            <circle cx={f.x} cy={f.y} r={6}   fill="#f97316" opacity={0.15} />
            <circle cx={f.x} cy={f.y} r={3.5}  fill="#ea580c" opacity={0.90} />
            <circle cx={f.x} cy={f.y} r={1.5}  fill="#fef08a" opacity={0.85} />
          </g>
        ))}
        {/* Electro Dragon death lightning — bolts from sky */}
        {activeDeathLightning?.map((dl, i) => {
          const d = generateLightningPath(dl.x, dl.topY, dl.x, dl.y, dl.seed);
          const splashR = (1 - dl.alpha) * 18 + 2;
          return (
            <g key={`dl-${i}`}>
              {/* outer glow */}
              <path d={d} fill="none" stroke="#60a5fa" strokeWidth={10}
                opacity={dl.alpha * 0.08} strokeLinecap="round" strokeLinejoin="round" />
              {/* mid glow */}
              <path d={d} fill="none" stroke="#93c5fd" strokeWidth={5}
                opacity={dl.alpha * 0.22} strokeLinecap="round" strokeLinejoin="round" />
              {/* core */}
              <path d={d} fill="none" stroke="#ffffff" strokeWidth={1.5}
                opacity={dl.alpha * 0.95} strokeLinecap="round" strokeLinejoin="round" />
              {/* ground impact ring */}
              <circle cx={dl.x} cy={dl.y} r={splashR}
                fill="none" stroke="#93c5fd" strokeWidth={1.5} opacity={dl.alpha * 0.65} />
              {/* impact flash */}
              <circle cx={dl.x} cy={dl.y} r={4}
                fill="#bfdbfe" opacity={dl.alpha * 0.45} />
            </g>
          );
        })}
        {/* Heal orbs in flight — glowing lime sphere */}
        {activeHealOrbs?.map((h, i) => (
          <g key={`heal-orb-${i}`}>
            <circle cx={h.x} cy={h.y} r={9}   fill="#4ade80" opacity={0.08} />
            <circle cx={h.x} cy={h.y} r={5}   fill="#4ade80" opacity={0.22} />
            <circle cx={h.x} cy={h.y} r={3}   fill="#4ade80" opacity={0.90} />
            <circle cx={h.x} cy={h.y} r={1.2} fill="rgba(255,255,255,0.9)" />
          </g>
        ))}
        {/* Projectiles in flight — shape varies by defense type */}
        {activeProjectiles?.map((p, i) => {
          const { x, y, color, defenseId, angle } = p;
          if (defenseId === "archer-tower" || defenseId === "x-bow") {
            // Elongated arrow/bolt, rotated along flight direction
            return (
              <g key={i} transform={`translate(${x},${y}) rotate(${angle})`}>
                <ellipse rx={6} ry={1} fill={color} opacity={0.95} />
                <ellipse rx={2.5} ry={0.5} fill="rgba(255,255,255,0.8)" />
              </g>
            );
          }
          if (defenseId === "mortar" || defenseId === "scattershot") {
            // Heavy shell — large circle with glow ring
            return (
              <g key={i}>
                <circle cx={x} cy={y} r={6.5} fill="none" stroke={color} strokeWidth={1} opacity={0.25} />
                <circle cx={x} cy={y} r={3.5} fill={color} opacity={0.92} />
              </g>
            );
          }
          if (defenseId === "wizard-tower") {
            // Glowing orb
            return (
              <g key={i}>
                <circle cx={x} cy={y} r={6} fill={color} opacity={0.15} />
                <circle cx={x} cy={y} r={3} fill={color} opacity={0.9} />
                <circle cx={x} cy={y} r={1.3} fill="rgba(255,255,255,0.85)" />
              </g>
            );
          }
          if (defenseId === "eagle-artillery") {
            // Large amber shell with bright core
            return (
              <g key={i}>
                <circle cx={x} cy={y} r={7} fill={color} opacity={0.12} />
                <circle cx={x} cy={y} r={4} fill={color} opacity={0.9} />
                <circle cx={x} cy={y} r={1.8} fill="rgba(255,255,255,0.75)" />
              </g>
            );
          }
          if (defenseId === "air-defense") {
            // Blue rocket missile oriented along flight direction
            return (
              <g key={i} transform={`translate(${x},${y}) rotate(${angle})`}>
                {/* engine glow trail */}
                <ellipse rx={9} ry={2.5} cx={-4} fill={color} opacity={0.10} />
                {/* body */}
                <ellipse rx={6} ry={2} fill={color} opacity={0.92} />
                {/* bright nose */}
                <ellipse rx={2.5} ry={1} cx={4} fill="rgba(255,255,255,0.85)" />
              </g>
            );
          }
          // cannon and others — solid ball with white core
          return (
            <g key={i}>
              <circle cx={x} cy={y} r={2.5} fill={color} opacity={0.9} />
              <circle cx={x} cy={y} r={1} fill="rgba(255,255,255,0.8)" />
            </g>
          );
        })}
        {/* Impact flashes — expanding ring that fades out at landing */}
        {impactFlashes?.map((f, i) => {
          const isSplash = ["mortar","wizard-tower","eagle-artillery","scattershot"].includes(f.defenseId);
          const maxR  = isSplash ? 14 : 7;
          const r     = 2 + (1 - f.alpha) * maxR;
          const sw    = isSplash ? 1.5 : 1;
          return (
            <circle key={`flash-${i}`} cx={f.x} cy={f.y} r={r}
              fill="none" stroke={f.color} strokeWidth={sw}
              opacity={f.alpha * 0.75}
            />
          );
        })}
        {/* Heal halos — double expanding ring at impact point */}
        {healHalos?.map((f, i) => {
          const rOuter = 4  + (1 - f.alpha) * 20;
          const rInner = 2  + (1 - f.alpha) * 11;
          return (
            <g key={`heal-halo-${i}`}>
              <circle cx={f.x} cy={f.y} r={rOuter} fill="none" stroke="#4ade80" strokeWidth={1.5} opacity={f.alpha * 0.45} />
              <circle cx={f.x} cy={f.y} r={rInner} fill="none" stroke="#86efac" strokeWidth={2}   opacity={f.alpha * 0.70} />
            </g>
          );
        })}
        {/* Replay: animated troop dots + HP bars */}
        {replayDots?.map((dot) => {
          const BAR_W   = 14;
          const BAR_H   = 2;
          const barX    = dot.cx - BAR_W / 2;
          const barY    = dot.cy + 7;
          const hpColor = dot.hpPct > 0.6 ? "#22c55e" : dot.hpPct > 0.3 ? "#f59e0b" : "#ef4444";
          return (
            <g key={dot.id}>
              {/* Baby Dragon enragé — halo orange pulsant */}
              {dot.isEnraged && (
                <circle cx={dot.cx} cy={dot.cy} r={9}
                  fill="none" stroke="#f97316" strokeWidth={1.5} opacity={0.75} />
              )}
              {/* Miner underground: sillon de forage + indicateur discret */}
              {dot.isUnderground && (
                <>
                  {dot.trailCx !== undefined && dot.trailCy !== undefined && (
                    <line
                      x1={dot.trailCx} y1={dot.trailCy} x2={dot.cx} y2={dot.cy}
                      stroke="#b45309" strokeWidth={5}
                      strokeDasharray="5 3" strokeLinecap="round" opacity={0.85}
                    />
                  )}
                  <circle cx={dot.cx} cy={dot.cy} r={4.5} fill="#b45309" opacity={0.55} />
                </>
              )}
              {/* Sprite normal — masqué quand sous terre */}
              {!dot.isUnderground && (
                <>
                  <circle cx={dot.cx} cy={dot.cy} r={5.5}
                    fill="none" stroke="rgba(255,255,255,0.45)" strokeWidth={0.75} />
                  <circle cx={dot.cx} cy={dot.cy} r={5} fill={dot.fill} stroke="rgba(0,0,0,0.6)" strokeWidth={1} />
                  <text
                    x={dot.cx} y={dot.cy + 1}
                    textAnchor="middle" dominantBaseline="middle"
                    fontSize={5} fontFamily="monospace" fontWeight="bold"
                    fill="rgba(0,0,0,0.7)"
                    style={{ pointerEvents: "none", userSelect: "none" }}
                  >
                    {dot.label}
                  </text>
                  {(!hpOnDamageOnly || dot.hpPct < 1) && (
                    <>
                      <rect x={barX} y={barY} width={BAR_W} height={BAR_H} rx={1} fill="rgba(0,0,0,0.45)" />
                      <rect x={barX} y={barY} width={BAR_W * dot.hpPct} height={BAR_H} rx={1} fill={hpColor} />
                    </>
                  )}
                </>
              )}
            </g>
          );
        })}
        {/* Debug: wall stats overlay */}
        {debugMode && replayResult && (placedWalls ?? []).map((w) => {
          const wr = replayResult.walls?.[w.instanceId];
          if (!wr) return null;
          const s    = Math.min(Math.floor(replayTime ?? 0), wr.hpPerSecond.length - 1);
          const hp   = wr.hpPerSecond[s] ?? WALL_HP[w.level];
          const dead = wr.destroyedAt !== null && (replayTime ?? 0) >= wr.destroyedAt;
          return (
            <text key={`dbg-w-${w.instanceId}`}
              x={w.x * cellPx + cellPx / 2} y={w.y * cellPx + cellPx / 2 + 1}
              textAnchor="middle" dominantBaseline="middle"
              fontSize={3.5} fontFamily="monospace"
              fill={dead ? "#ef4444" : "#fbbf24"} opacity={0.85}
              style={{ userSelect: "none" }}
            >{dead ? "✕" : hp}</text>
          );
        })}
        {/* Debug overlay — HP valeurs + distance cible */}
        {debugMode && replayDots?.map((dot) => {
          const hpVal = Math.round(dot.hpPct * 999); // approximation affichage
          return (
            <g key={`dbg-${dot.id}`} style={{ pointerEvents: "none" }}>
              <text x={dot.cx} y={dot.cy - 8}
                textAnchor="middle" fontSize={4.5} fontFamily="monospace"
                fill="#fbbf24" opacity={0.9}
                style={{ userSelect: "none" }}
              >{Math.round(dot.hpPct * 100)}%</text>
            </g>
          );
        })}
        {/* Debug: target line labels */}
        {debugMode && targetLines?.map((l, i) => {
          const mx = (l.x1 + l.x2) / 2;
          const my = (l.y1 + l.y2) / 2;
          const dist = Math.round(Math.hypot(l.x2 - l.x1, l.y2 - l.y1) / cellPx * 10) / 10;
          return (
            <text key={`dbg-tl-${i}`} x={mx} y={my}
              textAnchor="middle" fontSize={4} fontFamily="monospace"
              fill="#94a3b8" opacity={0.8}
              style={{ userSelect: "none" }}
            >{dist}t</text>
          );
        })}
      </svg>
    </div>
  );
}

// ── ReplayControls ─────────────────────────────────────────────────────────

function ReplayControls({
  durationSeconds, replayTime, playing, speed,
  onPlayPause, onSpeedToggle, onSeek, onClose,
}: {
  durationSeconds: number;
  replayTime: number;
  playing: boolean;
  speed: 1 | 2;
  onPlayPause: () => void;
  onSpeedToggle: () => void;
  onSeek: (t: number) => void;
  onClose: () => void;
}) {
  return (
    <div className="rounded-2xl border border-[#1e2a45] bg-[#06080f] p-4 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-slate-300">Replay</span>
        <button
          onClick={onClose}
          className="text-xs text-slate-500 hover:text-slate-300 transition-colors"
        >
          ✕ Fermer
        </button>
      </div>

      {/* Progress slider */}
      <div className="space-y-1">
        <input
          type="range"
          min={0}
          max={durationSeconds}
          step={0.05}
          value={replayTime}
          onChange={(e) => onSeek(Number(e.target.value))}
          className="w-full accent-cyan-400 cursor-pointer"
        />
        <div className="flex justify-between text-xs text-slate-500">
          <span>{replayTime.toFixed(1)} s</span>
          <span>{durationSeconds} s</span>
        </div>
      </div>

      {/* Buttons */}
      <div className="flex items-center gap-2">
        <button
          onClick={onPlayPause}
          className="rounded-lg bg-cyan-500 px-4 py-1.5 text-xs font-semibold text-black hover:bg-cyan-400 active:bg-cyan-600 transition-colors"
        >
          {playing ? "⏸ Pause" : "▶ Play"}
        </button>
        <button
          onClick={onSpeedToggle}
          className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors ${
            speed === 2
              ? "border-cyan-500 bg-cyan-500/10 text-cyan-400"
              : "border-[#1e2a45] text-slate-400 hover:border-slate-500"
          }`}
        >
          ×{speed}
        </button>
        {!playing && replayTime >= durationSeconds && (
          <button
            onClick={() => onSeek(0)}
            className="ml-auto text-xs text-slate-500 hover:text-slate-300 transition-colors"
          >
            ↺ Recommencer
          </button>
        )}
      </div>
    </div>
  );
}

// ── TroopPlacementPanel ────────────────────────────────────────────────────

function TroopPlacementPanel({
  slots, selectedSlotId, onSelectSlot, placedTroops, onRemoveTroop, onUpdateTiming,
}: {
  slots: TroopSlot[];
  selectedSlotId: string | null;
  onSelectSlot: (id: string | null) => void;
  placedTroops: PlacedTroop[];
  onRemoveTroop: (id: string) => void;
  onUpdateTiming: (id: string, t: number) => void;
}) {
  return (
    <div className="space-y-3">
      {/* Slot selector */}
      <div className="space-y-1">
        <p className="text-xs text-slate-500">Sélectionner le type à poser :</p>
        <div className="flex flex-wrap gap-1.5">
          {slots.map((slot, idx) => {
            const troop = TROOPS.find((t) => t.id === slot.troopId)!;
            const abbr  = TROOP_ABBREV[slot.troopId] ?? troop.name.slice(0, 2);
            const color = TROOP_COLORS[idx % TROOP_COLORS.length];
            const sel   = selectedSlotId === slot.slotId;
            return (
              <button
                key={slot.slotId}
                onClick={() => onSelectSlot(sel ? null : slot.slotId)}
                className={`rounded-lg border px-2.5 py-1 text-xs font-semibold transition-colors ${
                  sel
                    ? "border-cyan-500 bg-cyan-500/15 text-cyan-300"
                    : "border-[#1e2a45] text-slate-400 hover:border-slate-500"
                }`}
              >
                <span className={color}>{abbr}</span>
                <span className="ml-1 text-slate-500">Lv{slot.level}</span>
              </button>
            );
          })}
        </div>
        <p className="text-xs text-slate-600">
          {selectedSlotId ? "Cliquer sur la zone dorée pour poser une troupe" : "Aucune troupe sélectionnée"}
        </p>
      </div>

      {/* Placed troops list */}
      {placedTroops.length > 0 && (
        <div className="space-y-1">
          <p className="text-xs text-slate-500">Troupes placées ({placedTroops.length}) :</p>
          <div className="max-h-40 overflow-y-auto space-y-1">
            {placedTroops.map((pt) => {
              const troop = TROOPS.find((t) => t.id === pt.troopId)!;
              const abbr  = TROOP_ABBREV[pt.troopId] ?? troop.name.slice(0, 2);
              const slotIdx = slots.findIndex((s) => s.troopId === pt.troopId);
              const color = TROOP_COLORS[Math.max(0, slotIdx) % TROOP_COLORS.length];
              return (
                <div key={pt.instanceId} className="flex items-center gap-2 rounded-lg bg-[#0d1020] px-2.5 py-1.5 text-xs">
                  <span className={`font-semibold ${color}`}>{abbr}</span>
                  <span className="text-slate-500">Lv{pt.level}</span>
                  <span className="text-slate-600">({pt.x},{pt.y})</span>
                  <span className="text-slate-500 ml-auto flex-shrink-0">t=</span>
                  <input
                    type="number" min={0} step={0.5}
                    value={pt.deployAt}
                    onChange={(e) => onUpdateTiming(pt.instanceId, Number(e.target.value))}
                    className="w-12 rounded border border-[#1e2a45] bg-[#06080f] px-1 py-0.5 text-slate-200 focus:outline-none focus:ring-1 focus:ring-cyan-500"
                  />
                  <span className="text-slate-600">s</span>
                  <button
                    onClick={() => onRemoveTroop(pt.instanceId)}
                    className="ml-1 text-slate-600 hover:text-rose-400 transition-colors"
                  >×</button>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ── DefensePalette ─────────────────────────────────────────────────────────

function DefensePalette({
  palLevels,
  onLevelChange,
  cellSize,
  onDragItemStart,
  placedCounts = {},
  thLimits = {},
}: {
  palLevels: Record<string, number>;
  onLevelChange: (id: string, level: number) => void;
  cellSize: number;
  onDragItemStart?: (size: number) => void;
  placedCounts?: Record<string, number>;
  thLimits?: Record<string, number>;
}) {
  return (
    <div className="space-y-1.5">
      {DEFENSES.map((def) => {
        const level     = palLevels[def.id] ?? 1;
        const fill      = DEFENSE_FILL[def.id] ?? "#ef4444";
        const limit     = thLimits[def.id] ?? 0;
        const placed    = placedCounts[def.id] ?? 0;
        const atLimit   = limit > 0 && placed >= limit;
        const unavail   = limit === 0;
        const disabled  = atLimit || unavail;

        return (
          <div
            key={def.id}
            draggable={!disabled}
            onDragStart={(e) => {
              if (disabled) { e.preventDefault(); return; }
              e.dataTransfer.setData(
                "text/plain",
                JSON.stringify({ defenseId: def.id, level })
              );
              e.dataTransfer.effectAllowed = "copy";
              onDragItemStart?.(def.size ?? 1);

              // Image de drag : carré coloré à la vraie taille du bâtiment
              const tilePx = Math.round(cellSize * (def.size ?? 1));
              const ghost  = document.createElement("div");
              ghost.style.cssText = [
                `width:${tilePx}px`,
                `height:${tilePx}px`,
                `background:${fill}`,
                "border-radius:4px",
                "opacity:0.85",
                `box-shadow:0 2px 10px rgba(0,0,0,0.5)`,
                "position:fixed",
                `top:-${tilePx * 2}px`,  // hors écran
                "left:0",
                "pointer-events:none",
              ].join(";");
              document.body.appendChild(ghost);
              e.dataTransfer.setDragImage(ghost, tilePx / 2, tilePx / 2);
              // Le navigateur prend un snapshot synchrone ; on peut retirer
              setTimeout(() => document.body.removeChild(ghost), 0);
            }}
            className={`flex items-center gap-2.5 rounded-lg border px-3 py-2 transition-colors select-none ${
              disabled
                ? "border-slate-800 bg-[#080a10] cursor-not-allowed opacity-50"
                : "border-[#1e2a45] bg-[#0d1020] cursor-grab active:cursor-grabbing hover:border-slate-500"
            }`}
          >
            {/* Color swatch */}
            <div className="flex-shrink-0 rounded-sm" style={{ width: 10, height: 10, backgroundColor: disabled ? "#555" : fill }} />

            {/* Name */}
            <span className={`flex-1 text-xs font-medium truncate ${disabled ? "text-slate-500" : "text-slate-200"}`}>
              {def.name}
            </span>

            {/* TH count/limit badge */}
            {limit > 0 && (
              <span className={`text-xs font-mono flex-shrink-0 ${
                atLimit ? "text-red-400" : placed > 0 ? "text-amber-400" : "text-slate-500"
              }`}>
                {placed}/{limit}
              </span>
            )}
            {unavail && (
              <span className="text-xs text-slate-600 flex-shrink-0">—</span>
            )}

            {/* Level selector — stops propagation to prevent interfering with drag */}
            <div
              draggable={false}
              onDragStart={(e) => e.stopPropagation()}
              onClick={(e) => e.stopPropagation()}
            >
              <select
                value={level}
                onChange={(e) => onLevelChange(def.id, Number(e.target.value))}
                className="rounded border border-[#252f50] bg-[#06080f] text-xs text-slate-200 px-1 py-0.5 focus:outline-none focus:ring-1 focus:ring-cyan-500"
              >
                {def.levels.map((l) => (
                  <option key={l.level} value={l.level}>Lv {l.level}</option>
                ))}
              </select>
            </div>

            {/* Drag hint */}
            <span className="text-slate-600 text-xs" aria-hidden>⠿</span>
          </div>
        );
      })}
    </div>
  );
}

// ── BuildingPalette ────────────────────────────────────────────────────────

function BuildingPalette({
  palLevels,
  onLevelChange,
  cellSize,
  onDragItemStart,
}: {
  palLevels: Record<string, number>;
  onLevelChange: (id: string, level: number) => void;
  cellSize: number;
  onDragItemStart?: (size: number) => void;
}) {
  return (
    <div className="space-y-1.5 max-h-64 overflow-y-auto pr-1">
      {NEUTRAL_BUILDINGS.map((bld) => {
        const level = palLevels[bld.id] ?? bld.levels[bld.levels.length - 1].level;
        const fill  = BUILDING_FILL[bld.category] ?? BUILDING_FILL["building"];
        return (
          <div
            key={bld.id}
            draggable
            onDragStart={(e) => {
              e.dataTransfer.setData("text/plain", JSON.stringify({ buildingId: bld.id, level }));
              e.dataTransfer.effectAllowed = "copy";
              const tilePx = Math.round(cellSize * (bld.size ?? 1));
              const ghost  = document.createElement("div");
              ghost.style.cssText = [
                `width:${tilePx}px`, `height:${tilePx}px`,
                `background:${fill}`, "border-radius:3px",
                "border:1px dashed rgba(255,255,255,0.3)", "opacity:0.8",
                "position:fixed", `top:-${tilePx * 2}px`, "left:0", "pointer-events:none",
              ].join(";");
              document.body.appendChild(ghost);
              e.dataTransfer.setDragImage(ghost, tilePx / 2, tilePx / 2);
              setTimeout(() => document.body.removeChild(ghost), 0);
            }}
            className="flex items-center gap-2.5 rounded-lg border border-[#1e2a45] bg-[#0d1020] px-3 py-1.5 cursor-grab active:cursor-grabbing hover:border-slate-500 transition-colors select-none"
          >
            <div className="flex-shrink-0 rounded-sm" style={{ width: 8, height: 8, backgroundColor: fill }} />
            <span className="flex-1 text-xs font-medium text-slate-300 truncate">{bld.name}</span>
            <div draggable={false} onDragStart={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}>
              <select
                value={level}
                onChange={(e) => onLevelChange(bld.id, Number(e.target.value))}
                className="rounded border border-[#252f50] bg-[#06080f] text-xs text-slate-200 px-1 py-0.5 focus:outline-none focus:ring-1 focus:ring-cyan-500"
              >
                {bld.levels.map((l) => (
                  <option key={l.level} value={l.level}>Lv {l.level}</option>
                ))}
              </select>
            </div>
            <span className="text-slate-600 text-xs" aria-hidden>⠿</span>
          </div>
        );
      })}
    </div>
  );
}

// ── TroopComposer ──────────────────────────────────────────────────────────

function TroopComposer({
  slots,
  totalCount,
  onUpdate,
  onAdd,
  onRemove,
}: {
  slots: TroopSlot[];
  totalCount: number;
  onUpdate: (slotId: string, patch: Partial<Omit<TroopSlot, "slotId">>) => void;
  onAdd: () => void;
  onRemove: (slotId: string) => void;
}) {
  return (
    <div className="space-y-3">
      {slots.map((slot, idx) => {
        const troop = TROOPS.find((t) => t.id === slot.troopId)!;
        const lData = troop.levels.find((l) => l.level === slot.level)!;
        const color = TROOP_COLORS[idx % TROOP_COLORS.length];

        return (
          <div key={slot.slotId} className="flex items-end gap-2">
            <div className={`mb-2.5 h-2 w-2 flex-shrink-0 rounded-full bg-current ${color}`} />

            <div className="grid flex-1 grid-cols-3 gap-2 sm:grid-cols-[2fr_1fr_1fr_auto]">
              <Field label="Troupe">
                <Select value={slot.troopId} onChange={(e) => onUpdate(slot.slotId, { troopId: e.target.value })}>
                  {TROOPS.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </Select>
              </Field>
              <Field label={`Niv. (max ${troop.levels.length})`}>
                <Select value={slot.level} onChange={(e) => onUpdate(slot.slotId, { level: Number(e.target.value) })}>
                  {troop.levels.map((l) => <option key={l.level} value={l.level}>Lv {l.level}</option>)}
                </Select>
              </Field>
              <Field label="Qté">
                <Select value={slot.count} onChange={(e) => onUpdate(slot.slotId, { count: Number(e.target.value) })}>
                  {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                    <option key={n} value={n}>{n}</option>
                  ))}
                </Select>
              </Field>
              <div className="hidden sm:flex items-end pb-2.5">
                <p className="text-xs leading-tight text-slate-500">
                  {lData.hp} HP<br />{lData.dps} DPS
                </p>
              </div>
            </div>

            <button
              onClick={() => onRemove(slot.slotId)}
              disabled={slots.length <= 1}
              className="mb-1 rounded-lg p-1.5 text-lg leading-none text-slate-600 hover:bg-[#0d1020] hover:text-rose-400 disabled:pointer-events-none disabled:opacity-0 transition-colors"
            >×</button>
          </div>
        );
      })}

      <div className="flex items-center justify-between pt-1">
        <button
          onClick={onAdd}
          disabled={slots.length >= MAX_TROOP_SLOTS}
          className="rounded-lg border border-[#1e2a45] px-3 py-1.5 text-xs font-medium text-slate-300 hover:border-slate-500 hover:text-slate-100 disabled:cursor-not-allowed disabled:opacity-40 transition-colors"
        >
          + Ajouter un type
        </button>
        <p className="text-xs text-slate-400">
          <span className="font-semibold text-slate-200">{totalCount}</span>{" "}
          troupe{totalCount > 1 ? "s" : ""}
        </p>
      </div>
    </div>
  );
}

// ── ResultsSection ─────────────────────────────────────────────────────────

function ResultsSection({
  result, meta, placed, placedBuildings, placedWalls, totalTroops, survivors,
}: {
  result: SimulationResult;
  meta: TroopMeta[];
  placed: PlacedDefense[];
  placedBuildings: PlacedBuilding[];
  placedWalls: WallPlacement[];
  totalTroops: number;
  survivors: number;
}) {
  const destroyedCount = placed.filter(
    (d) => result.defenses[d.instanceId]?.destroyedAt !== null
  ).length;
  const destroyedBuildingsCount = placedBuildings.filter(
    (b) => result.buildings[b.instanceId]?.destroyedAt !== null
  ).length;

  return (
    <section className="rounded-2xl border border-[#141a30] bg-[#06080f] p-6 space-y-6">
      <h2 className="text-base font-semibold text-slate-100">Résultats</h2>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-3">
        <StatCard label="Durée" value={`${result.durationSeconds} secondes`} />
        <StatCard label="Troupes survivantes" value={`${survivors} / ${totalTroops}`} />
        <StatCard label="Défenses détruites" value={`${destroyedCount} / ${placed.length}`} accent />
      </div>

      {/* Per-defense cards */}
      <div>
        <p className="mb-3 text-xs text-slate-500">État des défenses</p>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {placed.map((d) => {
            const dr  = result.defenses[d.instanceId];
            const def = DEFENSES.find((def) => def.id === d.defenseId)!;
            const firstShot = result.shots.find((s) => s.defInstId === d.instanceId);
            return (
              <DefenseResultCard
                key={d.instanceId}
                name={`${def.name} Lv${d.level}`}
                position={{ x: d.x, y: d.y }}
                destroyedAt={dr?.destroyedAt ?? null}
                damageDealt={dr?.totalDamageDealt ?? 0}
                color={DEFENSE_FILL[d.defenseId] ?? "#ef4444"}
                firstShotTime={firstShot?.time ?? null}
                attackSpeed={def.attackSpeed}
              />
            );
          })}
        </div>
      </div>

      {/* Neutral buildings results */}
      {placedBuildings.length > 0 && (
        <div>
          <p className="mb-3 text-xs text-slate-500">
            Bâtiments neutres &nbsp;·&nbsp; {destroyedBuildingsCount}/{placedBuildings.length} détruits
          </p>
          <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
            {placedBuildings.map((b) => {
              const br  = result.buildings[b.instanceId];
              const bld = NEUTRAL_BUILDINGS.find((nb) => nb.id === b.buildingId);
              const cat = bld?.category ?? "building";
              const fill = BUILDING_FILL[cat] ?? BUILDING_FILL["building"];
              const done = br?.destroyedAt !== null;
              return (
                <div key={b.instanceId} className="rounded-xl bg-[#0d1020] px-3 py-2 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <div className="h-2 w-2 flex-shrink-0 rounded-sm" style={{ backgroundColor: fill }} />
                    <span className="truncate text-xs text-slate-200">{bld?.name ?? b.buildingId} Lv{b.level}</span>
                  </div>
                  <span className={`flex-shrink-0 text-xs font-semibold ${done ? "text-cyan-400" : "text-slate-500"}`}>
                    {done ? `t=${br.destroyedAt!.toFixed(1)}s` : "Survit"}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Wall results */}
      {placedWalls.length > 0 && (() => {
        const wallEntries = placedWalls.map((w) => {
          const wr = result.walls?.[w.instanceId];
          const destroyed = wr?.destroyedAt !== null && wr?.destroyedAt !== undefined;
          const damageReceived = wr
            ? (WALL_HP[w.level] ?? 100) - (wr.hpPerSecond[wr.hpPerSecond.length - 1] ?? 0)
            : 0;
          return { w, wr, destroyed, damageReceived };
        });
        const destroyedWalls = wallEntries.filter((e) => e.destroyed).sort((a, b) => (a.wr!.destroyedAt ?? 0) - (b.wr!.destroyedAt ?? 0));
        const totalDmgWalls = wallEntries.reduce((s, e) => s + e.damageReceived, 0);
        const firstDestroyed = destroyedWalls[0];
        return (
          <div className="space-y-2">
            <p className="text-xs text-slate-500">
              Murs &nbsp;·&nbsp;
              <span className="text-white">{destroyedWalls.length}</span>/{placedWalls.length} détruits
              {totalDmgWalls > 0 && <> &nbsp;·&nbsp; {Math.round(totalDmgWalls)} dégâts reçus</>}
            </p>
            {firstDestroyed && (
              <p className="text-xs text-amber-400">
                Premier mur détruit à t={firstDestroyed.wr!.destroyedAt!.toFixed(1)}s
                &nbsp;({firstDestroyed.w.x},{firstDestroyed.w.y}) Lv{firstDestroyed.w.level}
              </p>
            )}
            {destroyedWalls.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {destroyedWalls.slice(0, 12).map(({ w, wr }) => (
                  <span key={w.instanceId}
                    className="rounded bg-red-900/30 px-1.5 py-0.5 text-xs text-red-300 border border-red-800/40">
                    ({w.x},{w.y}) t={wr!.destroyedAt!.toFixed(1)}s
                  </span>
                ))}
                {destroyedWalls.length > 12 && (
                  <span className="text-xs text-slate-500">+{destroyedWalls.length - 12} autres</span>
                )}
              </div>
            )}
          </div>
        );
      })()}

      {/* Eliminated troops */}
      {meta.some((m) => result.troops[m.instanceId]?.destroyedAt !== null) && (
        <div className="space-y-0.5 text-xs text-slate-400">
          <p className="mb-1 text-slate-500">Troupes éliminées</p>
          {meta
            .filter((m) => result.troops[m.instanceId]?.destroyedAt !== null)
            .map((m) => (
              <p key={m.instanceId}>
                <span className={`font-mono font-medium ${m.color}`}>{m.label}</span>
                {" "}— morte à t={result.troops[m.instanceId]!.destroyedAt!.toFixed(1)} sec
              </p>
            ))}
        </div>
      )}

      {/* HP table */}
      <div>
        <p className="mb-3 text-xs text-slate-500">HP des troupes par seconde</p>
        <div className="overflow-x-auto">
          <HpTable result={result} meta={meta} />
        </div>
      </div>

      {/* Combat logs */}
      {result.targetChanges.length > 0 && (
        <div>
          <p className="mb-2 text-xs text-slate-500">Logs de combat — changements de cible ({result.targetChanges.length})</p>
          <div className="max-h-48 overflow-y-auto rounded-xl bg-slate-950 p-3 space-y-0.5 font-mono text-xs">
            {result.targetChanges.map((ev, i) => {
              const troopMeta = meta.find((m) => m.instanceId === ev.troopInstId);
              const label     = troopMeta?.label ?? ev.troopId;
              const color     = troopMeta?.color ?? "text-slate-400";
              const oldDef    = placed.find((d) => d.instanceId === ev.oldTargetId);
              const newDef    = placed.find((d) => d.instanceId === ev.newTargetId);
              const oldName   = oldDef ? `${DEFENSES.find((d) => d.id === oldDef.defenseId)?.name ?? oldDef.defenseId} Lv${oldDef.level}` : "—";
              const newName   = newDef ? `${DEFENSES.find((d) => d.id === newDef.defenseId)?.name ?? newDef.defenseId} Lv${newDef.level}` : "—";
              const reasonLabel = ev.reason === "initial" ? "1ère cible" : ev.reason === "destroyed" ? "détruite" : "plus de cible";
              return (
                <div key={i} className="flex items-baseline gap-1.5 text-slate-400">
                  <span className="text-slate-600 flex-shrink-0">t={ev.time.toFixed(1)}s</span>
                  <span className={`font-semibold flex-shrink-0 ${color}`}>{label}</span>
                  <span className="text-slate-600">→</span>
                  {ev.reason === "initial" ? (
                    <span className="text-emerald-400">{newName}</span>
                  ) : (
                    <>
                      <span className="line-through text-slate-600">{oldName}</span>
                      <span className="text-slate-600">→</span>
                      <span className={ev.newTargetId ? "text-cyan-400" : "text-red-500"}>{newName}</span>
                    </>
                  )}
                  <span className="text-slate-700 ml-auto flex-shrink-0">({reasonLabel})</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}

// ── DefenseResultCard ──────────────────────────────────────────────────────

function DefenseResultCard({
  name, position, destroyedAt, damageDealt, color, firstShotTime, attackSpeed,
}: {
  name: string; position: Vec2;
  destroyedAt: number | null; damageDealt: number; color: string;
  firstShotTime: number | null; attackSpeed: number;
}) {
  const done = destroyedAt !== null;
  const delay = firstShotTime !== null ? firstShotTime.toFixed(2) : null;
  const cooldownOk = firstShotTime !== null && firstShotTime >= attackSpeed - 0.15;
  return (
    <div className="rounded-xl bg-[#0d1020] px-4 py-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className="mt-0.5 h-2.5 w-2.5 flex-shrink-0 rounded-sm" style={{ backgroundColor: color }} />
          <div className="min-w-0">
            <p className="truncate text-xs font-medium text-slate-200">{name}</p>
            <p className="text-xs text-slate-500">({position.x}, {position.y})</p>
          </div>
        </div>
        <span className={`flex-shrink-0 text-xs font-semibold ${done ? "text-cyan-400" : "text-slate-500"}`}>
          {done ? "Détruit" : "Survit"}
        </span>
      </div>
      <p className="mt-1.5 text-xs text-slate-500">
        {done ? `t=${destroyedAt!.toFixed(1)} sec · ` : ""}
        {damageDealt.toLocaleString()} HP infligés
      </p>
      {delay !== null && (
        <p className={`mt-0.5 text-xs font-mono ${cooldownOk ? "text-emerald-400" : "text-rose-400"}`}>
          {cooldownOk ? "✓" : "✗"} 1er tir à t={delay}s
          <span className="text-slate-600 ml-1">(vitesse d&apos;attaque : {attackSpeed}s)</span>
        </p>
      )}
    </div>
  );
}

// ── HpTable ────────────────────────────────────────────────────────────────

function HpTable({ result, meta }: { result: SimulationResult; meta: TroopMeta[] }) {
  const maxT = Math.floor(result.durationSeconds);
  const groups: { slotId: string; troopName: string; color: string; members: TroopMeta[] }[] = [];
  for (const m of meta) {
    const g = groups.find((g) => g.slotId === m.slotId);
    if (g) g.members.push(m);
    else groups.push({ slotId: m.slotId, troopName: m.troopName, color: m.color, members: [m] });
  }

  return (
    <table className="w-full text-right font-mono text-xs">
      <thead>
        <tr className="border-b border-[#1e2a45]">
          <th className="pb-1 pr-4 text-left" />
          {groups.map((g) => (
            <th key={g.slotId} colSpan={g.members.length} className={`pb-1 px-2 text-center font-semibold ${g.color}`}>
              {g.troopName}
            </th>
          ))}
        </tr>
        <tr className="border-b border-[#141a30] text-slate-500">
          <th className="pb-2 pr-4 text-left">t</th>
          {meta.map((m) => <th key={m.instanceId} className={`px-2 pb-2 ${m.color}`}>{m.label}</th>)}
        </tr>
      </thead>
      <tbody>
        {Array.from({ length: maxT + 1 }, (_, t) => (
          <tr key={t} className="border-b border-[#141a30]/40 hover:bg-[#0d1020]/30">
            <td className="py-1 pr-4 text-left text-slate-500">{t}s</td>
            {meta.map((m) => {
              const tr   = result.troops[m.instanceId];
              const hp   = tr?.hpPerSecond[t] ?? 0;
              const dead = hp === 0 && tr?.destroyedAt !== null;
              const pct  = hp / m.maxHp;
              const c    = dead ? "text-slate-600" : pct > 0.6 ? "text-slate-200" : pct > 0.3 ? "text-cyan-400" : "text-red-400";
              return <td key={m.instanceId} className={`px-2 py-1 ${c}`}>{dead ? "—" : hp}</td>;
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ── Primitives ─────────────────────────────────────────────────────────────

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="block text-xs font-medium text-slate-400">{label}</label>
      {children}
    </div>
  );
}

function Select({ value, onChange, children }: {
  value: string | number;
  onChange: React.ChangeEventHandler<HTMLSelectElement>;
  children: React.ReactNode;
}) {
  return (
    <select
      value={value}
      onChange={onChange}
      className="w-full rounded-lg border border-[#1e2a45] bg-[#0d1020] px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-cyan-500"
    >
      {children}
    </select>
  );
}

function StatCard({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded-xl bg-[#0d1020] px-4 py-3">
      <p className="text-xs text-slate-500">{label}</p>
      <p className={`mt-0.5 text-sm font-semibold ${accent ? "text-cyan-400" : "text-slate-200"}`}>{value}</p>
    </div>
  );
}
