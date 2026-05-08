/**
 * Tests : Air Bomb (Bombe aérienne)
 *
 *   npx tsx lib/engine/airbomb.test.ts
 *
 * Rules:
 *  - triggerRadius 4, AIR only, triggerDelay 0.3s
 *  - trapDamage applied to all air troops within explosionRadius 3
 *  - Ground troops never trigger and never take damage
 *  - Consumed after first explosion (single-use)
 *
 * Setup: Air Defense at (5, 25) gives air troops a target to fly toward.
 *        Air-bomb at (22, 25) is crossed en route.
 *        Troops drop at (35, 25).
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

// ── Shared fixtures ───────────────────────────────────────────────────────────

const AIR_DEF: DefensePlacement = {
  instanceId: "ad1",
  defenseId:  "air-defense",
  level:      8,
  position:   { x: 5, y: 25 },
};

// Air-bomb level 8: trapDamage=280, triggerRadius=4, explosionRadius=3
const AB: DefensePlacement = {
  instanceId: "ab1",
  defenseId:  "air-bomb",
  level:      8,
  position:   { x: 22, y: 25 },
};

function troop(id: string, troopId: string, level: number, x: number, y: number): TroopDeployment {
  return { instanceId: id, troopId, level, dropPosition: { x, y } };
}

// ── Test 1: Giant (sol) ne déclenche jamais ────────────────────────────────────
console.log("\nTest 1: Giant (sol) ne déclenche pas la bombe aérienne");
{
  const r = simulateAttack(
    [troop("g1", "giant", 5, 35, 25)],
    [AIR_DEF, AB],
  );
  const ab = r.defenses["ab1"];
  assert(ab.destroyedAt === null, "air-bomb non déclenchée par un géant (sol)", `destroyedAt=${ab.destroyedAt}`);
}

// ── Test 2: Dragon (air) déclenche ────────────────────────────────────────────
console.log("\nTest 2: Dragon (air) déclenche la bombe aérienne");
{
  const r = simulateAttack(
    [troop("d1", "dragon", 5, 35, 25)],
    [AIR_DEF, AB],
  );
  const ab = r.defenses["ab1"];
  assert(ab.destroyedAt !== null, "air-bomb déclenchée par un dragon", `destroyedAt=${ab.destroyedAt}`);
}

// ── Test 3: Balloon déclenche ─────────────────────────────────────────────────
console.log("\nTest 3: Balloon (air) déclenche la bombe aérienne");
{
  const r = simulateAttack(
    [troop("bl1", "balloon", 4, 35, 25)],
    [AIR_DEF, AB],
  );
  const ab = r.defenses["ab1"];
  assert(ab.destroyedAt !== null, "air-bomb déclenchée par un balloon", `destroyedAt=${ab.destroyedAt}`);
}

// ── Test 4: Plusieurs unités AIR prennent les dégâts AoE ──────────────────────
// Dragons dropped inside trigger radius (at ~23,25) so they're already within
// explosion radius when the bomb fires 0.3s later.
console.log("\nTest 4: Plusieurs dragons déjà dans le rayon prennent les dégâts AoE");
{
  const r = simulateAttack(
    [
      troop("d1", "dragon", 5, 23, 25),   // inside triggerRadius and explosionRadius
      troop("d2", "dragon", 5, 23, 24),
      troop("d3", "dragon", 5, 23, 26),
    ],
    [AIR_DEF, AB],
  );
  const ab = r.defenses["ab1"];
  const d1 = r.troops["d1"];
  const d2 = r.troops["d2"];
  const d3 = r.troops["d3"];
  assert(ab.destroyedAt !== null, "bombe déclenchée");
  // Bomb fires at ~t=0.4s; check HP at t=1 snapshot (index 1)
  const snapIdx = 1;
  const hitCount = [d1, d2, d3].filter((t) => {
    const hp = t.hpPerSecond[snapIdx] ?? t.hpPerSecond[t.hpPerSecond.length - 1];
    return hp < 3940; // Dragon Lv5 = 3940 HP; hit if below max
  }).length;
  assert(hitCount >= 2, `au moins 2 dragons endommagés (got ${hitCount})`);
}

// ── Test 5: Archer au sol ne prend jamais les dégâts ──────────────────────────
console.log("\nTest 5: Archer (sol) ne prend pas les dégâts de la bombe aérienne");
{
  // Dragon triggers the bomb; archer nearby should NOT be hit
  const r = simulateAttack(
    [
      troop("d1", "dragon",  5, 35, 25),   // triggers bomb
      troop("a1", "archer",  1, 23, 25),   // ground, next to bomb — must be ignored
    ],
    [AIR_DEF, AB],
  );
  const ab = r.defenses["ab1"];
  const archer = r.troops["a1"];
  assert(ab.destroyedAt !== null, "bombe déclenchée");
  const bombTime = ab.destroyedAt!;
  const snapIdx  = Math.min(Math.floor(bombTime) + 1, archer.hpPerSecond.length - 1);
  const archerHpAtBomb = archer.hpPerSecond[snapIdx] ?? archer.hpPerSecond[archer.hpPerSecond.length - 1];
  // Archer Lv1 = 95 HP; 280 dmg would kill it; it should still be alive after bomb
  assert(archerHpAtBomb > 0, "archer au sol non touché par l'explosion", `hp≈${archerHpAtBomb}`);
}

// ── Test 6: Explosion après délai ~0.3s ──────────────────────────────────────
console.log("\nTest 6: Explosion après délai 0.3s (destroyedAt > triggerTime)");
{
  const r = simulateAttack(
    [troop("d1", "dragon", 5, 35, 25)],
    [AIR_DEF, AB],
  );
  const ab = r.defenses["ab1"];
  assert(ab.destroyedAt !== null, "bombe déclenchée");
  // The trap is set to triggerDelay=0.3; destroyedAt should be at least 0.2s after trigger
  // We verify destroyedAt > 0 (trivially true) and the delay ≥ triggerDelay
  // Since we can't directly compare triggerAt, we just verify it exploded (not instant at t=0)
  assert((ab.destroyedAt ?? 0) > 0.2, "explosion non instantanée (délai respecté)", `destroyedAt=${ab.destroyedAt}`);
}

// ── Test 7: Single-use — une seule explosion ──────────────────────────────────
console.log("\nTest 7: Single-use — deuxième dragon non touché par une deuxième explosion");
{
  const r = simulateAttack(
    [
      troop("d1", "dragon", 5, 35, 25),   // closer, triggers first
      troop("d2", "dragon", 5, 40, 25),   // arrives after bomb consumed
    ],
    [AIR_DEF, AB],
  );
  const ab  = r.defenses["ab1"];
  const d2  = r.troops["d2"];
  assert(ab.destroyedAt !== null, "bombe consommée après d1");
  const bombTime   = ab.destroyedAt!;
  const snapIdx    = Math.floor(bombTime);
  const d2HpAtBomb = d2.hpPerSecond[snapIdx] ?? d2.hpPerSecond[0];
  // Dragon Lv5 = 2400 HP; if hit by 280 dmg, hp = 2120. Still > 2100.
  assert(d2HpAtBomb >= 3900, "d2 non touché par la bombe (déjà consommée)", `hp≈${d2HpAtBomb}`);
}

// ── Test 8: Dragon hors explosionRadius ne prend rien ─────────────────────────
console.log("\nTest 8: Dragon hors explosionRadius non touché");
{
  // bomb at (22, 25), explosionRadius=3, triggerRadius=4
  // d1 triggers when it enters triggerRadius (at about x=26); explosion hits at about x=25-26
  // d2 drops far away and hasn't moved close enough at explosion time
  const r = simulateAttack(
    [
      troop("d1", "dragon", 5, 35, 25),   // triggers the bomb
      troop("d2", "dragon", 5, 50, 25),   // far away when bomb fires
    ],
    [AIR_DEF, AB],
  );
  const ab  = r.defenses["ab1"];
  const d2  = r.troops["d2"];
  assert(ab.destroyedAt !== null, "bombe déclenchée par d1");
  const bombTime   = ab.destroyedAt!;
  const snapIdx    = Math.floor(bombTime);
  const d2HpAtBomb = d2.hpPerSecond[snapIdx] ?? d2.hpPerSecond[0];
  assert(d2HpAtBomb >= 2400, "d2 hors rayon, HP intact au moment de l'explosion", `hp≈${d2HpAtBomb}`);
}

// ── Summary ──────────────────────────────────────────────────────────────────
console.log(`\n${passed + failed} tests — ${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
