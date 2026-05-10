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
  /** Hero regeneration time in minutes (heroes only). */
  regenTimeMins?: number;
  /** Hero Hall level required to unlock this hero level (heroes only). */
  heroHallRequired?: number;
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
  /**
   * CoC housing space consumed when the troop is trained.
   * Used by spring trap to decide whether to eject the troop.
   * Default 1 when not specified.
   */
  housingSpace?: number;
  /** True for heroes (King, Queen, Warden, Champion). */
  isHero?: boolean;
  /** Maximum number of instances allowed per attack (1 for all heroes). */
  maxCount?: number;
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
    housingSpace: 1,
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
    housingSpace: 1,
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
    housingSpace: 5,
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
    housingSpace: 1,
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
    housingSpace: 2,
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
    attackType: "Ground",
    preferredTarget: "Defenses",
    attackSpeed: 3.0,
    housingSpace: 5,
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
    housingSpace: 4,
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
    housingSpace: 14,
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
    housingSpace: 20,
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
    housingSpace: 25,
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
    housingSpace: 10,
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
    housingSpace: 5,
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
    housingSpace: 30,
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
  // ── Heroes ────────────────────────────────────────────────────────────────
  {
    id:             "archer-queen",
    name:           "Archer Queen",
    movementSpeed:  24,
    attackType:     "Ground & Air",
    preferredTarget: "None",
    attackSpeed:    0.75,
    housingSpace:   0,   // heroes do not consume army housing space
    isHero:         true,
    maxCount:       1,
    levels: [
      // ── HDV 8 (max lv 10) ─────────────────────────────────────────────
      { level:  1, hp:  580, dps: 136, townHallRequired:  8, regenTimeMins: 115, heroHallRequired: 2 },
      { level:  2, hp:  592, dps: 139, townHallRequired:  8, regenTimeMins: 115, heroHallRequired: 2 },
      { level:  3, hp:  604, dps: 143, townHallRequired:  8, regenTimeMins: 115, heroHallRequired: 2 },
      { level:  4, hp:  617, dps: 146, townHallRequired:  8, regenTimeMins: 115, heroHallRequired: 2 },
      { level:  5, hp:  630, dps: 150, townHallRequired:  8, regenTimeMins: 130, heroHallRequired: 2 },
      { level:  6, hp:  643, dps: 154, townHallRequired:  8, regenTimeMins: 130, heroHallRequired: 2 },
      { level:  7, hp:  657, dps: 157, townHallRequired:  8, regenTimeMins: 130, heroHallRequired: 2 },
      { level:  8, hp:  670, dps: 162, townHallRequired:  8, regenTimeMins: 130, heroHallRequired: 2 },
      { level:  9, hp:  685, dps: 165, townHallRequired:  8, regenTimeMins: 130, heroHallRequired: 2 },
      { level: 10, hp:  699, dps: 169, townHallRequired:  8, regenTimeMins: 145, heroHallRequired: 2 },
      // ── HDV 9 (max lv 30) ─────────────────────────────────────────────
      { level: 11, hp:  714, dps: 173, townHallRequired:  9, regenTimeMins: 145, heroHallRequired: 3 },
      { level: 12, hp:  729, dps: 178, townHallRequired:  9, regenTimeMins: 145, heroHallRequired: 3 },
      { level: 13, hp:  744, dps: 183, townHallRequired:  9, regenTimeMins: 145, heroHallRequired: 3 },
      { level: 14, hp:  759, dps: 187, townHallRequired:  9, regenTimeMins: 145, heroHallRequired: 3 },
      { level: 15, hp:  775, dps: 192, townHallRequired:  9, regenTimeMins: 160, heroHallRequired: 3 },
      { level: 16, hp:  792, dps: 196, townHallRequired:  9, regenTimeMins: 160, heroHallRequired: 3 },
      { level: 17, hp:  808, dps: 201, townHallRequired:  9, regenTimeMins: 160, heroHallRequired: 3 },
      { level: 18, hp:  826, dps: 207, townHallRequired:  9, regenTimeMins: 160, heroHallRequired: 3 },
      { level: 19, hp:  842, dps: 212, townHallRequired:  9, regenTimeMins: 160, heroHallRequired: 3 },
      { level: 20, hp:  861, dps: 217, townHallRequired:  9, regenTimeMins: 175, heroHallRequired: 3 },
      { level: 21, hp:  878, dps: 223, townHallRequired:  9, regenTimeMins: 175, heroHallRequired: 3 },
      { level: 22, hp:  897, dps: 228, townHallRequired:  9, regenTimeMins: 175, heroHallRequired: 3 },
      { level: 23, hp:  916, dps: 234, townHallRequired:  9, regenTimeMins: 175, heroHallRequired: 3 },
      { level: 24, hp:  935, dps: 240, townHallRequired:  9, regenTimeMins: 175, heroHallRequired: 3 },
      { level: 25, hp:  954, dps: 246, townHallRequired:  9, regenTimeMins: 190, heroHallRequired: 3 },
      { level: 26, hp:  974, dps: 252, townHallRequired:  9, regenTimeMins: 190, heroHallRequired: 3 },
      { level: 27, hp:  995, dps: 258, townHallRequired:  9, regenTimeMins: 190, heroHallRequired: 3 },
      { level: 28, hp: 1016, dps: 264, townHallRequired:  9, regenTimeMins: 190, heroHallRequired: 3 },
      { level: 29, hp: 1038, dps: 271, townHallRequired:  9, regenTimeMins: 190, heroHallRequired: 3 },
      { level: 30, hp: 1059, dps: 278, townHallRequired:  9, regenTimeMins: 205, heroHallRequired: 3 },
      // ── HDV 10 (max lv 40) ────────────────────────────────────────────
      { level: 31, hp: 1082, dps: 285, townHallRequired: 10, regenTimeMins: 205, heroHallRequired: 4 },
      { level: 32, hp: 1104, dps: 292, townHallRequired: 10, regenTimeMins: 205, heroHallRequired: 4 },
      { level: 33, hp: 1127, dps: 299, townHallRequired: 10, regenTimeMins: 205, heroHallRequired: 4 },
      { level: 34, hp: 1151, dps: 307, townHallRequired: 10, regenTimeMins: 205, heroHallRequired: 4 },
      { level: 35, hp: 1175, dps: 315, townHallRequired: 10, regenTimeMins: 220, heroHallRequired: 4 },
      { level: 36, hp: 1200, dps: 322, townHallRequired: 10, regenTimeMins: 220, heroHallRequired: 4 },
      { level: 37, hp: 1226, dps: 331, townHallRequired: 10, regenTimeMins: 220, heroHallRequired: 4 },
      { level: 38, hp: 1251, dps: 338, townHallRequired: 10, regenTimeMins: 220, heroHallRequired: 4 },
      { level: 39, hp: 1278, dps: 347, townHallRequired: 10, regenTimeMins: 220, heroHallRequired: 4 },
      { level: 40, hp: 1304, dps: 356, townHallRequired: 10, regenTimeMins: 235, heroHallRequired: 4 },
      // ── HDV 11 (max lv 50) ────────────────────────────────────────────
      { level: 41, hp: 1331, dps: 365, townHallRequired: 11, regenTimeMins: 235, heroHallRequired: 5 },
      { level: 42, hp: 1359, dps: 374, townHallRequired: 11, regenTimeMins: 235, heroHallRequired: 5 },
      { level: 43, hp: 1388, dps: 383, townHallRequired: 11, regenTimeMins: 235, heroHallRequired: 5 },
      { level: 44, hp: 1417, dps: 393, townHallRequired: 11, regenTimeMins: 235, heroHallRequired: 5 },
      { level: 45, hp: 1447, dps: 403, townHallRequired: 11, regenTimeMins: 250, heroHallRequired: 5 },
      { level: 46, hp: 1478, dps: 413, townHallRequired: 11, regenTimeMins: 250, heroHallRequired: 5 },
      { level: 47, hp: 1508, dps: 423, townHallRequired: 11, regenTimeMins: 250, heroHallRequired: 5 },
      { level: 48, hp: 1540, dps: 434, townHallRequired: 11, regenTimeMins: 250, heroHallRequired: 5 },
      { level: 49, hp: 1572, dps: 445, townHallRequired: 11, regenTimeMins: 250, heroHallRequired: 5 },
      { level: 50, hp: 1606, dps: 456, townHallRequired: 11, regenTimeMins: 265, heroHallRequired: 5 },
      // ── HDV 12 (max lv 65) ────────────────────────────────────────────
      { level: 51, hp: 1646, dps: 465, townHallRequired: 12, regenTimeMins: 265, heroHallRequired: 6 },
      { level: 52, hp: 1688, dps: 474, townHallRequired: 12, regenTimeMins: 265, heroHallRequired: 6 },
      { level: 53, hp: 1730, dps: 485, townHallRequired: 12, regenTimeMins: 265, heroHallRequired: 6 },
      { level: 54, hp: 1774, dps: 495, townHallRequired: 12, regenTimeMins: 265, heroHallRequired: 6 },
      { level: 55, hp: 1819, dps: 505, townHallRequired: 12, regenTimeMins: 280, heroHallRequired: 6 },
      { level: 56, hp: 1865, dps: 515, townHallRequired: 12, regenTimeMins: 280, heroHallRequired: 6 },
      { level: 57, hp: 1912, dps: 526, townHallRequired: 12, regenTimeMins: 280, heroHallRequired: 6 },
      { level: 58, hp: 1960, dps: 537, townHallRequired: 12, regenTimeMins: 280, heroHallRequired: 6 },
      { level: 59, hp: 2010, dps: 548, townHallRequired: 12, regenTimeMins: 280, heroHallRequired: 6 },
      { level: 60, hp: 2060, dps: 559, townHallRequired: 12, regenTimeMins: 295, heroHallRequired: 6 },
      { level: 61, hp: 2111, dps: 570, townHallRequired: 12, regenTimeMins: 295, heroHallRequired: 6 },
      { level: 62, hp: 2164, dps: 581, townHallRequired: 12, regenTimeMins: 295, heroHallRequired: 6 },
      { level: 63, hp: 2218, dps: 593, townHallRequired: 12, regenTimeMins: 295, heroHallRequired: 6 },
      { level: 64, hp: 2274, dps: 605, townHallRequired: 12, regenTimeMins: 295, heroHallRequired: 6 },
      { level: 65, hp: 2330, dps: 617, townHallRequired: 12, regenTimeMins: 310, heroHallRequired: 6 },
      // ── HDV 13 (max lv 75) ────────────────────────────────────────────
      { level: 66, hp: 2384, dps: 628, townHallRequired: 13, regenTimeMins: 310, heroHallRequired: 7 },
      { level: 67, hp: 2432, dps: 638, townHallRequired: 13, regenTimeMins: 310, heroHallRequired: 7 },
      { level: 68, hp: 2476, dps: 648, townHallRequired: 13, regenTimeMins: 310, heroHallRequired: 7 },
      { level: 69, hp: 2516, dps: 656, townHallRequired: 13, regenTimeMins: 310, heroHallRequired: 7 },
      { level: 70, hp: 2552, dps: 664, townHallRequired: 13, regenTimeMins: 325, heroHallRequired: 7 },
      { level: 71, hp: 2584, dps: 671, townHallRequired: 13, regenTimeMins: 325, heroHallRequired: 7 },
      { level: 72, hp: 2616, dps: 677, townHallRequired: 13, regenTimeMins: 325, heroHallRequired: 7 },
      { level: 73, hp: 2648, dps: 682, townHallRequired: 13, regenTimeMins: 325, heroHallRequired: 7 },
      { level: 74, hp: 2680, dps: 687, townHallRequired: 13, regenTimeMins: 325, heroHallRequired: 7 },
      { level: 75, hp: 2712, dps: 692, townHallRequired: 13, regenTimeMins: 340, heroHallRequired: 7 },
      // ── HDV 14 (max lv 80) ────────────────────────────────────────────
      { level: 76, hp: 2740, dps: 697, townHallRequired: 14, regenTimeMins: 340, heroHallRequired: 8 },
      { level: 77, hp: 2768, dps: 701, townHallRequired: 14, regenTimeMins: 340, heroHallRequired: 8 },
      { level: 78, hp: 2796, dps: 706, townHallRequired: 14, regenTimeMins: 340, heroHallRequired: 8 },
      { level: 79, hp: 2824, dps: 710, townHallRequired: 14, regenTimeMins: 340, heroHallRequired: 8 },
      { level: 80, hp: 2852, dps: 714, townHallRequired: 14, regenTimeMins: 355, heroHallRequired: 8 },
      // ── HDV 15 (max lv 90) ────────────────────────────────────────────
      { level: 81, hp: 2880, dps: 717, townHallRequired: 15, regenTimeMins: 355, heroHallRequired: 8 },
      { level: 82, hp: 2904, dps: 721, townHallRequired: 15, regenTimeMins: 355, heroHallRequired: 8 },
      { level: 83, hp: 2928, dps: 724, townHallRequired: 15, regenTimeMins: 355, heroHallRequired: 8 },
      { level: 84, hp: 2952, dps: 728, townHallRequired: 15, regenTimeMins: 355, heroHallRequired: 8 },
      { level: 85, hp: 2976, dps: 731, townHallRequired: 15, regenTimeMins: 370, heroHallRequired: 8 },
      { level: 86, hp: 3000, dps: 734, townHallRequired: 15, regenTimeMins: 370, heroHallRequired: 9 },
      { level: 87, hp: 3024, dps: 738, townHallRequired: 15, regenTimeMins: 370, heroHallRequired: 9 },
      { level: 88, hp: 3048, dps: 741, townHallRequired: 15, regenTimeMins: 370, heroHallRequired: 9 },
      { level: 89, hp: 3072, dps: 745, townHallRequired: 15, regenTimeMins: 370, heroHallRequired: 9 },
      { level: 90, hp: 3096, dps: 748, townHallRequired: 15, regenTimeMins: 385, heroHallRequired: 9 },
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
