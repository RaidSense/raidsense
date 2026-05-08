import { getTroopById } from "../data/troops";
import { getDefenseById, type TargetType } from "../data/defenses";
import { getNeutralBuildingById } from "../data/neutral-buildings";
import { type WallPlacement, WALL_HP } from "../data/walls";
import { dijkstraPath, adjacentTilesForFootprint, type PathResult } from "./pathfinding";
import { TOWN_HALL_DATA } from "../data/town-halls";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TICKS_PER_SECOND = 10;
const TICK = 1 / TICKS_PER_SECOND; // 0.1 s
const MAX_SIM_SECONDS = 180;        // hard cap: 3-minute raid

const SPEED_DIVISOR = 16;
const GRID_SIZE     = 44;

// Wall pathfinding V2
/** Path-cost ratio above which breaking a wall is preferred over a long detour. */
const DETOUR_RATIO   = 2.0;
/** Ticks a troop stays locked on a chosen wall before re-evaluating (≈ 1 s). */
const WALL_LOCK_TICKS = 10;

// Eagle Artillery burst constants
const EAGLE_BURST_SIZE     = 3;
const EAGLE_SHOT_INTERVAL  = 0.75;  // s between shots within a burst
const EAGLE_BURST_INTERVAL = 10;    // s from one burst start to the next
// Wait between burst end and next burst start:
const EAGLE_INTER_BURST    = EAGLE_BURST_INTERVAL - (EAGLE_BURST_SIZE - 1) * EAGLE_SHOT_INTERVAL;

// Tiles per second a projectile travels (used by the frontend for animation).
export const PROJECTILE_SPEED = 25;

// Healer: radius (tiles) around the heal target within which all allies are healed.
const HEALER_SPLASH_RADIUS = 1.5;

// Baby Dragon enrage
const ENRAGE_RADIUS = 4.5;   // tiles — no allied air unit closer than this → enraged

// Electro Dragon death lightning
const DEATH_LIGHTNING_COUNT    = 6;
const DEATH_LIGHTNING_DELAY    = 0.8;   // s after death before first bolt
const DEATH_LIGHTNING_INTERVAL = 0.3;   // s between consecutive bolts
const DEATH_LIGHTNING_SPREAD   = 3;     // tile radius of random scatter
const DEATH_LIGHTNING_SPLASH   = 1.5;   // splash radius per bolt (tiles)

// Set to true to print target-acquisition, cooldown, and shot events to the console.
const DEBUG = true;

// All defenses except Inferno Tower use the discrete model:
// initial-delay of one full attackSpeed before the first shot,
// and a cooldown reset whenever the target changes.
const DISCRETE_DEFENSE_IDS = new Set<string>([
  "cannon", "archer-tower", "mortar", "air-defense",
  "wizard-tower", "x-bow", "eagle-artillery", "scattershot",
  "hidden-tesla", "bomb-tower", "monolith", "builder-hut",
]);

// Ground troops that are actually air units — affects which defenses can target them.
const AIR_UNIT_IDS = new Set<string>([
  "balloon",
  "healer",
  "dragon",
  "baby-dragon",
  "electro-dragon",
]);

// Per-troop melee/ranged attack radius in tiles.
const TROOP_ATTACK_RANGE: Record<string, number> = {
  "barbarian":      0.4,
  "archer":         3.5,
  "giant":          1.0,
  "goblin":         0.4,
  "wall-breaker":   0.5,
  "balloon":        2.0,
  "wizard":         3.0,
  "healer":         5.0,
  "dragon":         3,
  "pekka":          0.8,
  "baby-dragon":    2.75,
  "miner":          0.5,
  "electro-dragon": 3,
};

// ---------------------------------------------------------------------------
// Public API types
// ---------------------------------------------------------------------------

export type Vec2 = { x: number; y: number };

/** One troop dropped at a specific position on the grid. */
export interface TroopDeployment {
  instanceId: string;
  troopId: string;     // must match a Troop.id in troops.ts
  level: number;
  dropPosition: Vec2;
  isAirUnit?: boolean;
  /** Simulation time (s) when this troop enters the battle. Default 0. */
  deployAt?: number;
}

/** One defense building placed at a position on the grid. */
export interface DefensePlacement {
  instanceId: string;
  defenseId: string;   // must match a Defense.id in defenses.ts
  level: number;
  position: Vec2;      // centre tile of the defense
  /**
   * Configurable mode for X-Bow ("ground" | "both") and
   * Inferno Tower ("single" | "multi"). Empty string = default.
   */
  mode?: string;
}

/** One neutral building placed at a position on the grid. */
export interface BuildingPlacement {
  instanceId: string;
  buildingId: string;  // must match a NeutralBuilding.id in neutral-buildings.ts
  level: number;
  position: Vec2;      // centre tile of the building
}

/** Per-troop simulation output. */
export interface TroopResult {
  instanceId: string;
  /**
   * HP snapshot at t = 0, 1, 2, … seconds.
   * hpPerSecond[t] is the HP value recorded at the end of second t.
   * Values are rounded up to the nearest integer (CoC HUD style).
   */
  hpPerSecond: number[];
  /**
   * The defense instanceId being targeted at t = 0, 1, 2, … seconds.
   * Null when idle (no targets left) or already dead.
   */
  targetPerSecond: (string | null)[];
  /**
   * Tile position (fractional) at t = 0, 1, 2, … seconds.
   * Used to drive replay animations with linear interpolation between seconds.
   */
  positionPerSecond: Vec2[];
  /** Exact simulation time in seconds when this troop died. Null if survived. */
  destroyedAt: number | null;
  /** Underground state snapshot at t = 0, 1, 2, … seconds (Miner only; always false otherwise). */
  undergroundPerSecond: boolean[];
  /** Enraged state snapshot at t = 0, 1, 2, … seconds (Baby Dragon only; always false otherwise). */
  enragedPerSecond: boolean[];
}

/** Per-defense simulation output. */
export interface DefenseResult {
  instanceId: string;
  /** HP snapshot at t = 0, 1, 2, … seconds (same convention as TroopResult). */
  hpPerSecond: number[];
  /** Exact simulation time in seconds when this defense was destroyed. Null if survived. */
  destroyedAt: number | null;
  /** Cumulative damage actually dealt (no overkill inflation). */
  totalDamageDealt: number;
}

/** Per-wall simulation output. */
export interface WallResult {
  instanceId:  string;
  hpPerSecond: number[];
  destroyedAt: number | null;
}

/** Per-neutral-building simulation output. */
export interface BuildingResult {
  instanceId: string;
  hpPerSecond: number[];
  destroyedAt: number | null;
}

/** Fireball or attack projectile fired by a troop (Baby Dragon, …). */
export interface TroopFireEvent {
  time:           number;
  troopId:        string;
  attackerInstId: string;
  from:           Vec2;   // attacker centre (tile + 0.5)
  to:             Vec2;   // target centre (tile + 0.5)
  targetInstId:   string;
  damage:         number; // actual damage dealt to the primary target
}

/** One death-lightning bolt impact from a dying Electro Dragon. */
export interface DeathLightningEvent {
  time:         number;
  sourceInstId: string;
  /** Impact centre in tile coords (fractional). */
  position:     Vec2;
  damage:       number;
  splashRadius: number;
}

/** One link in an Electro Dragon chain. */
export interface ChainLink {
  from:         Vec2;
  to:           Vec2;
  targetInstId: string;
  damage:       number;
}

/** Full chain event emitted each time an Electro Dragon fires. */
export interface ChainEvent {
  time:           number;
  attackerInstId: string;
  links:          ChainLink[];
}

/** Discrete heal applied to one troop at one tick. Used for precise HP tracking in replay. */
export interface HealTickEvent {
  time:         number;
  healerInstId: string;
  targetInstId: string;
  amount:       number;
}

/** One heal pulse emitted by a Healer. Used to animate orbs in replay. */
export interface HealEvent {
  /** Simulation time (s) when the orb is fired. */
  time:          number;
  healerInstId:  string;
  /** Healer centre position (tile + 0.5 offset). */
  healerPos:     Vec2;
  /** Primary heal target instance id. */
  targetInstId:  string;
  /** Primary target centre position (tile + 0.5 offset). */
  targetPos:     Vec2;
  /** All troop instance ids healed by this pulse (primary + splash). */
  healedTargets: string[];
}

/** One projectile fired during the simulation. Used to animate shots in replay. */
export interface ShotEvent {
  /** Simulation time (s) when the shot was fired. */
  time:         number;
  /** Defense type id (e.g. "cannon") — used for colour lookup in the frontend. */
  defenseId:    string;
  /** Defense instance id — used to match beams to placed buildings. */
  defInstId:    string;
  /** Troop instance id that was hit — used for accurate HP tracking. */
  targetInstId: string;
  /** Actual damage dealt (capped at target remaining HP). */
  damage:       number;
  /** All troop instance ids hit by this shot (primary first, then splash). */
  hitTargets:   string[];
  /**
   * Scattershot only: one entry per troop hit by the directional cone.
   * from = primary impact position, to = cone-hit troop position (both tile-centred).
   * Undefined for all other defense types.
   */
  residualProjectiles?: { from: Vec2; to: Vec2; targetInstId: string; damage: number }[];
  /** Defense centre in tile coords. Pixel = pos * cellPx. */
  defPos:       Vec2;
  /**
   * Troop centre at time of shot in tile coords (already +0.5 offset applied).
   * Pixel = pos * cellPx.
   */
  troopPos:     Vec2;
}

/** A troop switching from one defense target to another. */
export interface TargetChangeEvent {
  time:        number;
  troopInstId: string;
  troopId:     string;         // type label (e.g. "giant")
  oldTargetId: string | null;
  newTargetId: string | null;
  reason:      "initial" | "destroyed" | "no_targets";
}

/** Full simulation output. */
export interface SimulationResult {
  troops: Record<string, TroopResult>;
  defenses: Record<string, DefenseResult>;
  buildings: Record<string, BuildingResult>;
  durationSeconds: number;
  walls: Record<string, WallResult>;
  shots: ShotEvent[];
  heals: HealEvent[];
  healEvents: HealTickEvent[];
  chainEvents: ChainEvent[];
  deathLightningEvents: DeathLightningEvent[];
  troopFireEvents: TroopFireEvent[];
  targetChanges: TargetChangeEvent[];
}

// ---------------------------------------------------------------------------
// Internal state types (not exported)
// ---------------------------------------------------------------------------

interface TroopState {
  instanceId: string;
  troopId: string;
  hp: number;
  dps: number;
  speed: number;
  attackRange:    number;
  attackSpeed:    number;
  attackCooldown: number;
  splashRadius:   number;
  hps:                 number;   // heal per second (0 for non-healers)
  maxHp:               number;   // initial HP cap, used to clamp healing
  healVisualCooldown:  number;   // counts down; emits HealEvent when ≤ 0
  isUnderground:       boolean;  // true while Miner is burrowing toward target
  undergroundHistory:  boolean[];
  isEnraged:           boolean;  // true when Baby Dragon is alone (no allied air unit nearby)
  enragedHistory:      boolean[];
  // Wall pathfinding V2
  bfsPath:             Vec2[];        // remaining tile waypoints
  bfsTargetId:         string | null; // entity for which path was computed
  bfsWallVer:          number;        // wallVersion when path was computed
  bfsPathCost:         number;        // Dijkstra cost of cached path
  wallAttackId:        string | null; // wall currently being attacked
  wallAttackLockTimer: number;        // ticks remaining in wall-lock (stability)
  deathDamage:             number;   // damage per death-lightning bolt (Electro Dragon)
  deathLightningPending:   { fireAt: number; position: Vec2 }[];
  deathLightningTriggered: boolean;
  chainMaxTargets:     number;   // Electro Dragon chain (0 = no chain)
  chainFalloff:        number;   // damage multiplier per bounce
  chainRange:          number;   // max centre-to-centre distance per bounce (tiles)
  position: Vec2;
  isAirUnit: boolean;
  preferredTarget: string;
  targetId: string | null;
  alive: boolean;
  destroyedAt: number | null;
  hpHistory: number[];
  targetHistory: (string | null)[];
  positionHistory: Vec2[];
  deployAt: number;   // seconds — troop activates when simTime reaches this
  isActive: boolean;  // false until deployAt is reached
  // ── TH death-zone debuffs ────────────────────────────────────────────────
  speedMultiplier:  number;   // 1.0 = normal; reduced by TH slow zones
  attackMultiplier: number;   // 1.0 = normal; reduced by TH slow zones
  housingSpace:     number;   // space occupied in army camp (used by spring-trap)
}

interface DefenseState {
  instanceId:         string;
  defenseId:          string;
  hp:                 number;
  dps:                number;
  size:               number;   // footprint side length in tiles
  splashRadius:       number;   // used when splashType === "radius"
  splashType:         "radius" | "scattershot" | "none";
  minRange:           number;
  maxRange:           number;
  targetType:         TargetType;
  position:           Vec2;
  targetId:           string | null;
  alive:              boolean;
  destroyedAt:        number | null;
  totalDamageDealt:   number;
  attackSpeed:        number;
  attackCooldown:     number;
  isDiscrete:         boolean;  // true = uses initial-delay + target-change reset
  burstRemaining:      number;   // Eagle Artillery burst; -1 = N/A
  interBurstCooldown:  number;
  lockedBurstPos:      Vec2 | null;   // impact position locked at burst start
  lockedBurstTargetId: string | null; // target locked at burst start
  hpHistory:          number[];  // per-second HP snapshots
  // ── X-Bow / Inferno Tower mode ──────────────────────────────────────────
  mode:               string;   // "" | "ground" | "both" | "single" | "multi"
  // Inferno Tower single-target ramp-up
  dpsSingleInit:      number;
  dpsSingleMid:       number;
  dpsSingleMax:       number;
  singleLockTarget:   string | null; // currently locked troop instanceId
  singleLockDuration: number;        // seconds locked on current target
  // Inferno Tower multi-target
  multiTargetCount:   number;        // 0 = N/A
  // ── Hidden Tesla ──────────────────────────────────────────────────────────
  isHidden:         boolean;   // true = not yet activated (invisible to troops)
  activationRadius: number;    // 0 = always active; 6 for hidden-tesla
  // ── HP max (used by builder hut repair + monolith bonus) ─────────────────
  maxHp:          number;
  // ── Monolith HP% bonus ────────────────────────────────────────────────────
  hpPercentBonus: number;   // 0 for all other defenses; >0 for monolith
  // ── Builder Hut passive repair ────────────────────────────────────────────
  repairPerSecond: number;  // 0 for all other defenses
  // ── Air Sweeper ───────────────────────────────────────────────────────────
  pulseInterval:  number;   // 0 = standard attack; 5 for air-sweeper
  pulseCooldown:  number;   // seconds until next pulse fires
  coneAngle:      number;   // cone half-width in radians (60° = π/3 for air-sweeper)
  pushStrength:   number;   // tiles pushed per pulse
  orientation:    number;   // degrees: 0=right, 90=down, 180=left, 270=up
  // ── Bomb Tower death explosion ─────────────────────────────────────────────
  deathExplosionDamage:    number;
  deathExplosionRadius:    number;
  deathExplosionTriggered: boolean;
  // ── Trap (bomb / spring-trap) ─────────────────────────────────────────────
  isTrap:            boolean;
  triggerRadius:     number;
  explosionRadius:   number;
  triggerDelay:      number;
  trapDamage:        number;
  targetsGroundOnly: boolean;
  targetsAirOnly:    boolean;
  isTriggered:       boolean;   // troop entered triggerRadius
  triggerAt:         number;    // simTime of explosion (-1 = not triggered)
  consumed:          boolean;   // true after activation
  ejectCapacity:     number;    // spring-trap: max housing space ejectable (0 for other traps)
}

interface WallState {
  instanceId:  string;
  x:           number;
  y:           number;
  hp:          number;
  alive:       boolean;
  destroyedAt: number | null;
  hpHistory:   number[];
}

interface BuildingState {
  instanceId:  string;
  buildingId:  string;
  hp:          number;
  size:        number;
  targetTags:  readonly string[];
  position:    Vec2;
  alive:       boolean;
  destroyedAt: number | null;
  hpHistory:   number[];
  level:       number;
  maxHp:       number;
  // ── TH 12–15 weapon (0 = no weapon) ─────────────────────────────────────
  weaponDps:            number;
  weaponTargetCount:    number;
  weaponRange:          number;
  weaponAttackSpeed:    number;
  weaponAttackCooldown: number;
  isWeaponActive:       boolean;
  // ── Death effect ─────────────────────────────────────────────────────────
  deathDamage:             number;
  deathRadius:             number;
  deathEffectDps:          number;
  deathEffectSlow:         number;   // 1.0 = no slow
  deathEffectDuration:     number;
  deathEffectRadius:       number;
  deathExplosionTriggered: boolean;
}

/** Active death-effect zone left by a destroyed TH 12–15. */
interface THDeathZone {
  sourceInstId:  string;
  position:      Vec2;
  radius:        number;
  dps:           number;
  slowMultiplier: number;
  endTime:       number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function euclidean(a: Vec2, b: Vec2): number {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
}

function stepToward(pos: Vec2, goal: Vec2, maxStep: number): Vec2 {
  const d = euclidean(pos, goal);
  if (d <= maxStep) return { x: goal.x, y: goal.y };
  const ratio = maxStep / d;
  return { x: pos.x + (goal.x - pos.x) * ratio, y: pos.y + (goal.y - pos.y) * ratio };
}

/**
 * Distance from point `p` to the nearest edge of a square footprint.
 * The footprint is centered on `center` with side length `size`.
 * Returns 0 when the point is inside or touching the footprint.
 */
function distanceToFootprint(p: Vec2, center: Vec2, size: number): number {
  const half = size / 2;
  const dx = Math.max(0, Math.abs(p.x - center.x) - half);
  const dy = Math.max(0, Math.abs(p.y - center.y) - half);
  return Math.sqrt(dx * dx + dy * dy);
}

/** Edge-to-edge distance between two square footprints. Returns 0 when touching or overlapping. */
function distanceBetweenFootprints(aPos: Vec2, aSize: number, bPos: Vec2, bSize: number): number {
  const dx = Math.max(0, Math.abs(aPos.x - bPos.x) - aSize / 2 - bSize / 2);
  const dy = Math.max(0, Math.abs(aPos.y - bPos.y) - aSize / 2 - bSize / 2);
  return Math.sqrt(dx * dx + dy * dy);
}

function defenseCanTarget(targetType: TargetType, isAirUnit: boolean): boolean {
  if (targetType === "Ground & Air") return true;
  return targetType === "Air" ? isAirUnit : !isAirUnit;
}

// ---------------------------------------------------------------------------
// Main simulation
// ---------------------------------------------------------------------------

/**
 * Runs a tick-based simulation (10 ticks/second) of a Clash of Clans attack.
 *
 * Simplifications vs. the live game:
 *  - Walls are ignored (troops walk in straight lines to targets).
 *  - Healer healing is not applied (she moves but deals 0 DPS, as per data).
 *  - Inferno Tower single-target ramp-up is modelled (3-tier DPS: init/mid/max).
 *  - Eagle Artillery activation threshold is not enforced.
 *  - Splash damage is applied for mortar, wizard-tower, and eagle-artillery.
 *  - Troops attack in discrete hits (attackSpeed-based, not continuous DPS).
 *  - Neutral buildings (non-attacking destructibles) are tracked alongside
 *    defenses and are valid troop targets.
 */
export function simulateAttack(
  deployments:        TroopDeployment[],
  placements:         DefensePlacement[],
  buildingPlacements: BuildingPlacement[] = [],
  wallPlacements:     WallPlacement[]     = [],
): SimulationResult {
  if (DEBUG) {
    console.log("%c[SIMULATION] Démarrage — cooldown initial activé pour toutes les défenses (sauf TDE)", "color:#22d3ee;font-weight:bold");
  }

  // Guard: instanceIds must be unique across troops, defenses, and buildings.
  const allIds = [
    ...deployments.map((d) => d.instanceId),
    ...placements.map((p) => p.instanceId),
    ...buildingPlacements.map((b) => b.instanceId),
  ];
  const seen = new Set<string>();
  for (const id of allIds) {
    if (seen.has(id)) throw new Error(`Duplicate instanceId detected: "${id}"`);
    seen.add(id);
  }

  // -------------------------------------------------------------------------
  // 1. Initialise state
  // -------------------------------------------------------------------------

  const troops = new Map<string, TroopState>();

  for (const dep of deployments) {
    const troopData = getTroopById(dep.troopId);
    if (!troopData) throw new Error(`Unknown troop id: "${dep.troopId}"`);

    const levelData = troopData.levels.find((l) => l.level === dep.level);
    if (!levelData)
      throw new Error(`Level ${dep.level} not found for troop "${dep.troopId}"`);

    const isAirUnit = dep.isAirUnit ?? AIR_UNIT_IDS.has(dep.troopId);

    troops.set(dep.instanceId, {
      instanceId: dep.instanceId,
      troopId: dep.troopId,
      hp: levelData.hp,
      dps: levelData.dps,
      speed:          troopData.movementSpeed / SPEED_DIVISOR,
      attackRange:    TROOP_ATTACK_RANGE[dep.troopId] ?? 0.5,
      attackSpeed:    troopData.attackSpeed,
      attackCooldown: troopData.attackSpeed,
      splashRadius:   troopData.splashRadius ?? 0,
      hps:                levelData.hps ?? 0,
      maxHp:              levelData.hp,
      healVisualCooldown: 0,
      isUnderground:      dep.troopId === "miner",
      undergroundHistory: [],
      isEnraged:          false,
      enragedHistory:     [],
      bfsPath:             [],
      bfsTargetId:         null,
      bfsWallVer:          -1,
      bfsPathCost:         0,
      wallAttackId:        null,
      wallAttackLockTimer: 0,
      chainMaxTargets:    troopData.chainMaxTargets ?? 0,
      chainFalloff:       troopData.chainFalloff    ?? 1,
      chainRange:         troopData.chainRange      ?? 0,
      deathDamage:             levelData.deathDamage ?? 0,
      deathLightningPending:   [],
      deathLightningTriggered: false,
      position: { ...dep.dropPosition },
      isAirUnit,
      preferredTarget: troopData.preferredTarget,
      targetId: null,
      alive: true,
      destroyedAt: null,
      hpHistory: [],
      targetHistory: [],
      positionHistory: [],
      deployAt:  dep.deployAt ?? 0,
      isActive:  (dep.deployAt ?? 0) <= 0,
      speedMultiplier:  1,
      attackMultiplier: 1,
      housingSpace:     troopData.housingSpace ?? 1,
    });
  }

  const defenses = new Map<string, DefenseState>();

  for (const pl of placements) {
    const defData = getDefenseById(pl.defenseId);
    if (!defData) throw new Error(`Unknown defense id: "${pl.defenseId}"`);

    const levelData = defData.levels.find((l) => l.level === pl.level);
    if (!levelData)
      throw new Error(`Level ${pl.level} not found for defense "${pl.defenseId}"`);

    const isEagle   = pl.defenseId === "eagle-artillery";
    const isXbow    = pl.defenseId === "x-bow";
    const isInferno = pl.defenseId === "inferno-tower";
    const mode      = pl.mode ?? (isInferno ? "multi" : isXbow ? "ground" : "");

    // X-Bow: adjust range and target type by mode
    let maxRange   = levelData.maxRange;
    let targetType = defData.targetType;
    if (isXbow    && mode === "both")  { maxRange = 11.5; targetType = "Ground & Air"; }
    if (isInferno && mode === "multi") { maxRange = 10; }

    defenses.set(pl.instanceId, {
      instanceId:         pl.instanceId,
      defenseId:          pl.defenseId,
      hp:                 levelData.hp,
      dps:                levelData.dps,
      size:               defData.size,
      minRange:           levelData.minRange,
      maxRange,
      targetType,
      position:           { ...pl.position },
      targetId:           null,
      alive:              true,
      destroyedAt:        null,
      totalDamageDealt:   0,
      hpHistory:          [],
      attackSpeed:        defData.attackSpeed,
      splashRadius:       defData.splashRadius ?? 0,
      splashType:         defData.splashType ?? "none",
      attackCooldown:     DISCRETE_DEFENSE_IDS.has(pl.defenseId) ? defData.attackSpeed : 0,
      isDiscrete:         DISCRETE_DEFENSE_IDS.has(pl.defenseId),
      burstRemaining:      isEagle ? EAGLE_BURST_SIZE : -1,
      interBurstCooldown:  0,
      lockedBurstPos:      null,
      lockedBurstTargetId: null,
      mode,
      dpsSingleInit:      levelData.dpsSingleInit ?? 0,
      dpsSingleMid:       levelData.dpsSingleMid  ?? 0,
      dpsSingleMax:       levelData.dpsSingleMax  ?? 0,
      singleLockTarget:   null,
      singleLockDuration: 0,
      multiTargetCount:   levelData.multiTargetCount ?? 0,
      isHidden:         (defData.activationRadius ?? 0) > 0,
      activationRadius: defData.activationRadius ?? 0,
      deathExplosionDamage:    levelData.deathExplosionDamage ?? 0,
      deathExplosionRadius:    defData.deathExplosionRadius   ?? 0,
      deathExplosionTriggered: false,
      maxHp:          levelData.hp,
      hpPercentBonus: levelData.hpPercentBonus  ?? 0,
      repairPerSecond: levelData.repairPerSecond ?? 0,
      isTrap:            !!defData.isTrap,
      triggerRadius:     defData.triggerRadius    ?? 0,
      explosionRadius:   levelData.explosionRadius ?? defData.explosionRadius ?? 0,
      triggerDelay:      defData.triggerDelay     ?? 0,
      trapDamage:        levelData.trapDamage     ?? 0,
      targetsGroundOnly: !!defData.targetsGroundOnly,
      targetsAirOnly:    !!defData.targetsAirOnly,
      isTriggered:   false,
      triggerAt:     -1,
      consumed:      false,
      ejectCapacity: levelData.ejectCapacity ?? 0,
      pulseInterval:  defData.pulseInterval ?? 0,
      pulseCooldown:  defData.pulseInterval ?? 0,   // first pulse at t = pulseInterval
      coneAngle:      (defData.coneAngle ?? 0) / 2 * (Math.PI / 180), // store half-cone in radians
      pushStrength:   levelData.pushStrength ?? 0,
      orientation:    pl.defenseId === "air-sweeper" ? (parseInt(pl.mode ?? "0") || 0) : 0,
    });
  }

  const buildings = new Map<string, BuildingState>();

  for (const pl of buildingPlacements) {
    const bldData = getNeutralBuildingById(pl.buildingId);
    if (!bldData) throw new Error(`Unknown building id: "${pl.buildingId}"`);

    const levelData = bldData.levels.find((l) => l.level === pl.level);
    if (!levelData)
      throw new Error(`Level ${pl.level} not found for building "${pl.buildingId}"`);

    const thW = pl.buildingId === "town-hall" ? TOWN_HALL_DATA[pl.level]?.weapon : undefined;
    buildings.set(pl.instanceId, {
      instanceId:  pl.instanceId,
      buildingId:  pl.buildingId,
      hp:          levelData.hp,
      size:        bldData.size,
      targetTags:  bldData.targetTags,
      position:    { ...pl.position },
      alive:       true,
      destroyedAt: null,
      hpHistory:   [],
      level:       pl.level,
      maxHp:       levelData.hp,
      weaponDps:            thW?.dps               ?? 0,
      weaponTargetCount:    thW?.targetCount        ?? 0,
      weaponRange:          thW?.range              ?? 0,
      weaponAttackSpeed:    thW?.attackSpeed        ?? 0,
      weaponAttackCooldown: thW?.attackSpeed        ?? 0,
      isWeaponActive:       false,
      deathDamage:          thW?.deathDamage        ?? 0,
      deathRadius:          thW?.deathExplosionRadius ?? 0,
      deathEffectDps:       thW?.deathEffectDps     ?? 0,
      deathEffectSlow:      thW?.deathEffectSlow    ?? 1,
      deathEffectDuration:  thW?.deathEffectDuration ?? 0,
      deathEffectRadius:    thW?.deathEffectRadius  ?? 0,
      deathExplosionTriggered: false,
    });
  }

  // ── Walls ──────────────────────────────────────────────────────────────────

  const walls = new Map<string, WallState>();
  for (const wp of wallPlacements) {
    const hp = WALL_HP[wp.level] ?? 100;
    walls.set(wp.instanceId, {
      instanceId: wp.instanceId,
      x: wp.x, y: wp.y,
      hp, alive: true, destroyedAt: null, hpHistory: [],
    });
  }

  // Version counter — increments whenever a wall dies so troops recompute BFS
  let wallVersion = 0;

  // Active death-effect zones from destroyed TH 12-15
  let thDeathZones: THDeathZone[] = [];

  /** Pre-built Set<"x,y"> of currently alive wall tiles (rebuilt on demand). */
  function buildBlockedSet(): Set<string> {
    const s = new Set<string>();
    for (const [, w] of walls) if (w.alive) s.add(`${w.x},${w.y}`);
    return s;
  }

  /**
   * Picks the wall that minimises (troop→wall) + (wall→target).
   * Falls back to nearest wall if nothing qualifies on the direct line.
   */
  function pickBestWall(troopPos: Vec2, targetPos: Vec2): string | null {
    let bestId: string | null = null;
    let bestCost = Infinity;
    for (const [id, w] of walls) {
      if (!w.alive) continue;
      const wx = w.x + 0.5, wy = w.y + 0.5;
      const c = euclidean(troopPos, { x: wx, y: wy })
              + euclidean({ x: wx, y: wy }, targetPos);
      if (c < bestCost) { bestCost = c; bestId = id; }
    }
    return bestId;
  }

  // Per-wallVersion BFS cache (cleared whenever wallVersion increments).
  // Key = "fromX,fromY|targetId|wallVer"
  let pathCacheVersion = -1;
  const pathCache = new Map<string, PathResult | null>();

  // -------------------------------------------------------------------------
  // 2. Targeting helpers (closures over state maps)
  // -------------------------------------------------------------------------

  /**
   * Returns the closest living target (defense or neutral building) based on
   * the troop's preferredTarget:
   *  - "Defenses" → only alive defenses
   *  - "Resources" → only neutral buildings with "resource" tag (fallback: any)
   *  - "Buildings" / "None" / "Heroes" → nearest of defenses + buildings
   */
  function pickTroopTarget(troop: TroopState): string | null {
    let bestId: string | null = null;
    let bestDist = Infinity;
    const pref = troop.preferredTarget;

    // Helper: nearest alive VISIBLE defense.
    // Traps (bombs) and hidden Tesla are never targetable by troops.
    function nearestDefense(): string | null {
      let id: string | null = null; let d = Infinity;
      for (const [k, def] of defenses) {
        if (!def.alive || def.isHidden || def.isTrap) continue;
        const dist = distanceToFootprint(troop.position, def.position, def.size);
        if (dist < d) { d = dist; id = k; }
      }
      return id;
    }

    // Helper: nearest alive neutral building by footprint edge distance (optional tag filter)
    function nearestBuilding(tag?: string): string | null {
      let id: string | null = null; let d = Infinity;
      for (const [k, bld] of buildings) {
        if (!bld.alive) continue;
        if (tag && !bld.targetTags.includes(tag)) continue;
        const dist = distanceToFootprint(troop.position, bld.position, bld.size);
        if (dist < d) { d = dist; id = k; }
      }
      return id;
    }

    if (pref === "Defenses") {
      // Priorité : défenses → fallback : bâtiments neutres
      return nearestDefense() ?? nearestBuilding();
    }

    if (pref === "Resources") {
      // Priorité : ressources → autres bâtiments → défenses (dernier recours)
      return nearestBuilding("resource") ?? nearestBuilding() ?? nearestDefense();
    }

    // "None" | "Buildings" | "Heroes" → plus proche toutes catégories (par footprint)
    const def = nearestDefense();
    const bld = nearestBuilding();
    if (def === null) return bld;
    if (bld === null) return def;
    const defEntity = defenses.get(def)!;
    const bldEntity = buildings.get(bld)!;
    return distanceToFootprint(troop.position, defEntity.position, defEntity.size)
        <= distanceToFootprint(troop.position, bldEntity.position, bldEntity.size)
         ? def : bld;
  }

  /**
   * Returns the closest living troop instanceId that this defense can target
   * and that is within [minRange, maxRange].
   */
  function pickDefenseTarget(def: DefenseState): string | null {
    let bestId: string | null = null;
    let bestDist = Infinity;

    for (const [id, troop] of troops) {
      if (!troop.alive || !troop.isActive) continue;
      if (troop.isUnderground) continue;
      if (!defenseCanTarget(def.targetType, troop.isAirUnit)) continue;
      // Use troop centre (+0.5) for accurate min/max range checks, especially the dead zone.
      const d = euclidean(def.position, { x: troop.position.x + 0.5, y: troop.position.y + 0.5 });
      if (d >= def.minRange && d <= def.maxRange && d < bestDist) {
        bestDist = d;
        bestId = id;
      }
    }
    return bestId;
  }

  // -------------------------------------------------------------------------
  // 3. Record t = 0 snapshot (after computing initial targets)
  // -------------------------------------------------------------------------

  for (const troop of troops.values()) {
    troop.targetId = pickTroopTarget(troop);
    troop.hpHistory.push(Math.ceil(troop.hp));
    troop.targetHistory.push(troop.targetId);
    troop.positionHistory.push({ ...troop.position });
    troop.undergroundHistory.push(troop.isUnderground);
    troop.enragedHistory.push(troop.isEnraged);
  }
  for (const def of defenses.values()) {
    def.hpHistory.push(Math.ceil(def.hp));
  }
  for (const bld of buildings.values()) {
    bld.hpHistory.push(Math.ceil(bld.hp));
  }
  for (const w of walls.values()) {
    w.hpHistory.push(Math.ceil(w.hp));
  }

  // -------------------------------------------------------------------------
  // 4. Simulation loop
  // -------------------------------------------------------------------------

  const shots:         ShotEvent[]         = [];
  const heals:         HealEvent[]         = [];
  const healEvents:    HealTickEvent[]     = [];
  const chainEvents:        ChainEvent[]          = [];
  const deathLightningEvents: DeathLightningEvent[] = [];
  const troopFireEvents:      TroopFireEvent[]      = [];
  const targetChanges:        TargetChangeEvent[]   = [];

  function fireShot(
    def:       DefenseState,
    target:    TroopState,
    damage:    number,
    simTime:   number,
    extraHits: string[] = [],
    coneHits?: { id: string; damage: number; position: Vec2 }[],
  ): void {
    const actual = Math.min(damage, target.hp);
    target.hp            -= actual;
    def.totalDamageDealt += actual;
    if (target.hp <= 0 && target.alive) {
      target.hp          = 0;
      target.alive       = false;
      target.destroyedAt = simTime;
    }
    const impactPos: Vec2 = { x: target.position.x + 0.5, y: target.position.y + 0.5 };
    shots.push({
      time:         simTime,
      defenseId:    def.defenseId,
      defInstId:    def.instanceId,
      targetInstId: target.instanceId,
      damage:       actual,
      hitTargets:   [target.instanceId, ...extraHits],
      defPos:       { ...def.position },
      troopPos:     impactPos,
      ...(coneHits?.length ? {
        residualProjectiles: coneHits.map((h) => ({
          from:         impactPos,
          to:           { x: h.position.x + 0.5, y: h.position.y + 0.5 },
          targetInstId: h.id,
          damage:       h.damage,
        })),
      } : {}),
    });
    if (DEBUG) {
      const splashInfo = extraHits.length ? ` [splash×${extraHits.length}: ${extraHits.join(",")}]` : "";
      console.log(`[DEBUG t=${simTime.toFixed(2)}s] TIR ${def.defenseId}(${def.instanceId}) → ${target.instanceId} | dégâts=${actual.toFixed(0)}${splashInfo}`);
    }
  }

  /**
   * Applies `damage` to every alive, active troop within `def.splashRadius` tiles
   * of `primary`'s position (excluding the primary itself).
   * Returns the list of hit troop instance ids.
   */
  function applySplash(
    def:     DefenseState,
    primary: TroopState,
    damage:  number,
    simTime: number,
  ): string[] {
    if (def.splashRadius <= 0) return [];
    const hit: string[] = [];
    for (const [id, t] of troops) {
      if (!t.alive || !t.isActive || id === primary.instanceId) continue;
      if (!defenseCanTarget(def.targetType, t.isAirUnit)) continue;
      if (euclidean(primary.position, t.position) <= def.splashRadius) {
        const actual = Math.min(damage, t.hp);
        t.hp -= actual;
        def.totalDamageDealt += actual;
        if (t.hp <= 0 && t.alive) {
          t.hp = 0;
          t.alive = false;
          t.destroyedAt = simTime;
        }
        hit.push(id);
      }
    }
    return hit;
  }

  /**
   * Scattershot two-zone radial splash.
   *
   * Troops within 5 tiles of the primary impact point are hit:
   *   Near zone (dist ≤ 1 tile) : 100 % damage
   *   Far  zone (1 < dist ≤ 5)  :  50 % damage
   *
   * A directional cone was tried but failed because all troops converge
   * to the same attack-range stopping point (fwd ≈ 0 for every troop),
   * so a radius check is the only model that works here.
   *
   * Primary target is never hit twice (excluded by instanceId check).
   */
  function applyScattershotConeSplash(
    def:     DefenseState,
    primary: TroopState,
    damage:  number,
    simTime: number,
  ): { id: string; damage: number; position: Vec2 }[] {
    const hit: { id: string; damage: number; position: Vec2 }[] = [];
    for (const [id, t] of troops) {
      if (!t.alive || !t.isActive || id === primary.instanceId) continue;
      if (!defenseCanTarget(def.targetType, t.isAirUnit)) continue;

      const dist = euclidean(primary.position, t.position);
      const zone = dist <= 1 ? "near" : dist <= 5 ? "far" : "miss";

      if (DEBUG) console.log("[SCATTER CHECK]", {
        troop: id,
        dist:  +dist.toFixed(3),
        zone,
        hit:   dist <= 5,
      });

      if (dist > 5) continue;

      const multiplier = dist <= 1 ? 1.0 : 0.5;
      const actual = Math.min(damage * multiplier, t.hp);
      t.hp -= actual;
      def.totalDamageDealt += actual;
      if (t.hp <= 0 && t.alive) {
        t.hp = 0;
        t.alive = false;
        t.destroyedAt = simTime;
      }
      hit.push({ id, damage: actual, position: { ...t.position } });
    }
    return hit;
  }

  /** Returns the N closest alive troops in range for multi-target defenses. */
  function findNearestTroops(def: DefenseState, maxCount: number): TroopState[] {
    const candidates: { dist: number; t: TroopState }[] = [];
    for (const troop of troops.values()) {
      if (!troop.alive || !troop.isActive) continue;
      if (!defenseCanTarget(def.targetType, troop.isAirUnit)) continue;
      const d = euclidean(def.position, troop.position);
      if (d >= def.minRange && d <= def.maxRange) candidates.push({ dist: d, t: troop });
    }
    candidates.sort((a, b) => a.dist - b.dist);
    return candidates.slice(0, maxCount).map((c) => c.t);
  }

  let lastSimTime = 0;
  const maxTicks = MAX_SIM_SECONDS * TICKS_PER_SECOND;

  for (let tick = 1; tick <= maxTicks; tick++) {
    const simTime = tick / TICKS_PER_SECOND;

    // --- Activate troops whose deployAt time has been reached ----------------
    for (const troop of troops.values()) {
      if (!troop.isActive && simTime >= troop.deployAt) {
        troop.isActive = true;
        troop.targetId = pickTroopTarget(troop);
        if (troop.targetId !== null) {
          targetChanges.push({
            time: simTime, troopInstId: troop.instanceId, troopId: troop.troopId,
            oldTargetId: null, newTargetId: troop.targetId, reason: "initial",
          });
        }
      }
    }

    // --- Hidden Tesla activation (proximity trigger) -------------------------
    for (const def of defenses.values()) {
      if (!def.alive || !def.isHidden || def.activationRadius === 0) continue;
      for (const t of troops.values()) {
        if (!t.alive || !t.isActive || t.isUnderground) continue;
        const dist = euclidean(def.position, { x: t.position.x + 0.5, y: t.position.y + 0.5 });
        if (dist <= def.activationRadius) {
          def.isHidden = false;
          // Reset cooldown so Tesla fires after a normal initial delay
          def.attackCooldown = def.attackSpeed;
          if (DEBUG) console.log(`[DEBUG t=${simTime.toFixed(2)}s] TESLA ACTIVÉE ${def.instanceId} (déclenchée par ${t.instanceId})`);
          break;
        }
      }
    }

    // --- Trap phase: trigger detection + explosion ---------------------------
    for (const def of defenses.values()) {
      if (!def.alive || !def.isTrap || def.consumed) continue;

      // Trigger check
      if (!def.isTriggered) {
        for (const t of troops.values()) {
          if (!t.alive || !t.isActive || t.isUnderground) continue;
          if (def.targetsGroundOnly && t.isAirUnit) continue;
          if (def.targetsAirOnly   && !t.isAirUnit) continue;
          const dist = euclidean(def.position, { x: t.position.x + 0.5, y: t.position.y + 0.5 });
          if (dist <= def.triggerRadius) {
            if (def.defenseId === "spring-trap") {
              // Spring-trap: consumed immediately on first troop contact
              def.consumed    = true;
              def.alive       = false;
              def.destroyedAt = simTime;
              if (DEBUG) console.log(`[SPRING_TRIGGER t=${simTime.toFixed(1)}s] ${def.instanceId} → ${t.instanceId} housing=${t.housingSpace} cap=${def.ejectCapacity}`);
              if (t.housingSpace <= def.ejectCapacity) {
                t.hp = 0; t.alive = false; t.destroyedAt = simTime;
                if (DEBUG) console.log(`[SPRING_EJECT t=${simTime.toFixed(1)}s] ${t.instanceId} removed`);
              } else {
                if (DEBUG) console.log(`[SPRING_IMMUNE t=${simTime.toFixed(1)}s] ${t.instanceId} housing=${t.housingSpace} > cap=${def.ejectCapacity}`);
              }
            } else {
              def.isTriggered = true;
              def.triggerAt   = simTime + def.triggerDelay;
              if (DEBUG) {
                const trapLabel = def.defenseId === "giant-bomb" ? "GIANT_BOMB"
                                : def.defenseId === "air-bomb"   ? "AIR_BOMB"
                                : "BOMB";
                console.log(`[${trapLabel}_TRIGGER t=${simTime.toFixed(1)}s] ${def.instanceId} → ${t.instanceId}`);
              }
            }
            break;
          }
        }
      }

      // Explosion check (bomb only — spring-trap is instant in trigger block)
      if (def.isTriggered && !def.consumed && simTime >= def.triggerAt) {
        let hits = 0;
        for (const t of troops.values()) {
          if (!t.alive || !t.isActive) continue;
          if (def.targetsGroundOnly && t.isAirUnit)  continue;
          if (def.targetsAirOnly    && !t.isAirUnit) continue;
          const dist = euclidean(def.position, { x: t.position.x + 0.5, y: t.position.y + 0.5 });
          if (dist <= def.explosionRadius) {
            const actual = Math.min(def.trapDamage, t.hp);
            t.hp -= actual;
            def.totalDamageDealt += actual;
            if (t.hp <= 0 && t.alive) { t.hp = 0; t.alive = false; t.destroyedAt = simTime; }
            hits++;
          }
        }
        def.consumed    = true;
        def.alive       = false;
        def.destroyedAt = simTime;
        if (DEBUG) {
          const trapLabel = def.defenseId === "giant-bomb" ? "GIANT_BOMB"
                          : def.defenseId === "air-bomb"   ? "AIR_BOMB"
                          : "BOMB";
          console.log(`[${trapLabel}_EXPLODE t=${simTime.toFixed(1)}s] ${def.instanceId} dmg=${def.trapDamage} hits=${hits}`);
        }
      }
    }

    // --- TH weapon activation (fires on first damage) ------------------------
    // TODO: add 51 % HP alternative activation trigger (real CoC behaviour)
    for (const bld of buildings.values()) {
      if (!bld.isWeaponActive && bld.weaponDps > 0 && bld.alive && bld.hp < bld.maxHp) {
        bld.isWeaponActive = true;
        if (DEBUG) console.log(`[DEBUG t=${simTime.toFixed(2)}s] HDV ACTIVÉ ${bld.instanceId} Lv${bld.level}`);
      }
    }

    // --- Defense phase: each defense fires at a troop in range ---------------

    for (const def of defenses.values()) {
      if (!def.alive || def.isHidden || def.pulseInterval > 0 || def.isTrap) continue; // Tesla/sweeper/traps skip

      // ── Eagle Artillery burst mechanics ───────────────────────────────────
      // Handled before normal target selection so the burst target is locked
      // for all 3 shots; no retargeting mid-burst.
      if (def.burstRemaining >= 0) {
        if (def.burstRemaining === 0) {
          def.interBurstCooldown -= TICK;
          if (def.interBurstCooldown <= 0) {
            def.burstRemaining = EAGLE_BURST_SIZE;
            def.attackCooldown = 0;
            // lockedBurstPos cleared at burst end; will be set lazily on first shot.
          }
          continue;
        }
        def.attackCooldown -= TICK;
        if (def.attackCooldown > 0) continue;

        // Lock the burst target on the first shot of each burst (lockedBurstPos is null
        // at simulation start and after each burst ends).
        if (def.lockedBurstPos === null) {
          const burstTargetId = pickDefenseTarget(def);
          if (burstTargetId === null) continue;
          const burstTroop        = troops.get(burstTargetId)!;
          def.targetId            = burstTargetId;
          def.lockedBurstPos      = { ...burstTroop.position };
          def.lockedBurstTargetId = burstTargetId;
        }

        // Fire at the locked position — same point for all 3 shots.
        const lPos = def.lockedBurstPos;
        const dpa  = def.dps * EAGLE_BURST_INTERVAL / EAGLE_BURST_SIZE;
        const hitTargets: string[] = [];
        for (const [id, t] of troops) {
          if (!t.alive || !t.isActive) continue;
          if (!defenseCanTarget(def.targetType, t.isAirUnit)) continue;
          if (euclidean(lPos, t.position) <= def.splashRadius) {
            const actual = Math.min(dpa, t.hp);
            t.hp -= actual;
            def.totalDamageDealt += actual;
            if (t.hp <= 0 && t.alive) { t.hp = 0; t.alive = false; t.destroyedAt = simTime; }
            hitTargets.push(id);
          }
        }
        shots.push({
          time:         simTime,
          defenseId:    def.defenseId,
          defInstId:    def.instanceId,
          targetInstId: def.lockedBurstTargetId ?? "",
          damage:       dpa,
          hitTargets,
          defPos:       { ...def.position },
          troopPos:     { x: lPos.x + 0.5, y: lPos.y + 0.5 },
        });
        def.burstRemaining -= 1;
        if (def.burstRemaining > 0) {
          def.attackCooldown = EAGLE_SHOT_INTERVAL;
        } else {
          def.interBurstCooldown  = EAGLE_INTER_BURST;
          def.lockedBurstPos      = null;
          def.lockedBurstTargetId = null;
        }
        continue;
      }

      // Always target the nearest valid troop (CoC behaviour).
      // Cooldown resets only when forced: target died or left range.
      const prevDefTargetId = def.targetId;
      const currentTarget = def.targetId ? troops.get(def.targetId) : undefined;
      let forceReset = false;

      if (!currentTarget?.alive) {
        def.targetId = pickDefenseTarget(def);
        forceReset   = def.targetId !== prevDefTargetId;
      } else {
        const d = euclidean(def.position, { x: currentTarget.position.x + 0.5, y: currentTarget.position.y + 0.5 });
        if (d < def.minRange || d > def.maxRange) {
          def.targetId = pickDefenseTarget(def);
          forceReset   = def.targetId !== prevDefTargetId;
        } else {
          // Target alive and in range — silently switch to closest if a nearer one appeared.
          def.targetId = pickDefenseTarget(def);
        }
      }

      // Discrete defenses: reset timer only on forced target change (death / OOR).
      if (def.isDiscrete && forceReset) {
        def.attackCooldown = def.attackSpeed;
        if (DEBUG) {
          console.log(`[DEBUG t=${simTime.toFixed(2)}s] CIBLE ${def.defenseId}(${def.instanceId}) → ${def.targetId} | cooldown reset à ${def.attackSpeed.toFixed(3)}s`);
        }
      }

      if (def.targetId === null) continue;
      const target = troops.get(def.targetId)!;

      // ── Inferno Tower single-target mode ──────────────────────────────────
      if (def.defenseId === "inferno-tower" && def.mode === "single") {
        def.attackCooldown -= TICK;
        if (def.attackCooldown > 0) continue;

        // Track lock-on duration; reset if target changed.
        if (def.singleLockTarget !== def.targetId) {
          def.singleLockTarget   = def.targetId;
          def.singleLockDuration = 0;
        } else {
          def.singleLockDuration += def.attackSpeed;
        }

        const activeDps =
          def.singleLockDuration >= 5.25 ? def.dpsSingleMax  :
          def.singleLockDuration >= 1.5  ? def.dpsSingleMid  :
                                           def.dpsSingleInit;
        fireShot(def, target, activeDps * def.attackSpeed, simTime);
        def.attackCooldown = def.attackSpeed;
        continue;
      }

      // ── Inferno Tower multi-target mode ───────────────────────────────────
      if (def.defenseId === "inferno-tower" && def.mode === "multi") {
        def.attackCooldown -= TICK;
        if (def.attackCooldown > 0) continue;

        const targets = findNearestTroops(def, def.multiTargetCount || 5);
        for (const t of targets) {
          fireShot(def, t, def.dps * def.attackSpeed, simTime);
        }
        def.attackCooldown = def.attackSpeed;
        continue;
      }

      // ── Standard timed attack ─────────────────────────────────────────────
      def.attackCooldown -= TICK;
      if (def.attackCooldown > 0) {
        if (DEBUG && tick % TICKS_PER_SECOND === 0) {
          console.log(`[DEBUG t=${simTime.toFixed(2)}s] ATTENTE ${def.defenseId}(${def.instanceId}) | cooldown restant=${def.attackCooldown.toFixed(3)}s`);
        }
        continue;
      }

      // Monolith: dps field = base damage per shot; add HP% bonus on target's MAX HP.
      // All other defenses: damage = dps * attackSpeed (standard).
      let stdDamage = def.dps * def.attackSpeed;
      if (def.defenseId === "monolith" && def.hpPercentBonus > 0) {
        const baseDmg  = def.dps;  // "dps" stores damage-per-shot for monolith
        const bonusDmg = target.maxHp * def.hpPercentBonus;
        stdDamage = baseDmg + bonusDmg;
        if (DEBUG) console.log(
          `[DEBUG t=${simTime.toFixed(2)}s] MONOLITH ${def.instanceId} → ${def.targetId}` +
          ` base=${baseDmg.toFixed(0)} bonus=${bonusDmg.toFixed(0)} total=${stdDamage.toFixed(0)}`
        );
      }
      if (stdDamage <= 0) { def.attackCooldown = def.attackSpeed; continue; } // e.g. builder-hut lv1
      if (def.splashType === "scattershot") {
        const coneHits = applyScattershotConeSplash(def, target, stdDamage, simTime);
        fireShot(def, target, stdDamage, simTime, coneHits.map((h) => h.id), coneHits);
      } else {
        const splashHits = def.splashType === "radius"
          ? applySplash(def, target, stdDamage, simTime)
          : [];
        fireShot(def, target, stdDamage, simTime, splashHits);
      }
      def.attackCooldown = def.attackSpeed;
    }

    // --- TH 12-15 activated weapon (multi-target, Inferno-like) ---------------
    for (const bld of buildings.values()) {
      if (!bld.alive || !bld.isWeaponActive || bld.weaponDps === 0) continue;
      bld.weaponAttackCooldown -= TICK;
      if (bld.weaponAttackCooldown > 0) continue;
      const candidates: { dist: number; t: TroopState }[] = [];
      for (const t of troops.values()) {
        if (!t.alive || !t.isActive || t.isUnderground) continue;
        const d = euclidean(bld.position, { x: t.position.x + 0.5, y: t.position.y + 0.5 });
        if (d <= bld.weaponRange) candidates.push({ dist: d, t });
      }
      candidates.sort((a, b) => a.dist - b.dist);
      for (const { t } of candidates.slice(0, bld.weaponTargetCount)) {
        const actual = Math.min(bld.weaponDps * bld.weaponAttackSpeed, t.hp);
        t.hp -= actual;
        if (t.hp <= 0 && t.alive) { t.hp = 0; t.alive = false; t.destroyedAt = simTime; }
        if (DEBUG) console.log(`[DEBUG t=${simTime.toFixed(2)}s] HDV ATTAQUE ${bld.instanceId} → ${t.instanceId} | ${actual.toFixed(0)} dégâts`);
      }
      bld.weaponAttackCooldown = bld.weaponAttackSpeed;
    }

    // --- Air Sweeper pulse (every 5 s, pushes air troops within 120° cone) ---
    for (const def of defenses.values()) {
      if (!def.alive || def.pulseInterval === 0) continue;
      def.pulseCooldown -= TICK;
      if (def.pulseCooldown > 0) continue;
      def.pulseCooldown += def.pulseInterval; // += avoids cumulative drift

      const rad  = def.orientation * (Math.PI / 180);
      const dirX = Math.cos(rad);
      const dirY = Math.sin(rad);

      for (const t of troops.values()) {
        if (!t.alive || !t.isActive || !t.isAirUnit) continue;
        const tx   = t.position.x + 0.5;
        const ty   = t.position.y + 0.5;
        const dx   = tx - def.position.x;
        const dy   = ty - def.position.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist === 0 || dist > def.maxRange) continue;
        // Cone check: angle between direction and troop vector
        const dot   = (dx / dist) * dirX + (dy / dist) * dirY;
        const angle = Math.acos(Math.max(-1, Math.min(1, dot)));
        if (angle > def.coneAngle) continue; // outside cone (coneAngle is already half-cone in rad)
        // Instantaneous push in orientation direction, clamped to grid
        t.position.x = Math.max(0, Math.min(GRID_SIZE - 1, t.position.x + dirX * def.pushStrength));
        t.position.y = Math.max(0, Math.min(GRID_SIZE - 1, t.position.y + dirY * def.pushStrength));
        if (DEBUG) console.log(`[DEBUG t=${simTime.toFixed(2)}s] AIR_SWEEPER_PUSH ${def.instanceId} → ${t.instanceId} push=${def.pushStrength.toFixed(1)} tiles`);
      }
    }

    // --- Troop phase: each troop moves or attacks a defense / building -------

    // Diminishing returns: count alive & active healers this tick.
    const activeHealers = [...troops.values()].filter(
      (t) => t.alive && t.isActive && t.hps > 0,
    ).length;
    const healMultiplier =
      activeHealers <= 2 ? 1.0 :
      activeHealers <= 4 ? 0.9 :
      activeHealers === 5 ? 0.7 :
      activeHealers === 6 ? 0.4 : 0.1;

    for (const troop of troops.values()) {
      if (!troop.alive || !troop.isActive) continue;

      // ── Healer: soigne les alliés au lieu d'attaquer ─────────────────────
      if (troop.hps > 0) {
        // Cible : troupe non-Healer vivante.
        // Priorité : blessée (hp < maxHp) avec le plus grand maxHp.
        // Fallback  : pleine vie, plus grand maxHp.
        let healTargetId: string | null = null;
        let bestMaxHp = -1;
        let fallbackId: string | null = null;
        let fallbackMaxHp = -1;
        for (const [id, t] of troops) {
          if (!t.alive || !t.isActive || id === troop.instanceId) continue;
          if (t.hps > 0)    continue; // ignorer les autres Healers
          if (t.isAirUnit)  continue; // le Healer ne soigne que les troupes au sol
          if (t.hp < t.maxHp) {
            if (t.maxHp > bestMaxHp) { bestMaxHp = t.maxHp; healTargetId = id; }
          } else {
            if (t.maxHp > fallbackMaxHp) { fallbackMaxHp = t.maxHp; fallbackId = id; }
          }
        }
        const resolvedTargetId = healTargetId ?? fallbackId;
        troop.targetId = resolvedTargetId;
        if (resolvedTargetId === null) continue;

        const healTarget = troops.get(resolvedTargetId)!;
        const distToTarget = euclidean(troop.position, healTarget.position);

        if (distToTarget <= troop.attackRange) {
          // Soin continu chaque tick — troupes au sol non-Healer dans splashRadius autour de la cible.
          const healPerTick = troop.hps * TICK * healMultiplier;
          for (const [, t] of troops) {
            if (!t.alive || !t.isActive || t.hps > 0 || t.isAirUnit) continue;
            if (euclidean(healTarget.position, t.position) <= HEALER_SPLASH_RADIUS) {
              const actual = Math.min(healPerTick, t.maxHp - t.hp);
              if (actual > 0) {
                t.hp += actual;
                healEvents.push({ time: simTime, healerInstId: troop.instanceId, targetInstId: t.instanceId, amount: actual });
              }
            }
          }
          // Pulse visuel (une fois par attackSpeed)
          troop.healVisualCooldown -= TICK;
          if (troop.healVisualCooldown <= 0) {
            heals.push({
              time:          simTime,
              healerInstId:  troop.instanceId,
              healerPos:     { x: troop.position.x + 0.5, y: troop.position.y + 0.5 },
              targetInstId:  resolvedTargetId,
              targetPos:     { x: healTarget.position.x + 0.5, y: healTarget.position.y + 0.5 },
              healedTargets: [...troops.values()]
                .filter((t) => t.alive && t.isActive && t.hps === 0 &&
                               euclidean(healTarget.position, t.position) <= HEALER_SPLASH_RADIUS)
                .map((t) => t.instanceId),
            });
            troop.healVisualCooldown = troop.attackSpeed;
          }
        } else {
          troop.position = stepToward(troop.position, healTarget.position, troop.speed * TICK * troop.speedMultiplier);
        }
        continue;
      }

      const prevTargetId = troop.targetId;

      // Reacquire target if current one is destroyed (check both maps).
      const currentTarget = troop.targetId
        ? (defenses.get(troop.targetId) ?? buildings.get(troop.targetId))
        : undefined;

      if (!currentTarget?.alive) {
        troop.targetId = pickTroopTarget(troop);
        if (troop.targetId !== prevTargetId) {
          const reason: TargetChangeEvent["reason"] =
            prevTargetId === null ? "initial" :
            troop.targetId === null ? "no_targets" : "destroyed";
          targetChanges.push({
            time:        simTime,
            troopInstId: troop.instanceId,
            troopId:     troop.troopId,
            oldTargetId: prevTargetId,
            newTargetId: troop.targetId,
            reason,
          });
        }
      }

      if (troop.targetId === null) continue;

      // Resolve entity — may be a defense or a neutral building.
      const targetEntity = defenses.get(troop.targetId) ?? buildings.get(troop.targetId);
      if (!targetEntity) continue;

      // Distance to the nearest edge of the target's footprint (not its centre).
      const distToFootprint = distanceToFootprint(
        troop.position, targetEntity.position, targetEntity.size,
      );

      // Miner: sous terre en déplacement, à la surface en attaque
      if (troop.troopId === "miner") {
        troop.isUnderground = distToFootprint > troop.attackRange;
      }

      // Baby Dragon: enragé si aucun AUTRE Baby Dragon allié vivant dans le rayon 4.5 tiles.
      // Les autres troupes aériennes (Dragon, Electro Dragon, Healer, Balloon…) ne comptent pas.
      if (troop.troopId === "baby-dragon") {
        troop.isEnraged = true;
        for (const [id, t] of troops) {
          if (id === troop.instanceId || !t.alive || !t.isActive) continue;
          if (t.troopId !== "baby-dragon") continue;
          if (euclidean(troop.position, t.position) < ENRAGE_RADIUS) {
            troop.isEnraged = false;
            break;
          }
        }
      }

      if (distToFootprint <= troop.attackRange) {
        troop.attackCooldown -= TICK * troop.attackMultiplier;
        if (troop.attackCooldown <= 0) {
          // Baby Dragon rage: dégâts ×2, vitesse d'attaque ×1.5
          const isEnragedBD          = troop.troopId === "baby-dragon" && troop.isEnraged;
          const effectiveAttackSpeed = isEnragedBD ? troop.attackSpeed / 1.5 : troop.attackSpeed;
          const effectiveDps         = isEnragedBD ? troop.dps * 2 : troop.dps;
          const damage               = effectiveDps * effectiveAttackSpeed;

          if (troop.chainMaxTargets > 0) {
            // ── Electro Dragon : chaîne d'éclairs ────────────────────────────
            const tc = (p: Vec2): Vec2 => ({ x: p.x + 0.5, y: p.y + 0.5 });
            const links: ChainLink[] = [];
            const hitIds = new Set<string>([troop.targetId!]);

            // Frappe principale
            const primaryActual = Math.min(damage, targetEntity.hp);
            targetEntity.hp -= primaryActual;
            if (targetEntity.hp <= 0 && targetEntity.alive) {
              targetEntity.hp = 0; targetEntity.alive = false; targetEntity.destroyedAt = simTime;
            }
            links.push({ from: tc(troop.position), to: tc(targetEntity.position), targetInstId: troop.targetId!, damage: primaryActual });

            // Rebonds
            let prevPos  = targetEntity.position;
            let prevSize = targetEntity.size;
            let multiplier = 1.0;
            for (let bounce = 1; bounce < troop.chainMaxTargets; bounce++) {
              multiplier *= troop.chainFalloff;
              let nextId: string | null = null;
              let bestDist = Infinity;
              let bestHp = -1;
              for (const [id, ent] of defenses) {
                if (!ent.alive || hitIds.has(id)) continue;
                const d = distanceBetweenFootprints(prevPos, prevSize, ent.position, ent.size);
                if (d <= troop.chainRange && (d < bestDist || (d === bestDist && ent.hp > bestHp))) {
                  bestDist = d; nextId = id; bestHp = ent.hp;
                }
              }
              for (const [id, ent] of buildings) {
                if (!ent.alive || hitIds.has(id)) continue;
                const d = distanceBetweenFootprints(prevPos, prevSize, ent.position, ent.size);
                if (d <= troop.chainRange && (d < bestDist || (d === bestDist && ent.hp > bestHp))) {
                  bestDist = d; nextId = id; bestHp = ent.hp;
                }
              }
              if (nextId === null) break;
              hitIds.add(nextId);
              const nextEnt = (defenses.get(nextId) ?? buildings.get(nextId))!;
              const chainActual = Math.min(damage * multiplier, nextEnt.hp);
              nextEnt.hp -= chainActual;
              if (nextEnt.hp <= 0 && nextEnt.alive) {
                nextEnt.hp = 0; nextEnt.alive = false; nextEnt.destroyedAt = simTime;
              }
              links.push({ from: tc(prevPos), to: tc(nextEnt.position), targetInstId: nextId, damage: chainActual });
              prevPos  = nextEnt.position;
              prevSize = nextEnt.size;
            }
            chainEvents.push({ time: simTime, attackerInstId: troop.instanceId, links });
          } else {
            // ── Attaque normale (+ splash éventuel pour le Dragon) ────────────
            const actualDamage = Math.min(damage, targetEntity.hp);
            targetEntity.hp -= actualDamage;
            if (targetEntity.hp <= 0 && targetEntity.alive) {
              targetEntity.hp = 0;
              targetEntity.alive = false;
              targetEntity.destroyedAt = simTime;
            }
            if (troop.splashRadius > 0) {
              for (const [id, entity] of [
                ...[...defenses.entries()],
                ...[...buildings.entries()],
              ] as [string, DefenseState | BuildingState][]) {
                if (!entity.alive || id === troop.targetId) continue;
                if (euclidean(targetEntity.position, entity.position) <= troop.splashRadius) {
                  const splashActual = Math.min(damage, entity.hp);
                  entity.hp -= splashActual;
                  if (entity.hp <= 0 && entity.alive) {
                    entity.hp = 0;
                    entity.alive = false;
                    entity.destroyedAt = simTime;
                  }
                }
              }
            }
            // Baby Dragon fireball event (visuel + tracking dégâts sous-seconde)
            if (troop.troopId === "baby-dragon") {
              troopFireEvents.push({
                time:           simTime,
                troopId:        troop.troopId,
                attackerInstId: troop.instanceId,
                from:           { x: troop.position.x + 0.5, y: troop.position.y + 0.5 },
                to:             { x: targetEntity.position.x + 0.5, y: targetEntity.position.y + 0.5 },
                targetInstId:   troop.targetId!,
                damage:         actualDamage,
              });
            }
          }
          troop.attackCooldown = effectiveAttackSpeed;
        }
      } else if (troop.wallAttackId !== null) {
        // ── Attacking a locked wall ───────────────────────────────────────
        const wall = walls.get(troop.wallAttackId);
        if (!wall || !wall.alive) {
          // Wall died → force full replan
          troop.wallAttackId        = null;
          troop.wallAttackLockTimer = 0;
          troop.bfsPath             = [];
          troop.bfsWallVer          = -1;
        } else {
          // Decrement stability lock
          if (troop.wallAttackLockTimer > 0) troop.wallAttackLockTimer--;

          if (troop.wallAttackLockTimer === 0) {
            // Lock expired → clear and let BFS re-decide next tick
            troop.wallAttackId = null;
            troop.bfsWallVer   = -1;
          } else {
            // Still locked → attack the wall
            const wallCenter = { x: wall.x + 0.5, y: wall.y + 0.5 };
            if (euclidean(troop.position, wallCenter) <= troop.attackRange + 0.5) {
              troop.attackCooldown -= TICK * troop.attackMultiplier;
              if (troop.attackCooldown <= 0) {
                const isEnragedBD = troop.troopId === "baby-dragon" && troop.isEnraged;
                const effAS  = isEnragedBD ? troop.attackSpeed / 1.5 : troop.attackSpeed;
                const effDps = isEnragedBD ? troop.dps * 2 : troop.dps;
                const actual = Math.min(effDps * effAS, wall.hp);
                wall.hp -= actual;
                if (wall.hp <= 0 && wall.alive) {
                  wall.hp = 0; wall.alive = false; wall.destroyedAt = simTime;
                  wallVersion++;
                }
                troop.attackCooldown = effAS;
              }
            } else {
              troop.position = stepToward(troop.position, wallCenter, troop.speed * TICK * troop.speedMultiplier);
            }
          }
        }
      } else if (walls.size > 0 && !troop.isAirUnit && troop.troopId !== "miner") {
        // ── BFS + decision logic (V2) ─────────────────────────────────────

        // Invalidate path cache when wallVersion changes
        if (pathCacheVersion !== wallVersion) {
          pathCache.clear();
          pathCacheVersion = wallVersion;
        }

        const needReplan =
          troop.bfsTargetId !== troop.targetId ||
          troop.bfsWallVer  !== wallVersion    ||
          troop.bfsPath.length === 0;

        if (needReplan) {
          troop.bfsTargetId = troop.targetId;
          troop.bfsWallVer  = wallVersion;
          troop.bfsPath     = [];
          troop.bfsPathCost = 0;

          const fromTile  = { x: Math.floor(troop.position.x), y: Math.floor(troop.position.y) };
          const goalTiles = adjacentTilesForFootprint(
            targetEntity.position.x, targetEntity.position.y,
            (targetEntity as { size: number }).size ?? 1,
            GRID_SIZE,
          );

          // Global path cache keyed by position + target + wallVersion
          const cacheKey = `${fromTile.x},${fromTile.y}|${troop.targetId}|${wallVersion}`;
          let result = pathCache.get(cacheKey);
          if (result === undefined) {
            result = dijkstraPath(fromTile, goalTiles, buildBlockedSet(), GRID_SIZE);
            pathCache.set(cacheKey, result);
          }

          const directDist = euclidean(troop.position, targetEntity.position);

          if (result !== null && result.cost <= directDist * DETOUR_RATIO) {
            // ① Valid path AND detour is acceptable → follow it
            troop.bfsPath     = result.path;
            troop.bfsPathCost = result.cost;
            troop.wallAttackId = null;
          } else {
            // ② No path OR detour too long → pick best wall to break
            const bestWallId = pickBestWall(troop.position, targetEntity.position);
            troop.wallAttackId        = bestWallId;
            troop.wallAttackLockTimer = bestWallId ? WALL_LOCK_TICKS : 0;
            troop.bfsPath = [];
          }
        }

        // ③ Follow BFS path waypoint-by-waypoint
        if (troop.bfsPath.length > 0) {
          const wp    = troop.bfsPath[0];
          const wpCtr = { x: wp.x + 0.5, y: wp.y + 0.5 };
          const step  = troop.speed * TICK * troop.speedMultiplier;
          if (euclidean(troop.position, wpCtr) <= step + 0.05) {
            troop.position = { ...wpCtr };
            troop.bfsPath.shift();
          } else {
            troop.position = stepToward(troop.position, wpCtr, step);
          }
        } else if (!troop.wallAttackId) {
          // Fallback straight line (e.g. empty walls map or goal already adjacent)
          troop.position = stepToward(troop.position, targetEntity.position, troop.speed * TICK * troop.speedMultiplier);
        }
      } else {
        // No walls (or air unit / miner) — straight line
        troop.position = stepToward(troop.position, targetEntity.position, troop.speed * TICK * troop.speedMultiplier);
      }
    }

    // --- Electro Dragon death lightning: schedule + process ------------------

    for (const troop of troops.values()) {
      // Schedule 6 bolts the first tick after death
      if (troop.troopId === "electro-dragon" && !troop.alive && !troop.deathLightningTriggered && troop.deathDamage > 0) {
        troop.deathLightningTriggered = true;
        const baseTime = troop.destroyedAt ?? simTime;
        // Centre la dispersion sur la dernière cible (là où la défense se trouve),
        // pas sur le dragon qui meurt loin derrière.
        const lastTarget = troop.targetId
          ? (defenses.get(troop.targetId) ?? buildings.get(troop.targetId))
          : null;
        const scatterCenter = lastTarget ? lastTarget.position : troop.position;
        for (let i = 0; i < DEATH_LIGHTNING_COUNT; i++) {
          const angle = Math.random() * 2 * Math.PI;
          const r     = Math.random() * DEATH_LIGHTNING_SPREAD;
          troop.deathLightningPending.push({
            fireAt:   baseTime + DEATH_LIGHTNING_DELAY + i * DEATH_LIGHTNING_INTERVAL,
            position: { x: scatterCenter.x + Math.cos(angle) * r, y: scatterCenter.y + Math.sin(angle) * r },
          });
        }
      }
      // Fire pending bolts whose time has come
      if (!troop.deathLightningPending.length) continue;
      const due: { fireAt: number; position: Vec2 }[] = [];
      troop.deathLightningPending = troop.deathLightningPending.filter(e => {
        if (e.fireAt <= simTime) { due.push(e); return false; }
        return true;
      });
      for (const evt of due) {
        for (const [, def] of defenses) {
          if (!def.alive) continue;
          if (distanceToFootprint(evt.position, def.position, def.size) <= DEATH_LIGHTNING_SPLASH) {
            const actual = Math.min(troop.deathDamage, def.hp);
            def.hp -= actual;
            if (def.hp <= 0 && def.alive) { def.hp = 0; def.alive = false; def.destroyedAt = simTime; }
          }
        }
        for (const [, bld] of buildings) {
          if (!bld.alive) continue;
          if (distanceToFootprint(evt.position, bld.position, bld.size) <= DEATH_LIGHTNING_SPLASH) {
            const actual = Math.min(troop.deathDamage, bld.hp);
            bld.hp -= actual;
            if (bld.hp <= 0 && bld.alive) { bld.hp = 0; bld.alive = false; bld.destroyedAt = simTime; }
          }
        }
        deathLightningEvents.push({
          time:         simTime,
          sourceInstId: troop.instanceId,
          position:     { ...evt.position },
          damage:       troop.deathDamage,
          splashRadius: DEATH_LIGHTNING_SPLASH,
        });
      }
    }

    // --- TH death explosions + lingering zones --------------------------------
    for (const bld of buildings.values()) {
      if (!bld.alive && !bld.deathExplosionTriggered && bld.deathDamage > 0) {
        bld.deathExplosionTriggered = true;
        if (DEBUG) console.log(`[DEBUG t=${simTime.toFixed(2)}s] HDV DÉTRUIT ${bld.instanceId} Lv${bld.level} — explosion ${bld.deathDamage} HP r=${bld.deathRadius}`);
        for (const t of troops.values()) {
          if (!t.alive || !t.isActive) continue;
          if (euclidean(t.position, bld.position) <= bld.deathRadius) {
            const actual = Math.min(bld.deathDamage, t.hp);
            t.hp -= actual;
            if (t.hp <= 0 && t.alive) { t.hp = 0; t.alive = false; t.destroyedAt = simTime; }
            if (DEBUG) console.log(`[DEBUG t=${simTime.toFixed(2)}s] HDV EFFET DE MORT → ${t.instanceId} dégâts=${actual.toFixed(0)}`);
          }
        }
        if (bld.deathEffectDuration > 0) {
          thDeathZones.push({
            sourceInstId:  bld.instanceId,
            position:      { ...bld.position },
            radius:        bld.deathEffectRadius > 0 ? bld.deathEffectRadius : bld.deathRadius,
            dps:           bld.deathEffectDps,
            slowMultiplier: bld.deathEffectSlow,
            endTime:       simTime + bld.deathEffectDuration,
          });
          if (DEBUG) console.log(`[DEBUG t=${simTime.toFixed(2)}s] HDV EFFET DE MORT zone créée (dur=${bld.deathEffectDuration}s slow=${bld.deathEffectSlow})`);
        }
      }
    }

    // --- TH death-zone: slow + DPS (reset multipliers each tick) -------------
    thDeathZones = thDeathZones.filter((z) => z.endTime > simTime);
    for (const t of troops.values()) { t.speedMultiplier = 1.0; t.attackMultiplier = 1.0; }
    for (const zone of thDeathZones) {
      for (const t of troops.values()) {
        if (!t.alive || !t.isActive) continue;
        if (euclidean(t.position, zone.position) > zone.radius) continue;
        if (zone.dps > 0) {
          const actual = Math.min(zone.dps * TICK, t.hp);
          t.hp -= actual;
          if (t.hp <= 0 && t.alive) { t.hp = 0; t.alive = false; t.destroyedAt = simTime; }
        }
        if (zone.slowMultiplier < 1.0) {
          t.speedMultiplier  = Math.min(t.speedMultiplier,  zone.slowMultiplier);
          t.attackMultiplier = Math.min(t.attackMultiplier, zone.slowMultiplier);
        }
      }
    }

    // --- Defense death explosions (e.g. Bomb Tower) --------------------------
    for (const def of defenses.values()) {
      if (def.alive || def.deathExplosionTriggered || def.deathExplosionDamage === 0) continue;
      // Trigger only on the exact tick the defense died.
      if (def.destroyedAt !== simTime) continue;
      def.deathExplosionTriggered = true;
      if (DEBUG) console.log(`[DEBUG t=${simTime.toFixed(2)}s] EXPLOSION MORT ${def.defenseId}(${def.instanceId}) — ${def.deathExplosionDamage}HP r=${def.deathExplosionRadius}`);
      for (const t of troops.values()) {
        if (!t.alive || !t.isActive || t.isAirUnit) continue; // ground troops only
        if (euclidean(t.position, def.position) > def.deathExplosionRadius) continue;
        const actual = Math.min(def.deathExplosionDamage, t.hp);
        t.hp -= actual;
        if (t.hp <= 0 && t.alive) { t.hp = 0; t.alive = false; t.destroyedAt = simTime; }
        if (DEBUG) console.log(`[DEBUG t=${simTime.toFixed(2)}s] EXPLOSION MORT → ${t.instanceId} dégâts=${actual.toFixed(0)}`);
      }
    }

    // --- Builder Hut passive repair (once per second) ------------------------
    if (tick % TICKS_PER_SECOND === 0) {
      for (const bh of defenses.values()) {
        if (!bh.alive || bh.repairPerSecond === 0) continue;
        let bestId: string | null = null;
        let bestDist = Infinity;
        const REPAIR_RADIUS = 6;
        // Nearest damaged defense (excluding self)
        for (const [id, d] of defenses) {
          if (!d.alive || id === bh.instanceId || d.hp >= d.maxHp) continue;
          const dist = euclidean(bh.position, d.position);
          if (dist <= REPAIR_RADIUS && dist < bestDist) { bestDist = dist; bestId = id; }
        }
        // Nearest damaged neutral building
        for (const [id, b] of buildings) {
          if (!b.alive || b.hp >= b.maxHp) continue;
          const dist = euclidean(bh.position, b.position);
          if (dist <= REPAIR_RADIUS && dist < bestDist) { bestDist = dist; bestId = id; }
        }
        if (bestId === null) continue;
        const dTarget = defenses.get(bestId);
        const bTarget = buildings.get(bestId);
        if (dTarget) {
          const healed = Math.min(bh.repairPerSecond, dTarget.maxHp - dTarget.hp);
          if (healed > 0) {
            dTarget.hp += healed;
            if (DEBUG) console.log(`[DEBUG t=${simTime.toFixed(2)}s] BUILDER_HUT ${bh.instanceId} repaired ${bestId} +${healed.toFixed(0)}hp`);
          }
        } else if (bTarget) {
          const healed = Math.min(bh.repairPerSecond, bTarget.maxHp - bTarget.hp);
          if (healed > 0) {
            bTarget.hp += healed;
            if (DEBUG) console.log(`[DEBUG t=${simTime.toFixed(2)}s] BUILDER_HUT ${bh.instanceId} repaired ${bestId} +${healed.toFixed(0)}hp`);
          }
        }
      }
    }

    // --- Whole-second snapshot -----------------------------------------------

    if (tick % TICKS_PER_SECOND === 0) {
      for (const troop of troops.values()) {
        troop.hpHistory.push(troop.alive ? Math.ceil(troop.hp) : 0);
        troop.targetHistory.push(troop.alive ? troop.targetId : null);
        troop.positionHistory.push({ ...troop.position });
        troop.undergroundHistory.push(troop.isUnderground);
        troop.enragedHistory.push(troop.isEnraged);
      }
      for (const def of defenses.values()) {
        def.hpHistory.push(def.alive ? Math.ceil(def.hp) : 0);
      }
      for (const bld of buildings.values()) {
        bld.hpHistory.push(bld.alive ? Math.ceil(bld.hp) : 0);
      }
      for (const w of walls.values()) {
        w.hpHistory.push(w.alive ? Math.ceil(w.hp) : 0);
      }
    }

    // --- Termination check ---------------------------------------------------

    lastSimTime = simTime;

    const hasPendingLightning = [...troops.values()].some(t => t.deathLightningPending.length > 0);
    const allTroopsDead       = [...troops.values()].every((t) => !t.alive);
    // Consumed traps don't count as "alive targets" for termination.
    const allTargetsDown      = [...defenses.values()].filter(d => !d.isTrap).every(d => !d.alive)
                             && [...defenses.values()].filter(d => d.isTrap && !d.consumed && d.alive).length === 0
                             && [...buildings.values()].every((b) => !b.alive)
                             && [...walls.values()].every((w) => !w.alive);
    if ((allTroopsDead && !hasPendingLightning) || allTargetsDown) break;
  }

  // -------------------------------------------------------------------------
  // 5. Build results
  // -------------------------------------------------------------------------

  const troopResults: Record<string, TroopResult> = {};
  for (const [id, troop] of troops) {
    troopResults[id] = {
      instanceId:           id,
      hpPerSecond:          troop.hpHistory,
      targetPerSecond:      troop.targetHistory,
      positionPerSecond:    troop.positionHistory,
      destroyedAt:          troop.destroyedAt,
      undergroundPerSecond: troop.undergroundHistory,
      enragedPerSecond:     troop.enragedHistory,
    };
  }

  const defenseResults: Record<string, DefenseResult> = {};
  for (const [id, def] of defenses) {
    defenseResults[id] = {
      instanceId:       id,
      hpPerSecond:      def.hpHistory,
      destroyedAt:      def.destroyedAt,
      totalDamageDealt: Math.round(def.totalDamageDealt),
    };
  }

  const buildingResults: Record<string, BuildingResult> = {};
  for (const [id, bld] of buildings) {
    buildingResults[id] = {
      instanceId:  id,
      hpPerSecond: bld.hpHistory,
      destroyedAt: bld.destroyedAt,
    };
  }

  const wallResults: Record<string, WallResult> = {};
  for (const [id, w] of walls) {
    wallResults[id] = {
      instanceId:  id,
      hpPerSecond: w.hpHistory,
      destroyedAt: w.destroyedAt,
    };
  }

  return {
    troops: troopResults,
    defenses: defenseResults,
    buildings: buildingResults,
    walls:     wallResults,
    durationSeconds: Math.round(lastSimTime * 10) / 10,
    shots,
    heals,
    healEvents,
    chainEvents,
    deathLightningEvents,
    troopFireEvents,
    targetChanges,
  };
}
