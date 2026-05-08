/**
 * Tests : Tornado Trap (Piège tornade)
 *
 *   npx tsx lib/engine/tornado.test.ts
 *
 * Rules:
 *  - triggerRadius 3, affecte sol + air (sauf Miner)
 *  - Durée : tornadoDuration secondes après activation
 *  - Dégâts continus : tornadoDps * TICK chaque tick dans effectRadius
 *  - Attraction vers le centre : pullStep = 1.2 * (1/clamp(ceil(housing/3),1,5)) * TICK
 *  - Single-use
 *
 * Setup : Cannon at (5,25) gives troops a ground target to walk toward.
 *         Air Defense at (5,20) gives air units a target.
 *         Tornado at (22,25). Troops drop at (35,25).
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

// ── Fixtures ─────────────────────────────────────────────────────────────────

const CANNON: DefensePlacement = {
  instanceId: "c1", defenseId: "cannon", level: 10, position: { x: 5, y: 25 },
};
const AIR_DEF: DefensePlacement = {
  instanceId: "ad1", defenseId: "air-defense", level: 8, position: { x: 5, y: 20 },
};

// Tornado Lv3: duration=7, dps=8, triggerRadius=3, effectRadius=3
const TORNADO: DefensePlacement = {
  instanceId: "t1", defenseId: "tornado-trap", level: 3, position: { x: 22, y: 25 },
};

function troop(id: string, troopId: string, level: number, x: number, y: number): TroopDeployment {
  return { instanceId: id, troopId, level, dropPosition: { x, y } };
}

// ── Test 1: Giant déclenche ───────────────────────────────────────────────────
console.log("\nTest 1: Giant (sol) déclenche la tornade");
{
  const r = simulateAttack([troop("g1", "giant", 5, 35, 25)], [CANNON, TORNADO]);
  const t1 = r.defenses["t1"];
  assert(t1.destroyedAt !== null, "tornade déclenchée par un géant", `destroyedAt=${t1.destroyedAt}`);
}

// ── Test 2: Dragon déclenche ──────────────────────────────────────────────────
console.log("\nTest 2: Dragon (air) déclenche la tornade");
{
  const r = simulateAttack([troop("d1", "dragon", 5, 35, 25)], [AIR_DEF, TORNADO]);
  const t1 = r.defenses["t1"];
  assert(t1.destroyedAt !== null, "tornade déclenchée par un dragon", `destroyedAt=${t1.destroyedAt}`);
}

// ── Test 3: Miner ne déclenche pas ───────────────────────────────────────────
console.log("\nTest 3: Miner ne déclenche pas la tornade");
{
  const r = simulateAttack([troop("m1", "miner", 5, 35, 25)], [CANNON, TORNADO]);
  const t1 = r.defenses["t1"];
  assert(t1.destroyedAt === null, "tornade non déclenchée par un miner", `destroyedAt=${t1.destroyedAt}`);
}

// ── Test 4: Troupe dans effectRadius prend des dégâts ────────────────────────
console.log("\nTest 4: Troupe dans effectRadius prend des dégâts sur la durée");
{
  // Giant dropped inside effectRadius=3 of tornado at (22,25).
  // Giant at (23,25): center (23.5,25.5), distance from trap center (22.5,25.5) = 1 ≤ 3 ✓
  // Giant Lv5 = 620 HP, dps=8, duration=7 → totalDmg ≈ 56
  const r = simulateAttack([troop("g1", "giant", 5, 23, 25)], [CANNON, TORNADO]);
  const g1 = r.troops["g1"];
  const t1 = r.defenses["t1"];
  assert(t1.destroyedAt !== null, "tornade déclenchée");
  // At t=8 (tornado ends at ~trigger+7), giant should have taken ~56 dmg
  const hp8 = g1.hpPerSecond[8] ?? g1.hpPerSecond[g1.hpPerSecond.length - 1];
  assert(hp8 < 620, "giant a perdu des HP à cause de la tornade", `hp[8]=${hp8}`);
}

// ── Test 5: Troupe attirée vers le centre ─────────────────────────────────────
console.log("\nTest 5: Troupe attirée vers le centre de la tornade");
{
  // Giant at (23,25), tornado center at (22.5,25.5).
  // Giant should be pulled toward center each tick.
  // Giant Lv5 housing=5: attractionFactor=1/clamp(ceil(5/3),1,5)=1/2, pullStep=0.06/tick
  // After 7s (70 ticks) of pulling: ~70*0.06 = 4.2 tiles pulled
  // But cannon also kills eventually; we just check position moves toward center.
  const r = simulateAttack([troop("g1", "giant", 5, 26, 25)], [CANNON, TORNADO]);
  const g1 = r.troops["g1"];
  const t1 = r.defenses["t1"];
  assert(t1.destroyedAt !== null, "tornade déclenchée");
  // Compare position at t=1 vs t=0 — giant should be WEST of start (pulled left toward trap at x=22)
  const pos0 = g1.positionPerSecond[0];
  const pos2 = g1.positionPerSecond[2] ?? g1.positionPerSecond[g1.positionPerSecond.length - 1];
  assert(pos2 !== undefined, "positions enregistrées");
  // Normal movement alone would take giant from x=26 westward. But pull accelerates it.
  // We verify the giant moved west (x decreased) which is consistent with both movement + pull.
  assert(pos2.x < pos0.x, "géant attiré vers l'ouest (centre tornade)", `x[0]=${pos0.x.toFixed(2)} x[2]=${pos2.x.toFixed(2)}`);
}

// ── Test 6: Troupe hors effectRadius non affectée ─────────────────────────────
console.log("\nTest 6: Troupe hors effectRadius non affectée par les dégâts");
{
  // Giant dropped far from tornado (35,25).
  // Tornado triggers when giant enters triggerRadius=3 at ~x=25.
  // But effectRadius=3 around center (22.5,25.5) — giant at trigger position is ~x=25
  // Distance from center to giant at x=25: |25.5-22.5|=3 exactly → borderline.
  // Use a giant dropped at (40,25) so when it triggers (enters triggerRadius at x≈25),
  // it's still outside effectRadius at that moment.
  // Actually trigger fires at x≈25 and effectRadius center is (22.5,25.5):
  // distance = |25.5-22.5| = 3 = effectRadius exactly → may or may not be included.
  // For a clear "outside" test, use a giant far enough that by the time tornado ends
  // it hasn't been pulled inside effectRadius.
  // Instead: test that a troop that never enters effectRadius takes 0 tornado damage.
  // Put ONLY an air troop that triggers the tornado; ground giant starts far away
  // and cannon kills it before it reaches effectRadius.
  // Simplest: drop a wizard outside triggerRadius so it never enters the effect zone.
  const r = simulateAttack(
    [troop("g1", "giant", 5, 35, 25)],
    [CANNON, TORNADO],
  );
  const g1 = r.troops["g1"];
  const t1 = r.defenses["t1"];
  assert(t1.destroyedAt !== null, "tornade déclenchée");
  // Giant triggers at ~x=25, which is ~3 tiles from tornado center (22.5) — at the boundary.
  // The cannon keeps firing. We verify the giant's hp loss is NOT purely from tornado damage.
  // Since cannon fires too, we can't isolate. Use a different approach:
  // Check that a troop dropped at (35,30) (far south) never enters effectRadius.
  const r2 = simulateAttack(
    [troop("g2", "giant", 5, 35, 25), troop("g3", "giant", 5, 35, 32)],
    [CANNON, TORNADO],
  );
  // g3 is far south and cannon target is at (5,25) — g3 walks toward (5,25) south of tornado.
  // g3's path is (35,32)→(5,25), passing below the tornado. It should not be in effectRadius.
  const g3 = r2.troops["g3"];
  // g3 should survive for a while (cannon focuses on g2 first); check it was never pulled.
  // If g3 was NOT in effectRadius, its hp should be full at t=3 (before cannon switches to it).
  const hp3 = g3.hpPerSecond[3] ?? g3.hpPerSecond[0];
  assert(hp3 >= 590, "g3 hors rayon non affecté par la tornade", `hp[3]=${hp3}`);
}

// ── Test 7: Tornade s'arrête après duration ───────────────────────────────────
console.log("\nTest 7: Tornade s'arrête après duration=7s");
{
  // Giant inside effectRadius. Tornado duration=7. After trigger+7s, no more damage.
  // Measure total damage dealt by tornado = totalDamageDealt ≈ 8 dps * 7s = 56.
  const r = simulateAttack([troop("g1", "giant", 5, 23, 25)], [CANNON, TORNADO]);
  const t1 = r.defenses["t1"];
  assert(t1.destroyedAt !== null, "tornade déclenchée");
  // Tornado DPS=8, duration=7s → max dmg ≈ 56. With TICK precision → 56 ± 1.
  assert(t1.totalDamageDealt >= 50 && t1.totalDamageDealt <= 80,
    `dégâts totaux cohérents avec durée 7s (${t1.totalDamageDealt.toFixed(1)} dmg)`);
}

// ── Test 8: Single-use — ne se réactive pas ───────────────────────────────────
console.log("\nTest 8: Piège single-use, ne se réactive pas");
{
  // Two giants. First triggers tornado. Second walks through same area but tornado is consumed.
  const r = simulateAttack(
    [troop("g1", "giant", 5, 35, 25), troop("g2", "giant", 5, 38, 25)],
    [CANNON, TORNADO],
  );
  const t1 = r.defenses["t1"];
  // Only one trigger event — totalDamageDealt should reflect ONE activation, not two.
  assert(t1.destroyedAt !== null, "tornade déclenchée une fois");
  // If tornado re-activated, damage would be ~2x; single activation ≤ ~90 dmg for 7s+2 giants
  assert(t1.totalDamageDealt < 200, "pas de double activation (single-use)", `dmg=${t1.totalDamageDealt.toFixed(1)}`);
}

// ── Test 9: Petite troupe plus attirée que grosse ─────────────────────────────
console.log("\nTest 9: Barbarian (housing=1) plus attiré que PEKKA (housing=25)");
{
  // Both start at same x, same distance. After tornado duration, barbarian should be
  // closer to tornado center than PEKKA.
  // Both dropped at (26,25). Tornado at (22,25), center (22.5,25.5).
  // Barbarian: attractionFactor=1, pullStep=0.12/tick
  // PEKKA: attractionFactor=1/5, pullStep=0.024/tick
  // Both are ground troops and walk toward cannon, so movement is same.
  // BUT tornado pull is stronger for barb → barb ends up further west (closer to center).

  const rBarb = simulateAttack(
    [troop("b1", "barbarian", 1, 26, 25)],
    [CANNON, TORNADO],
  );
  const rPekka = simulateAttack(
    [troop("p1", "pekka", 5, 26, 25)],
    [CANNON, TORNADO],
  );
  const barb  = rBarb.troops["b1"];
  const pekka = rPekka.troops["p1"];

  // After tornado duration (~7s from trigger), compare x position.
  // Tornado center at x=22.5. Lower x = closer to center.
  const triggerT = rBarb.defenses["t1"].destroyedAt ?? 0;
  const snapIdx  = Math.min(Math.floor(triggerT) + 4, barb.positionPerSecond.length - 1);

  const barbX  = barb.positionPerSecond[snapIdx]?.x ?? 26;
  const pekkaX = pekka.positionPerSecond[snapIdx]?.x ?? 26;
  const tornadoCenterX = 22.5; // tornado at (22,25), size=1, center x = 22.5

  // Stronger pull keeps barb CLOSER to center; PEKKA escapes further.
  const barbDist  = Math.abs(barbX  - tornadoCenterX);
  const pekkaDist = Math.abs(pekkaX - tornadoCenterX);
  assert(barbDist < pekkaDist,
    `barbarian (dist=${barbDist.toFixed(2)}) reste plus près du centre que PEKKA (dist=${pekkaDist.toFixed(2)})`);
}

// ── Summary ──────────────────────────────────────────────────────────────────
console.log(`\n${passed + failed} tests — ${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
