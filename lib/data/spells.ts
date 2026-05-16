export interface SpellLevel {
  level: number;
  /** Additive damage bonus in percent. e.g. 130 → final = base × 2.3 */
  damageBoostPercent: number;
  /** Absolute speed bonus in CoC internal units (same unit as movementSpeed). */
  speedBoost: number;
}

export interface SpellPlacement {
  spellId: string;
  level: number;
  position: { x: number; y: number };
  /** Simulation time (seconds) when the spell lands. */
  deployAt: number;
}

export const RAGE_SPELL = {
  id: "rage" as const,
  name: "Sort de Rage",
  radius: 5,
  duration: 18,
  housingSpace: 2,
  levels: [
    { level: 1, damageBoostPercent: 130, speedBoost: 20 },
    { level: 2, damageBoostPercent: 140, speedBoost: 22 },
    { level: 3, damageBoostPercent: 150, speedBoost: 24 },
    { level: 4, damageBoostPercent: 160, speedBoost: 26 },
    { level: 5, damageBoostPercent: 170, speedBoost: 28 },
    { level: 6, damageBoostPercent: 180, speedBoost: 30 },
  ],
} as const;

export interface FreezeSpellLevel {
  level: number;
  durationSeconds: number;
}

export const FREEZE_SPELL = {
  id: "freeze" as const,
  name: "Sort de Gel",
  radius: 3.5,
  housingSpace: 1,
  levels: [
    { level: 1, durationSeconds: 2.5 },
    { level: 2, durationSeconds: 3.0 },
    { level: 3, durationSeconds: 3.5 },
    { level: 4, durationSeconds: 4.0 },
    { level: 5, durationSeconds: 4.5 },
    { level: 6, durationSeconds: 5.0 },
    { level: 7, durationSeconds: 5.5 },
  ],
} as const;

export const SPELLS = [RAGE_SPELL, FREEZE_SPELL] as const;

export function getSpellById(id: string): typeof SPELLS[number] | undefined {
  return SPELLS.find((s) => s.id === id);
}
