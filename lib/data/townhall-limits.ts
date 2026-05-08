/**
 * Maximum number of each defense type allowed per Town Hall level.
 * Source: approximate CoC values — update if exact data changes.
 * A missing key means the defense is not yet available at that TH level (= 0).
 */

export interface THDefenseLimits {
  cannon?:             number;
  "archer-tower"?:     number;
  mortar?:             number;
  "air-defense"?:      number;
  "wizard-tower"?:     number;
  "x-bow"?:            number;
  "inferno-tower"?:    number;
  "eagle-artillery"?:  number;
  scattershot?:        number;
  "hidden-tesla"?:     number;
  "bomb-tower"?:       number;
  "air-sweeper"?:      number;
  "monolith"?:         number;
  "builder-hut"?:      number;
  "bomb"?:             number;
  "spring-trap"?:      number;
  "giant-bomb"?:       number;
  "air-bomb"?:         number;
}

export const TH_DEFENSE_LIMITS: Record<number, THDefenseLimits> = {
  1:  { cannon: 2 },
  2:  { cannon: 2,  "archer-tower": 1 },
  3:  { cannon: 2,  "archer-tower": 2,  mortar: 1,  bomb: 2 },
  4:  { cannon: 3,  "archer-tower": 3,  mortar: 1,  "air-defense": 1,  bomb: 2,  "spring-trap": 2 },
  5:  { cannon: 4,  "archer-tower": 4,  mortar: 2,  "air-defense": 2,  bomb: 4,  "spring-trap": 2,  "air-bomb": 2 },
  6:  { cannon: 5,  "archer-tower": 5,  mortar: 2,  "air-defense": 3,  "wizard-tower": 1,  "air-sweeper": 1,  bomb: 4,  "spring-trap": 4,  "giant-bomb": 1,  "air-bomb": 2 },
  7:  { cannon: 6,  "archer-tower": 6,  mortar: 3,  "air-defense": 3,  "wizard-tower": 2,  "hidden-tesla": 2,  "air-sweeper": 1,  bomb: 6,  "spring-trap": 4,  "giant-bomb": 2,  "air-bomb": 4 },
  8:  { cannon: 6,  "archer-tower": 6,  mortar: 3,  "air-defense": 4,  "wizard-tower": 3,  "hidden-tesla": 3,  "bomb-tower": 1,  "air-sweeper": 1,  bomb: 8,  "spring-trap": 6,  "giant-bomb": 3,  "air-bomb": 4 },
  9:  { cannon: 7,  "archer-tower": 7,  mortar: 4,  "air-defense": 4,  "wizard-tower": 4,  "x-bow": 2,  "hidden-tesla": 4,  "bomb-tower": 1,  "air-sweeper": 2,  bomb: 8,  "spring-trap": 6,  "giant-bomb": 4,  "air-bomb": 5 },
  10: { cannon: 8,  "archer-tower": 8,  mortar: 4,  "air-defense": 4,  "wizard-tower": 5,  "x-bow": 3,  "inferno-tower": 1,  "hidden-tesla": 4,  "bomb-tower": 2,  "air-sweeper": 2,  bomb: 10,  "spring-trap": 6,  "giant-bomb": 5,  "air-bomb": 5 },
  11: { cannon: 9,  "archer-tower": 9,  mortar: 4,  "air-defense": 4,  "wizard-tower": 5,  "x-bow": 3,  "inferno-tower": 2,  "eagle-artillery": 1,  "hidden-tesla": 4,  "bomb-tower": 2,  "air-sweeper": 2,  bomb: 10,  "spring-trap": 6,  "giant-bomb": 5,  "air-bomb": 6 },
  12: { cannon: 9,  "archer-tower": 9,  mortar: 4,  "air-defense": 4,  "wizard-tower": 5,  "x-bow": 4,  "inferno-tower": 3,  "eagle-artillery": 1,  "hidden-tesla": 5,  "bomb-tower": 3,  "air-sweeper": 2,  bomb: 10,  "spring-trap": 8,  "giant-bomb": 6,  "air-bomb": 6 },
  13: { cannon: 10, "archer-tower": 9,  mortar: 5,  "air-defense": 5,  "wizard-tower": 5,  "x-bow": 4,  "inferno-tower": 3,  "eagle-artillery": 1,  scattershot: 1,  "hidden-tesla": 5,  "bomb-tower": 3,  "air-sweeper": 2,  bomb: 12,  "spring-trap": 9,  "giant-bomb": 6,  "air-bomb": 7 },
  14: { cannon: 11, "archer-tower": 10, mortar: 5,  "air-defense": 5,  "wizard-tower": 5,  "x-bow": 4,  "inferno-tower": 3,  "eagle-artillery": 1,  scattershot: 2,  "hidden-tesla": 5,  "bomb-tower": 4,  "air-sweeper": 2,  "builder-hut": 5,  bomb: 12,  "spring-trap": 9,  "giant-bomb": 7,  "air-bomb": 7 },
  15: { cannon: 11, "archer-tower": 11, mortar: 5,  "air-defense": 5,  "wizard-tower": 5,  "x-bow": 4,  "inferno-tower": 3,  "eagle-artillery": 1,  scattershot: 2,  "hidden-tesla": 5,  "bomb-tower": 4,  "air-sweeper": 2,  "monolith": 1,  "builder-hut": 5,  bomb: 12,  "spring-trap": 9,  "giant-bomb": 7,  "air-bomb": 8 },
};

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Max count for one defense type at a given TH level (0 = not unlocked). */
export function getDefenseLimit(thLevel: number, defenseId: string): number {
  return (TH_DEFENSE_LIMITS[thLevel] as Record<string, number> | undefined)?.[defenseId] ?? 0;
}

/** Sum of all defense slots at a given TH level. */
export function getTotalDefenseLimit(thLevel: number): number {
  const limits = TH_DEFENSE_LIMITS[thLevel];
  if (!limits) return 0;
  return Object.values(limits).reduce((sum, v) => sum + v, 0);
}

/** Returns violations: defenses placed beyond their TH-level limit. */
export function validateDefensesForTH(
  defenses: { defenseId: string }[],
  thLevel:  number,
): { defenseId: string; placed: number; limit: number }[] {
  const counts: Record<string, number> = {};
  for (const d of defenses) {
    counts[d.defenseId] = (counts[d.defenseId] ?? 0) + 1;
  }
  return Object.entries(counts)
    .map(([id, n]) => ({ defenseId: id, placed: n, limit: getDefenseLimit(thLevel, id) }))
    .filter(({ placed, limit }) => placed > limit);
}
