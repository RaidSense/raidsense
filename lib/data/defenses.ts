export type TargetType = "Ground" | "Air" | "Ground & Air";

export interface DefenseLevel {
  level: number;
  hp: number;
  /** Default DPS. For Inferno multi mode: per-target DPS. */
  dps: number;
  minRange: number;
  maxRange: number;
  townHallRequired: number;
  // ── Inferno Tower single-target ramp-up tiers ────────────────────────────
  dpsSingleInit?: number; // 0 – 1.5 s on same target
  dpsSingleMid?:  number; // 1.5 s – 5.25 s
  dpsSingleMax?:  number; // 5.25 s+
  // ── Inferno Tower multi-target mode ─────────────────────────────────────
  multiTargetCount?: number; // simultaneous targets (default 5 or 6)
  // ── Bomb Tower death explosion ────────────────────────────────────────────
  deathExplosionDamage?: number; // ground-troop splash damage at destruction
  // ── Air Sweeper pulse ─────────────────────────────────────────────────────
  pushStrength?: number;         // tiles pushed per pulse (air-sweeper only)
}

export interface Defense {
  id: string;
  name: string;
  targetType: TargetType;
  /** Side length of the building footprint in tiles (always square). */
  size: number;
  /** Seconds between attacks. */
  attackSpeed: number;
  /** Splash radius in tiles — used when splashType is "radius". */
  splashRadius?: number;
  /**
   * How the splash zone is resolved after hitting the primary target.
   * "radius"      — circular zone of `splashRadius` tiles (mortar, wizard-tower, eagle-artillery).
   * "scattershot" — zoned falloff behind the primary target (see applyScattershotSplash).
   * Omitted       — no splash.
   */
  splashType?: "radius" | "scattershot";
  /** Non-obvious mechanics: modes, splash radius, activation conditions, etc. */
  notes?: string;
  /**
   * Proximity radius (tiles) that triggers activation from hidden state.
   * Only used by Hidden Tesla. Undefined / 0 = always active (normal defenses).
   */
  activationRadius?: number;
  /**
   * Radius (tiles) of the death explosion on destruction.
   * Only used by Bomb Tower. Affects ground troops only.
   */
  deathExplosionRadius?: number;
  /** Seconds between pulses. Only used by Air Sweeper (5). */
  pulseInterval?: number;
  /** Sweep cone width in degrees. Only used by Air Sweeper (120). */
  coneAngle?: number;
  levels: DefenseLevel[];
}

export const DEFENSES: Defense[] = [
  {
    id: "cannon",
    name: "Cannon",
    targetType: "Ground",
    size: 3,
    attackSpeed: 0.8,
    levels: [
      { level: 1,  hp: 420,   dps: 9,   minRange: 0, maxRange: 9, townHallRequired: 1  },
      { level: 2,  hp: 470,   dps: 12,  minRange: 0, maxRange: 9, townHallRequired: 1  },
      { level: 3,  hp: 520,   dps: 16,  minRange: 0, maxRange: 9, townHallRequired: 2  },
      { level: 4,  hp: 570,   dps: 22,  minRange: 0, maxRange: 9, townHallRequired: 3  },
      { level: 5,  hp: 620,   dps: 30,  minRange: 0, maxRange: 9, townHallRequired: 4  },
      { level: 6,  hp: 680,   dps: 40,  minRange: 0, maxRange: 9, townHallRequired: 5  },
      { level: 7,  hp: 740,   dps: 54,  minRange: 0, maxRange: 9, townHallRequired: 5  },
      { level: 8,  hp: 800,   dps: 72,  minRange: 0, maxRange: 9, townHallRequired: 6  },
      { level: 9,  hp: 860,   dps: 96,  minRange: 0, maxRange: 9, townHallRequired: 7  },
      { level: 10, hp: 930,   dps: 128, minRange: 0, maxRange: 9, townHallRequired: 8  },
      { level: 11, hp: 1000,  dps: 170, minRange: 0, maxRange: 9, townHallRequired: 9  },
      { level: 12, hp: 1080,  dps: 200, minRange: 0, maxRange: 9, townHallRequired: 10 },
      { level: 13, hp: 1170,  dps: 235, minRange: 0, maxRange: 9, townHallRequired: 11 },
      { level: 14, hp: 1270,  dps: 276, minRange: 0, maxRange: 9, townHallRequired: 12 },
      { level: 15, hp: 1380,  dps: 323, minRange: 0, maxRange: 9, townHallRequired: 12 },
      { level: 16, hp: 1500,  dps: 378, minRange: 0, maxRange: 9, townHallRequired: 13 },
      { level: 17, hp: 1630,  dps: 441, minRange: 0, maxRange: 9, townHallRequired: 14 },
      { level: 18, hp: 1770,  dps: 514, minRange: 0, maxRange: 9, townHallRequired: 15 },
      { level: 19, hp: 1920,  dps: 598, minRange: 0, maxRange: 9, townHallRequired: 16 },
      { level: 20, hp: 2080,  dps: 696, minRange: 0, maxRange: 9, townHallRequired: 16 },
    ],
  },
  {
    id: "archer-tower",
    name: "Archer Tower",
    targetType: "Ground & Air",
    size: 3,
    attackSpeed: 0.5,
    notes: "Two configurable range modes: Long-range (range 10, targets ground & air) and Short-range (range 7, faster fire rate). Data uses Long-range mode (range 10).",
    levels: [
      { level: 1,  hp: 380,  dps: 11,  minRange: 0, maxRange: 10, townHallRequired: 1  },
      { level: 2,  hp: 420,  dps: 15,  minRange: 0, maxRange: 10, townHallRequired: 2  },
      { level: 3,  hp: 460,  dps: 19,  minRange: 0, maxRange: 10, townHallRequired: 3  },
      { level: 4,  hp: 500,  dps: 25,  minRange: 0, maxRange: 10, townHallRequired: 4  },
      { level: 5,  hp: 540,  dps: 33,  minRange: 0, maxRange: 10, townHallRequired: 5  },
      { level: 6,  hp: 580,  dps: 44,  minRange: 0, maxRange: 10, townHallRequired: 5  },
      { level: 7,  hp: 630,  dps: 58,  minRange: 0, maxRange: 10, townHallRequired: 6  },
      { level: 8,  hp: 700,  dps: 76,  minRange: 0, maxRange: 10, townHallRequired: 7  },
      { level: 9,  hp: 780,  dps: 100, minRange: 0, maxRange: 10, townHallRequired: 8  },
      { level: 10, hp: 870,  dps: 132, minRange: 0, maxRange: 10, townHallRequired: 9  },
      { level: 11, hp: 960,  dps: 165, minRange: 0, maxRange: 10, townHallRequired: 10 },
      { level: 12, hp: 1050, dps: 193, minRange: 0, maxRange: 10, townHallRequired: 11 },
      { level: 13, hp: 1150, dps: 226, minRange: 0, maxRange: 10, townHallRequired: 12 },
      { level: 14, hp: 1260, dps: 264, minRange: 0, maxRange: 10, townHallRequired: 12 },
      { level: 15, hp: 1380, dps: 309, minRange: 0, maxRange: 10, townHallRequired: 13 },
      { level: 16, hp: 1510, dps: 361, minRange: 0, maxRange: 10, townHallRequired: 14 },
      { level: 17, hp: 1650, dps: 421, minRange: 0, maxRange: 10, townHallRequired: 15 },
      { level: 18, hp: 1800, dps: 491, minRange: 0, maxRange: 10, townHallRequired: 16 },
      { level: 19, hp: 1960, dps: 572, minRange: 0, maxRange: 10, townHallRequired: 16 },
      { level: 20, hp: 2130, dps: 665, minRange: 0, maxRange: 10, townHallRequired: 16 },
    ],
  },
  {
    id: "mortar",
    name: "Mortar",
    targetType: "Ground",
    size: 3,
    attackSpeed: 5,
    splashRadius: 1.5,
    splashType: "radius",
    notes: "Splash weapon (radius 1.5 tiles). Min range 4 — cannot target nearby units. DPS is low because damage is delivered as heavy area-splash per slow shot.",
    levels: [
      { level: 1,  hp: 400,  dps: 4,  minRange: 4, maxRange: 11, townHallRequired: 3  },
      { level: 2,  hp: 450,  dps: 5,  minRange: 4, maxRange: 11, townHallRequired: 4  },
      { level: 3,  hp: 500,  dps: 7,  minRange: 4, maxRange: 11, townHallRequired: 5  },
      { level: 4,  hp: 550,  dps: 9,  minRange: 4, maxRange: 11, townHallRequired: 6  },
      { level: 5,  hp: 600,  dps: 11, minRange: 4, maxRange: 11, townHallRequired: 7  },
      { level: 6,  hp: 660,  dps: 14, minRange: 4, maxRange: 11, townHallRequired: 8  },
      { level: 7,  hp: 730,  dps: 18, minRange: 4, maxRange: 11, townHallRequired: 9  },
      { level: 8,  hp: 810,  dps: 22, minRange: 4, maxRange: 11, townHallRequired: 10 },
      { level: 9,  hp: 900,  dps: 28, minRange: 4, maxRange: 11, townHallRequired: 11 },
      { level: 10, hp: 1000, dps: 36, minRange: 4, maxRange: 11, townHallRequired: 12 },
      { level: 11, hp: 1110, dps: 46, minRange: 4, maxRange: 11, townHallRequired: 13 },
      { level: 12, hp: 1230, dps: 58, minRange: 4, maxRange: 11, townHallRequired: 14 },
      { level: 13, hp: 1360, dps: 73, minRange: 4, maxRange: 11, townHallRequired: 15 },
      { level: 14, hp: 1500, dps: 92, minRange: 4, maxRange: 11, townHallRequired: 16 },
    ],
  },
  {
    id: "air-defense",
    name: "Air Defense",
    targetType: "Air",
    size: 3,
    attackSpeed: 1,
    levels: [
      { level: 1,  hp: 800,  dps: 80,  minRange: 0, maxRange: 10, townHallRequired: 4  },
      { level: 2,  hp: 850,  dps: 110, minRange: 0, maxRange: 10, townHallRequired: 5  },
      { level: 3,  hp: 900,  dps: 140, minRange: 0, maxRange: 10, townHallRequired: 6  },
      { level: 4,  hp: 950,  dps: 160, minRange: 0, maxRange: 10, townHallRequired: 7  },
      { level: 5,  hp: 1000, dps: 190, minRange: 0, maxRange: 10, townHallRequired: 8  },
      { level: 6,  hp: 1050, dps: 230, minRange: 0, maxRange: 10, townHallRequired: 9  },
      { level: 7,  hp: 1100, dps: 280, minRange: 0, maxRange: 10, townHallRequired: 10 },
      { level: 8,  hp: 1210, dps: 320, minRange: 0, maxRange: 10, townHallRequired: 11 },
      { level: 9,  hp: 1300, dps: 360, minRange: 0, maxRange: 10, townHallRequired: 12 },
      { level: 10, hp: 1400, dps: 400, minRange: 0, maxRange: 10, townHallRequired: 13 },
      { level: 11, hp: 1500, dps: 440, minRange: 0, maxRange: 10, townHallRequired: 14 },
      { level: 12, hp: 1650, dps: 500, minRange: 0, maxRange: 10, townHallRequired: 15 },
      { level: 13, hp: 1750, dps: 540, minRange: 0, maxRange: 10, townHallRequired: 16 },
      { level: 14, hp: 1850, dps: 600, minRange: 0, maxRange: 10, townHallRequired: 16 },
      { level: 15, hp: 1950, dps: 650, minRange: 0, maxRange: 10, townHallRequired: 16 },
      { level: 16, hp: 2000, dps: 700, minRange: 0, maxRange: 10, townHallRequired: 16 },
    ],
  },
  {
    id: "wizard-tower",
    name: "Wizard Tower",
    targetType: "Ground & Air",
    size: 3,
    attackSpeed: 1,
    splashRadius: 1.5,
    splashType: "radius",
    notes: "Splash weapon (radius 1.5 tiles). Hits all units within splash radius around the targeted unit.",
    levels: [
      { level: 1,  hp: 620,  dps: 11,  minRange: 0, maxRange: 7, townHallRequired: 5  },
      { level: 2,  hp: 700,  dps: 16,  minRange: 0, maxRange: 7, townHallRequired: 5  },
      { level: 3,  hp: 790,  dps: 22,  minRange: 0, maxRange: 7, townHallRequired: 6  },
      { level: 4,  hp: 880,  dps: 30,  minRange: 0, maxRange: 7, townHallRequired: 7  },
      { level: 5,  hp: 980,  dps: 40,  minRange: 0, maxRange: 7, townHallRequired: 8  },
      { level: 6,  hp: 1090, dps: 54,  minRange: 0, maxRange: 7, townHallRequired: 9  },
      { level: 7,  hp: 1210, dps: 72,  minRange: 0, maxRange: 7, townHallRequired: 10 },
      { level: 8,  hp: 1350, dps: 97,  minRange: 0, maxRange: 7, townHallRequired: 11 },
      { level: 9,  hp: 1500, dps: 130, minRange: 0, maxRange: 7, townHallRequired: 12 },
      { level: 10, hp: 1670, dps: 174, minRange: 0, maxRange: 7, townHallRequired: 13 },
      { level: 11, hp: 1860, dps: 233, minRange: 0, maxRange: 7, townHallRequired: 14 },
      { level: 12, hp: 2070, dps: 311, minRange: 0, maxRange: 7, townHallRequired: 15 },
      { level: 13, hp: 2300, dps: 416, minRange: 0, maxRange: 7, townHallRequired: 16 },
    ],
  },
  {
    id: "x-bow",
    name: "X-Bow",
    // Default: Ground-only (range 14). "both" mode uses range 11.5 and targets Ground & Air.
    targetType: "Ground",
    size: 3,
    attackSpeed: 0.128,
    notes: "Configurable mode: Ground-only (range 14) or Ground+Air (range 11.5). Damage per tick = DPS × 0.128. Must be reloaded with Elixir.",
    levels: [
      { level: 1,  hp: 1500, dps: 60,  minRange: 0, maxRange: 14, townHallRequired: 9  },
      { level: 2,  hp: 1900, dps: 70,  minRange: 0, maxRange: 14, townHallRequired: 9  },
      { level: 3,  hp: 2300, dps: 80,  minRange: 0, maxRange: 14, townHallRequired: 10 },
      { level: 4,  hp: 2700, dps: 85,  minRange: 0, maxRange: 14, townHallRequired: 11 },
      { level: 5,  hp: 3100, dps: 95,  minRange: 0, maxRange: 14, townHallRequired: 12 },
      { level: 6,  hp: 3400, dps: 110, minRange: 0, maxRange: 14, townHallRequired: 13 },
      { level: 7,  hp: 3700, dps: 130, minRange: 0, maxRange: 14, townHallRequired: 14 },
      { level: 8,  hp: 4000, dps: 155, minRange: 0, maxRange: 14, townHallRequired: 15 },
      { level: 9,  hp: 4200, dps: 185, minRange: 0, maxRange: 14, townHallRequired: 16 },
      { level: 10, hp: 4400, dps: 205, minRange: 0, maxRange: 14, townHallRequired: 16 },
      { level: 11, hp: 4600, dps: 225, minRange: 0, maxRange: 14, townHallRequired: 16 },
      { level: 12, hp: 4800, dps: 235, minRange: 0, maxRange: 14, townHallRequired: 16 },
      { level: 13, hp: 5000, dps: 245, minRange: 0, maxRange: 14, townHallRequired: 16 },
    ],
  },
  {
    id: "inferno-tower",
    name: "Inferno Tower",
    targetType: "Ground & Air",
    size: 2,
    attackSpeed: 0.128,
    notes: "Single-target: DPS ramps at 3 tiers (0–1.5s / 1.5–5.25s / 5.25s+), resets on target change. Multi-target: constant DPS hitting 5 (lv1-7) or 6 (lv8+) targets simultaneously. Default mode: multi.",
    levels: [
      { level: 1,  hp: 1500, dps: 30,  dpsSingleInit: 30,  dpsSingleMid: 80,  dpsSingleMax: 800,  multiTargetCount: 5, minRange: 0, maxRange: 9, townHallRequired: 10 },
      { level: 2,  hp: 1800, dps: 35,  dpsSingleInit: 35,  dpsSingleMid: 100, dpsSingleMax: 1000, multiTargetCount: 5, minRange: 0, maxRange: 9, townHallRequired: 10 },
      { level: 3,  hp: 2100, dps: 40,  dpsSingleInit: 40,  dpsSingleMid: 120, dpsSingleMax: 1200, multiTargetCount: 5, minRange: 0, maxRange: 9, townHallRequired: 11 },
      { level: 4,  hp: 2400, dps: 45,  dpsSingleInit: 45,  dpsSingleMid: 140, dpsSingleMax: 1400, multiTargetCount: 5, minRange: 0, maxRange: 9, townHallRequired: 12 },
      { level: 5,  hp: 2700, dps: 50,  dpsSingleInit: 50,  dpsSingleMid: 150, dpsSingleMax: 1500, multiTargetCount: 5, minRange: 0, maxRange: 9, townHallRequired: 13 },
      { level: 6,  hp: 3000, dps: 55,  dpsSingleInit: 55,  dpsSingleMid: 160, dpsSingleMax: 1600, multiTargetCount: 5, minRange: 0, maxRange: 9, townHallRequired: 14 },
      { level: 7,  hp: 3300, dps: 65,  dpsSingleInit: 65,  dpsSingleMid: 180, dpsSingleMax: 1800, multiTargetCount: 5, minRange: 0, maxRange: 9, townHallRequired: 15 },
      { level: 8,  hp: 3700, dps: 80,  dpsSingleInit: 80,  dpsSingleMid: 210, dpsSingleMax: 2100, multiTargetCount: 6, minRange: 0, maxRange: 9, townHallRequired: 16 },
      { level: 9,  hp: 4000, dps: 100, dpsSingleInit: 100, dpsSingleMid: 230, dpsSingleMax: 2300, multiTargetCount: 6, minRange: 0, maxRange: 9, townHallRequired: 16 },
      { level: 10, hp: 4400, dps: 120, dpsSingleInit: 120, dpsSingleMid: 260, dpsSingleMax: 2600, multiTargetCount: 6, minRange: 0, maxRange: 9, townHallRequired: 16 },
      { level: 11, hp: 4800, dps: 140, dpsSingleInit: 140, dpsSingleMid: 290, dpsSingleMax: 2900, multiTargetCount: 6, minRange: 0, maxRange: 9, townHallRequired: 16 },
      { level: 12, hp: 5100, dps: 155, dpsSingleInit: 155, dpsSingleMid: 330, dpsSingleMax: 3300, multiTargetCount: 6, minRange: 0, maxRange: 9, townHallRequired: 16 },
    ],
  },
  {
    id: "eagle-artillery",
    name: "Eagle Artillery",
    targetType: "Ground & Air",
    size: 4,
    attackSpeed: 1,
    splashRadius: 3,
    splashType: "radius",
    notes: "Fires a burst of 3 shells with area splash. Inactive until 150 housing spaces of troops have been deployed. Min range 7 — cannot hit nearby units.",
    levels: [
      { level: 1, hp: 4000,  dps: 112, minRange: 7, maxRange: 50, townHallRequired: 11 },
      { level: 2, hp: 5000,  dps: 135, minRange: 7, maxRange: 50, townHallRequired: 11 },
      { level: 3, hp: 6200,  dps: 162, minRange: 7, maxRange: 50, townHallRequired: 12 },
      { level: 4, hp: 7700,  dps: 194, minRange: 7, maxRange: 50, townHallRequired: 13 },
      { level: 5, hp: 9500,  dps: 233, minRange: 7, maxRange: 50, townHallRequired: 14 },
      { level: 6, hp: 11700, dps: 280, minRange: 7, maxRange: 50, townHallRequired: 15 },
      { level: 7, hp: 14400, dps: 336, minRange: 7, maxRange: 50, townHallRequired: 16 },
    ],
  },
  {
    id: "scattershot",
    name: "Scattershot",
    targetType: "Ground & Air",
    size: 3,
    attackSpeed: 3.2,
    splashType: "scattershot",
    notes: "Area-splash weapon. Near zone (≤1 tile from primary): 100% damage. Far zone (1–5 tiles): 50% damage. Range 3–10 tiles.",
    levels: [
      { level: 1, hp: 3000, dps: 90,  minRange: 3, maxRange: 10, townHallRequired: 13 },
      { level: 2, hp: 3600, dps: 108, minRange: 3, maxRange: 10, townHallRequired: 13 },
      { level: 3, hp: 4320, dps: 130, minRange: 3, maxRange: 10, townHallRequired: 14 },
      { level: 4, hp: 5180, dps: 156, minRange: 3, maxRange: 10, townHallRequired: 15 },
      { level: 5, hp: 6220, dps: 187, minRange: 3, maxRange: 10, townHallRequired: 16 },
    ],
  },
  {
    id: "air-sweeper",
    name: "Souffleur d'Air",
    targetType: "Air",
    size: 2,
    attackSpeed: 1,   // unused — air-sweeper uses pulseInterval, not standard attack
    pulseInterval: 5, // seconds between sweeps
    coneAngle: 120,   // degrees
    notes: "Repousse les troupes aériennes dans un cône de 120°. Portée 15. Push instantané toutes les 5s. Orientable (0=droite, 90=bas, 180=gauche, 270=haut).",
    levels: [
      { level: 1, hp:  750, dps: 0, minRange: 0, maxRange: 15, townHallRequired:  6, pushStrength: 1.6 },
      { level: 2, hp:  800, dps: 0, minRange: 0, maxRange: 15, townHallRequired:  6, pushStrength: 2.0 },
      { level: 3, hp:  850, dps: 0, minRange: 0, maxRange: 15, townHallRequired:  7, pushStrength: 2.4 },
      { level: 4, hp:  900, dps: 0, minRange: 0, maxRange: 15, townHallRequired:  8, pushStrength: 2.8 },
      { level: 5, hp:  950, dps: 0, minRange: 0, maxRange: 15, townHallRequired:  9, pushStrength: 3.2 },
      { level: 6, hp: 1000, dps: 0, minRange: 0, maxRange: 15, townHallRequired: 10, pushStrength: 3.6 },
      { level: 7, hp: 1050, dps: 0, minRange: 0, maxRange: 15, townHallRequired: 11, pushStrength: 4.0 },
    ],
  },
  {
    id: "bomb-tower",
    name: "Tour à Bombes",
    targetType: "Ground",
    size: 3,
    attackSpeed: 1.1,
    splashRadius: 1.5,
    splashType: "radius",
    deathExplosionRadius: 2.75,
    notes: "Splash au sol (rayon 1.5). Explose à la destruction : inflige deathExplosionDamage aux troupes au sol dans un rayon de 2.75 cases.",
    levels: [
      { level:  1, hp:  650, dps: 24, minRange: 0, maxRange: 6, townHallRequired:  8, deathExplosionDamage: 150 },
      { level:  2, hp:  700, dps: 28, minRange: 0, maxRange: 6, townHallRequired:  8, deathExplosionDamage: 180 },
      { level:  3, hp:  750, dps: 32, minRange: 0, maxRange: 6, townHallRequired:  9, deathExplosionDamage: 220 },
      { level:  4, hp:  850, dps: 40, minRange: 0, maxRange: 6, townHallRequired: 10, deathExplosionDamage: 260 },
      { level:  5, hp: 1050, dps: 48, minRange: 0, maxRange: 6, townHallRequired: 11, deathExplosionDamage: 300 },
      { level:  6, hp: 1300, dps: 56, minRange: 0, maxRange: 6, townHallRequired: 11, deathExplosionDamage: 350 },
      { level:  7, hp: 1600, dps: 64, minRange: 0, maxRange: 6, townHallRequired: 12, deathExplosionDamage: 400 },
      { level:  8, hp: 1900, dps: 72, minRange: 0, maxRange: 6, townHallRequired: 13, deathExplosionDamage: 450 },
      { level:  9, hp: 2300, dps: 84, minRange: 0, maxRange: 6, townHallRequired: 14, deathExplosionDamage: 500 },
      { level: 10, hp: 2500, dps: 94, minRange: 0, maxRange: 6, townHallRequired: 15, deathExplosionDamage: 550 },
    ],
  },
  {
    id: "hidden-tesla",
    name: "Tesla camouflée",
    targetType: "Ground & Air",
    size: 2,
    attackSpeed: 0.6,
    activationRadius: 6,
    notes: "Reste cachée jusqu'à ce qu'une troupe entre dans un rayon de 6 cases. TODO: activation à 51% HP (non implémenté).",
    levels: [
      { level:  1, hp:  600, dps:  34, minRange: 0, maxRange: 7, townHallRequired:  7 },
      { level:  2, hp:  630, dps:  40, minRange: 0, maxRange: 7, townHallRequired:  7 },
      { level:  3, hp:  660, dps:  48, minRange: 0, maxRange: 7, townHallRequired:  7 },
      { level:  4, hp:  690, dps:  55, minRange: 0, maxRange: 7, townHallRequired:  8 },
      { level:  5, hp:  730, dps:  64, minRange: 0, maxRange: 7, townHallRequired:  8 },
      { level:  6, hp:  770, dps:  75, minRange: 0, maxRange: 7, townHallRequired:  8 },
      { level:  7, hp:  810, dps:  87, minRange: 0, maxRange: 7, townHallRequired:  9 },
      { level:  8, hp:  850, dps:  99, minRange: 0, maxRange: 7, townHallRequired: 10 },
      { level:  9, hp:  900, dps: 110, minRange: 0, maxRange: 7, townHallRequired: 11 },
      { level: 10, hp:  980, dps: 120, minRange: 0, maxRange: 7, townHallRequired: 12 },
      { level: 11, hp: 1100, dps: 130, minRange: 0, maxRange: 7, townHallRequired: 13 },
      { level: 12, hp: 1200, dps: 140, minRange: 0, maxRange: 7, townHallRequired: 13 },
      { level: 13, hp: 1350, dps: 150, minRange: 0, maxRange: 7, townHallRequired: 14 },
      { level: 14, hp: 1450, dps: 160, minRange: 0, maxRange: 7, townHallRequired: 15 },
    ],
  },
];

export function getDefenseById(id: string): Defense | undefined {
  return DEFENSES.find((d) => d.id === id);
}

export function getDefenseLevel(id: string, level: number): DefenseLevel | undefined {
  return getDefenseById(id)?.levels.find((l) => l.level === level);
}

export function getDefensesForTownHall(th: number): Defense[] {
  return DEFENSES.filter((d) => d.levels.some((l) => l.townHallRequired <= th));
}

export function getDefensesByTargetType(targetType: TargetType): Defense[] {
  return DEFENSES.filter(
    (d) => d.targetType === targetType || d.targetType === "Ground & Air"
  );
}
