/**
 * PathDecision — architecture centralisée pour les décisions de déplacement
 * face aux murs.
 *
 * La fonction `computePathDecision` est une fonction PURE : elle ne touche pas
 * aux structures internes du moteur. Elle peut être testée indépendamment et
 * étend facilement les comportements futurs (WallBreaker, Jump Spell, héros…).
 *
 * Décisions possibles :
 *   DIRECT      — suivre le chemin Dijkstra autour des murs
 *   BREAK_WALL  — casser un mur sur la ligne directe vers la cible
 *
 * Coût estimé = secondes jusqu'à la cible (permet de comparer les stratégies).
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export type PathDecisionMode = "DIRECT" | "BREAK_WALL";

export interface PathDecision {
  mode:          PathDecisionMode;
  /** Instance ID du mur à casser (undefined si DIRECT). */
  targetWallId?: string;
  /** Temps estimé en secondes pour atteindre la cible avec cette stratégie. */
  estimatedCost: number;
}

/** Profil minimal de la troupe nécessaire pour calculer la décision. */
export interface TroopCapability {
  instanceId:  string;
  troopId:     string;
  dps:         number;
  speed:       number;    // tiles/s
  attackRange: number;    // tiles
  // Future extensions:
  // canJump?:     boolean;   // Jump Spell
  // isWallBreaker?: boolean; // casse toujours en priorité
  // heroAbility?: string;    // capacité spéciale héros
}

/** Info minimale sur un mur pour le calcul de coût. */
export interface WallInfo {
  instanceId: string;
  x:          number;   // tuile top-left
  y:          number;
  hp:         number;
  alive:      boolean;
}

/** Résultat intermédiaire exposant le meilleur mur candidat et son coût. */
export interface WallBreakOption {
  wallId:        string;
  estimatedCost: number;  // secondes
}

// ── Helper : coût de casser un mur ────────────────────────────────────────────

/**
 * Estime le temps (secondes) pour :
 *   1. Marcher jusqu'au mur
 *   2. Casser le mur (hp / dps)
 *   3. Marcher de l'autre côté jusqu'à la cible
 */
export function wallBreakCost(
  troop:    TroopCapability,
  fromPos:  { x: number; y: number },
  wall:     WallInfo,
  targetPos: { x: number; y: number },
): number {
  if (troop.dps <= 0) return Infinity;
  const wx = wall.x + 0.5, wy = wall.y + 0.5;
  const distToWall   = Math.hypot(fromPos.x - wx, fromPos.y - wy);
  const distFromWall = Math.hypot(wx - targetPos.x, wy - targetPos.y);
  return distToWall / troop.speed + wall.hp / troop.dps + distFromWall / troop.speed;
}

// ── Fonction principale ────────────────────────────────────────────────────────

/**
 * Décide si la troupe doit suivre le chemin Dijkstra (DIRECT) ou casser un
 * mur (BREAK_WALL).
 *
 * Logique :
 *  1. Si le chemin Dijkstra est valide ET son coût ≤ directDist × detourRatio
 *     → DIRECT (même si BREAK_WALL serait légèrement plus vite, la stabilité
 *       du chemin est préférable).
 *  2. Sinon, comparer pathTime vs meilleur breakWallCost :
 *     - Si BREAK_WALL est plus rapide et un mur candidat existe → BREAK_WALL
 *     - Sinon → DIRECT (chemin Dijkstra ou ligne directe)
 *
 * @param troop         Profil de la troupe (dps, speed…)
 * @param fromPos       Position actuelle (tile flottant)
 * @param targetPos     Position de la cible
 * @param dijkstraCost  Coût Dijkstra en tuiles (null = aucun chemin trouvé)
 * @param directDist    Distance euclidienne directe (tuiles)
 * @param detourRatio   Seuil au-delà duquel le détour est jugé trop long (ex: 2.0)
 * @param candidateWalls Murs vivants à considérer pour le bris
 */
export function computePathDecision(
  troop:          TroopCapability,
  fromPos:        { x: number; y: number },
  targetPos:      { x: number; y: number },
  dijkstraCost:   number | null,
  directDist:     number,
  detourRatio:    number,
  candidateWalls: WallInfo[],
): PathDecision {
  const pathTime = dijkstraCost !== null ? dijkstraCost / troop.speed : Infinity;

  // ── Évaluer le meilleur mur à casser ─────────────────────────────────────
  let bestWall: WallBreakOption | null = null;
  for (const wall of candidateWalls) {
    if (!wall.alive) continue;
    const cost = wallBreakCost(troop, fromPos, wall, targetPos);
    if (bestWall === null || cost < bestWall.estimatedCost) {
      bestWall = { wallId: wall.instanceId, estimatedCost: cost };
    }
  }

  // ── Chemin acceptable ? ───────────────────────────────────────────────────
  const pathAcceptable =
    dijkstraCost !== null &&
    dijkstraCost <= directDist * detourRatio;

  if (pathAcceptable) {
    // Le chemin est raisonnable — suivre sans forcer le bris de mur.
    return { mode: "DIRECT", estimatedCost: pathTime };
  }

  // ── Chemin inacceptable ou absent — comparer DIRECT vs BREAK_WALL ─────────
  if (bestWall !== null && bestWall.estimatedCost < pathTime) {
    return {
      mode:          "BREAK_WALL",
      targetWallId:  bestWall.wallId,
      estimatedCost: bestWall.estimatedCost,
    };
  }

  // Fallback : aller directement même si long (pas de mur cassable profitable)
  return {
    mode:          "DIRECT",
    estimatedCost: pathTime < Infinity ? pathTime : directDist / troop.speed,
  };
}

// ── Préparer l'ouverture de murs (future extension) ──────────────────────────

/**
 * TODO — Wall Openings :
 * Quand un mur est détruit ou qu'un Jump Spell crée une ouverture temporaire,
 * appeler `notifyWallOpening(instanceId, duration?)` pour mettre à jour le
 * `blockedSet` Dijkstra et invalider le cache de chemin.
 *
 * Signature prévue :
 *   notifyWallOpening(wallInstanceId: string, temporaryMs?: number): void
 *
 * Future WallBreaker :
 * Si `troop.troopId === "wall-breaker"`, forcer toujours mode = BREAK_WALL
 * et cibler le mur le plus proche indépendamment du coût.
 *
 * Future Jump Spell :
 * Si `troop.canJump === true`, passer directement à travers sans bris.
 * Traiter comme DIRECT avec coût = directDist / speed.
 */
export type _FutureExtensions = never; // placeholder pour satisfaire le linter
