/**
 * Tests : Reine des Archers (Archer Queen)
 *
 *   npx tsx lib/engine/archerqueen.test.ts
 *
 * Couvre :
 *   - Vérification des stats par niveau (dps, hp)
 *   - Portée supérieure aux troupes mêlée
 *   - Niveau max HDV15 = 90
 *   - Comportement isHero / maxCount
 *   - Intégration moteur : la Reine attaque et détruit une défense
 */

import { getHeroById, getHeroLevel } from "../data/heroes";
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

// ── Données de référence ─────────────────────────────────────────────────────

const queen = getHeroById("archer-queen");

// ── Test 1 : données chargées ────────────────────────────────────────────────
console.log("\nTest 1: Reine des Archers chargée depuis troops.ts");
{
  assert(queen !== undefined, "archer-queen existe dans TROOPS");
  assert(queen?.name === "Archer Queen", `name = "Archer Queen" (got "${queen?.name}")`);
  assert(queen?.isHero === true, "isHero = true");
  assert(queen?.maxCount === 1, `maxCount = 1 (got ${queen?.maxCount})`);
  assert(queen?.housingSpace === 0, `housingSpace = 0 — heroes ne consomment pas d'espace (got ${queen?.housingSpace})`);
  assert(queen?.attackSpeed === 0.75, `attackSpeed = 0.75s (got ${queen?.attackSpeed})`);
  assert(queen?.movementSpeed === 24, `movementSpeed = 24 (got ${queen?.movementSpeed})`);
  assert(queen?.attackType === "Ground & Air", `attackType = "Ground & Air" (got "${queen?.attackType}")`);
}

// ── Test 2 : stats niveau 90 ─────────────────────────────────────────────────
console.log("\nTest 2: Stats niveau 90 — DPS=748, HP=3096, régénération=385min");
{
  const lv90 = getHeroLevel("archer-queen", 90);
  assert(lv90 !== undefined, "niveau 90 existe");
  assert(lv90?.dps === 748, `dps lv90 = 748 (got ${lv90?.dps})`);
  assert(lv90?.hp  === 3096, `hp lv90 = 3096 (got ${lv90?.hp})`);
  assert(lv90?.townHallRequired === 15, `townHallRequired lv90 = 15 (got ${lv90?.townHallRequired})`);
  assert(lv90?.regenTimeMins === 385, `regenTimeMins lv90 = 385 (got ${lv90?.regenTimeMins})`);
  assert(lv90?.heroHallRequired === 9, `heroHallRequired lv90 = 9 (got ${lv90?.heroHallRequired})`);
}

// ── Test 3 : stats niveau 1 ──────────────────────────────────────────────────
console.log("\nTest 3: Stats niveau 1 — DPS=136, HP=580, HDV requis=8");
{
  const lv1 = getHeroLevel("archer-queen", 1);
  assert(lv1?.dps === 136, `dps lv1 = 136 (got ${lv1?.dps})`);
  assert(lv1?.hp  === 580,  `hp lv1 = 580 (got ${lv1?.hp})`);
  assert(lv1?.townHallRequired === 8, `townHallRequired lv1 = 8 (got ${lv1?.townHallRequired})`);
}

// ── Test 4 : niveau max HDV15 = 90 ───────────────────────────────────────────
console.log("\nTest 4: Niveau max accessible HDV15 = 90");
{
  const levels = queen?.levels ?? [];
  const th15Levels = levels.filter(l => l.townHallRequired <= 15);
  const maxLv = Math.max(...th15Levels.map(l => l.level));
  assert(maxLv === 90, `niveau max HDV15 = 90 (got ${maxLv})`);

  // Aucun niveau ne dépasse TH15 dans les données actuelles
  const th16Levels = levels.filter(l => l.townHallRequired > 15);
  assert(th16Levels.length === 0, `aucun niveau HDV16+ dans les données (count=${th16Levels.length})`);
}

// ── Test 5 : portée d'attaque supérieure aux troupes mêlée ───────────────────
console.log("\nTest 5: Portée — Reine (5 tiles) détruit sans marcher, Barbare (0.4) doit s'approcher");
{
  // Reine à exactement 5 tuiles du Cannon → elle est déjà dans sa portée d'attaque,
  // elle commence à tirer dès t=0 sans se déplacer.
  // Barbare à même distance → doit marcher ~4.6 tuiles avant de pouvoir frapper.
  // On compare le temps de destruction : la Reine doit être significativement plus rapide.
  const cannon: DefensePlacement[] = [
    { instanceId: "c1", defenseId: "cannon", level: 1, position: { x: 10, y: 22 } },
  ];

  // Queen lv10 : 169 DPS depuis 5 tuiles (cannon center à x=10.5, queen drop à x=16 → dist=5.5)
  const rQueen = simulateAttack(
    [{ instanceId: "q1", troopId: "archer-queen", level: 10, dropPosition: { x: 16, y: 22 } }],
    cannon, [],
  );
  // Giant lv5 (31 DPS, portée 1 tuile) depuis la même position — doit marcher longtemps
  const rGiant = simulateAttack(
    [{ instanceId: "gi1", troopId: "giant", level: 5, dropPosition: { x: 16, y: 22 } }],
    cannon, [],
  );

  const queenDestroy = rQueen.events.find(e => e.type === "DEFENSE_DESTROYED")?.time ?? Infinity;
  const giantDestroy = rGiant.events.find(e => e.type === "DEFENSE_DESTROYED")?.time ?? Infinity;

  assert(isFinite(queenDestroy), `Reine détruit le cannon (t=${queenDestroy?.toFixed(2)}s)`);
  assert(isFinite(giantDestroy), `Giant détruit le cannon (t=${giantDestroy?.toFixed(2)}s)`);
  assert(queenDestroy < giantDestroy,
    `Reine (${queenDestroy?.toFixed(1)}s) plus rapide que Giant (${giantDestroy?.toFixed(1)}s) grâce à la portée et au DPS`);

  // La Reine ne doit presque pas se déplacer (elle est déjà à portée)
  const queenPos0 = rQueen.troops["q1"]?.positionPerSecond[0];
  const queenPos1 = rQueen.troops["q1"]?.positionPerSecond[1];
  const queenMoved = queenPos0 && queenPos1
    ? Math.hypot(queenPos1.x - queenPos0.x, queenPos1.y - queenPos0.y)
    : Infinity;
  assert(queenMoved < 2.0,
    `Reine peu déplacée après 1s (${queenMoved.toFixed(2)} tuiles) — déjà à portée`);
}

// ── Test 6 : intégration moteur — Reine lv90 détruit une défense ─────────────
console.log("\nTest 6: Intégration — Reine lv90 détruit un Cannon lv10");
{
  const troops: TroopDeployment[] = [
    { instanceId: "q90", troopId: "archer-queen", level: 90, dropPosition: { x: 25, y: 22 } },
  ];
  const defenses: DefensePlacement[] = [
    { instanceId: "c1", defenseId: "cannon", level: 10, position: { x: 20, y: 22 } },
  ];

  const result = simulateAttack(troops, defenses, []);

  assert(result.events.some(e => e.type === "DEFENSE_DESTROYED" && e.targetId === "c1"),
    "Reine lv90 détruit la défense (confirme qu'elle a bien tiré)");
  assert(result.events.filter(e => e.type === "DEFENSE_DESTROYED" && e.targetId === "c1").length === 1,
    "Cannon lv10 détruit une seule fois par la Reine lv90");

  const queenSurvived = result.troops["q90"]?.destroyedAt === null;
  const destroyTime   = result.events.find(e => e.type === "DEFENSE_DESTROYED")?.time;
  assert(destroyTime !== undefined && destroyTime < 10,
    `Cannon détruit rapidement (${destroyTime?.toFixed(2)}s) — DPS 748 cohérent`);
}

// ── Test 7 : tous les niveaux sont présents ───────────────────────────────────
console.log("\nTest 7: 90 niveaux présents, séquence continue de 1 à 90");
{
  const levels = queen?.levels ?? [];
  assert(levels.length === 90, `90 niveaux définis (got ${levels.length})`);

  const nums = levels.map(l => l.level);
  const allPresent = Array.from({ length: 90 }, (_, i) => i + 1).every(n => nums.includes(n));
  assert(allPresent, "niveaux 1 à 90 tous présents");

  // HP et DPS strictement croissants
  const hpAsc  = levels.every((l, i) => i === 0 || l.hp  >= levels[i - 1].hp);
  const dpsAsc = levels.every((l, i) => i === 0 || l.dps >= levels[i - 1].dps);
  assert(hpAsc,  "HP strictement non-décroissants niveau par niveau");
  assert(dpsAsc, "DPS strictement non-décroissants niveau par niveau");
}

// ── Summary ───────────────────────────────────────────────────────────────────
console.log(`\n${passed + failed} tests — ${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
