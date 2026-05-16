/**
 * Unified simulation event system.
 * Events are collected during simulateAttack() and returned in SimulationResult.
 * Designed to be extensible: new event types can be added without breaking existing consumers.
 */

// ── Event types ──────────────────────────────────────────────────────────────

export type SimEventType =
  // Defenses
  | "DEFENSE_FIRE"          // defense shot lands on a troop
  | "TESLA_ACTIVATED"       // hidden tesla pops
  | "AIR_SWEEP"             // air sweeper pulse pushes a troop
  | "DEATH_EXPLOSION"       // bomb tower death blast
  // Traps
  | "TRAP_TRIGGER"          // any trap triggered (generic entry)
  | "TRAP_HIT"              // bomb/giant-bomb/air-bomb hit on a single troop
  | "SPRING_EJECT"          // spring trap ejects a troop
  | "SPRING_IMMUNE"         // spring trap fired but troop too heavy
  | "TORNADO_TRIGGER"       // tornado activated
  | "TORNADO_TICK"          // tornado per-second summary (dmg + pulled count)
  | "TORNADO_END"           // tornado expired
  | "SEEKING_AIR_MINE_HIT"  // SAM single-target hit
  // Troops
  | "TROOP_FIRE"            // troop fires at a defense/building
  | "TROOP_DEATH"           // troop killed
  | "CHAIN_LIGHTNING"       // electro dragon death lightning
  // Buildings & defenses
  | "REPAIR"                // builder hut heals something
  | "DEFENSE_DESTROYED"     // defense HP reaches 0
  | "BUILDING_DESTROYED"    // neutral building HP reaches 0
  | "WALL_TARGETED"         // troop locks onto a wall to break it
  | "WALL_DAMAGED"          // troop deals damage to a wall
  | "WALL_DESTROYED"        // wall HP reaches 0
  // Pathfinding
  | "PATH_DECISION"         // troop decided DIRECT or BREAK_WALL
  // Spell effects
  | "SPELL_APPLIED"         // spell effect (Rage, …)
  | "FROZEN_APPLIED"        // Freeze Spell locks an entity until expiresAt
  // Future / extensible
  | "SUMMON"                // (future) troop summoned mid-battle
  | "HERO_ABILITY"          // (future) hero special ability
  | string;                 // catch-all for forward-compatibility

// ── SimEvent ─────────────────────────────────────────────────────────────────

export interface SimEvent {
  /** Simulation time in seconds when this event occurred. */
  time: number;
  /** Event category — see SimEventType. */
  type: SimEventType;
  /** Instance ID of the entity that caused the event (defense, trap, troop…). */
  sourceId?: string;
  /** Instance ID of the entity that was affected. */
  targetId?: string;
  /** Numeric value: damage dealt, HP healed, tiles pushed, etc. */
  value?: number;
  /** Arbitrary extra fields for event-specific data. */
  extra?: Record<string, unknown>;
}
