/**
 * PathDecision — architecture centralisée pour les décisions de déplacement
 * face aux murs.
 *
 * V2 (smart simulation) :
 *   Quand un PathDecisionContext est fourni, chaque mur candidat est évalué
 *   en simulant virtuellement sa destruction puis en recalculant le chemin
 *   Dijkstra réel post-bris. Le score intègre :
 *     • temps de marche vers le mur
 *     • temps de destruction
 *     • temps de trajet post-bris (Dijkstra réel, pas ligne droite)
 *     • pénalité par mur supplémentaire détecté près du chemin post-bris
 *
 * Mode legacy (ctx absent) : estimation géométrique v1 — conservé pour la
 * rétrocompatibilité des tests et des appels externes.
 *
 * Décisions possibles :
 *   DIRECT      — suivre le chemin Dijkstra autour des murs
 *   BREAK_WALL  — casser un mur spécifique pour ouvrir un raccourci réel
 */

import { dijkstraPath, type GridPos } from "./pathfinding";

// ── Constants ──────────────────────────────────────────────────────────────────

/** Max murs évalués par décision (perf guard sur grille 44×44). */
const MAX_WALL_CANDIDATES     = 6;

/** Max murs secondaires évalués en look-ahead par mur principal. */
const MAX_LOOKAHEAD_CANDIDATES = 4;

/**
 * Pénalité simulée (secondes) par mur supplémentaire détecté à ≤1 tuile du
 * chemin post-bris. Proxy pour "combien de murs faudra-t-il encore casser".
 */
const MULTI_WALL_PENALTY_SECS = 2.0;

/**
 * Lorsque le chemin Dijkstra courant est déjà acceptable, BREAK_WALL ne
 * l'emporte que si son score est strictement inférieur à
 * pathTime × BREAK_OVERRIDE_FACTOR (doit être ≥25 % plus rapide).
 */
const BREAK_OVERRIDE_FACTOR   = 0.75;

// ── Types ──────────────────────────────────────────────────────────────────────

export type PathDecisionMode = "DIRECT" | "BREAK_WALL";

export interface PathDecision {
  mode:          PathDecisionMode;
  /** Instance ID du mur à casser (undefined si DIRECT). */
  targetWallId?: string;
  /** Temps estimé en secondes pour atteindre la cible avec cette stratégie. */
  estimatedCost: number;
  /** Évaluations détaillées par mur candidat (disponible quand ctx est fourni). */
  debugInfo?:    WallBreakEval[];
}

/** Profil minimal de la troupe nécessaire pour calculer la décision. */
export interface TroopCapability {
  instanceId:  string;
  troopId:     string;
  dps:         number;
  speed:       number;    // tiles/s
  attackRange: number;    // tiles
}

/** Info minimale sur un mur pour le calcul de coût. */
export interface WallInfo {
  instanceId: string;
  x:          number;   // tuile top-left
  y:          number;
  hp:         number;
  alive:      boolean;
}

/** Résultat intermédiaire legacy exposant le meilleur mur candidat et son coût. */
export interface WallBreakOption {
  wallId:        string;
  estimatedCost: number;
}

/**
 * Contexte spatial fourni par le moteur pour activer la simulation de bris.
 * Absent = mode legacy (estimation géométrique).
 */
export interface PathDecisionContext {
  fromTile:  GridPos;       // position en tuile entière de la troupe (Math.floor)
  goalTiles: Set<string>;   // tuiles adjacentes au footprint de la cible
  blocked:   Set<string>;   // murs vivants courants sous forme "x,y"
  gridSize:  number;
}

/** Évaluation détaillée d'un mur candidat — utilisée pour les logs et events. */
export interface WallBreakEval {
  wallId:            string;
  score:             number;        // coût total ajusté — mur seul (secondes)
  walkTime:          number;        // secondes pour marcher jusqu'au mur
  breakTime:         number;        // secondes pour détruire le mur
  afterTime:         number;        // secondes de trajet post-bris (Dijkstra)
  postBreakPathCost: number | null; // coût Dijkstra post-bris (null = toujours bloqué)
  wallsNearPath:     number;        // murs supplémentaires détectés près du chemin post-bris
  distanceGain:      number;        // pathTime − score (positif = bris avantageux)
  reason:            string;        // raison humaine du choix
  // ── Look-ahead 2-murs ────────────────────────────────────────────────────
  /** Instance ID du second mur probable à casser après celui-ci. */
  bestSecondWallId?: string;
  /** Coût estimé total pour casser ce mur PUIS bestSecondWallId (secondes). */
  scoreTwoWall?:     number;
  /** score − scoreTwoWall : positif si la paire est plus rapide que le mur seul. */
  lookaheadGain?:    number;
}

// ── Helper : coût géométrique de casser un mur (estimation legacy) ─────────────

/**
 * Estime le temps (secondes) pour :
 *   1. Marcher jusqu'au mur  2. Casser le mur (hp/dps)  3. Rejoindre la cible
 * N.B. : utilise la ligne droite post-bris — pas de Dijkstra réel.
 */
export function wallBreakCost(
  troop:     TroopCapability,
  fromPos:   { x: number; y: number },
  wall:      WallInfo,
  targetPos: { x: number; y: number },
): number {
  if (troop.dps <= 0) return Infinity;
  const wx = wall.x + 0.5, wy = wall.y + 0.5;
  return Math.hypot(fromPos.x - wx, fromPos.y - wy) / troop.speed
       + wall.hp / troop.dps
       + Math.hypot(wx - targetPos.x, wy - targetPos.y) / troop.speed;
}

// ── Helpers : murs adjacents au chemin post-bris ─────────────────────────────

/**
 * Retourne les WallInfo distincts (hors mur brisé) dont au moins une tuile
 * est à ±1 tuile (8-connexe) d'une tuile du chemin post-bris.
 * Limité à `limit` entrées pour borne le look-ahead.
 */
function getWallsNearPath(
  path:      GridPos[],
  walls:     WallInfo[],
  excludeId: string,
  limit:     number,
): WallInfo[] {
  const near = new Map<string, WallInfo>();
  outer: for (const tile of path) {
    for (const w of walls) {
      if (!w.alive || w.instanceId === excludeId || near.has(w.instanceId)) continue;
      if (Math.abs(tile.x - w.x) <= 1 && Math.abs(tile.y - w.y) <= 1) {
        near.set(w.instanceId, w);
        if (near.size >= limit) break outer;
      }
    }
  }
  return [...near.values()];
}

/** Délègue à getWallsNearPath et retourne le count plafonné à 3. */
function countWallsNearPath(
  path:      GridPos[],
  walls:     WallInfo[],
  excludeId: string,
): number {
  return Math.min(getWallsNearPath(path, walls, excludeId, 4).length, 3);
}

// ── Helper : évaluation look-ahead pour un second mur ────────────────────────

/**
 * Pour un mur principal A déjà simulé (virtualBlocked = blocked sans A),
 * cherche le meilleur mur B parmi bCandidates tel que A+B ensemble ouvrent
 * un chemin, et retourne { wallId, score } avec :
 *   score = walkTimeA + breakTimeA + walkAtoB + breakTimeB + afterTime2
 */
function runLookahead(
  primaryWall:  WallInfo,
  virtualBlocked: Set<string>,
  bCandidates:  WallInfo[],
  ctx:          PathDecisionContext,
  walkTimeA:    number,
  breakTimeA:   number,
  speed:        number,
  dps:          number,
): { wallId: string; score: number } | null {
  const wx = primaryWall.x + 0.5, wy = primaryWall.y + 0.5;
  let best: { wallId: string; score: number } | null = null;

  for (const wallB of bCandidates) {
    const vb2 = new Set(virtualBlocked);
    vb2.delete(`${wallB.x},${wallB.y}`);
    const pb2 = dijkstraPath(ctx.fromTile, ctx.goalTiles, vb2, ctx.gridSize);
    if (pb2 === null) continue;

    const wbx = wallB.x + 0.5, wby = wallB.y + 0.5;
    const s2  = walkTimeA + breakTimeA
              + Math.hypot(wx - wbx, wy - wby) / speed
              + wallB.hp / dps
              + pb2.cost / speed;

    if (best === null || s2 < best.score) best = { wallId: wallB.instanceId, score: s2 };
  }
  return best;
}

// ── Fonction principale ────────────────────────────────────────────────────────

/**
 * Décide si la troupe doit suivre le chemin Dijkstra (DIRECT) ou casser un
 * mur (BREAK_WALL).
 *
 * Logique V2 (ctx fourni) :
 *  1. Pré-filtrer les MAX_WALL_CANDIDATES murs par coût géométrique croissant.
 *  2. Pour chaque candidat, simuler sa destruction (blockedSet - ce mur) et
 *     recalculer le chemin Dijkstra réel post-bris.
 *  3. Score = walkTime + breakTime + afterTravelTime + wallProximityPenalty.
 *  4. Si le chemin courant est acceptable ET qu'aucun mur n'est ≥25 % plus
 *     rapide → DIRECT.
 *  5. Sinon → BREAK_WALL sur le mur au meilleur score, ou DIRECT si aucun
 *     mur ne bat le chemin courant.
 *
 * Mode legacy (ctx absent) : estimation géométrique v1 (tests + appels externes).
 *
 * @param troop          Profil de la troupe (dps, speed…)
 * @param fromPos        Position actuelle (tile flottant)
 * @param targetPos      Position de la cible
 * @param dijkstraCost   Coût Dijkstra en tuiles (null = aucun chemin trouvé)
 * @param directDist     Distance euclidienne directe (tuiles)
 * @param detourRatio    Seuil au-delà duquel le détour est jugé trop long (ex: 2.0)
 * @param candidateWalls Murs vivants à considérer pour le bris
 * @param ctx            Contexte spatial pour la simulation (optionnel)
 */
export function computePathDecision(
  troop:          TroopCapability,
  fromPos:        { x: number; y: number },
  targetPos:      { x: number; y: number },
  dijkstraCost:   number | null,
  directDist:     number,
  detourRatio:    number,
  candidateWalls: WallInfo[],
  ctx?:           PathDecisionContext,
): PathDecision {
  const speed    = troop.speed > 0 ? troop.speed : 1;
  const pathTime = dijkstraCost !== null ? dijkstraCost / speed : Infinity;

  const pathAcceptable =
    dijkstraCost !== null &&
    dijkstraCost <= directDist * detourRatio;

  // ══════════════════════════════════════════════════════════════════════════
  // MODE SIMULATION — ctx fourni (appel depuis le moteur)
  // ══════════════════════════════════════════════════════════════════════════
  if (ctx !== undefined) {
    if (troop.dps <= 0) {
      return { mode: "DIRECT", estimatedCost: isFinite(pathTime) ? pathTime : directDist / speed };
    }

    // Pré-filtrer : top MAX_WALL_CANDIDATES murs par coût géométrique (troop→wall→target)
    const candidates = candidateWalls
      .filter(w => w.alive)
      .map(w => {
        const wx = w.x + 0.5, wy = w.y + 0.5;
        const geo = Math.hypot(fromPos.x - wx, fromPos.y - wy)
                  + Math.hypot(wx - targetPos.x, wy - targetPos.y);
        return { w, geo };
      })
      .sort((a, b) => a.geo - b.geo)
      .slice(0, MAX_WALL_CANDIDATES)
      .map(e => e.w);

    const evals: WallBreakEval[] = [];

    for (const wall of candidates) {
      const virtualBlocked = new Set(ctx.blocked);
      virtualBlocked.delete(`${wall.x},${wall.y}`);
      const postBreak = dijkstraPath(ctx.fromTile, ctx.goalTiles, virtualBlocked, ctx.gridSize);

      const wx       = wall.x + 0.5, wy = wall.y + 0.5;
      const walkTime  = Math.hypot(fromPos.x - wx, fromPos.y - wy) / speed;
      const breakTime = wall.hp / troop.dps;

      if (postBreak === null) {
        // Mur seul insuffisant — look-ahead : chercher B qui complète l'ouverture
        const bCandidates = candidateWalls
          .filter(w => w.alive && w.instanceId !== wall.instanceId)
          .map(w => ({
            w,
            geo: Math.hypot(wx - (w.x + 0.5), wy - (w.y + 0.5))
               + Math.hypot((w.x + 0.5) - targetPos.x, (w.y + 0.5) - targetPos.y),
          }))
          .sort((a, b) => a.geo - b.geo)
          .slice(0, MAX_LOOKAHEAD_CANDIDATES)
          .map(e => e.w);

        const twoWall = runLookahead(wall, virtualBlocked, bCandidates, ctx,
                                     walkTime, breakTime, speed, troop.dps);
        evals.push({
          wallId: wall.instanceId, score: Infinity,
          walkTime, breakTime, afterTime: Infinity,
          postBreakPathCost: null, wallsNearPath: 0,
          distanceGain: -Infinity, reason: "still-blocked",
          ...(twoWall && {
            bestSecondWallId: twoWall.wallId,
            scoreTwoWall:     twoWall.score,
            lookaheadGain:    isFinite(pathTime) ? pathTime - twoWall.score : 9999,
          }),
        });
        continue;
      }

      const afterTime  = postBreak.cost / speed;
      const nearWalls  = getWallsNearPath(postBreak.path, candidateWalls, wall.instanceId,
                                          MAX_LOOKAHEAD_CANDIDATES);
      const wallsNear  = Math.min(nearWalls.length, 3);
      const penalty    = wallsNear * MULTI_WALL_PENALTY_SECS;
      const score      = walkTime + breakTime + afterTime + penalty;
      const gain       = isFinite(pathTime) ? pathTime - score : 9999;

      // Look-ahead : si des murs obstaculent le chemin post-bris, tester A+B
      const twoWall = nearWalls.length > 0
        ? runLookahead(wall, virtualBlocked, nearWalls, ctx, walkTime, breakTime, speed, troop.dps)
        : null;

      evals.push({
        wallId: wall.instanceId, score,
        walkTime, breakTime, afterTime,
        postBreakPathCost: postBreak.cost,
        wallsNearPath: wallsNear,
        distanceGain:  gain,
        reason:        "",
        ...(twoWall && {
          bestSecondWallId: twoWall.wallId,
          scoreTwoWall:     twoWall.score,
          lookaheadGain:    score - twoWall.score,
        }),
      });
    }

    // Score effectif : utilise scoreTwoWall quand il améliore le score simple
    const effScore = (ev: WallBreakEval): number =>
      (ev.scoreTwoWall !== undefined && ev.scoreTwoWall < ev.score)
        ? ev.scoreTwoWall
        : ev.score;

    // Trouver le meilleur mur par score effectif
    let bestEval: WallBreakEval | null = null;
    for (const ev of evals) {
      const eff = effScore(ev);
      if (isFinite(eff) && (bestEval === null || eff < effScore(bestEval))) {
        bestEval = ev;
      }
    }

    // ── Décision ──────────────────────────────────────────────────────────
    if (pathAcceptable) {
      // Chemin Dijkstra acceptable : BREAK_WALL seulement si nettement plus rapide
      if (bestEval !== null && effScore(bestEval) < pathTime * BREAK_OVERRIDE_FACTOR) {
        bestEval.reason = "break-overrides-acceptable-path";
        return {
          mode: "BREAK_WALL", targetWallId: bestEval.wallId,
          estimatedCost: effScore(bestEval), debugInfo: evals,
        };
      }
      const top = evals.find(e => e.wallId === bestEval?.wallId);
      if (top && !top.reason) top.reason = "direct-acceptable";
      return { mode: "DIRECT", estimatedCost: pathTime, debugInfo: evals };
    }

    // Chemin inacceptable ou absent — casser si gain réel (score effectif)
    if (bestEval !== null && effScore(bestEval) < pathTime) {
      bestEval.reason = dijkstraCost === null ? "no-direct-path" : "break-shorter-than-detour";
      return {
        mode: "BREAK_WALL", targetWallId: bestEval.wallId,
        estimatedCost: effScore(bestEval), debugInfo: evals,
      };
    }

    if (bestEval) bestEval.reason = "direct-wins-despite-detour";
    return {
      mode:          "DIRECT",
      estimatedCost: isFinite(pathTime) ? pathTime : directDist / speed,
      debugInfo:     evals,
    };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // MODE LEGACY — ctx absent (tests unitaires, appels externes)
  // Estimation géométrique v1 — comportement identique à la version précédente.
  // ══════════════════════════════════════════════════════════════════════════
  let bestWall: WallBreakOption | null = null;
  for (const wall of candidateWalls) {
    if (!wall.alive) continue;
    const cost = wallBreakCost(troop, fromPos, wall, targetPos);
    if (bestWall === null || cost < bestWall.estimatedCost) {
      bestWall = { wallId: wall.instanceId, estimatedCost: cost };
    }
  }

  if (pathAcceptable) {
    return { mode: "DIRECT", estimatedCost: pathTime };
  }

  if (bestWall !== null && bestWall.estimatedCost < pathTime) {
    return { mode: "BREAK_WALL", targetWallId: bestWall.wallId,
             estimatedCost: bestWall.estimatedCost };
  }

  return {
    mode:          "DIRECT",
    estimatedCost: isFinite(pathTime) ? pathTime : directDist / speed,
  };
}
