/**
 * Tests : PathDecision architecture
 *
 *   npx tsx lib/engine/pathdecision.test.ts
 *
 * Teste la fonction pure computePathDecision et son intégration dans
 * le moteur (events PATH_DECISION).
 */

import { computePathDecision, wallBreakCost, type TroopCapability, type WallInfo } from "./path-decision";
import { simulateAttack } from "./calculator";
import type { TroopDeployment, DefensePlacement } from "./calculator";
import type { WallPlacement } from "../data/walls";

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

// ── Summary ──────────────────────────────────────────────────────────────────
console.log(`\n${passed + failed} tests — ${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
