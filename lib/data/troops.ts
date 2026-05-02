export type AttackType = "Ground" | "Air" | "Ground & Air";
export type PreferredTarget = "None" | "Defenses" | "Resources" | "Heroes" | "Buildings";

export interface TroopLevel {
  level: number;
  hp: number;
  dps: number;
  /** Heal per second (Healer only). */
  hps?: number;
  /** Damage per death-lightning bolt (Electro Dragon only). */
  deathDamage?: number;
  townHallRequired: number;
}

export interface Troop {
  id: string;
  name: string;
  movementSpeed: number;
  attackType: AttackType;
  preferredTarget: PreferredTarget;
  /** Seconds between attacks. */
  attackSpeed: number;
  /** Splash radius in tiles around the primary target (0 = single-target). */
  splashRadius?: number;
  /** Max targets in an electric chain including primary (0 = no chain). */
  chainMaxTargets?: number;
  /** Damage multiplier applied per bounce (e.g. 0.8 = 80 %). */
  chainFalloff?: number;
  /** Max centre-to-centre distance in tiles between consecutive chain targets. */
  chainRange?: number;
  levels: TroopLevel[];
}

export const TROOPS: Troop[] = [
  {
    id: "barbarian",
    name: "Barbarian",
    movementSpeed: 18,
    attackType: "Ground",
    preferredTarget: "None",
    attackSpeed: 1.0,
    levels: [
      { level: 1,  hp: 45,  dps: 9,  townHallRequired: 1  },
      { level: 2,  hp: 54,  dps: 12, townHallRequired: 1  },
      { level: 3,  hp: 65,  dps: 15, townHallRequired: 3  },
      { level: 4,  hp: 85,  dps: 18, townHallRequired: 5  },
      { level: 5,  hp: 105, dps: 23, townHallRequired: 7  },
      { level: 6,  hp: 125, dps: 26, townHallRequired: 8  },
      { level: 7,  hp: 160, dps: 30, townHallRequired: 9  },
      { level: 8,  hp: 205, dps: 34, townHallRequired: 10 },
      { level: 9,  hp: 230, dps: 38, townHallRequired: 11 },
      { level: 10, hp: 250, dps: 42, townHallRequired: 12 },
      { level: 11, hp: 270, dps: 45, townHallRequired: 13 },
      { level: 12, hp: 290, dps: 48, townHallRequired: 14 },
      { level: 13, hp: 310, dps: 51, townHallRequired: 15 },
    ],
  },
  {
    id: "archer",
    name: "Archer",
    movementSpeed: 24,
    attackType: "Ground & Air",
    preferredTarget: "None",
    attackSpeed: 1.0,
    levels: [
      { level: 1, hp: 20,  dps: 7,   townHallRequired: 1 },
      { level: 2, hp: 23,  dps: 9,   townHallRequired: 1 },
      { level: 3, hp: 28,  dps: 12,  townHallRequired: 3 },
      { level: 4, hp: 33,  dps: 16,  townHallRequired: 5 },
      { level: 5, hp: 40,  dps: 20,  townHallRequired: 7 },
      { level: 6, hp: 44,  dps: 25,  townHallRequired: 8 },
      { level: 7, hp: 52,  dps: 30,  townHallRequired: 9 },
      { level: 8, hp: 60,  dps: 37,  townHallRequired: 10 },
      { level: 9, hp: 70,  dps: 45,  townHallRequired: 11 },
      { level: 10, hp: 80, dps: 55,  townHallRequired: 12 },
      { level: 11, hp: 92, dps: 66,  townHallRequired: 13 },
      { level: 12, hp: 106, dps: 79, townHallRequired: 14 },
      { level: 13, hp: 122, dps: 94, townHallRequired: 15 },
      { level: 14, hp: 140, dps: 111, townHallRequired: 16 },
    ],
  },
  {
    id: "giant",
    name: "Giant",
    movementSpeed: 12,
    attackType: "Ground",
    preferredTarget: "Defenses",
    attackSpeed: 2.0,
    levels: [
      { level: 1, hp: 300,  dps: 11,  townHallRequired: 1 },
      { level: 2, hp: 360,  dps: 14,  townHallRequired: 1 },
      { level: 3, hp: 430,  dps: 19,  townHallRequired: 4 },
      { level: 4, hp: 520,  dps: 24,  townHallRequired: 6 },
      { level: 5, hp: 620,  dps: 31,  townHallRequired: 7 },
      { level: 6, hp: 740,  dps: 40,  townHallRequired: 8 },
      { level: 7, hp: 880,  dps: 52,  townHallRequired: 9 },
      { level: 8, hp: 1040, dps: 66,  townHallRequired: 10 },
      { level: 9, hp: 1220, dps: 83,  townHallRequired: 11 },
      { level: 10, hp: 1430, dps: 103, townHallRequired: 12 },
      { level: 11, hp: 1670, dps: 128, townHallRequired: 13 },
      { level: 12, hp: 1950, dps: 158, townHallRequired: 14 },
      { level: 13, hp: 2270, dps: 194, townHallRequired: 15 },
      { level: 14, hp: 2640, dps: 237, townHallRequired: 16 },
    ],
  },
  {
    id: "goblin",
    name: "Goblin",
    movementSpeed: 32,
    attackType: "Ground",
    preferredTarget: "Resources",
    attackSpeed: 1.0,
    levels: [
      { level: 1, hp: 25,  dps: 11,  townHallRequired: 1 },
      { level: 2, hp: 30,  dps: 14,  townHallRequired: 1 },
      { level: 3, hp: 36,  dps: 19,  townHallRequired: 3 },
      { level: 4, hp: 43,  dps: 26,  townHallRequired: 5 },
      { level: 5, hp: 52,  dps: 35,  townHallRequired: 7 },
      { level: 6, hp: 63,  dps: 47,  townHallRequired: 8 },
      { level: 7, hp: 75,  dps: 62,  townHallRequired: 9 },
      { level: 8, hp: 90,  dps: 82,  townHallRequired: 10 },
      { level: 9, hp: 108, dps: 108, townHallRequired: 11 },
      { level: 10, hp: 130, dps: 142, townHallRequired: 12 },
      { level: 11, hp: 156, dps: 186, townHallRequired: 13 },
      { level: 12, hp: 187, dps: 242, townHallRequired: 14 },
      { level: 13, hp: 224, dps: 312, townHallRequired: 15 },
      { level: 14, hp: 268, dps: 401, townHallRequired: 16 },
    ],
  },
  {
    id: "wall-breaker",
    name: "Wall Breaker",
    movementSpeed: 24,
    attackType: "Ground",
    preferredTarget: "None",
    attackSpeed: 1.0,
    levels: [
      { level: 1, hp: 20,  dps: 12,  townHallRequired: 2 },
      { level: 2, hp: 24,  dps: 18,  townHallRequired: 3 },
      { level: 3, hp: 29,  dps: 25,  townHallRequired: 5 },
      { level: 4, hp: 35,  dps: 34,  townHallRequired: 6 },
      { level: 5, hp: 42,  dps: 47,  townHallRequired: 7 },
      { level: 6, hp: 50,  dps: 63,  townHallRequired: 8 },
      { level: 7, hp: 60,  dps: 85,  townHallRequired: 9 },
      { level: 8, hp: 72,  dps: 113, townHallRequired: 10 },
      { level: 9, hp: 86,  dps: 152, townHallRequired: 11 },
      { level: 10, hp: 103, dps: 203, townHallRequired: 12 },
      { level: 11, hp: 124, dps: 270, townHallRequired: 13 },
      { level: 12, hp: 149, dps: 355, townHallRequired: 14 },
      { level: 13, hp: 179, dps: 464, townHallRequired: 15 },
      { level: 14, hp: 215, dps: 602, townHallRequired: 16 },
    ],
  },
  {
    id: "balloon",
    name: "Balloon",
    movementSpeed: 10,
    attackType: "Ground", // unité aérienne qui attaque les défenses au sol
    preferredTarget: "Defenses",
    attackSpeed: 3.0,
    levels: [
      { level: 1, hp: 150, dps: 25,  townHallRequired: 2  },
      { level: 2, hp: 180, dps: 32,  townHallRequired: 3  },
      { level: 3, hp: 216, dps: 48,  townHallRequired: 5  },
      { level: 4, hp: 280, dps: 72,  townHallRequired: 6  },
      { level: 5, hp: 390, dps: 108, townHallRequired: 7  },
      { level: 6, hp: 545, dps: 162, townHallRequired: 8  },
      { level: 7, hp: 690, dps: 198, townHallRequired: 9  },
      { level: 8, hp: 840, dps: 236, townHallRequired: 10 },
      { level: 9, hp: 940, dps: 256, townHallRequired: 11 },
    ],
  },
  {
    id: "wizard",
    name: "Wizard",
    movementSpeed: 16,
    attackType: "Ground & Air",
    preferredTarget: "None",
    attackSpeed: 1.4,
    levels: [
      { level: 1, hp: 75,  dps: 35,  townHallRequired: 4 },
      { level: 2, hp: 90,  dps: 50,  townHallRequired: 5 },
      { level: 3, hp: 108, dps: 70,  townHallRequired: 6 },
      { level: 4, hp: 130, dps: 100, townHallRequired: 7 },
      { level: 5, hp: 156, dps: 125, townHallRequired: 8 },
      { level: 6, hp: 187, dps: 157, townHallRequired: 9 },
      { level: 7, hp: 224, dps: 197, townHallRequired: 10 },
      { level: 8, hp: 269, dps: 247, townHallRequired: 11 },
      { level: 9, hp: 323, dps: 309, townHallRequired: 12 },
      { level: 10, hp: 388, dps: 386, townHallRequired: 13 },
      { level: 11, hp: 466, dps: 483, townHallRequired: 14 },
      { level: 12, hp: 559, dps: 602, townHallRequired: 15 },
      { level: 13, hp: 671, dps: 747, townHallRequired: 16 },
    ],
  },
  {
    id: "healer",
    name: "Healer",
    movementSpeed: 16,
    attackType: "Air",
    preferredTarget: "None",
    attackSpeed: 0.7,
    levels: [
      { level: 1,  hp: 500,  dps: 0, hps: 36, townHallRequired: 6  },
      { level: 2,  hp: 700,  dps: 0, hps: 48, townHallRequired: 7  },
      { level: 3,  hp: 900,  dps: 0, hps: 60, townHallRequired: 9  },
      { level: 4,  hp: 1200, dps: 0, hps: 66, townHallRequired: 10 },
      { level: 5,  hp: 1500, dps: 0, hps: 72, townHallRequired: 11 },
      { level: 6,  hp: 1600, dps: 0, hps: 72, townHallRequired: 12 },
      { level: 7,  hp: 1700, dps: 0, hps: 72, townHallRequired: 13 },
      { level: 8,  hp: 1800, dps: 0, hps: 76, townHallRequired: 14 },
      { level: 9,  hp: 1900, dps: 0, hps: 80, townHallRequired: 15 },
      { level: 10, hp: 2000, dps: 0, hps: 80, townHallRequired: 15 },
      { level: 11, hp: 2100, dps: 0, hps: 82, townHallRequired: 16 },
    ],
  },
  {
    id: "dragon",
    name: "Dragon",
    movementSpeed: 20,
    attackType: "Ground & Air",
    preferredTarget: "None",
    attackSpeed: 1.25,
    splashRadius: 0.3,
    levels: [
      { level: 1, hp: 1900,  dps: 100, townHallRequired: 7 },
      { level: 2, hp: 2280,  dps: 120, townHallRequired: 7 },
      { level: 3, hp: 2736,  dps: 144, townHallRequired: 8 },
      { level: 4, hp: 3283,  dps: 172, townHallRequired: 9 },
      { level: 5, hp: 3940,  dps: 207, townHallRequired: 10 },
      { level: 6, hp: 4728,  dps: 248, townHallRequired: 11 },
      { level: 7, hp: 5673,  dps: 297, townHallRequired: 12 },
      { level: 8, hp: 6808,  dps: 357, townHallRequired: 13 },
      { level: 9, hp: 8170,  dps: 428, townHallRequired: 14 },
      { level: 10, hp: 9804, dps: 514, townHallRequired: 15 },
      { level: 11, hp: 11765, dps: 617, townHallRequired: 16 },
    ],
  },
  {
    id: "pekka",
    name: "P.E.K.K.A",
    movementSpeed: 16,
    attackType: "Ground",
    preferredTarget: "None",
    attackSpeed: 1.8,
    levels: [
      { level: 1, hp: 2500,  dps: 200, townHallRequired: 8 },
      { level: 2, hp: 2900,  dps: 240, townHallRequired: 8 },
      { level: 3, hp: 3200,  dps: 290, townHallRequired: 9 },
      { level: 4, hp: 3700,  dps: 340, townHallRequired: 10 },
      { level: 5, hp: 4100,  dps: 400, townHallRequired: 11 },
      { level: 6, hp: 4700,  dps: 480, townHallRequired: 12 },
      { level: 7, hp: 5300,  dps: 560, townHallRequired: 13 },
      { level: 8, hp: 6000,  dps: 660, townHallRequired: 14 },
      { level: 9, hp: 6800,  dps: 775, townHallRequired: 15 },
      { level: 10, hp: 7700, dps: 908, townHallRequired: 16 },
    ],
  },
  {
    id: "baby-dragon",
    name: "Baby Dragon",
    movementSpeed: 20,
    attackType: "Ground & Air",
    preferredTarget: "None",
    attackSpeed: 1.0,
    splashRadius: 0.3,
    levels: [
      { level: 1,  hp: 1200, dps: 75,  townHallRequired: 9  },
      { level: 2,  hp: 1300, dps: 85,  townHallRequired: 9  },
      { level: 3,  hp: 1400, dps: 95,  townHallRequired: 10 },
      { level: 4,  hp: 1500, dps: 105, townHallRequired: 10 },
      { level: 5,  hp: 1600, dps: 115, townHallRequired: 11 },
      { level: 6,  hp: 1700, dps: 125, townHallRequired: 11 },
      { level: 7,  hp: 1800, dps: 135, townHallRequired: 12 },
      { level: 8,  hp: 1900, dps: 145, townHallRequired: 12 },
      { level: 9,  hp: 2000, dps: 155, townHallRequired: 13 },
      { level: 10, hp: 2100, dps: 165, townHallRequired: 13 },
      { level: 11, hp: 2200, dps: 175, townHallRequired: 14 },
      { level: 12, hp: 2350, dps: 185, townHallRequired: 15 },
    ],
  },
  {
    id: "miner",
    name: "Miner",
    movementSpeed: 32,
    attackType: "Ground",
    preferredTarget: "None",
    attackSpeed: 1.7,
    levels: [
      { level: 1,  hp: 550,  dps: 80,  townHallRequired: 10 },
      { level: 2,  hp: 610,  dps: 88,  townHallRequired: 10 },
      { level: 3,  hp: 670,  dps: 96,  townHallRequired: 11 },
      { level: 4,  hp: 730,  dps: 104, townHallRequired: 12 },
      { level: 5,  hp: 800,  dps: 112, townHallRequired: 13 },
      { level: 6,  hp: 900,  dps: 120, townHallRequired: 14 },
      { level: 7,  hp: 1000, dps: 128, townHallRequired: 15 },
      { level: 8,  hp: 1150, dps: 136, townHallRequired: 15 },
      { level: 9,  hp: 1350, dps: 144, townHallRequired: 15 },
      { level: 10, hp: 1550, dps: 160, townHallRequired: 15 },
      { level: 11, hp: 1750, dps: 175, townHallRequired: 16 },
      { level: 12, hp: 2050, dps: 195, townHallRequired: 16 },
    ],
  },
  {
    id: "electro-dragon",
    name: "Electro Dragon",
    movementSpeed: 13,
    attackType: "Ground & Air",
    preferredTarget: "None",
    attackSpeed: 3.5,
    chainMaxTargets: 5,
    chainFalloff:    0.8,
    chainRange:      1,
    levels: [
      { level: 1, hp: 3400, dps: 260, deathDamage:  65, townHallRequired: 11 },
      { level: 2, hp: 3900, dps: 290, deathDamage:  75, townHallRequired: 11 },
      { level: 3, hp: 4400, dps: 320, deathDamage:  85, townHallRequired: 12 },
      { level: 4, hp: 4700, dps: 350, deathDamage:  95, townHallRequired: 13 },
      { level: 5, hp: 5000, dps: 380, deathDamage: 105, townHallRequired: 13 },
      { level: 6, hp: 5400, dps: 410, deathDamage: 115, townHallRequired: 14 },
      { level: 7, hp: 5700, dps: 440, deathDamage: 125, townHallRequired: 14 },
      { level: 8, hp: 6200, dps: 460, deathDamage: 135, townHallRequired: 15 },
      { level: 9, hp: 6700, dps: 500, deathDamage: 145, townHallRequired: 16 },
    ],
  },
];

export function getTroopById(id: string): Troop | undefined {
  return TROOPS.find((t) => t.id === id);
}

export function getTroopLevel(id: string, level: number): TroopLevel | undefined {
  return getTroopById(id)?.levels.find((l) => l.level === level);
}

export function getTroopsForTownHall(th: number): Troop[] {
  return TROOPS.filter((t) => t.levels.some((l) => l.townHallRequired <= th));
}
