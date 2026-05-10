/**
 * Tests : PathDecision architecture
 *
 *   npx tsx lib/engine/pathdecision.test.ts
 *
 * Teste la fonction pure computePathDecision et son intégration dans
 * le moteur (events PATH_DECISION).
 */

import { computePathDecision, wallBreakCost, type TroopCapability, type WallInfo, type PathDecisionContext } from "./path-decision";
import { dijkstraPath, adjacentTilesForFootprint } from "./pathfinding";
import { simulateAttack } from "./calculator";
import type { TroopDeployment, DefensePlacement } from "./calculator";
import type { WallPlacement } from "../data/walls";

// ── Helpers pour les tests simulation (ctx fourni) ────────────────────────────

const GRID = 44;

/**
 * Construit un PathDecisionContext et calcule le dijkstraCost réel.
 * Permet d'écrire des tests réalistes en mode simulation.
 */
function makeCtx(
  fromPos:   { x: number; y: number },
  targetPos: { x: number; y: number },
  walls:     WallInfo[],
  targetSize = 1,
): { ctx: PathDecisionContext; dijkstraCost: number | null; directDist: number } {
  const fromTile  = { x: Math.floor(fromPos.x), y: Math.floor(fromPos.y) };
  const blocked   = new Set<string>(walls.filter(w => w.alive).map(w => `${w.x},${w.y}`));
  const goalTiles = adjacentTilesForFootprint(targetPos.x, targetPos.y, targetSize, GRID);
  const result    = dijkstraPath(fromTile, goalTiles, blocked, GRID);
  const directDist = Math.hypot(fromPos.x - targetPos.x, fromPos.y - targetPos.y);
  return { ctx: { fromTile, goalTiles, blocked, gridSize: GRID }, dijkstraCost: result?.cost ?? null, directDist };
}

let passed = 0;
let failed = 0;

function assert(condition: boolean, label: string, detail = "") {
  if (condition) {
    console.log(`  ✓ ${label}`);
    passed++;
  } else {
    console.error(`  ✗ ${label}${detail ? " — " + detail : ""}`);
    failed++;
  }
}

// ── Profils de troupes ────────────────────────────────────────────────────────
// Giant Lv5 : dps=31, movementSpeed=12 → speed=12/16=0.75 tiles/s
const GIANT: TroopCapability = { instanceId: "g1", troopId: "giant",     dps: 31, speed: 12/16, attackRange: 1 };
// Barbarian Lv10 : dps=42, movementSpeed=18 → speed=18/16=1.125 tiles/s
const BARB:  TroopCapability = { instanceId: "b1", troopId: "barbarian", dps: 42, speed: 18/16, attackRange: 0.5 };

// ── Mur de référence : Lv1 (100 HP) ──────────────────────────────────────────
const WALL_LV1: WallInfo = { instanceId: "w1", x: 10, y: 25, hp: 100, alive: true };
// Mur lourd : Lv10 (4000 HP)
const WALL_LV10: WallInfo = { instanceId: "w1", x: 10, y: 25, hp: 4000, alive: true };

// ── Test 1: DIRECT quand le chemin Dijkstra est acceptable ───────────────────
console.log("\nTest 1: DIRECT quand chemin Dijkstra acceptable (cost ≤ directDist × 2.0)");
{
  // directDist=5, dijkstraCost=8 → 8 ≤ 5×2.0=10 → acceptable
  const d = computePathDecision(GIANT, { x: 20, y: 25 }, { x: 5, y: 25 },
    8, 5, 2.0, [WALL_LV1]);
  assert(d.mode === "DIRECT", "mode = DIRECT", `got ${d.mode}`);
  assert(d.estimatedCost > 0, "estimatedCost > 0", `got ${d.estimatedCost}`);
}

// ── Test 2: BREAK_WALL quand pas de chemin (dijkstraCost = null) ─────────────
console.log("\nTest 2: BREAK_WALL quand aucun chemin Dijkstra trouvé");
{
  const d = computePathDecision(GIANT, { x: 20, y: 25 }, { x: 5, y: 25 },
    null, 15, 2.0, [WALL_LV1]);
  assert(d.mode === "BREAK_WALL", "mode = BREAK_WALL", `got ${d.mode}`);
  assert(d.targetWallId === "w1", "targetWallId = w1", `got ${d.targetWallId}`);
}

// ── Test 3: BREAK_WALL quand détour trop long et mur léger ───────────────────
console.log("\nTest 3: BREAK_WALL quand détour long + mur léger (Giant, mur Lv1)");
{
  // directDist=5, dijkstraCost=15 → 15 > 5×2.0=10 → inacceptable
  // Giant: pathTime = 15/0.75 = 20s, breakWallCost = distToWall/speed + hp/dps + distFromWall/speed
  // Wall at (10,25), from (20,25) to target (5,25): distToWall≈10.5, distFromWall≈5.5
  // breakCost ≈ 10.5/0.75 + 100/31 + 5.5/0.75 = 14 + 3.2 + 7.3 = 24.5s
  // pathTime (20s) < breakCost (24.5s) → DIRECT is actually better here
  // So with a closer wall: wall at (12, 25) → distToWall≈8.5, distFromWall≈7.5
  const wallClose: WallInfo = { instanceId: "wc", x: 12, y: 25, hp: 100, alive: true };
  const d = computePathDecision(GIANT, { x: 20, y: 25 }, { x: 5, y: 25 },
    null, 15, 2.0, [wallClose]); // no path → null
  assert(d.mode === "BREAK_WALL", "mode = BREAK_WALL (no path, wall available)", `got ${d.mode}`);
}

// ── Test 4: DIRECT quand mur très lourd rend le bris non rentable ─────────────
console.log("\nTest 4: DIRECT quand mur Lv10 (4000 HP) — bris trop coûteux");
{
  // Chemin detour=15, direct=5 → inacceptable par DETOUR_RATIO
  // Giant: breakWallCost = distToWall/0.75 + 4000/31 + distFromWall/0.75 >> pathTime (∞)
  // dijkstraCost=null (blocked) — but wall breaking costs 4000/31 ≈ 129s → giant prefers wall too
  // Let dijkstraCost=15 (detour found): pathTime=20s, breakCost>>20 → DIRECT wins
  const d = computePathDecision(GIANT, { x: 20, y: 25 }, { x: 5, y: 25 },
    15, 5, 2.0, [WALL_LV10]);
  // dijkstraCost=15, directDist=5, 15 > 5*2=10 → NOT acceptable
  // pathTime=20s; breakCost(Lv10) >> 20s → DIRECT (fallback) wins
  assert(d.mode === "DIRECT", "mode = DIRECT — mur lourd, bris trop coûteux", `got ${d.mode}`);
}

// ── Test 5: Giant préfère BREAK_WALL, barbe préfère DIRECT (scénarios distincts) ──
console.log("\nTest 5: Giant sans chemin → BREAK_WALL, barbe avec court chemin → DIRECT");
{
  // Giant : path bloqué (null) → BREAK_WALL
  const dGiant = computePathDecision(GIANT, { x: 20, y: 25 }, { x: 5, y: 25 },
    null, 15, 2.0, [WALL_LV1]);
  assert(dGiant.mode === "BREAK_WALL", `giant sans chemin → BREAK_WALL (got ${dGiant.mode})`);

  // Barb : chemin court (9 tiles, directDist=5) → acceptable → DIRECT
  // 9 ≤ 5×2.0=10 → pathAcceptable=true → DIRECT
  const dBarb = computePathDecision(BARB, { x: 20, y: 25 }, { x: 5, y: 25 },
    9, 5, 2.0, [WALL_LV1]);
  assert(dBarb.mode === "DIRECT", `barb avec chemin court acceptable → DIRECT (got ${dBarb.mode})`);

  // wallBreakCost : barb (dps=42, speed=1.125) > FASTER break than giant (dps=31, speed=0.75)
  const from = { x: 20, y: 25 }; const target = { x: 5, y: 25 };
  const costGiant = wallBreakCost(GIANT, from, WALL_LV1, target);
  const costBarb  = wallBreakCost(BARB,  from, WALL_LV1, target);
  assert(costBarb < costGiant, `barb brise le mur plus vite (${costBarb.toFixed(1)}s) que giant (${costGiant.toFixed(1)}s)`,
    `barb=${costBarb.toFixed(1)} giant=${costGiant.toFixed(1)}`);
}

// ── Test 6: Mur détruit → décision change (BREAK_WALL → DIRECT) ──────────────
console.log("\nTest 6: Mur détruit → décision bascule de BREAK_WALL à DIRECT");
{
  const aliveWall:    WallInfo = { ...WALL_LV1, alive: true  };
  const destroyedWall: WallInfo = { ...WALL_LV1, alive: false };

  const withWall    = computePathDecision(GIANT, { x: 20, y: 25 }, { x: 5, y: 25 }, null, 15, 2.0, [aliveWall]);
  const withoutWall = computePathDecision(GIANT, { x: 20, y: 25 }, { x: 5, y: 25 }, null, 15, 2.0, [destroyedWall]);

  assert(withWall.mode === "BREAK_WALL", "avec mur vivant → BREAK_WALL", `got ${withWall.mode}`);
  assert(withoutWall.mode === "DIRECT",  "avec mur détruit → DIRECT (fallback)", `got ${withoutWall.mode}`);
}

// ── Test 7: Décision stable — mêmes inputs = même output ──────────────────────
console.log("\nTest 7: Décision déterministe — mêmes inputs → même output");
{
  const d1 = computePathDecision(GIANT, { x: 20, y: 25 }, { x: 5, y: 25 }, null, 15, 2.0, [WALL_LV1]);
  const d2 = computePathDecision(GIANT, { x: 20, y: 25 }, { x: 5, y: 25 }, null, 15, 2.0, [WALL_LV1]);
  const d3 = computePathDecision(GIANT, { x: 20, y: 25 }, { x: 5, y: 25 }, null, 15, 2.0, [WALL_LV1]);
  assert(d1.mode === d2.mode && d2.mode === d3.mode, "mode stable sur 3 appels");
  assert(d1.estimatedCost === d2.estimatedCost, "estimatedCost stable");
}

// ── Test 8: PATH_DECISION event émis dans result.events ──────────────────────
console.log("\nTest 8: PATH_DECISION émis dans result.events lors d'une simulation");
{
  // Scenario: wall bloque le chemin direct → troupe prend une décision
  const walls: WallPlacement[] = [
    // Ligne de murs sur x=20, de y=23 à y=27 → bloque le passage direct
    { instanceId: "wA", x: 20, y: 23, level: 1 },
    { instanceId: "wB", x: 20, y: 24, level: 1 },
    { instanceId: "wC", x: 20, y: 25, level: 1 },
    { instanceId: "wD", x: 20, y: 26, level: 1 },
    { instanceId: "wE", x: 20, y: 27, level: 1 },
  ];
  const r = simulateAttack(
    [{ instanceId: "g1", troopId: "giant", level: 5, dropPosition: { x: 30, y: 25 } }],
    [{ instanceId: "c1", defenseId: "cannon", level: 10, position: { x: 5, y: 25 } }],
    [],
    walls,
  );
  const pathEvents = r.events.filter((e) => e.type === "PATH_DECISION");
  assert(pathEvents.length > 0, "au moins un PATH_DECISION émis", `count=${pathEvents.length}`);
  const modes = pathEvents.map((e) => e.extra?.["mode"]);
  const hasBreak  = modes.includes("BREAK_WALL");
  const hasDirect = modes.includes("DIRECT");
  assert(hasBreak || hasDirect, "mode BREAK_WALL ou DIRECT présent dans les events");
  // All events have valid structure
  for (const ev of pathEvents) {
    assert(typeof ev.value === "number", `PATH_DECISION value est un number (${ev.sourceId})`);
    assert(ev.sourceId !== undefined,    `PATH_DECISION a un sourceId (${ev.sourceId})`);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Tests comportementaux avec simulation réelle (PathDecisionContext fourni)
// ═══════════════════════════════════════════════════════════════════════════

// ── Test 9 [ctx] : Détour raisonnable → DIRECT ───────────────────────────────
console.log("\nTest 9 [ctx]: Détour raisonnable — mur unique, contournement 2 tuiles → DIRECT");
{
  // Un seul mur sur la ligne directe. Le chemin Dijkstra le contourne par
  // une case au-dessus ou en-dessous → détour négligeable → DIRECT attendu.
  const from   = { x: 32, y: 22 };
  const target = { x: 5.5, y: 22.5 };  // cible size-1 centrée en (5,22)
  const walls: WallInfo[] = [{ instanceId: "wSingle", x: 20, y: 22, hp: 100, alive: true }];
  const { ctx, dijkstraCost, directDist } = makeCtx(from, target, walls);

  assert(dijkstraCost !== null, "chemin Dijkstra existe (détour autour du mur)",
    `dijkstraCost=${dijkstraCost}`);

  const d = computePathDecision(GIANT, from, target, dijkstraCost, directDist, 2.0, walls, ctx);
  assert(d.mode === "DIRECT",
    `détour raisonnable (${dijkstraCost?.toFixed(1)} tuiles ≤ ${(directDist * 2).toFixed(1)}) → DIRECT`,
    `mode=${d.mode}`);
}

// ── Test 10 [ctx] : Mur unique vraiment utile → BREAK_WALL ───────────────────
console.log("\nTest 10 [ctx]: Colonne pleine (x=20) — aucun chemin → BREAK_WALL sur la ligne directe");
{
  // Colonne complète de murs en x=20 sur toute la hauteur de la grille.
  // Aucun chemin possible. La troupe doit casser le mur à y=22 (ligne directe).
  const from   = { x: 32, y: 22 };
  const target = { x: 5.5, y: 22.5 };
  const column: WallInfo[] = Array.from({ length: GRID }, (_, i) => ({
    instanceId: `wCol${i}`, x: 20, y: i, hp: 100, alive: true,
  }));
  const { ctx, dijkstraCost, directDist } = makeCtx(from, target, column);

  assert(dijkstraCost === null, "colonne pleine → aucun chemin Dijkstra");

  const d = computePathDecision(GIANT, from, target, dijkstraCost, directDist, 2.0, column, ctx);
  assert(d.mode === "BREAK_WALL", "colonne pleine → BREAK_WALL", `mode=${d.mode}`);

  const chosen = column.find(w => w.instanceId === d.targetWallId);
  assert(chosen !== undefined, "un mur valide est ciblé", `targetWallId=${d.targetWallId}`);
  // Le mur sur la ligne directe (y=22) doit avoir le meilleur score post-bris.
  assert(chosen?.y === 22, `mur choisi sur la ligne directe y=22 (got y=${chosen?.y})`);
}

// ── Test 11 [ctx] : Double couche — pénalité visible dans debugInfo ───────────
console.log("\nTest 11 [ctx]: Double couche — le mur extérieur est pénalisé (wallsNearPath ≥ 1)");
{
  // Wall A (22,22) et Wall B (21,22) forment une double couche sur la ligne directe.
  // Après avoir brisé A, B bloque encore → B est adjacent au chemin post-bris
  // → debugInfo doit montrer wallsNearPath ≥ 1 pour wallA.
  const from   = { x: 32, y: 22 };
  const target = { x: 5.5, y: 22.5 };
  const wallA: WallInfo = { instanceId: "wallA", x: 22, y: 22, hp: 100, alive: true };
  const wallB: WallInfo = { instanceId: "wallB", x: 21, y: 22, hp: 100, alive: true };
  const walls = [wallA, wallB];
  const { ctx, dijkstraCost, directDist } = makeCtx(from, target, walls);

  // Ratio serré pour forcer l'évaluation BREAK_WALL (le détour dépasse 1.05×directDist)
  const d = computePathDecision(GIANT, from, target, dijkstraCost, directDist, 1.05, walls, ctx);

  const evalA = d.debugInfo?.find(e => e.wallId === "wallA");
  assert(evalA !== undefined, "évaluation de wallA présente dans debugInfo");
  assert((evalA?.wallsNearPath ?? 0) >= 1,
    `wallA pénalisé — wallB détecté derrière (wallsNearPath=${evalA?.wallsNearPath})`);

  const evalB = d.debugInfo?.find(e => e.wallId === "wallB");
  assert(evalB !== undefined, "évaluation de wallB présente dans debugInfo");
  // Les deux murs se pénalisent mutuellement : chacun bloque le chemin post-bris de l'autre.
  assert((evalB?.wallsNearPath ?? 0) >= 1,
    `wallB aussi pénalisé — wallA détecté sur son chemin post-bris (wallsNearPath=${evalB?.wallsNearPath})`);
}

// ── Test 12 [ctx] : Cible enfermée → BREAK_WALL depuis l'enceinte ─────────────
console.log("\nTest 12 [ctx]: Cible complètement enfermée — BREAK_WALL sur un mur de l'enceinte");
{
  // Cible en (10,22) entourée de 8 murs bloquant tous les goalTiles adjacents.
  // Aucun chemin possible. Le système doit choisir un mur de l'enceinte.
  const from   = { x: 32, y: 22 };
  const target = { x: 10.5, y: 22.5 };  // cible size-1 centrée en (10,22)
  // Bloquer les 8 tuiles adjacentes à (10,22) : goalTiles pour size=1
  const enclosure: WallInfo[] = [
    { instanceId: "eN1", x: 9,  y: 21, hp: 100, alive: true },
    { instanceId: "eN2", x: 10, y: 21, hp: 100, alive: true },
    { instanceId: "eN3", x: 11, y: 21, hp: 100, alive: true },
    { instanceId: "eN4", x: 9,  y: 22, hp: 100, alive: true },
    { instanceId: "eN5", x: 11, y: 22, hp: 100, alive: true },  // est — plus proche du troop
    { instanceId: "eN6", x: 9,  y: 23, hp: 100, alive: true },
    { instanceId: "eN7", x: 10, y: 23, hp: 100, alive: true },
    { instanceId: "eN8", x: 11, y: 23, hp: 100, alive: true },
  ];
  const { ctx, dijkstraCost, directDist } = makeCtx(from, target, enclosure);

  assert(dijkstraCost === null, "cible enfermée → aucun chemin", `dijkstraCost=${dijkstraCost}`);

  const d = computePathDecision(GIANT, from, target, dijkstraCost, directDist, 2.0, enclosure, ctx);
  assert(d.mode === "BREAK_WALL", "cible enfermée → BREAK_WALL", `mode=${d.mode}`);

  const chosen = enclosure.find(w => w.instanceId === d.targetWallId);
  assert(chosen !== undefined, "le mur ciblé appartient à l'enceinte", `id=${d.targetWallId}`);
  // Le mur à l'est (x=11) est le plus proche du troop venant de x=32 — il doit être préféré.
  assert(chosen?.x === 11,
    `mur est (x=11) choisi car le plus proche sur la ligne directe (got x=${chosen?.x})`);
}

// ── Test 13 [ctx] : Comparaison stratégique — mur proche mais inutile ignoré ──
console.log("\nTest 13 [ctx]: Colonne + mur hors-colonne — le mur utile gagne sur le mur géométriquement proche");
{
  // Colonne complète en x=20 → aucun chemin.
  // + Mur hors-colonne à (25,22) : géométriquement proche mais casser ce mur
  //   ne supprime pas la colonne → score=Infinity pour ce mur.
  // La simulation doit choisir le mur de la colonne (y=22) car seul lui ouvre un vrai chemin.
  const from   = { x: 32, y: 22 };
  const target = { x: 5.5, y: 22.5 };
  const column: WallInfo[] = Array.from({ length: GRID }, (_, i) => ({
    instanceId: `wC${i}`, x: 20, y: i, hp: 100, alive: true,
  }));
  const wDecoy: WallInfo = { instanceId: "wDecoy", x: 25, y: 22, hp: 100, alive: true };
  const walls = [...column, wDecoy];
  const { ctx, dijkstraCost, directDist } = makeCtx(from, target, walls);

  assert(dijkstraCost === null, "colonne + leurre → aucun chemin");

  const d = computePathDecision(GIANT, from, target, dijkstraCost, directDist, 2.0, walls, ctx);
  assert(d.mode === "BREAK_WALL", "→ BREAK_WALL", `mode=${d.mode}`);

  // Avec le look-ahead, le leurre proche peut être le PREMIER mur d'une paire
  // (troop→décoy→colonne), ce qui est plus rapide que troop→colonne seul.
  // On vérifie que : (a) leurre seul a score=∞, (b) la colonne (x=20) est impliquée.
  const evalDecoy = d.debugInfo?.find(e => e.wallId === "wDecoy");
  assert(!isFinite(evalDecoy?.score ?? Infinity),
    `leurre (25,22) seul a score=∞ (ne supprime pas la colonne) — got ${evalDecoy?.score}`);

  const chosen    = walls.find(w => w.instanceId === d.targetWallId);
  const evalFirst = d.debugInfo?.find(e => e.wallId === d.targetWallId);
  const secondW   = walls.find(w => w.instanceId === evalFirst?.bestSecondWallId);
  const colInvolved = chosen?.x === 20 || secondW?.x === 20;
  assert(colInvolved,
    `la colonne (x=20) fait partie de la stratégie (first x=${chosen?.x}, second x=${secondW?.x})`);
}

// ═══════════════════════════════════════════════════════════════════════════
// Tests look-ahead 2 murs
// ═══════════════════════════════════════════════════════════════════════════

// ── Test 14 [lookahead] : Double colonne — BREAK_WALL + second mur identifié ─
console.log("\nTest 14 [lookahead]: Double colonne (x=19 + x=20) — BREAK_WALL sur premier, second dans debugInfo");
{
  // Deux colonnes pleine hauteur en x=20 et x=19. Aucun mur seul ne suffit.
  // Le look-ahead doit trouver la paire (20,22)+(19,22) et choisir x=20 en premier.
  const from   = { x: 32, y: 22 };
  const target = { x: 5.5, y: 22.5 };
  const colA: WallInfo[] = Array.from({ length: GRID }, (_, i) => ({ instanceId: `cA${i}`, x: 20, y: i, hp: 100, alive: true }));
  const colB: WallInfo[] = Array.from({ length: GRID }, (_, i) => ({ instanceId: `cB${i}`, x: 19, y: i, hp: 100, alive: true }));
  const walls = [...colA, ...colB];
  const { ctx, dijkstraCost, directDist } = makeCtx(from, target, walls);

  assert(dijkstraCost === null, "double colonne → aucun chemin seul");

  const d = computePathDecision(GIANT, from, target, dijkstraCost, directDist, 2.0, walls, ctx);
  assert(d.mode === "BREAK_WALL", "look-ahead trouve une paire → BREAK_WALL", `mode=${d.mode}`);

  const chosen = walls.find(w => w.instanceId === d.targetWallId);
  assert(chosen?.x === 20, `premier mur = colonne x=20 (paire moins chère) (got x=${chosen?.x})`);

  const evalChosen = d.debugInfo?.find(e => e.wallId === d.targetWallId);
  assert(evalChosen?.bestSecondWallId !== undefined, "un second mur est identifié dans debugInfo");

  const secondWall = walls.find(w => w.instanceId === evalChosen?.bestSecondWallId);
  assert(secondWall?.x === 19, `second mur = colonne x=19 (got x=${secondWall?.x})`);
  assert(secondWall?.y === 22, `second mur sur ligne directe y=22 (got y=${secondWall?.y})`);
}

// ── Test 15 [lookahead] : Double couche avec détour raisonnable → DIRECT ─────
console.log("\nTest 15 [lookahead]: Double couche légère (22,22)+(21,22) — détour raisonnable → DIRECT");
{
  // Deux murs successifs sur la ligne directe. Le détour via y=21/23 reste
  // court (< 2× directDist). Ni mur seul ni paire A+B ne battent le chemin.
  const from   = { x: 32, y: 22 };
  const target = { x: 5.5, y: 22.5 };
  const wA: WallInfo = { instanceId: "t15A", x: 22, y: 22, hp: 100, alive: true };
  const wB: WallInfo = { instanceId: "t15B", x: 21, y: 22, hp: 100, alive: true };
  const walls = [wA, wB];
  const { ctx, dijkstraCost, directDist } = makeCtx(from, target, walls);

  const d = computePathDecision(GIANT, from, target, dijkstraCost, directDist, 2.0, walls, ctx);
  assert(d.mode === "DIRECT",
    `détour autour de la double couche reste raisonnable → DIRECT (mode=${d.mode})`);
}

// ── Test 16 [lookahead] : Faux premier mur — meilleure paire depuis le look-ahead
console.log("\nTest 16 [lookahead]: Leurre proche + double colonne — la paire utile gagne");
{
  // Même double colonne qu'en test 14, PLUS un leurre très proche (25,22).
  // Le leurre seul ne suffit pas et n'a pas de paire valide (les deux colonnes
  // bloquent toujours). La paire (20,22)+(19,22) gagne malgré son éloignement.
  const from   = { x: 32, y: 22 };
  const target = { x: 5.5, y: 22.5 };
  const colA: WallInfo[] = Array.from({ length: GRID }, (_, i) => ({ instanceId: `d16A${i}`, x: 20, y: i, hp: 100, alive: true }));
  const colB: WallInfo[] = Array.from({ length: GRID }, (_, i) => ({ instanceId: `d16B${i}`, x: 19, y: i, hp: 100, alive: true }));
  const decoy: WallInfo  = { instanceId: "d16dec", x: 25, y: 22, hp: 100, alive: true };
  const walls = [...colA, ...colB, decoy];
  const { ctx, dijkstraCost, directDist } = makeCtx(from, target, walls);

  const d = computePathDecision(GIANT, from, target, dijkstraCost, directDist, 2.0, walls, ctx);
  assert(d.mode === "BREAK_WALL", "→ BREAK_WALL (paire utile trouvée)", `mode=${d.mode}`);

  const chosen = walls.find(w => w.instanceId === d.targetWallId);
  // Le leurre (x=25) ne doit PAS être choisi — il n'a pas de paire valide.
  assert(chosen?.x !== 25, `leurre (x=25) écarté, mur x=${chosen?.x} choisi`);
  assert(chosen?.x === 20, `premier mur de la meilleure paire = x=20 (got x=${chosen?.x})`);

  // Le leurre doit apparaître dans debugInfo sans scoreTwoWall (aucune paire valide)
  const evalDecoy = d.debugInfo?.find(e => e.wallId === "d16dec");
  assert(evalDecoy !== undefined, "leurre évalué et présent dans debugInfo");
  assert(evalDecoy?.bestSecondWallId === undefined,
    `leurre sans paire valide (bestSecondWallId=${evalDecoy?.bestSecondWallId})`);
}

// ── Test 17 [perf] : Nombre d'évaluations borné ───────────────────────────────
console.log("\nTest 17 [perf]: 50 murs sur la carte — debugInfo bornée à MAX_WALL_CANDIDATES");
{
  // 50 murs arbitraires. Le pré-filtre garantit ≤ 6 évaluations principales.
  const from   = { x: 32, y: 22 };
  const target = { x: 5.5, y: 22.5 };
  const manyWalls: WallInfo[] = Array.from({ length: 50 }, (_, i) => ({
    instanceId: `mp${i}`,
    x: (i % 22) + 10,
    y: (Math.floor(i / 22) % 3) + 21,   // lignes y=21,22,23
    hp: 100, alive: true,
  }));
  const { ctx, dijkstraCost, directDist } = makeCtx(from, target, manyWalls);

  const d = computePathDecision(GIANT, from, target, dijkstraCost, directDist, 2.0, manyWalls, ctx);
  const evalCount = d.debugInfo?.length ?? 0;
  assert(evalCount <= 6, `évaluations bornées ≤ 6 (got ${evalCount})`);
}

// ── Summary ──────────────────────────────────────────────────────────────────
console.log(`\n${passed + failed} tests — ${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
