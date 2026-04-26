/**
 * Scénario de test : 5× Giant Lv5 vs 1× Cannon Lv10 sur une grille 50×50.
 *
 * Exécution :
 *   npx tsx lib/engine/calculator.test.ts
 */

import { simulateAttack } from "./calculator";
import type { TroopDeployment, DefensePlacement } from "./calculator";

// ---------------------------------------------------------------------------
// Scenario
// ---------------------------------------------------------------------------

// Giant Lv5 : 620 HP, 31 DPS, speed 12 → 0.75 tuile/s, portée d'attaque 1 tuile
// Cannon Lv10 : 930 HP, 128 DPS, portée 9 tuiles
//
// Les Giants sont droppés à ~5 tuiles du Cannon.
// Tous sont dans la portée du Cannon dès t=0 : le Cannon ouvre le feu immédiatement.
// Les Giants atteignent leur portée d'attaque (~1 tuile) à t≈5.3s.
// → 1 Giant tombe avant de pouvoir attaquer ; les 4 autres ripostent ensemble.

const CANNON_POS = { x: 25, y: 25 };
const GIANT_LEVEL = 5;
const GIANT_MAX_HP = 620; // Giant Lv5

const troops: TroopDeployment[] = [
  { instanceId: "g1", troopId: "giant", level: GIANT_LEVEL, dropPosition: { x: 30, y: 25 } }, // est    d=5
  { instanceId: "g2", troopId: "giant", level: GIANT_LEVEL, dropPosition: { x: 20, y: 25 } }, // ouest  d=5
  { instanceId: "g3", troopId: "giant", level: GIANT_LEVEL, dropPosition: { x: 25, y: 30 } }, // sud    d=5
  { instanceId: "g4", troopId: "giant", level: GIANT_LEVEL, dropPosition: { x: 25, y: 20 } }, // nord   d=5
  { instanceId: "g5", troopId: "giant", level: GIANT_LEVEL, dropPosition: { x: 29, y: 29 } }, // SE     d≈5.66
];

const defenses: DefensePlacement[] = [
  { instanceId: "cannon_1", defenseId: "cannon", level: 10, position: CANNON_POS },
];

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

const result = simulateAttack(troops, defenses);

// ---------------------------------------------------------------------------
// Display helpers
// ---------------------------------------------------------------------------

const LINE = "═".repeat(65);
const SEP  = "─".repeat(65);

function hpBar(hp: number, maxHp: number, width = 20): string {
  const filled = hp > 0 ? Math.max(1, Math.round((hp / maxHp) * width)) : 0;
  return "[" + "█".repeat(filled) + "░".repeat(width - filled) + "]";
}

function fmtHp(hp: number, alive: boolean): string {
  if (!alive) return " DEAD ".padStart(6);
  return String(hp).padStart(6);
}

function fmtTime(t: number | null): string {
  if (t === null) return "—";
  return `${t.toFixed(1)}s`;
}

// ---------------------------------------------------------------------------
// Header
// ---------------------------------------------------------------------------

console.log("\n" + LINE);
console.log("  RaidSense  —  Rapport de simulation");
console.log(LINE);
console.log(`  Scénario : 5× Giant Lv${GIANT_LEVEL} vs 1× Cannon Lv10`);
console.log(`  Grille   : 50×50  |  Cannon placé en (${CANNON_POS.x}, ${CANNON_POS.y})`);
console.log(`  Drops    : ~5 tuiles du Cannon (portée Cannon : 9 tuiles)`);
console.log(`  Durée    : ${result.durationSeconds}s`);
console.log(LINE);

// ---------------------------------------------------------------------------
// HP table
// ---------------------------------------------------------------------------

const ids = troops.map((t) => t.instanceId);
const labels = ["G1", "G2", "G3", "G4", "G5"];
const duration = result.durationSeconds;
const maxT = Math.floor(duration);

console.log("\n  HP des Giants par seconde\n");

// Column header
const header = "  t   " + labels.map((l) => l.padStart(6)).join("  ");
console.log(header);
console.log("  " + SEP.slice(0, header.length - 2));

for (let t = 0; t <= maxT; t++) {
  const cells = ids.map((id) => {
    const tr = result.troops[id];
    const hp = tr.hpPerSecond[t] ?? 0;
    const alive = tr.destroyedAt === null || tr.destroyedAt > t;
    return fmtHp(hp, alive);
  });
  const tLabel = `${t}s`.padStart(4);
  console.log(`  ${tLabel}  ${cells.join("  ")}`);
}

// ---------------------------------------------------------------------------
// Defense results
// ---------------------------------------------------------------------------

console.log("\n" + SEP);
console.log("  Résultats — Défenses\n");

const cannon = result.defenses["cannon_1"];
if (cannon.destroyedAt !== null) {
  console.log(`  Cannon Lv10  →  détruit à t = ${fmtTime(cannon.destroyedAt)}`);
} else {
  console.log(`  Cannon Lv10  →  survit (HP restants non nuls)`);
}
console.log(`  Dégâts infligés aux troupes : ${cannon.totalDamageDealt.toLocaleString()} HP`);

// ---------------------------------------------------------------------------
// Troop results
// ---------------------------------------------------------------------------

console.log("\n" + SEP);
console.log("  Résultats — Giants\n");

const survivors = ids.filter((id) => result.troops[id].destroyedAt === null);
const casualties = ids.filter((id) => result.troops[id].destroyedAt !== null);

console.log(`  Survivants : ${survivors.length} / ${ids.length}`);
for (const id of survivors) {
  const tr = result.troops[id];
  const finalHp = tr.hpPerSecond[tr.hpPerSecond.length - 1] ?? 0;
  const label = labels[ids.indexOf(id)];
  const bar = hpBar(finalHp, GIANT_MAX_HP);
  console.log(`    ${label}  ${String(finalHp).padStart(4)} HP  ${bar}`);
}

if (casualties.length > 0) {
  console.log(`\n  Eliminés : ${casualties.length} / ${ids.length}`);
  for (const id of casualties) {
    const label = labels[ids.indexOf(id)];
    const t = result.troops[id].destroyedAt;
    console.log(`    ${label}  →  t = ${fmtTime(t)}`);
  }
}

console.log("\n" + LINE + "\n");
