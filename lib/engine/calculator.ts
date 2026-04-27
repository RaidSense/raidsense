import { getTroopById } from "../data/troops";
import { getDefenseById, type TargetType } from "../data/defenses";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TICKS_PER_SECOND = 10;
const TICK = 1 / TICKS_PER_SECOND; // 0.1 s
const MAX_SIM_SECONDS = 180;        // hard cap: 3-minute raid

const SPEED_DIVISOR = 16;

// Eagle Artillery burst constants
const EAGLE_BURST_SIZE     = 3;
const EAGLE_SHOT_INTERVAL  = 0.75;  // s between shots within a burst
const EAGLE_BURST_INTERVAL = 10;    // s from one burst start to the next
// Wait between burst end and next burst start:
const EAGLE_INTER_BURST    = EAGLE_BURST_INTERVAL - (EAGLE_BURST_SIZE - 1) * EAGLE_SHOT_INTERVAL;

// Tiles per second a projectile travels (used by the frontend for animation).
export const PROJECTILE_SPEED = 25;

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
  "dragon":         2.25,
  "pekka":          0.8,
  "baby-dragon":    2.0,
  "miner":          0.5,
  "electro-dragon": 2.5,
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
  /**
   * Whether this instance counts as an air unit (determines which defenses
   * can fire at it). Inferred from troopId when omitted.
   */
  isAirUnit?: boolean;
}

/** One defense building placed at a position on the grid. */
export interface DefensePlacement {
  instanceId: string;
  defenseId: string;   // must match a Defense.id in defenses.ts
  level: number;
  position: Vec2;      // centre tile of the defense
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
}

/** Per-defense simulation output. */
export interface DefenseResult {
  instanceId: string;
  /** Exact simulation time in seconds when this defense was destroyed. Null if survived. */
  destroyedAt: number | null;
  /** Cumulative damage actually dealt (no overkill inflation). */
  totalDamageDealt: number;
}

/** One projectile fired during the simulation. Used to animate shots in replay. */
export interface ShotEvent {
  /** Simulation time (s) when the shot was fired. */
  time:      number;
  /** Defense type id (e.g. "cannon") — used for colour lookup in the frontend. */
  defenseId: string;
  /** Defense centre in tile coords. Pixel = pos * cellPx. */
  defPos:    Vec2;
  /**
   * Troop centre at time of shot in tile coords (already +0.5 offset applied).
   * Pixel = pos * cellPx.
   */
  troopPos:  Vec2;
}

/** Full simulation output. */
export interface SimulationResult {
  troops: Record<string, TroopResult>;
  defenses: Record<string, DefenseResult>;
  /** How many seconds the simulation actually ran before termination. */
  durationSeconds: number;
  /** Every discrete shot fired by a defense during the simulation. */
  shots: ShotEvent[];
}

// ---------------------------------------------------------------------------
// Internal state types (not exported)
// ---------------------------------------------------------------------------

interface TroopState {
  instanceId: string;
  troopId: string;
  hp: number;
  dps: number;
  /** Tiles per second. */
  speed: number;
  attackRange: number;
  position: Vec2;
  isAirUnit: boolean;
  preferredTarget: string;
  targetId: string | null;
  alive: boolean;
  destroyedAt: number | null;
  hpHistory: number[];
  targetHistory: (string | null)[];
  positionHistory: Vec2[];
}

interface DefenseState {
  instanceId:         string;
  defenseId:          string;   // defense type (e.g. "cannon")
  hp:                 number;
  dps:                number;
  minRange:           number;
  maxRange:           number;
  targetType:         TargetType;
  position:           Vec2;
  targetId:           string | null;
  alive:              boolean;
  destroyedAt:        number | null;
  totalDamageDealt:   number;
  attackSpeed:        number;   // seconds between shots (-1 unused for Eagle Artillery)
  attackCooldown:     number;   // seconds until next shot (counts down)
  burstRemaining:     number;   // Eagle Artillery: shots left in current burst; -1 = N/A
  interBurstCooldown: number;   // Eagle Artillery: wait timer between bursts
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
 *  - Inferno Tower ramp-up is not modelled (constant DPS from data).
 *  - Eagle Artillery activation threshold is not enforced.
 *  - Splash radius is not applied; each troop / defense deals its DPS to a
 *    single target per tick.
 */
export function simulateAttack(
  deployments: TroopDeployment[],
  placements: DefensePlacement[],
): SimulationResult {
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
      speed: troopData.movementSpeed / SPEED_DIVISOR,
      attackRange: TROOP_ATTACK_RANGE[dep.troopId] ?? 0.5,
      position: { ...dep.dropPosition },
      isAirUnit,
      preferredTarget: troopData.preferredTarget,
      targetId: null,
      alive: true,
      destroyedAt: null,
      hpHistory: [],    // populated after initial targeting below
      targetHistory: [],
      positionHistory: [],
    });
  }

  const defenses = new Map<string, DefenseState>();

  for (const pl of placements) {
    const defData = getDefenseById(pl.defenseId);
    if (!defData) throw new Error(`Unknown defense id: "${pl.defenseId}"`);

    const levelData = defData.levels.find((l) => l.level === pl.level);
    if (!levelData)
      throw new Error(`Level ${pl.level} not found for defense "${pl.defenseId}"`);

    const isEagle = pl.defenseId === "eagle-artillery";

    defenses.set(pl.instanceId, {
      instanceId:         pl.instanceId,
      defenseId:          pl.defenseId,
      hp:                 levelData.hp,
      dps:                levelData.dps,
      minRange:           levelData.minRange,
      maxRange:           levelData.maxRange,
      targetType:         defData.targetType,
      position:           { ...pl.position },
      targetId:           null,
      alive:              true,
      destroyedAt:        null,
      totalDamageDealt:   0,
      attackSpeed:        defData.attackSpeed,
      attackCooldown:     0,
      burstRemaining:     isEagle ? EAGLE_BURST_SIZE : -1,
      interBurstCooldown: 0,
    });
  }

  // -------------------------------------------------------------------------
  // 2. Targeting helpers (closures over state maps)
  // -------------------------------------------------------------------------

  /**
   * Returns the closest living defense instanceId, with preference for the
   * troop's preferred target category.
   * In this model, only defenses are tracked as buildings, so "Resources" and
   * "Buildings" both fall back to nearest defense.
   */
  function pickTroopTarget(troop: TroopState): string | null {
    let bestId: string | null = null;
    let bestDist = Infinity;

    for (const [id, def] of defenses) {
      if (!def.alive) continue;
      const d = euclidean(troop.position, def.position);
      if (d < bestDist) {
        bestDist = d;
        bestId = id;
      }
    }
    return bestId;
  }

  /**
   * Returns the closest living troop instanceId that this defense can target
   * and that is within [minRange, maxRange].
   */
  function pickDefenseTarget(def: DefenseState): string | null {
    let bestId: string | null = null;
    let bestDist = Infinity;

    for (const [id, troop] of troops) {
      if (!troop.alive) continue;
      if (!defenseCanTarget(def.targetType, troop.isAirUnit)) continue;
      const d = euclidean(def.position, troop.position);
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
  }

  // -------------------------------------------------------------------------
  // 4. Simulation loop
  // -------------------------------------------------------------------------

  const shots: ShotEvent[] = [];

  function fireShot(
    def:     DefenseState,
    target:  TroopState,
    damage:  number,
    simTime: number,
  ): void {
    const actual = Math.min(damage, target.hp);
    target.hp            -= actual;
    def.totalDamageDealt += actual;
    if (target.hp <= 0 && target.alive) {
      target.hp          = 0;
      target.alive       = false;
      target.destroyedAt = simTime;
    }
    shots.push({
      time:      simTime,
      defenseId: def.defenseId,
      defPos:    { ...def.position },
      troopPos:  { x: target.position.x + 0.5, y: target.position.y + 0.5 },
    });
  }

  let lastSimTime = 0;
  const maxTicks = MAX_SIM_SECONDS * TICKS_PER_SECOND;

  for (let tick = 1; tick <= maxTicks; tick++) {
    const simTime = tick / TICKS_PER_SECOND;

    // --- Defense phase: each defense fires at a troop in range ---------------

    for (const def of defenses.values()) {
      if (!def.alive) continue;

      // Reacquire if current target is dead or out of range.
      const currentTarget = def.targetId ? troops.get(def.targetId) : undefined;
      if (!currentTarget?.alive) {
        def.targetId = pickDefenseTarget(def);
      } else {
        const d = euclidean(def.position, currentTarget.position);
        if (d < def.minRange || d > def.maxRange) {
          def.targetId = pickDefenseTarget(def);
        }
      }

      if (def.targetId === null) continue;
      const target = troops.get(def.targetId)!;

      // ── Eagle Artillery burst mechanics ───────────────────────────────────
      if (def.burstRemaining >= 0) {
        if (def.burstRemaining === 0) {
          // Between bursts: count down inter-burst timer.
          def.interBurstCooldown -= TICK;
          if (def.interBurstCooldown <= 0) {
            def.burstRemaining = EAGLE_BURST_SIZE;
            def.attackCooldown = 0;
          }
          continue;
        }
        // Mid-burst: wait for shot cooldown.
        def.attackCooldown -= TICK;
        if (def.attackCooldown > 0) continue;

        // Damage per shot = total burst damage / burst size.
        const dpa = def.dps * EAGLE_BURST_INTERVAL / EAGLE_BURST_SIZE;
        fireShot(def, target, dpa, simTime);
        def.burstRemaining -= 1;
        if (def.burstRemaining > 0) {
          def.attackCooldown = EAGLE_SHOT_INTERVAL;
        } else {
          def.interBurstCooldown = EAGLE_INTER_BURST;
        }
        continue;
      }

      // ── Standard timed attack ─────────────────────────────────────────────
      def.attackCooldown -= TICK;
      if (def.attackCooldown > 0) continue;

      fireShot(def, target, def.dps * def.attackSpeed, simTime);
      def.attackCooldown = def.attackSpeed;
    }

    // --- Troop phase: each troop moves or attacks a defense ------------------

    for (const troop of troops.values()) {
      if (!troop.alive) continue;

      // Reacquire target if current one is destroyed.
      const currentDef = troop.targetId ? defenses.get(troop.targetId) : undefined;
      if (!currentDef?.alive) {
        troop.targetId = pickTroopTarget(troop);
      }

      if (troop.targetId === null) continue; // all defenses down

      const targetDef = defenses.get(troop.targetId)!;
      const distToTarget = euclidean(troop.position, targetDef.position);

      if (distToTarget <= troop.attackRange) {
        // In range — attack.
        const damage = troop.dps * TICK;
        const actualDamage = Math.min(damage, targetDef.hp);
        targetDef.hp -= actualDamage;

        if (targetDef.hp <= 0 && targetDef.alive) {
          targetDef.hp = 0;
          targetDef.alive = false;
          targetDef.destroyedAt = simTime;
        }
      } else {
        // Out of range — advance.
        troop.position = stepToward(
          troop.position,
          targetDef.position,
          troop.speed * TICK,
        );
      }
    }

    // --- Whole-second snapshot -----------------------------------------------

    if (tick % TICKS_PER_SECOND === 0) {
      for (const troop of troops.values()) {
        troop.hpHistory.push(troop.alive ? Math.ceil(troop.hp) : 0);
        troop.targetHistory.push(troop.alive ? troop.targetId : null);
        troop.positionHistory.push({ ...troop.position });
      }
    }

    // --- Termination check ---------------------------------------------------

    lastSimTime = simTime;

    const allTroopsDead = [...troops.values()].every((t) => !t.alive);
    const allDefensesDown = [...defenses.values()].every((d) => !d.alive);
    if (allTroopsDead || allDefensesDown) break;
  }

  // -------------------------------------------------------------------------
  // 5. Build results
  // -------------------------------------------------------------------------

  const troopResults: Record<string, TroopResult> = {};
  for (const [id, troop] of troops) {
    troopResults[id] = {
      instanceId: id,
      hpPerSecond: troop.hpHistory,
      targetPerSecond: troop.targetHistory,
      positionPerSecond: troop.positionHistory,
      destroyedAt: troop.destroyedAt,
    };
  }

  const defenseResults: Record<string, DefenseResult> = {};
  for (const [id, def] of defenses) {
    defenseResults[id] = {
      instanceId: id,
      destroyedAt: def.destroyedAt,
      totalDamageDealt: Math.round(def.totalDamageDealt),
    };
  }

  return {
    troops: troopResults,
    defenses: defenseResults,
    durationSeconds: Math.round(lastSimTime * 10) / 10,
    shots,
  };
}
