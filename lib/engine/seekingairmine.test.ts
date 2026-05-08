/**
 * Tests : Seeking Air Mine (Mine chercheuse)
 *
 *   npx tsx lib/engine/seekingairmine.test.ts
 *
 * Rules:
 *  - triggerRadius 4, air only, instant damage, single-target
 *  - Picks air unit with highest current HP (tie-break: closest)
 *  - One target only, consumed after
 *
 * Setup: Air Defense at (5,25) gives air units a target.
 *        SAM at (22,25), size=1.
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

const AIR_DEF: DefensePlacement = {
  instanceId: "ad1", defenseId: "air-defense", level: 8, position: { x: 5, y: 25 },
};

// SAM Lv5: trapDamage=2800, triggerRadius=4
const SAM5: DefensePlacement = {
  instanceId: "sam1", defenseId: "seeking-air-mine", level: 5, position: { x: 22, y: 25 },
};

// SAM Lv3: trapDamage=2100
const SAM3: DefensePlacement = {
  instanceId: "sam1", defenseId: "seeking-air-mine", level: 3, position: { x: 22, y: 25 },
};

function troop(id: string, troopId: string, level: number, x: number, y: number): TroopDeployment {
  return { instanceId: id, troopId, level, dropPosition: { x, y } };
}

// Drop inside triggerRadius=4 of SAM at (22,25):
// euclidean({22,25}, {x+0.5, 25.5}) ≤ 4 → use x=24 → dist≈2.55 ✓
const INSIDE = { x: 24, y: 25 } as const;

// ── Test 1: Giant (sol) ne déclenche PAS ─────────────────────────────────────
console.log("\nTest 1: Giant (sol) ne déclenche pas la SAM");
{
  const r = simulateAttack(
    [troop("g1", "giant", 5, INSIDE.x, INSIDE.y)],
    [AIR_DEF, SAM5],
  );
  const sam = r.defenses["sam1"];
  assert(sam.destroyedAt === null, "SAM non déclenchée par un géant", `destroyedAt=${sam.destroyedAt}`);
}

// ── Test 2: Dragon déclenche ──────────────────────────────────────────────────
console.log("\nTest 2: Dragon déclenche la SAM");
{
  const r = simulateAttack(
    [troop("d1", "dragon", 5, INSIDE.x, INSIDE.y)],
    [AIR_DEF, SAM5],
  );
  const sam = r.defenses["sam1"];
  assert(sam.destroyedAt !== null, "SAM déclenchée par un dragon", `destroyedAt=${sam.destroyedAt}`);
}

// ── Test 3: Balloon déclenche ─────────────────────────────────────────────────
console.log("\nTest 3: Balloon déclenche la SAM");
{
  const r = simulateAttack(
    [troop("bl1", "balloon", 5, INSIDE.x, INSIDE.y)],
    [AIR_DEF, SAM5],
  );
  const sam = r.defenses["sam1"];
  assert(sam.destroyedAt !== null, "SAM déclenchée par un balloon", `destroyedAt=${sam.destroyedAt}`);
}

// ── Test 4: Dragon + Balloon → cible dragon (plus de HP) ─────────────────────
// Dragon Lv5 = 3940 HP, Balloon Lv5 = 390 HP → dragon targeted
console.log("\nTest 4: Dragon + Balloon → cible le plus de HP (dragon)");
{
  const r = simulateAttack(
    [
      troop("d1", "dragon",  5, INSIDE.x,     INSIDE.y),
      troop("b1", "balloon", 5, INSIDE.x + 1, INSIDE.y),
    ],
    [AIR_DEF, SAM5],
  );
  const sam  = r.defenses["sam1"];
  const d1   = r.troops["d1"];
  const b1   = r.troops["b1"];
  assert(sam.destroyedAt !== null, "SAM déclenchée");
  // Dragon should have been hit (hp reduced), balloon intact
  const d1LastHp = d1.hpPerSecond[1] ?? d1.hpPerSecond[d1.hpPerSecond.length - 1];
  const b1Hp0    = b1.hpPerSecond[0];
  const b1Hp1    = b1.hpPerSecond[1] ?? b1.hpPerSecond[b1.hpPerSecond.length - 1];
  assert(d1LastHp < 3940, "dragon a subi des dégâts (cible choisie)", `hp=${d1LastHp}`);
  // Balloon must not have been hit by the SAM at trigger time (air-def may hit it later)
  assert(sam.totalDamageDealt <= 2800, "un seul hit SAM (pas balloon)", `dmg=${sam.totalDamageDealt}`);
}

// ── Test 5: Deux dragons HP égaux → cible le plus proche ─────────────────────
console.log("\nTest 5: Deux dragons même HP → cible le plus proche");
{
  // d1 at (23,25): dist ≈ 1.58 — closer
  // d2 at (25,25): dist ≈ 3.54 — further
  // Both Lv5 → same HP; SAM should hit d1 (closer)
  const r = simulateAttack(
    [
      troop("d1", "dragon", 5, 23, 25),
      troop("d2", "dragon", 5, 25, 25),
    ],
    [AIR_DEF, SAM5],
  );
  const sam = r.defenses["sam1"];
  const d1  = r.troops["d1"];
  const d2  = r.troops["d2"];
  assert(sam.destroyedAt !== null, "SAM déclenchée");
  const d1Hp1 = d1.hpPerSecond[1] ?? d1.hpPerSecond[d1.hpPerSecond.length - 1];
  const d2Hp1 = d2.hpPerSecond[1] ?? d2.hpPerSecond[d2.hpPerSecond.length - 1];
  assert(d1Hp1 < 3940, "d1 (plus proche) touché", `hp=${d1Hp1}`);
  assert(d2Hp1 >= 3800, "d2 (plus loin) non touché par SAM", `hp=${d2Hp1}`);
}

// ── Test 6: Une seule cible touchée ──────────────────────────────────────────
console.log("\nTest 6: 3 unités aériennes dans rayon → une seule prend dégâts SAM");
{
  const r = simulateAttack(
    [
      troop("d1", "dragon", 5, 23, 25),
      troop("d2", "dragon", 5, 23, 24),
      troop("d3", "dragon", 5, 23, 26),
    ],
    [AIR_DEF, SAM5],
  );
  const sam = r.defenses["sam1"];
  assert(sam.destroyedAt !== null, "SAM déclenchée");
  // SAM damage = 2800, one dragon hit → totalDamageDealt = 2800
  assert(sam.totalDamageDealt === 2800, `une seule cible touchée (dmg=${sam.totalDamageDealt})`);
}

// ── Test 7: SAM consommée après déclenchement ─────────────────────────────────
console.log("\nTest 7: SAM consommée après déclenchement");
{
  const r = simulateAttack(
    [troop("d1", "dragon", 5, INSIDE.x, INSIDE.y)],
    [AIR_DEF, SAM5],
  );
  const sam = r.defenses["sam1"];
  assert(sam.destroyedAt !== null, "SAM consommée (destroyedAt renseigné)");
}

// ── Test 8: Dégâts exacts par niveau ─────────────────────────────────────────
// Electro-dragon Lv8 HP=6200, SAM Lv5 dmg=2800 → remaining=3400
console.log("\nTest 8: Dégâts exacts Lv5 (dmg=2800) sur electro-dragon Lv8 (hp=6200)");
{
  const r = simulateAttack(
    [troop("ed1", "electro-dragon", 8, INSIDE.x, INSIDE.y)],
    [AIR_DEF, SAM5],
  );
  const sam = r.defenses["sam1"];
  assert(sam.totalDamageDealt === 2800, `dégâts exacts 2800 (got ${sam.totalDamageDealt})`);
}

// ── Test 9: SAM ne touche jamais une troupe sol ──────────────────────────────
console.log("\nTest 9: Géant au sol non touché même s'il est dans le rayon");
{
  const r = simulateAttack(
    [
      troop("d1", "dragon", 5, INSIDE.x, INSIDE.y),
      troop("g1", "giant",  5, INSIDE.x, INSIDE.y),
    ],
    [AIR_DEF, SAM5],
  );
  const sam = r.defenses["sam1"];
  const d1  = r.troops["d1"];
  // SAM should have hit only the dragon
  assert(sam.totalDamageDealt === 2800, "dégâts uniquement sur la cible air (2800)", `dmg=${sam.totalDamageDealt}`);
  const d1Hp1 = d1.hpPerSecond[1] ?? d1.hpPerSecond[d1.hpPerSecond.length - 1];
  assert(d1Hp1 < 3940, "dragon touché par SAM, pas le géant");
}

// ── Test 10: Plusieurs unités air → une seule prend dégâts (redondant t6) ────
console.log("\nTest 10: Plusieurs dragons dans rayon → totalDamageDealt = 1× dmg");
{
  const r = simulateAttack(
    [
      troop("d1", "dragon", 5, 23, 25),
      troop("d2", "dragon", 5, 24, 25),
      troop("d3", "dragon", 5, 25, 25),
    ],
    [AIR_DEF, SAM5],
  );
  const sam = r.defenses["sam1"];
  assert(sam.totalDamageDealt === 2800, `exactement 1 cible (dmg=${sam.totalDamageDealt})`);
}

// ── Test 11: Dragon Lv1 meurt instantanément ─────────────────────────────────
// Dragon Lv1 HP=1900, SAM Lv3 dmg=2100 → dragon dies
console.log("\nTest 11: Dragon Lv1 (hp=1900) meurt instantanément face SAM Lv3 (dmg=2100)");
{
  const r = simulateAttack(
    [troop("d1", "dragon", 1, INSIDE.x, INSIDE.y)],
    [AIR_DEF, SAM3],
  );
  const d1 = r.troops["d1"];
  assert(d1.destroyedAt !== null && d1.destroyedAt <= 2, "dragon tué instantanément", `destroyedAt=${d1.destroyedAt}`);
}

// ── Test 12: Electro-dragon Lv8 survit ───────────────────────────────────────
// Electro-dragon Lv8 HP=6200, SAM Lv5 dmg=2800 → survives with 3400
console.log("\nTest 12: Electro-dragon Lv8 (hp=6200) survit à SAM Lv5 (dmg=2800)");
{
  const r = simulateAttack(
    [troop("ed1", "electro-dragon", 8, INSIDE.x, INSIDE.y)],
    [AIR_DEF, SAM5],
  );
  const ed  = r.troops["ed1"];
  const sam = r.defenses["sam1"];
  assert(sam.destroyedAt !== null, "SAM déclenchée");
  assert(ed.destroyedAt === null || (ed.destroyedAt ?? 0) > 3, "ED survit à la SAM", `destroyedAt=${ed.destroyedAt}`);
  assert(sam.totalDamageDealt === 2800, "dégâts exacts 2800");
}

// ── Summary ──────────────────────────────────────────────────────────────────
console.log(`\n${passed + failed} tests — ${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
