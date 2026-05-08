/**
 * Tests : Giant Bomb (Bombe géante)
 *
 *   npx tsx lib/engine/giantbomb.test.ts
 *
 * Rules:
 *  - triggerRadius 3, ground only, instant explosion (triggerDelay=0)
 *  - trapDamage applied to all ground troops within explosionRadius
 *  - Air units never trigger and never take damage
 *  - Consumed after first explosion (single-use)
 *
 * Setup: Cannon at (5, 25) draws troops east → west.
 *        Giant-bomb at (20, 24) (size=2) is crossed on the way.
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

// ── Helpers ──────────────────────────────────────────────────────────────────

const CANNON: DefensePlacement = {
  instanceId: "c1",
  defenseId:  "cannon",
  level:      10,
  position:   { x: 5, y: 25 },
};

// Giant-bomb level 9: trapDamage=425, explosionRadius=4, triggerRadius=3
const GB: DefensePlacement = {
  instanceId: "gb1",
  defenseId:  "giant-bomb",
  level:      9,
  position:   { x: 20, y: 24 },
};

function troop(id: string, troopId: string, level: number, x: number, y: number): TroopDeployment {
  return { instanceId: id, troopId, level, dropPosition: { x, y } };
}

// ── Test 1: Dragon (air) ne déclenche pas la bombe ────────────────────────────
console.log("\nTest 1: Dragon (air) ne déclenche pas la bombe géante");
{
  const r = simulateAttack(
    [troop("d1", "dragon", 5, 35, 25)],
    [CANNON, GB],
  );
  const gb = r.defenses["gb1"];
  // Dragon is air → targetsGroundOnly=true → trap never triggered
  assert(gb.destroyedAt === null, "giant-bomb non consommée (dragon aérien)", `destroyedAt=${gb.destroyedAt}`);
}

// ── Test 2: Giant (sol) déclenche la bombe ────────────────────────────────────
console.log("\nTest 2: Giant (sol) déclenche la bombe géante");
{
  const r = simulateAttack(
    [troop("g1", "giant", 5, 35, 25)],
    [CANNON, GB],
  );
  const gb = r.defenses["gb1"];
  assert(gb.destroyedAt !== null, "giant-bomb déclenchée par le géant", `destroyedAt=${gb.destroyedAt}`);
}

// ── Test 3: Plusieurs troupes sol dans le rayon prennent les dégâts ───────────
console.log("\nTest 3: Plusieurs géants dans le rayon d'explosion prennent les dégâts");
{
  // Three giants close together — all within explosionRadius=4 of bomb at (20,24)
  const r = simulateAttack(
    [
      troop("g1", "giant", 5, 35, 25),  // leads the group
      troop("g2", "giant", 5, 36, 25),
      troop("g3", "giant", 5, 37, 25),
    ],
    [CANNON, GB],
  );
  const gb = r.defenses["gb1"];
  const g1 = r.troops["g1"];
  const g2 = r.troops["g2"];
  const g3 = r.troops["g3"];
  // Bomb should fire once; at least 2 giants should be damaged (closer ones hit)
  assert(gb.destroyedAt !== null, "bombe déclenchée");
  // g1 nearest — should be hit (425 dmg vs 620 hp → survive but heavily damaged, or die)
  // All three are close together so likely all hit
  const hitCount = [g1, g2, g3].filter((t) =>
    t.destroyedAt !== null || (t.hpPerSecond.find((hp) => hp < 620) !== undefined)
  ).length;
  assert(hitCount >= 2, `au moins 2 géants endommagés/tués (got ${hitCount})`);
}

// ── Test 4: Troupe sol HORS rayon explosion ne prend pas de dégâts ────────────
console.log("\nTest 4: Troupe sol hors rayon d'explosion non touchée");
{
  // Bomb at (20, 24), explosionRadius=4. A giant starting far away (35, 25) triggers
  // the bomb when it enters triggerRadius=3 of the bomb corner (20, 24).
  // A second giant dropped very far (50, 25) hasn't moved close enough at explosion time.
  const r = simulateAttack(
    [
      troop("g1", "giant", 5, 35, 25),  // triggers the bomb
      troop("g2", "giant", 5, 50, 25),  // still far away when bomb explodes
    ],
    [CANNON, GB],
  );
  const gb = r.defenses["gb1"];
  const g2 = r.troops["g2"];
  assert(gb.destroyedAt !== null, "bombe déclenchée par g1");
  // g2 is far from bomb when it explodes → should NOT be at 0 hp at bomb trigger time
  // g2's hp at second of explosion should equal max hp (620 for Giant Lv5)
  const bombTime = gb.destroyedAt!;
  const snapIdx  = Math.floor(bombTime);
  const g2HpAtBomb = g2.hpPerSecond[snapIdx] ?? g2.hpPerSecond[0];
  assert(g2HpAtBomb > 200, "g2 loin de la bombe, HP non réduit à 0 par l'explosion", `hp≈${g2HpAtBomb}`);
}

// ── Test 5: Bombe consommée après explosion ───────────────────────────────────
console.log("\nTest 5: Bombe consommée après explosion");
{
  const r = simulateAttack(
    [troop("g1", "giant", 5, 35, 25)],
    [CANNON, GB],
  );
  const gb = r.defenses["gb1"];
  assert(gb.destroyedAt !== null, "bombe consommée (destroyedAt renseigné)", `destroyedAt=${gb.destroyedAt}`);
}

// ── Test 6: Ne peut exploser qu'une seule fois ────────────────────────────────
console.log("\nTest 6: La bombe ne peut exploser qu'une seule fois");
{
  // Two giants — both pass through trap zone, only first triggers
  const r = simulateAttack(
    [
      troop("g1", "giant", 5, 35, 25),   // closer → triggers
      troop("g2", "giant", 5, 40, 25),   // arrives after trap is consumed
    ],
    [CANNON, GB],
  );
  const gb  = r.defenses["gb1"];
  const g1  = r.troops["g1"];
  const g2  = r.troops["g2"];
  assert(gb.destroyedAt !== null, "bombe déclenchée (g1)");
  // g2 should take damage only from the cannon, not an instant 425-dmg hit
  // We verify by checking g2's hp at bomb trigger time is still close to max
  const bombTime   = gb.destroyedAt!;
  const snapIdx    = Math.floor(bombTime);
  const g2HpAtBomb = g2.hpPerSecond[snapIdx] ?? g2.hpPerSecond[0];
  assert(
    g2HpAtBomb >= 540,  // Giant Lv5 = 620 HP; 425 dmg would leave ≤195 HP
    "g2 non touché par la bombe (déjà consommée)",
    `g2 hp at bomb time ≈ ${g2HpAtBomb}`,
  );
}

// ── Summary ──────────────────────────────────────────────────────────────────
console.log(`\n${passed + failed} tests — ${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
