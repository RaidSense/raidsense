/**
 * Tests : Spring Trap
 *
 *   npx tsx lib/engine/springtrap.test.ts
 *
 * Rules:
 *  - triggerRadius 1 tile, ground only
 *  - Consumed on first troop contact
 *  - Ejects if housingSpace <= ejectCapacity, otherwise no effect
 *
 * Setup: Cannon at (10, 25) draws troops west from drop (30, 25).
 *        Spring trap at (22, 25) is crossed on the way → triggers.
 */

import { simulateAttack } from "./calculator";
import type { TroopDeployment, DefensePlacement } from "./calculator";

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

// ── Shared setup ──────────────────────────────────────────────────────────────
// Cannon Lv10 at (10, 25) — draws ground troops westward
// Spring trap Lv6 (ejectCapacity=18) at (22, 25) — between drop and cannon
// Troops drop at (30, 25) → walk west → cross trap before reaching cannon

const CANNON: DefensePlacement = {
  instanceId: "c1",
  defenseId:  "cannon",
  level:      10,
  position:   { x: 10, y: 25 },
};

const SPRING: DefensePlacement = {
  instanceId: "sp1",
  defenseId:  "spring-trap",
  level:      6,   // ejectCapacity=18
  position:   { x: 22, y: 25 },
};

function troop(id: string, troopId: string, level: number, x: number, y: number): TroopDeployment {
  return { instanceId: id, troopId, level, dropPosition: { x, y } };
}

function lastHp(hpPerSecond: number[]): number {
  return hpPerSecond[hpPerSecond.length - 1] ?? 0;
}

// ── Test 1: Giant (housing=5, cap=18) → ejected ──────────────────────────────
console.log("\nTest 1: Giant Lv5 (housing=5) vs spring-trap lv6 (cap=18) → ejected");
{
  const r = simulateAttack([troop("g1", "giant", 5, 30, 25)], [CANNON, SPRING]);
  const g = r.troops["g1"];
  assert(g.destroyedAt !== null && g.destroyedAt <= 15, "giant ejected within 15s", `destroyedAt=${g.destroyedAt}`);
}

// ── Test 2: Barbarian (housing=1, cap=18) → ejected ──────────────────────────
console.log("\nTest 2: Barbarian Lv1 (housing=1) vs spring-trap → ejected");
{
  const r = simulateAttack([troop("b1", "barbarian", 1, 30, 25)], [CANNON, SPRING]);
  const b = r.troops["b1"];
  assert(b.destroyedAt !== null && b.destroyedAt <= 15, "barbarian ejected within 15s", `destroyedAt=${b.destroyedAt}`);
}

// ── Test 3: PEKKA (housing=25, cap=18) → immune, NOT ejected by trap ─────────
console.log("\nTest 3: PEKKA Lv5 (housing=25) vs spring-trap lv6 (cap=18) → immune");
{
  const r = simulateAttack([troop("p1", "pekka", 5, 30, 25)], [CANNON, SPRING]);
  const p = r.troops["p1"];
  // PEKKA is immune to spring-trap. It eventually gets killed by the cannon,
  // but destroyedAt should be > the time it would take to walk past the trap (~10s).
  // The key check: PEKKA's death is from the cannon (not instant eject at ~10s).
  const trapTriggerTime = (30 - 23) / (20 / 16); // approx 5.6s to cross trigger zone
  assert(
    p.destroyedAt === null || p.destroyedAt > trapTriggerTime + 2,
    "PEKKA not instantly ejected (dies later from cannon if at all)",
    `destroyedAt=${p.destroyedAt}, trapTime≈${trapTriggerTime.toFixed(1)}`,
  );
}

// ── Test 4: Trap consumed after first troop ───────────────────────────────────
console.log("\nTest 4: two giants — only first ejected (trap consumed)");
{
  // g2 drops slightly further, arrives after trap is consumed
  const r = simulateAttack(
    [
      troop("g1", "giant", 5, 30, 25),
      troop("g2", "giant", 5, 34, 25),
    ],
    [CANNON, SPRING],
  );
  const g1 = r.troops["g1"];
  const g2 = r.troops["g2"];
  assert(g1.destroyedAt !== null && g1.destroyedAt <= 15, "first giant ejected", `destroyedAt=${g1.destroyedAt}`);
  // g2 is not instantly ejected — it either survives or dies much later from the cannon
  const g1EjectTime = g1.destroyedAt!;
  assert(
    g2.destroyedAt === null || g2.destroyedAt > g1EjectTime + 1,
    "second giant NOT ejected by trap (trap consumed)",
    `g1=${g1EjectTime.toFixed(1)}s g2=${g2.destroyedAt?.toFixed(1) ?? "alive"}`,
  );
}

// ── Test 5: PEKKA triggers trap (immune) — trap consumed, giant safe ──────────
console.log("\nTest 5: PEKKA triggers (immune), then giant safe (trap consumed)");
{
  const r = simulateAttack(
    [
      troop("p1", "pekka",  5, 30, 25),   // closer → triggers first
      troop("g1", "giant",  5, 38, 25),   // arrives later → trap already consumed
    ],
    [CANNON, SPRING],
  );
  const p = r.troops["p1"];
  const g = r.troops["g1"];
  // PEKKA triggered but wasn't ejected → it keeps fighting; dies from cannon eventually
  const pekkaWalkTime = (30 - 23) / (20 / 16);
  assert(
    p.destroyedAt === null || p.destroyedAt > pekkaWalkTime + 1,
    "PEKKA not ejected instantly (immune)",
    `destroyedAt=${p.destroyedAt?.toFixed(1) ?? "alive"}`,
  );
  // Giant: trap was consumed by PEKKA, so giant NOT instantly ejected
  const giantWalkTime = (38 - 23) / (12 / 16);
  assert(
    g.destroyedAt === null || g.destroyedAt > giantWalkTime,
    "giant not instantly ejected (trap consumed by PEKKA)",
    `destroyedAt=${g.destroyedAt?.toFixed(1) ?? "alive"}, giantWalkTime≈${giantWalkTime.toFixed(1)}`,
  );
}

// ── Test 6: Archer (ground, housing=1) → ejected ─────────────────────────────
console.log("\nTest 6: Archer (ground, housing=1) vs spring-trap → ejected");
{
  const r = simulateAttack([troop("a1", "archer", 1, 30, 25)], [CANNON, SPRING]);
  const a = r.troops["a1"];
  assert(a.destroyedAt !== null && a.destroyedAt <= 15, "archer ejected within 15s", `destroyedAt=${a.destroyedAt}`);
}

// ── Test 7: Balloon (air) not triggered by spring-trap ───────────────────────
console.log("\nTest 7: Balloon (air) not triggered by spring-trap");
{
  // Balloon is air, spring-trap is targetsGroundOnly → no trigger
  // Balloon passes over the trap and eventually destroys or times out
  const r = simulateAttack([troop("bl1", "balloon", 4, 30, 25)], [CANNON, SPRING]);
  const bl = r.troops["bl1"];
  // Balloon should NOT be destroyed instantly at trap position
  const trapWalkTime = (30 - 23) / (10 / 16); // balloon speed=10
  assert(
    bl.destroyedAt === null || bl.destroyedAt > trapWalkTime,
    "balloon not instantly ejected (air unit immune to spring-trap)",
    `destroyedAt=${bl.destroyedAt?.toFixed(1) ?? "alive"}, trapTime≈${trapWalkTime.toFixed(1)}`,
  );
}

// ── Summary ──────────────────────────────────────────────────────────────────
console.log(`\n${passed + failed} tests — ${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
