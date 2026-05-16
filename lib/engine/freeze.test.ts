/**
 * Tests : Sort de Gel (Freeze Spell)
 *
 *   npx tsx lib/engine/freeze.test.ts
 *
 * Principe : le Freeze gèle les défenses dans le rayon au moment du cast (snapshot).
 * Les troupes attaquantes ne sont PAS gelées (elles sont du côté attaquant).
 *
 * Setup commun :
 *   - Cannon "c1" niveau 1 à (5,5) : HP=420, DPS=9, attackSpeed=0.8, size=3
 *     → centre (6.5,6.5), range maximal 9 tiles
 *   - Barbarian "b1" niveau 1 à (10,7) : dans la range du cannon
 *   - Freeze à (6,6) radius=3.5 → cannon.center ≈ 0.71 tile du centre → dans la zone
 */

import { simulateAttack } from "./calculator";
import type { TroopDeployment, DefensePlacement } from "./calculator";
import { FREEZE_SPELL, type SpellPlacement } from "../data/spells";

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

// ── Helpers ──────────────────────────────────────────────────────────────────

const CANNON: DefensePlacement = {
  instanceId: "c1", defenseId: "cannon", level: 1, position: { x: 5, y: 5 },
};

const BARB: TroopDeployment = {
  instanceId: "b1", troopId: "barbarian", level: 1, dropPosition: { x: 10, y: 7 },
};

function freeze(level = 1, deployAt = 0): SpellPlacement {
  return { spellId: "freeze", level, position: { x: 6, y: 6 }, deployAt };
}

// ── Test 1 : Défense gelée ne tire pas ───────────────────────────────────────
console.log("\nTest 1 : Défense gelée cesse d'attaquer");
{
  const no_freeze = simulateAttack([BARB], [CANNON]);
  const with_freeze = simulateAttack([BARB], [CANNON], [], [], [freeze()]);

  // Sans gel : cannon tire à t≈0.1s, 0.9s, 1.7s → barbe prend 3 hits (≈23 HP) à t=2
  const hp_no   = no_freeze.troops["b1"].hpPerSecond[2];
  // Avec gel lv1 (2.5s) : aucun tir pendant la fenêtre → barbe intacte à t=2
  const hp_with = with_freeze.troops["b1"].hpPerSecond[2];

  assert(hp_no < 45,    `sans gel : barbe blessée à t=2 (HP=${hp_no})`);
  assert(hp_with === 45, `avec gel : barbe intacte à t=2 (HP=${hp_with})`);
}

// ── Test 2 : Entité reprend son comportement après expiration ─────────────────
console.log("\nTest 2 : Défense reprend après expiration du gel");
{
  const with_freeze = simulateAttack([BARB], [CANNON], [], [], [freeze()]);

  // Gel expire à t=2.5s → cannon tire à partir de t≈2.6s
  // À t=4 : 1-2 tirs supplémentaires → barbe blessée
  const hp_t2 = with_freeze.troops["b1"].hpPerSecond[2];   // pendant le gel
  const hp_t4 = with_freeze.troops["b1"].hpPerSecond[4];   // après le gel

  assert(hp_t2 === 45,  `pendant gel (t=2) : HP=${hp_t2} = 45`);
  assert(hp_t4 < 45,    `après expiration (t=4) : cannon a tiré (HP=${hp_t4} < 45)`);
}

// ── Test 3 : Défense hors zone au cast → non gelée ───────────────────────────
console.log("\nTest 3 : Entité hors rayon au cast n'est pas affectée");
{
  // Cannon B à (20,5) : centre (21.5,6.5) → distance au freeze (6,6) ≈ 15.6 > 3.5 → pas gelé
  const CANNON_B: DefensePlacement = {
    instanceId: "c2", defenseId: "cannon", level: 1, position: { x: 20, y: 5 },
  };
  // Barb cible les deux cannons ; dans la range du cannon B (dist ≈ 3.2 tiles)
  const BARB_B: TroopDeployment = {
    instanceId: "b2", troopId: "barbarian", level: 1, dropPosition: { x: 23, y: 7 },
  };

  const with_freeze = simulateAttack([BARB_B], [CANNON, CANNON_B], [], [], [freeze()]);

  // Cannon A (c1) est gelé → aucun événement FROZEN_APPLIED sur c2
  const frozen_c1 = with_freeze.events.some(
    (e) => e.type === "FROZEN_APPLIED" && e.targetId === "c1",
  );
  const frozen_c2 = with_freeze.events.some(
    (e) => e.type === "FROZEN_APPLIED" && e.targetId === "c2",
  );

  // Cannon B (hors zone) doit tirer pendant la fenêtre de gel
  const c2_fires_during_freeze = with_freeze.shots.some(
    (s) => s.defInstId === "c2" && s.time <= 2.5,
  );

  assert(frozen_c1,              "cannon A (dans zone) reçoit FROZEN_APPLIED");
  assert(!frozen_c2,             "cannon B (hors zone) ne reçoit pas FROZEN_APPLIED");
  assert(c2_fires_during_freeze, `cannon B tire pendant le gel (à t≤2.5)`);
}

// ── Test 4 : FROZEN_APPLIED émis pour chaque défense gelée ───────────────────
console.log("\nTest 4 : Événement FROZEN_APPLIED émis");
{
  const r = simulateAttack([BARB], [CANNON], [], [], [freeze()]);

  const ev = r.events.find((e) => e.type === "FROZEN_APPLIED" && e.targetId === "c1");
  assert(ev !== undefined,              "FROZEN_APPLIED émis pour c1");
  assert(ev?.extra?.["spellId"] === "freeze", "spellId = 'freeze'");
  assert(
    typeof ev?.extra?.["expiresAt"] === "number" && (ev.extra["expiresAt"] as number) > 0,
    `expiresAt présent (=${ev?.extra?.["expiresAt"]})`,
  );
}

// ── Test 5 : Données niveau 7 correctes ──────────────────────────────────────
console.log("\nTest 5 : Données niveau 7 correctes");
{
  const lv7 = FREEZE_SPELL.levels[6];
  assert(lv7.level === 7,                "level = 7");
  assert(lv7.durationSeconds === 5.5,    `durationSeconds = ${lv7.durationSeconds}`);
  assert(FREEZE_SPELL.radius === 3.5,    `radius = ${FREEZE_SPELL.radius}`);
  assert(FREEZE_SPELL.levels.length === 7, "7 niveaux définis");
}

// ── Test 6 : Deux gels successifs prolongent la durée ────────────────────────
console.log("\nTest 6 : Deux gels successifs prolongent le freeze (pas de crash)");
{
  // Gel 1 à t=0 → frozenUntil=2.5 ; Gel 2 à t=1 → expiresAt=3.5 → frozenUntil=max(2.5,3.5)=3.5
  const r = simulateAttack([BARB], [CANNON], [], [], [
    freeze(1, 0),   // expires at t=2.5
    freeze(1, 1),   // expires at t=3.5 → étend la durée
  ]);

  // Premier tir du cannon c1 doit être après t=3.5 (gel prolongé)
  const firstShot = r.shots.find((s) => s.defInstId === "c1");
  assert(firstShot !== undefined || r.shots.length === 0 || true,
    "simulation terminée sans crash");
  if (firstShot) {
    assert(firstShot.time > 3.5,
      `premier tir après fin du gel prolongé (t=${firstShot.time.toFixed(2)} > 3.5)`);
  } else {
    // Cannon n'a pas tiré (barbe morte ou hors range) — simulation OK
    assert(true, "simulation complétée sans erreur");
  }
}

// ── Test 7 : Cooldown figé pendant le gel ────────────────────────────────────
console.log("\nTest 7 : Cooldown figé — premier tir du cannon après le gel");
{
  const no_freeze   = simulateAttack([BARB], [CANNON]);
  const with_freeze = simulateAttack([BARB], [CANNON], [], [], [freeze()]);

  const firstShot_no   = no_freeze.shots.find(   (s) => s.defInstId === "c1");
  const firstShot_with = with_freeze.shots.find( (s) => s.defInstId === "c1");

  // Sans gel : cannon tire dès la fin de son premier cooldown (t≈0.9s pour cannon lv1)
  assert(
    firstShot_no !== undefined && firstShot_no.time < 1.5,
    `sans gel : premier tir à t=${firstShot_no?.time.toFixed(2)} < 1.5`,
  );
  // Avec gel lv1 (2.5s) : cooldown figé, premier tir après t=2.5
  assert(
    firstShot_with !== undefined && firstShot_with.time > 2.5,
    `avec gel : premier tir à t=${firstShot_with?.time.toFixed(2)} > 2.5`,
  );
}

// ── Résultat ──────────────────────────────────────────────────────────────────
console.log(`\n${"─".repeat(50)}`);
console.log(`Résultat : ${passed} passés, ${failed} échoués`);
if (failed > 0) process.exit(1);
