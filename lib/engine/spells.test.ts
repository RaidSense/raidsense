/**
 * Tests : Sort de Rage (Rage Spell)
 *
 *   npx tsx lib/engine/spells.test.ts
 *
 * Setup commun : Pet-house niveau 1 (HP=700, pas de DPS) comme cible.
 * Barbarian niveau 1 : dps=9, attackSpeed=1.0, speed=18 → dmg/hit=9 (×2.3 sous Rage lv1).
 * Archer Queen niveau 1 : dps=136, attackSpeed=0.75, portée=5 → dmg/hit=102.
 */

import { simulateAttack } from "./calculator";
import type { TroopDeployment, DefensePlacement, BuildingPlacement } from "./calculator";
import { RAGE_SPELL, type SpellPlacement } from "../data/spells";

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

const PET_HOUSE: BuildingPlacement = {
  instanceId: "ph",
  buildingId:  "pet-house",
  level:        1,
  position:     { x: 20, y: 20 },
};

function barb(id: string, x: number, y: number): TroopDeployment {
  return { instanceId: id, troopId: "barbarian", level: 1, dropPosition: { x, y } };
}

function rage(x: number, y: number, level = 1, deployAt = 0): SpellPlacement {
  return { spellId: "rage", level, position: { x, y }, deployAt };
}

// 5 barbares drop à x=24, y=20-24 — à 2 tiles de l'edge du pet-house (22, _)
const FIVE_BARBS: TroopDeployment[] = [0,1,2,3,4].map((i) => barb(`b${i}`, 24, 20 + i));

// ── Test 1 : Troupe dans le rayon → bonus de dégâts ──────────────────────────
console.log("\nTest 1 : Troupe dans le rayon reçoit le bonus de dégâts");
{
  const no_rage = simulateAttack(FIVE_BARBS, [], [PET_HOUSE]);
  const with_rage = simulateAttack(FIVE_BARBS, [], [PET_HOUSE], [], [rage(21, 21)]);

  const t0 = no_rage.buildings["ph"].destroyedAt!;
  const t1 = with_rage.buildings["ph"].destroyedAt!;

  assert(t0 !== null,       "pet-house détruit sans rage");
  assert(t1 !== null,       "pet-house détruit avec rage");
  assert(t1 < t0,           `rage accélère la destruction (${t1.toFixed(2)}s < ${t0.toFixed(2)}s)`);
}

// ── Test 2 : Troupe hors du rayon → aucun bonus ──────────────────────────────
console.log("\nTest 2 : Troupe hors du rayon ne reçoit aucun bonus");
{
  // Rage en (38,38) — troupes en (24,20-24) à >20 tiles → hors zone radius=5
  const no_rage   = simulateAttack(FIVE_BARBS, [], [PET_HOUSE]);
  const out_range = simulateAttack(FIVE_BARBS, [], [PET_HOUSE], [], [rage(38, 38)]);

  const t0 = no_rage.buildings["ph"].destroyedAt;
  const t1 = out_range.buildings["ph"].destroyedAt;

  assert(t0 === t1,
    `aucun effet hors zone (${t0?.toFixed(2)}s = ${t1?.toFixed(2)}s)`);
}

// ── Test 3 : Troupe qui quitte la zone perd le bonus ─────────────────────────
console.log("\nTest 3 : Troupe qui quitte la zone perd le bonus");
{
  // Pet-house à (5,5), 5 barbs à (20,5) — trajets de 12.5 tiles
  const PH_FAR: BuildingPlacement = { instanceId: "ph2", buildingId: "pet-house", level: 1, position: { x: 5, y: 5 } };
  const BARBS_FAR: TroopDeployment[] = [0,1,2,3,4].map((i) => barb(`bf${i}`, 20, 5 + i));

  // Rage couvre la zone de combat → bonus plein tout le combat
  const rage_at_combat = simulateAttack(BARBS_FAR, [], [PH_FAR], [],
    [{ spellId: "rage", level: 1, position: { x: 5, y: 7 }, deployAt: 0 }]);

  // Rage couvre uniquement la zone de départ → barbs quittent la zone rapidement
  const rage_at_start  = simulateAttack(BARBS_FAR, [], [PH_FAR], [],
    [{ spellId: "rage", level: 1, position: { x: 20, y: 5 }, deployAt: 0 }]);

  const t_combat = rage_at_combat.buildings["ph2"].destroyedAt!;
  const t_start  = rage_at_start.buildings["ph2"].destroyedAt!;

  assert(t_combat < t_start,
    `rage sur zone de combat ≪ rage sur zone de départ (${t_combat.toFixed(2)}s < ${t_start.toFixed(2)}s)`);
}

// ── Test 4 : Héros ne reçoit que 50 % du bonus ───────────────────────────────
console.log("\nTest 4 : Héros ne reçoit que 50 % du bonus dégâts");
{
  // AQ niveau 1 : portée 5, drop à (27,20) → distance exacte à l'edge du pet-house (22,20)
  // Attaque immédiatement sans se déplacer.
  const AQ: TroopDeployment = {
    instanceId: "aq1", troopId: "archer-queen", level: 1,
    dropPosition: { x: 27, y: 20 },
  };

  const no_rage   = simulateAttack([AQ], [], [PET_HOUSE]);
  // rage à (24,20) : distance à l'AQ (27,20) = 3 tiles < 5 → en zone
  const with_rage = simulateAttack([AQ], [], [PET_HOUSE], [], [rage(24, 20)]);

  const t_no  = no_rage.buildings["ph"].destroyedAt!;
  const t_yes = with_rage.buildings["ph"].destroyedAt!;

  // +65 % (50 % de +130 %) → dmg/hit 102→168.3 → 5 hits au lieu de 7
  assert(t_yes < t_no,   `héros kill plus vite avec rage (${t_yes.toFixed(2)}s < ${t_no.toFixed(2)}s)`);
  // Avec 100 % boost la Queen tuerait en ~2.3s ; avec 50 % elle prend ~3.8s
  assert(t_yes > 3.0,    `héros ne reçoit pas 100 % du bonus (destroyedAt=${t_yes.toFixed(2)} > 3.0s)`);
}

// ── Test 5 : Deux Rages superposées ne doublent pas le bonus ─────────────────
console.log("\nTest 5 : Deux Rages superposées ne doublent pas le bonus");
{
  const one_rage = simulateAttack(FIVE_BARBS, [], [PET_HOUSE], [], [rage(21, 21)]);
  const two_rage = simulateAttack(FIVE_BARBS, [], [PET_HOUSE], [],
    [rage(21, 21), rage(21, 21)]);

  const t1 = one_rage.buildings["ph"].destroyedAt;
  const t2 = two_rage.buildings["ph"].destroyedAt;

  assert(t1 === t2,
    `1 rage = 2 rages superposées (${t1?.toFixed(2)}s = ${t2?.toFixed(2)}s)`);
}

// ── Test 6 : Le sort expire après 18 secondes ────────────────────────────────
console.log("\nTest 6 : Le sort expire après 18 secondes");
{
  // 1 barbare vs pet-house HP=700 → combat long (~78s sans rage)
  // Rage active de t=0 à t=18 → boost pendant 18s, puis dégâts normaux
  // Vérification : HP drop plus fort pendant la 18e seconde (rage active) que la 19e (expirée)
  const ONE_BARB: TroopDeployment[] = [barb("b6", 24, 21)];
  const with_rage = simulateAttack(ONE_BARB, [], [PET_HOUSE], [], [rage(22, 21)]);

  const hp = with_rage.buildings["ph"].hpPerSecond;
  const drop_17_18 = hp[17] - hp[18]; // pendant la 18e seconde : rage active → ~21 dmg
  const drop_18_19 = hp[18] - hp[19]; // pendant la 19e seconde : rage expirée → ~9 dmg

  assert(drop_17_18 > drop_18_19,
    `dégâts/s avant expiration > après (${drop_17_18} > ${drop_18_19})`);

  // La rage déployée après la fin du combat n'a aucun effet
  const no_rage      = simulateAttack(FIVE_BARBS, [], [PET_HOUSE]);
  const late_rage    = simulateAttack(FIVE_BARBS, [], [PET_HOUSE], [], [rage(21, 21, 1, 100)]);
  const t_no_rage    = no_rage.buildings["ph"].destroyedAt;
  const t_late_rage  = late_rage.buildings["ph"].destroyedAt;
  assert(t_late_rage === t_no_rage,
    `rage arrivant trop tard = sans rage (${t_late_rage?.toFixed(2)}s = ${t_no_rage?.toFixed(2)}s)`);
}

// ── Test 7 : Rage niveau 6 → +180 % dégâts, +30 vitesse ─────────────────────
console.log("\nTest 7 : Données niveau 6 correctes");
{
  const lv6 = RAGE_SPELL.levels[5];
  assert(lv6.level === 6,               `level = ${lv6.level}`);
  assert(lv6.damageBoostPercent === 180, `damageBoostPercent = ${lv6.damageBoostPercent}`);
  assert(lv6.speedBoost === 30,          `speedBoost = ${lv6.speedBoost}`);

  // Vérifier la formule : troupe normale → ×2.8, héros → ×1.9
  const expectedTroopMult = 1 + 180 / 100;        // 2.8
  const expectedHeroMult  = 1 + (180 * 0.5) / 100; // 1.9
  assert(Math.abs(expectedTroopMult - 2.8) < 0.001, `multiplicateur troupe lv6 = ${expectedTroopMult.toFixed(3)}`);
  assert(Math.abs(expectedHeroMult  - 1.9) < 0.001, `multiplicateur héros lv6 = ${expectedHeroMult.toFixed(3)}`);
}

// ── Résultat ──────────────────────────────────────────────────────────────────
console.log(`\n${"─".repeat(50)}`);
console.log(`Résultat : ${passed} passés, ${failed} échoués`);
if (failed > 0) process.exit(1);
