import { getTroopById } from "../data/troops";
import { getDefenseById, type TargetType } from "../data/defenses";
import { getNeutralBuildingById } from "../data/neutral-buildings";

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

// Set to true to print target-acquisition, cooldown, and shot events to the console.
const DEBUG = true;

// All defenses except Inferno Tower use the discrete model:
// initial-delay of one full attackSpeed before the first shot,
// and a cooldown reset whenever the target changes.
const DISCRETE_DEFENSE_IDS = new Set<string>([
  "cannon", "archer-tower", "mortar", "air-defense",
  "wizard-tower", "x-bow", "eagle-artillery", "scattershot",
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

/** Per-neutral-building simulation output. */
export interface BuildingResult {
  instanceId: string;
  hpPerSecond: number[];
  destroyedAt: number | null;
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
  shots: ShotEvent[];
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
  deployAt: number;   // seconds — troop activates when simTime reaches this
  isActive: boolean;  // false until deployAt is reached
}

interface DefenseState {
  instanceId:         string;
  defenseId:          string;
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
  attackSpeed:        number;
  attackCooldown:     number;
  isDiscrete:         boolean;  // true = uses initial-delay + target-change reset
  burstRemaining:     number;   // Eagle Artillery burst; -1 = N/A
  interBurstCooldown: number;
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
}

interface BuildingState {
  instanceId:  string;
  buildingId:  string;
  hp:          number;
  targetTags:  readonly string[];
  position:    Vec2;
  alive:       boolean;
  destroyedAt: number | null;
  hpHistory:   number[];
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
 *  - Inferno Tower single-target ramp-up is modelled (3-tier DPS: init/mid/max).
 *  - Eagle Artillery activation threshold is not enforced.
 *  - Splash radius is not applied; each troop / defense deals its DPS to a
 *    single target per tick.
 *  - Neutral buildings (non-attacking destructibles) are tracked alongside
 *    defenses and are valid troop targets.
 */
export function simulateAttack(
  deployments: TroopDeployment[],
  placements: DefensePlacement[],
  buildingPlacements: BuildingPlacement[] = [],
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
      speed: troopData.movementSpeed / SPEED_DIVISOR,
      attackRange: TROOP_ATTACK_RANGE[dep.troopId] ?? 0.5,
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
      attackCooldown:     DISCRETE_DEFENSE_IDS.has(pl.defenseId) ? defData.attackSpeed : 0,
      isDiscrete:         DISCRETE_DEFENSE_IDS.has(pl.defenseId),
      burstRemaining:     isEagle ? EAGLE_BURST_SIZE : -1,
      interBurstCooldown: 0,
      mode,
      dpsSingleInit:      levelData.dpsSingleInit ?? 0,
      dpsSingleMid:       levelData.dpsSingleMid  ?? 0,
      dpsSingleMax:       levelData.dpsSingleMax  ?? 0,
      singleLockTarget:   null,
      singleLockDuration: 0,
      multiTargetCount:   levelData.multiTargetCount ?? 0,
    });
  }

  const buildings = new Map<string, BuildingState>();

  for (const pl of buildingPlacements) {
    const bldData = getNeutralBuildingById(pl.buildingId);
    if (!bldData) throw new Error(`Unknown building id: "${pl.buildingId}"`);

    const levelData = bldData.levels.find((l) => l.level === pl.level);
    if (!levelData)
      throw new Error(`Level ${pl.level} not found for building "${pl.buildingId}"`);

    buildings.set(pl.instanceId, {
      instanceId:  pl.instanceId,
      buildingId:  pl.buildingId,
      hp:          levelData.hp,
      targetTags:  bldData.targetTags,
      position:    { ...pl.position },
      alive:       true,
      destroyedAt: null,
      hpHistory:   [],
    });
  }

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

    // Helper: nearest alive defense
    function nearestDefense(): string | null {
      let id: string | null = null; let d = Infinity;
      for (const [k, def] of defenses) {
        if (!def.alive) continue;
        const dist = euclidean(troop.position, def.position);
        if (dist < d) { d = dist; id = k; }
      }
      return id;
    }

    // Helper: nearest alive neutral building (optional tag filter)
    function nearestBuilding(tag?: string): string | null {
      let id: string | null = null; let d = Infinity;
      for (const [k, bld] of buildings) {
        if (!bld.alive) continue;
        if (tag && !bld.targetTags.includes(tag)) continue;
        const dist = euclidean(troop.position, bld.position);
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

    // "None" | "Buildings" | "Heroes" → plus proche toutes catégories
    const def = nearestDefense();
    const bld = nearestBuilding();
    if (def === null) return bld;
    if (bld === null) return def;
    return euclidean(troop.position, defenses.get(def)!.position)
         <= euclidean(troop.position, buildings.get(bld)!.position)
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
  for (const def of defenses.values()) {
    def.hpHistory.push(Math.ceil(def.hp));
  }
  for (const bld of buildings.values()) {
    bld.hpHistory.push(Math.ceil(bld.hp));
  }

  // -------------------------------------------------------------------------
  // 4. Simulation loop
  // -------------------------------------------------------------------------

  const shots:         ShotEvent[]         = [];
  const targetChanges: TargetChangeEvent[] = [];

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
      time:         simTime,
      defenseId:    def.defenseId,
      defInstId:    def.instanceId,
      targetInstId: target.instanceId,
      damage:       actual,
      defPos:       { ...def.position },
      troopPos:     { x: target.position.x + 0.5, y: target.position.y + 0.5 },
    });
    if (DEBUG) {
      console.log(`[DEBUG t=${simTime.toFixed(2)}s] TIR ${def.defenseId}(${def.instanceId}) → ${target.instanceId} | dégâts=${actual.toFixed(0)}`);
    }
  }

  /** Returns the N closest alive troops in range for multi-target defenses. */
  function findNearestTroops(def: DefenseState, maxCount: number): TroopState[] {
    const candidates: { dist: number; t: TroopState }[] = [];
    for (const troop of troops.values()) {
      if (!troop.alive) continue;
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

    // --- Defense phase: each defense fires at a troop in range ---------------

    for (const def of defenses.values()) {
      if (!def.alive) continue;

      // Reacquire if current target is dead or out of range.
      const prevDefTargetId = def.targetId;
      const currentTarget = def.targetId ? troops.get(def.targetId) : undefined;
      if (!currentTarget?.alive) {
        def.targetId = pickDefenseTarget(def);
      } else {
        const d = euclidean(def.position, currentTarget.position);
        if (d < def.minRange || d > def.maxRange) {
          def.targetId = pickDefenseTarget(def);
        }
      }

      // Discrete defenses: reset attack timer on any target change (new troop, death, out-of-range).
      if (def.isDiscrete && def.targetId !== prevDefTargetId) {
        def.attackCooldown = def.attackSpeed;
        if (DEBUG && def.targetId !== null) {
          console.log(`[DEBUG t=${simTime.toFixed(2)}s] CIBLE ${def.defenseId}(${def.instanceId}) → ${def.targetId} | cooldown reset à ${def.attackSpeed.toFixed(3)}s`);
        }
      }

      if (def.targetId === null) continue;
      const target = troops.get(def.targetId)!;

      // ── Eagle Artillery burst mechanics ───────────────────────────────────
      if (def.burstRemaining >= 0) {
        if (def.burstRemaining === 0) {
          def.interBurstCooldown -= TICK;
          if (def.interBurstCooldown <= 0) {
            def.burstRemaining = EAGLE_BURST_SIZE;
            def.attackCooldown = 0;
          }
          continue;
        }
        def.attackCooldown -= TICK;
        if (def.attackCooldown > 0) continue;

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

      fireShot(def, target, def.dps * def.attackSpeed, simTime);
      def.attackCooldown = def.attackSpeed;
    }

    // --- Troop phase: each troop moves or attacks a defense / building -------

    for (const troop of troops.values()) {
      if (!troop.alive || !troop.isActive) continue;

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

      const distToTarget = euclidean(troop.position, targetEntity.position);

      if (distToTarget <= troop.attackRange) {
        const damage = troop.dps * TICK;
        const actualDamage = Math.min(damage, targetEntity.hp);
        targetEntity.hp -= actualDamage;

        if (targetEntity.hp <= 0 && targetEntity.alive) {
          targetEntity.hp = 0;
          targetEntity.alive = false;
          targetEntity.destroyedAt = simTime;
        }
      } else {
        troop.position = stepToward(troop.position, targetEntity.position, troop.speed * TICK);
      }
    }

    // --- Whole-second snapshot -----------------------------------------------

    if (tick % TICKS_PER_SECOND === 0) {
      for (const troop of troops.values()) {
        troop.hpHistory.push(troop.alive ? Math.ceil(troop.hp) : 0);
        troop.targetHistory.push(troop.alive ? troop.targetId : null);
        troop.positionHistory.push({ ...troop.position });
      }
      for (const def of defenses.values()) {
        def.hpHistory.push(def.alive ? Math.ceil(def.hp) : 0);
      }
      for (const bld of buildings.values()) {
        bld.hpHistory.push(bld.alive ? Math.ceil(bld.hp) : 0);
      }
    }

    // --- Termination check ---------------------------------------------------

    lastSimTime = simTime;

    const allTroopsDead    = [...troops.values()].every((t) => !t.alive);
    const allTargetsDown   = [...defenses.values()].every((d) => !d.alive)
                          && [...buildings.values()].every((b) => !b.alive);
    if (allTroopsDead || allTargetsDown) break;
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

  return {
    troops: troopResults,
    defenses: defenseResults,
    buildings: buildingResults,
    durationSeconds: Math.round(lastSimTime * 10) / 10,
    shots,
    targetChanges,
  };
}
