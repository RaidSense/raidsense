/**
 * Town Hall data: HP values and weapon specs for TH 1–15.
 *
 * TH  1–11 — neutral building, no weapon.
 * TH 12    — Giga Tesla (activates on first damage).
 * TH 13–15 — Giga Tour de l'Enfer (activates on first damage).
 *
 * Activation trigger: first damage received.
 * TODO: add 51 % HP alternative activation trigger (real CoC behaviour).
 */

export interface TownHallWeapon {
  /** Continuous DPS while active — multi-target like Inferno multi. */
  dps:          number;
  targetCount:  number;
  range:        number;
  /** Seconds between tick-attacks (0.128 = 8 ticks/s, same as Inferno). */
  attackSpeed:  number;
  /** Instant HP damage dealt in deathExplosionRadius at destruction. */
  deathDamage:           number;
  deathExplosionRadius:  number;
  // ── Lingering death effect (TH 13–15) ─────────────────────────────────────
  /** Ongoing DPS to troops inside deathEffectRadius (0 = none). */
  deathEffectDps?:      number;
  deathEffectRadius?:   number;
  /** Movement + attack speed multiplier during effect (0.5 = 50 % slow). */
  deathEffectSlow?:     number;
  /** Duration of the lingering zone in seconds. */
  deathEffectDuration?: number;
}

export interface TownHallData {
  level:   number;
  hp:      number;
  weapon?: TownHallWeapon;
}

/** HP values and optional weapon for TH 1–15. */
export const TOWN_HALL_DATA: Record<number, TownHallData> = {
  1:  { level:  1, hp:   450 },
  2:  { level:  2, hp:  1600 },
  3:  { level:  3, hp:  1850 },
  4:  { level:  4, hp:  2100 },
  5:  { level:  5, hp:  2400 },
  6:  { level:  6, hp:  2800 },
  7:  { level:  7, hp:  3300 },
  8:  { level:  8, hp:  3900 },
  9:  { level:  9, hp:  4600 },
  10: { level: 10, hp:  5500 },
  11: { level: 11, hp:  6800 },
  // Giga Tesla
  12: { level: 12, hp:  7500, weapon: {
    dps: 140, targetCount: 4, range: 10, attackSpeed: 0.128,
    deathDamage: 500, deathExplosionRadius: 5,
  }},
  // Giga Tour de l'Enfer — base
  13: { level: 13, hp:  8200, weapon: {
    dps: 220, targetCount: 4, range: 10, attackSpeed: 0.128,
    deathDamage: 700, deathExplosionRadius: 5,
    deathEffectRadius: 5, deathEffectDuration: 8,
  }},
  // Giga Tour de l'Enfer — slow + DPS
  14: { level: 14, hp:  8900, weapon: {
    dps: 280, targetCount: 4, range: 10, attackSpeed: 0.128,
    deathDamage: 1000, deathExplosionRadius: 5,
    deathEffectDps: 180, deathEffectRadius: 5,
    deathEffectSlow: 0.5, deathEffectDuration: 8,
  }},
  // Giga Tour de l'Enfer — max (4.5 tile AoE)
  15: { level: 15, hp:  9600, weapon: {
    dps: 300, targetCount: 4, range: 10, attackSpeed: 0.128,
    deathDamage: 1000, deathExplosionRadius: 4.5,
    deathEffectDps: 180, deathEffectRadius: 4.5,
    deathEffectSlow: 0.5, deathEffectDuration: 8,
  }},
};

/** Returns weapon spec for a TH level, or undefined for TH 1–11. */
export function getTownHallWeapon(level: number): TownHallWeapon | undefined {
  return TOWN_HALL_DATA[level]?.weapon;
}
