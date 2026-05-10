/**
 * Héros jouables — catégorie distincte des troupes classiques.
 *
 * Chaque héros a :
 *   - des stats par niveau (hp, dps, townHallRequired, regenTimeMins, heroHallRequired)
 *   - une portée d'attaque définie dans TROOP_ATTACK_RANGE (calculator.ts)
 *   - housingSpace: 0  (les héros ne consomment pas d'espace d'armée)
 *   - maxCount: 1      (un seul exemplaire par attaque)
 *
 * À venir : capacités spéciales, équipements héroïques, familiers.
 */

import type { AttackType, PreferredTarget } from "./troops";

// ── Interfaces ────────────────────────────────────────────────────────────────

export interface HeroLevel {
  level:             number;
  hp:                number;
  dps:               number;
  townHallRequired:  number;
  /** Temps de régénération en minutes après utilisation en combat. */
  regenTimeMins:     number;
  /** Niveau du Hall des Héros requis pour débloquer ce niveau. */
  heroHallRequired:  number;
  // Champs optionnels pour compatibilité moteur (toujours absents sur les héros)
  hps?:              number;
  deathDamage?:      number;
}

export interface Hero {
  id:              string;
  name:            string;
  movementSpeed:   number;
  attackType:      AttackType;
  preferredTarget: PreferredTarget;
  attackSpeed:     number;
  housingSpace:    0;    // les héros ne consomment pas d'espace d'armée
  isHero:          true;
  maxCount:        1;
  // Champs optionnels pour compatibilité avec la forme Troop dans le moteur
  splashRadius?:    number;
  chainMaxTargets?: number;
  chainFalloff?:    number;
  chainRange?:      number;
  levels: HeroLevel[];
}

// ── Données ───────────────────────────────────────────────────────────────────

export const HEROES: Hero[] = [
  // ── Reine des Archers ──────────────────────────────────────────────────────
  // Cibles : Sol & Air | Portée attaque : 5 cases | Vitesse déplacement : 24
  // Vitesse attaque : 0.75s | Déblocage : HDV8, Hall des Héros niv.2
  {
    id:              "archer-queen",
    name:            "Archer Queen",
    movementSpeed:   24,
    attackType:      "Ground & Air",
    preferredTarget: "None",
    attackSpeed:     0.75,
    housingSpace:    0,
    isHero:          true,
    maxCount:        1,
    levels: [
      // ── HDV 8 (max lv 10) ───────────────────────────────────────────────
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
      // ── HDV 9 (max lv 30) ───────────────────────────────────────────────
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
      // ── HDV 10 (max lv 40) ──────────────────────────────────────────────
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
      // ── HDV 11 (max lv 50) ──────────────────────────────────────────────
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
      // ── HDV 12 (max lv 65) ──────────────────────────────────────────────
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
      // ── HDV 13 (max lv 75) ──────────────────────────────────────────────
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
      // ── HDV 14 (max lv 80) ──────────────────────────────────────────────
      { level: 76, hp: 2740, dps: 697, townHallRequired: 14, regenTimeMins: 340, heroHallRequired: 8 },
      { level: 77, hp: 2768, dps: 701, townHallRequired: 14, regenTimeMins: 340, heroHallRequired: 8 },
      { level: 78, hp: 2796, dps: 706, townHallRequired: 14, regenTimeMins: 340, heroHallRequired: 8 },
      { level: 79, hp: 2824, dps: 710, townHallRequired: 14, regenTimeMins: 340, heroHallRequired: 8 },
      { level: 80, hp: 2852, dps: 714, townHallRequired: 14, regenTimeMins: 355, heroHallRequired: 8 },
      // ── HDV 15 (max lv 90) ──────────────────────────────────────────────
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

// ── Lookup functions ──────────────────────────────────────────────────────────

export function getHeroById(id: string): Hero | undefined {
  return HEROES.find((h) => h.id === id);
}

export function getHeroLevel(id: string, level: number): HeroLevel | undefined {
  return getHeroById(id)?.levels.find((l) => l.level === level);
}

export function getHeroesForTownHall(th: number): Hero[] {
  return HEROES.filter((h) => h.levels.some((l) => l.townHallRequired <= th));
}
