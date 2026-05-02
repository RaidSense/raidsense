/**
 * Troop placement optimizer.
 * Wraps simulateAttack() with a generate-and-score loop.
 * Does NOT mutate any global state.
 */
import {
  simulateAttack,
  type SimulationResult,
  type TroopDeployment,
  type DefensePlacement,
  type BuildingPlacement,
} from "./calculator";
import { type WallPlacement } from "../data/walls";

// ── Constants ──────────────────────────────────────────────────────────────

const GRID_SIZE    = 44;
const DEPLOY_MARGIN = 5;

const AIR_UNIT_IDS = new Set([
  "balloon", "healer", "dragon", "baby-dragon", "electro-dragon",
]);

// ── Public types ───────────────────────────────────────────────────────────

export type Strategy = "random" | "spread" | "grouped";

/** A troop to deploy — without a position yet. */
export interface TroopTemplate {
  instanceId: string;
  troopId:    string;
  level:      number;
  deployAt?:  number;
}

export interface OptimizerOptions {
  iterations:      number;
  strategy:        Strategy;
  /** Stop early when this score is reached. Default: Infinity. */
  earlyExitScore?: number;
}

export interface CandidateResult {
  deployments: TroopDeployment[];
  score:       number;
  simResult:   SimulationResult;
}

export interface OptimizationResult {
  best:        CandidateResult;
  top3:        CandidateResult[];
  avgScore:    number;
  testedCount: number;
}

// ── Helpers ────────────────────────────────────────────────────────────────

/** All tiles in the deployment border ring. */
function getBorderPool(): { x: number; y: number }[] {
  const tiles: { x: number; y: number }[] = [];
  for (let x = 0; x < GRID_SIZE; x++) {
    for (let y = 0; y < GRID_SIZE; y++) {
      if (
        x < DEPLOY_MARGIN || x >= GRID_SIZE - DEPLOY_MARGIN ||
        y < DEPLOY_MARGIN || y >= GRID_SIZE - DEPLOY_MARGIN
      ) {
        tiles.push({ x, y });
      }
    }
  }
  return tiles;
}

function samplePositions(
  count:    number,
  strategy: Strategy,
  pool:     { x: number; y: number }[],
): { x: number; y: number }[] {
  if (strategy === "spread") {
    const step  = Math.max(1, Math.floor(pool.length / count));
    const start = Math.floor(Math.random() * step);
    return Array.from({ length: count }, (_, i) => ({
      ...pool[(start + i * step) % pool.length],
    }));
  }
  if (strategy === "grouped") {
    const start = Math.floor(Math.random() * pool.length);
    return Array.from({ length: count }, (_, i) => ({
      ...pool[(start + i) % pool.length],
    }));
  }
  // random — shuffle and take first N
  const shuffled = pool.slice().sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count).map((t) => ({ ...t }));
}

/**
 * Score formula (higher = better):
 *   +1000 per defense/building destroyed
 *   +500  per troop surviving
 *   +0.1  per point of damage dealt
 *   −2    per second of raid duration
 */
export function scoreSimResult(r: SimulationResult): number {
  const defensesDestroyed =
    Object.values(r.defenses).filter((d) => d.destroyedAt !== null).length +
    Object.values(r.buildings).filter((b) => b.destroyedAt !== null).length;
  const troopsSurvived =
    Object.values(r.troops).filter((t) => t.destroyedAt === null).length;
  const totalDamage =
    Object.values(r.defenses).reduce((s, d) => s + d.totalDamageDealt, 0);

  return (
    defensesDestroyed * 1000 +
    troopsSurvived    * 500  +
    totalDamage       * 0.1  -
    r.durationSeconds * 2
  );
}

// ── Main function ──────────────────────────────────────────────────────────

/**
 * Generates `options.iterations` random/strategic placements, simulates each,
 * and returns the best result alongside the top-3 and average score.
 *
 * @param troops    Templates without positions (built from TroopSlot[])
 * @param defenses  Already-built DefensePlacement[] (from buildDefensePlacements)
 * @param buildings Already-built BuildingPlacement[] (from buildNeutralBuildingPlacements)
 * @param options   Optimizer knobs
 */
export function createBestDeployment(
  troops:    TroopTemplate[],
  defenses:  DefensePlacement[],
  buildings: BuildingPlacement[],
  options:   OptimizerOptions,
  walls:     WallPlacement[] = [],
): OptimizationResult {
  const {
    iterations,
    strategy,
    earlyExitScore = Infinity,
  } = options;

  const pool       = getBorderPool();
  const candidates: CandidateResult[] = [];

  for (let iter = 0; iter < iterations; iter++) {
    const positions = samplePositions(troops.length, strategy, pool);

    const deployments: TroopDeployment[] = troops.map((t, idx) => ({
      instanceId:   t.instanceId,
      troopId:      t.troopId,
      level:        t.level,
      dropPosition: positions[idx],
      isAirUnit:    AIR_UNIT_IDS.has(t.troopId),
      deployAt:     t.deployAt ?? 0,
    }));

    const simResult = simulateAttack(deployments, defenses, buildings, walls);
    const score     = scoreSimResult(simResult);

    candidates.push({ deployments, score, simResult });

    if (score >= earlyExitScore) break;
  }

  candidates.sort((a, b) => b.score - a.score);

  const avgScore = Math.round(
    candidates.reduce((s, c) => s + c.score, 0) / candidates.length,
  );

  return {
    best:        candidates[0],
    top3:        candidates.slice(0, 3),
    avgScore,
    testedCount: candidates.length,
  };
}
