/**
 * Tests : Events Timeline
 *
 *   npx tsx lib/engine/events.test.ts
 *
 * Vérifie que le moteur émet les bons SimEvent dans result.events.
 */

import { simulateAttack } from "./calculator";
import type { SimEvent } from "./events";
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

function troop(id: string, troopId: string, level: number, x: number, y: number): TroopDeployment {
  return { instanceId: id, troopId, level, dropPosition: { x, y } };
}

// ── Fixtures ─────────────────────────────────────────────────────────────────

const CANNON: DefensePlacement = { instanceId: "c1", defenseId: "cannon", level: 10, position: { x: 5, y: 25 } };
const AIR_DEF: DefensePlacement = { instanceId: "ad1", defenseId: "air-defense", level: 8, position: { x: 5, y: 25 } };
const BOMB: DefensePlacement = { instanceId: "b1", defenseId: "bomb", level: 8, position: { x: 22, y: 25 } };
const SPRING: DefensePlacement = { instanceId: "sp1", defenseId: "spring-trap", level: 6, position: { x: 22, y: 25 } };
const SAM: DefensePlacement = { instanceId: "sam1", defenseId: "seeking-air-mine", level: 5, position: { x: 22, y: 25 } };
const TORNADO: DefensePlacement = { instanceId: "t1", defenseId: "tornado-trap", level: 3, position: { x: 22, y: 25 } };

// ── Test 1: events triés par temps ───────────────────────────────────────────
console.log("\nTest 1: events triés chronologiquement");
{
  const r = simulateAttack([troop("g1", "giant", 5, 30, 25)], [CANNON]);
  const evs = r.events;
  assert(evs.length > 0, "au moins un événement généré");
  let sorted = true;
  for (let i = 1; i < evs.length; i++) {
    if (evs[i].time < evs[i - 1].time) { sorted = false; break; }
  }
  assert(sorted, "tous les events sont triés par time croissant");
}

// ── Test 2: pushEvent fonctionne (DEFENSE_FIRE émis) ─────────────────────────
console.log("\nTest 2: DEFENSE_FIRE émis quand cannon tire");
{
  const r = simulateAttack([troop("g1", "giant", 5, 30, 25)], [CANNON]);
  const fires = r.events.filter((e) => e.type === "DEFENSE_FIRE");
  assert(fires.length > 0, "DEFENSE_FIRE émis", `count=${fires.length}`);
  assert(fires[0].sourceId === "c1", "sourceId = instanceId cannon");
  assert(fires[0].targetId === "g1", "targetId = giant");
  assert((fires[0].value ?? 0) > 0, "value = dégâts > 0", `value=${fires[0].value}`);
}

// ── Test 3: piège bomb génère TRAP_TRIGGER + TRAP_HIT ────────────────────────
console.log("\nTest 3: bomb génère TRAP_TRIGGER + TRAP_HIT");
{
  const r = simulateAttack([troop("g1", "giant", 5, 30, 25)], [CANNON, BOMB]);
  const triggers = r.events.filter((e) => e.type === "TRAP_TRIGGER" && e.sourceId === "b1");
  const hits     = r.events.filter((e) => e.type === "TRAP_HIT"     && e.sourceId === "b1");
  assert(triggers.length === 1, "un seul TRAP_TRIGGER pour la bombe", `count=${triggers.length}`);
  assert(hits.length >= 1, "au moins un TRAP_HIT", `count=${hits.length}`);
  assert((hits[0]?.value ?? 0) > 0, "TRAP_HIT value = dégâts > 0");
}

// ── Test 4: DEFENSE_DESTROYED émis quand bâtiment détruit ────────────────────
console.log("\nTest 4: DEFENSE_DESTROYED émis quand cannon détruit");
{
  // Use a weak cannon and many giants to ensure destruction
  const r = simulateAttack(
    [
      troop("g1", "giant", 5, 30, 25), troop("g2", "giant", 5, 28, 25),
      troop("g3", "giant", 5, 32, 25), troop("g4", "giant", 5, 29, 25),
    ],
    [{ instanceId: "c1", defenseId: "cannon", level: 1, position: { x: 25, y: 25 } }],
  );
  const destroyed = r.events.filter((e) => e.type === "DEFENSE_DESTROYED");
  assert(destroyed.length > 0, "DEFENSE_DESTROYED émis", `count=${destroyed.length}`);
  assert(destroyed[0].targetId === "c1", "targetId = cannon");
}

// ── Test 5: TROOP_DEATH émis quand troupe meurt ───────────────────────────────
console.log("\nTest 5: TROOP_DEATH émis quand troupe meurt");
{
  const r = simulateAttack(
    [troop("b1", "barbarian", 1, 10, 25)],  // weak barb, close cannon
    [{ instanceId: "c1", defenseId: "cannon", level: 10, position: { x: 8, y: 25 } }],
  );
  const deaths = r.events.filter((e) => e.type === "TROOP_DEATH");
  assert(deaths.length > 0, "TROOP_DEATH émis");
  assert(deaths[0].targetId === "b1", "targetId = barbarian");
  assert(deaths[0].sourceId === "c1", "sourceId = cannon qui a tué");
}

// ── Test 6: TORNADO_TRIGGER + TORNADO_TICK + TORNADO_END ─────────────────────
console.log("\nTest 6: tornado génère TRIGGER, TICK(s), END");
{
  const r = simulateAttack([troop("g1", "giant", 5, 23, 25)], [CANNON, TORNADO]);
  const trigger = r.events.filter((e) => e.type === "TORNADO_TRIGGER" && e.sourceId === "t1");
  const ticks   = r.events.filter((e) => e.type === "TORNADO_TICK"    && e.sourceId === "t1");
  const end     = r.events.filter((e) => e.type === "TORNADO_END"     && e.sourceId === "t1");
  assert(trigger.length === 1, "un TORNADO_TRIGGER");
  assert(ticks.length >= 1, `au moins un TORNADO_TICK (got ${ticks.length})`);
  assert(end.length === 1, "un TORNADO_END");
  // TORNADO_TICK value = dmg accumulé cette seconde
  assert((ticks[0]?.value ?? 0) > 0, "TORNADO_TICK value > 0 (dégâts)");
}

// ── Test 7: types cohérents — sourceId/targetId toujours strings ──────────────
console.log("\nTest 7: tous les events ont time number et type string");
{
  const r = simulateAttack([troop("g1", "giant", 5, 30, 25)], [CANNON]);
  let ok = true;
  for (const ev of r.events) {
    if (typeof ev.time   !== "number") { ok = false; break; }
    if (typeof ev.type   !== "string") { ok = false; break; }
    if (ev.sourceId !== undefined && typeof ev.sourceId !== "string") { ok = false; break; }
    if (ev.targetId !== undefined && typeof ev.targetId !== "string") { ok = false; break; }
  }
  assert(ok, "tous les events respectent le schema SimEvent");
}

// ── Test 8: SEEKING_AIR_MINE_HIT émis ────────────────────────────────────────
console.log("\nTest 8: SEEKING_AIR_MINE_HIT émis par la mine chercheuse");
{
  const r = simulateAttack([troop("d1", "dragon", 5, 24, 25)], [AIR_DEF, SAM]);
  const hits = r.events.filter((e) => e.type === "SEEKING_AIR_MINE_HIT" && e.sourceId === "sam1");
  assert(hits.length === 1, "un seul SEEKING_AIR_MINE_HIT", `count=${hits.length}`);
  assert(hits[0].value === 2800, `value = 2800 (dmg Lv5, got ${hits[0].value})`);
  assert(hits[0].targetId === "d1", "targetId = dragon");
}

// ── Test 9: SPRING_EJECT émis ─────────────────────────────────────────────────
console.log("\nTest 9: SPRING_EJECT émis par spring-trap");
{
  const r = simulateAttack([troop("g1", "giant", 5, 30, 25)], [CANNON, SPRING]);
  const ejects = r.events.filter((e) => e.type === "SPRING_EJECT" && e.sourceId === "sp1");
  assert(ejects.length === 1, "un SPRING_EJECT");
  assert(ejects[0].targetId === "g1", "targetId = giant");
}

// ── Test 10: events result est toujours un tableau ────────────────────────────
console.log("\nTest 10: result.events est toujours un tableau (même scénario vide)");
{
  // Minimal scenario: no troops at all (but that'd fail instanceId checks)
  // Use 1 troop but no defenses → sim terminates quickly, events may be empty
  const r = simulateAttack(
    [troop("g1", "giant", 1, 5, 5)],
    [],
  );
  assert(Array.isArray(r.events), "r.events est un tableau");
}

// ── Summary ───────────────────────────────────────────────────────────────────
console.log(`\n${passed + failed} tests — ${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
