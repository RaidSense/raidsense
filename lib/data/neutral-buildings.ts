export const NEUTRAL_BUILDINGS = [
  {
    "id": "pet-house",
    "name": "Animalerie",
    "category": "building",
    "size": 3,
    "levels": [
      {
        "level": 1,
        "hp": 700,
        "townHall": 14
      },
      {
        "level": 2,
        "hp": 800,
        "townHall": 14
      },
      {
        "level": 3,
        "hp": 900,
        "townHall": 14
      },
      {
        "level": 4,
        "hp": 1000,
        "townHall": 14
      },
      {
        "level": 5,
        "hp": 1050,
        "townHall": 15
      },
      {
        "level": 6,
        "hp": 1100,
        "townHall": 15
      },
      {
        "level": 7,
        "hp": 1150,
        "townHall": 15
      },
      {
        "level": 8,
        "hp": 1200,
        "townHall": 15
      }
    ],
    "targetTags": [
      "building"
    ],
    "canAttack": false,
    "isDefense": false,
    "isNeutral": true,
    "maxTownHallIncluded": 15,
    "behavior": {
      "attack": "none",
      "targetableBy": [
        "building"
      ],
      "blocksGroundPathing": true,
      "blocksAirPathing": false
    },
    "notes": "Bâtiment destructible neutre pour l'instant. Logique familiers à ajouter plus tard."
  },
  {
    "id": "workshop",
    "name": "Atelier",
    "category": "building",
    "size": 3,
    "levels": [
      {
        "level": 1,
        "hp": 1000,
        "townHall": 12
      },
      {
        "level": 2,
        "hp": 1100,
        "townHall": 12
      },
      {
        "level": 3,
        "hp": 1200,
        "townHall": 12
      },
      {
        "level": 4,
        "hp": 1300,
        "townHall": 13
      },
      {
        "level": 5,
        "hp": 1400,
        "townHall": 13
      },
      {
        "level": 6,
        "hp": 1500,
        "townHall": 14
      },
      {
        "level": 7,
        "hp": 1600,
        "townHall": 15
      }
    ],
    "targetTags": [
      "building"
    ],
    "canAttack": false,
    "isDefense": false,
    "isNeutral": true,
    "maxTownHallIncluded": 15,
    "behavior": {
      "attack": "none",
      "targetableBy": [
        "building"
      ],
      "blocksGroundPathing": true,
      "blocksAirPathing": false
    }
  },
  {
    "id": "builder-hut",
    "name": "Cabane des Assistants",
    "category": "building",
    "size": 3,
    "levels": [
      {
        "level": 1,
        "hp": 500,
        "townHall": 9
      }
    ],
    "targetTags": [
      "building"
    ],
    "canAttack": false,
    "isDefense": false,
    "isNeutral": true,
    "maxTownHallIncluded": 15,
    "behavior": {
      "attack": "none",
      "targetableBy": [
        "building"
      ],
      "blocksGroundPathing": true,
      "blocksAirPathing": false
    },
    "notes": "À vérifier : peut être traité comme bâtiment spécial plus tard si logique de réparation/assistant ajoutée."
  },
  {
    "id": "army-camp",
    "name": "Camp Militaire",
    "category": "building",
    "size": 4,
    "levels": [
      {
        "level": 1,
        "hp": 250,
        "townHall": 1
      },
      {
        "level": 2,
        "hp": 270,
        "townHall": 2
      },
      {
        "level": 3,
        "hp": 290,
        "townHall": 3
      },
      {
        "level": 4,
        "hp": 310,
        "townHall": 4
      },
      {
        "level": 5,
        "hp": 330,
        "townHall": 5
      },
      {
        "level": 6,
        "hp": 350,
        "townHall": 6
      },
      {
        "level": 7,
        "hp": 400,
        "townHall": 9
      },
      {
        "level": 8,
        "hp": 500,
        "townHall": 10
      },
      {
        "level": 9,
        "hp": 600,
        "townHall": 11
      },
      {
        "level": 10,
        "hp": 700,
        "townHall": 12
      },
      {
        "level": 11,
        "hp": 800,
        "townHall": 13
      },
      {
        "level": 12,
        "hp": 850,
        "townHall": 15
      }
    ],
    "targetTags": [
      "building"
    ],
    "canAttack": false,
    "isDefense": false,
    "isNeutral": true,
    "maxTownHallIncluded": 15,
    "behavior": {
      "attack": "none",
      "targetableBy": [
        "building"
      ],
      "blocksGroundPathing": true,
      "blocksAirPathing": false
    }
  },
  {
    "id": "barracks",
    "name": "Caserne",
    "category": "building",
    "size": 3,
    "levels": [
      {
        "level": 1,
        "hp": 250,
        "townHall": 1
      },
      {
        "level": 2,
        "hp": 290,
        "townHall": 1
      },
      {
        "level": 3,
        "hp": 330,
        "townHall": 1
      },
      {
        "level": 4,
        "hp": 370,
        "townHall": 2
      },
      {
        "level": 5,
        "hp": 420,
        "townHall": 3
      },
      {
        "level": 6,
        "hp": 470,
        "townHall": 4
      },
      {
        "level": 7,
        "hp": 520,
        "townHall": 5
      },
      {
        "level": 8,
        "hp": 580,
        "townHall": 6
      },
      {
        "level": 9,
        "hp": 650,
        "townHall": 7
      },
      {
        "level": 10,
        "hp": 730,
        "townHall": 8
      },
      {
        "level": 11,
        "hp": 810,
        "townHall": 9
      },
      {
        "level": 12,
        "hp": 900,
        "townHall": 10
      },
      {
        "level": 13,
        "hp": 980,
        "townHall": 11
      },
      {
        "level": 14,
        "hp": 1050,
        "townHall": 12
      },
      {
        "level": 15,
        "hp": 1150,
        "townHall": 13
      },
      {
        "level": 16,
        "hp": 1250,
        "townHall": 14
      },
      {
        "level": 17,
        "hp": 1350,
        "townHall": 15
      }
    ],
    "targetTags": [
      "building"
    ],
    "canAttack": false,
    "isDefense": false,
    "isNeutral": true,
    "maxTownHallIncluded": 15,
    "behavior": {
      "attack": "none",
      "targetableBy": [
        "building"
      ],
      "blocksGroundPathing": true,
      "blocksAirPathing": false
    }
  },
  {
    "id": "dark-barracks",
    "name": "Caserne Noire",
    "category": "building",
    "size": 3,
    "levels": [
      {
        "level": 1,
        "hp": 500,
        "townHall": 7
      },
      {
        "level": 2,
        "hp": 550,
        "townHall": 7
      },
      {
        "level": 3,
        "hp": 600,
        "townHall": 8
      },
      {
        "level": 4,
        "hp": 650,
        "townHall": 8
      },
      {
        "level": 5,
        "hp": 700,
        "townHall": 9
      },
      {
        "level": 6,
        "hp": 750,
        "townHall": 9
      },
      {
        "level": 7,
        "hp": 800,
        "townHall": 10
      },
      {
        "level": 8,
        "hp": 850,
        "townHall": 11
      },
      {
        "level": 9,
        "hp": 900,
        "townHall": 12
      },
      {
        "level": 10,
        "hp": 950,
        "townHall": 13
      },
      {
        "level": 11,
        "hp": 1000,
        "townHall": 14
      },
      {
        "level": 12,
        "hp": 1050,
        "townHall": 15
      }
    ],
    "targetTags": [
      "building"
    ],
    "canAttack": false,
    "isDefense": false,
    "isNeutral": true,
    "maxTownHallIncluded": 15,
    "behavior": {
      "attack": "none",
      "targetableBy": [
        "building"
      ],
      "blocksGroundPathing": true,
      "blocksAirPathing": false
    }
  },
  {
    "id": "clan-castle",
    "name": "Château de Clan",
    "category": "special",
    "size": 3,
    "levels": [
      {
        "level": 1,
        "hp": 1000,
        "townHall": 3
      },
      {
        "level": 2,
        "hp": 1400,
        "townHall": 4
      },
      {
        "level": 3,
        "hp": 2000,
        "townHall": 6
      },
      {
        "level": 4,
        "hp": 2600,
        "townHall": 8
      },
      {
        "level": 5,
        "hp": 3000,
        "townHall": 9
      },
      {
        "level": 6,
        "hp": 3400,
        "townHall": 10
      },
      {
        "level": 7,
        "hp": 4000,
        "townHall": 11
      },
      {
        "level": 8,
        "hp": 4400,
        "townHall": 12
      },
      {
        "level": 9,
        "hp": 4800,
        "townHall": 13
      },
      {
        "level": 10,
        "hp": 5200,
        "townHall": 14
      },
      {
        "level": 11,
        "hp": 5400,
        "townHall": 15
      }
    ],
    "targetTags": [
      "building",
      "special"
    ],
    "canAttack": false,
    "isDefense": false,
    "isNeutral": true,
    "maxTownHallIncluded": 15,
    "behavior": {
      "attack": "none",
      "targetableBy": [
        "building",
        "special"
      ],
      "blocksGroundPathing": true,
      "blocksAirPathing": false
    },
    "notes": "Bâtiment destructible neutre pour l'instant. Logique des troupes de château à ajouter plus tard."
  },
  {
    "id": "elixir-collector",
    "name": "Extracteur d'Élixir",
    "category": "resource",
    "size": 3,
    "levels": [
      {
        "level": 1,
        "hp": 400,
        "townHall": 1
      },
      {
        "level": 2,
        "hp": 440,
        "townHall": 1
      },
      {
        "level": 3,
        "hp": 480,
        "townHall": 2
      },
      {
        "level": 4,
        "hp": 520,
        "townHall": 2
      },
      {
        "level": 5,
        "hp": 560,
        "townHall": 3
      },
      {
        "level": 6,
        "hp": 600,
        "townHall": 3
      },
      {
        "level": 7,
        "hp": 640,
        "townHall": 4
      },
      {
        "level": 8,
        "hp": 680,
        "townHall": 4
      },
      {
        "level": 9,
        "hp": 720,
        "townHall": 5
      },
      {
        "level": 10,
        "hp": 780,
        "townHall": 5
      },
      {
        "level": 11,
        "hp": 860,
        "townHall": 7
      },
      {
        "level": 12,
        "hp": 960,
        "townHall": 8
      },
      {
        "level": 13,
        "hp": 1080,
        "townHall": 10
      },
      {
        "level": 14,
        "hp": 1180,
        "townHall": 11
      },
      {
        "level": 15,
        "hp": 1280,
        "townHall": 12
      },
      {
        "level": 16,
        "hp": 1350,
        "townHall": 14
      }
    ],
    "targetTags": [
      "building",
      "resource"
    ],
    "canAttack": false,
    "isDefense": false,
    "isNeutral": true,
    "maxTownHallIncluded": 15,
    "behavior": {
      "attack": "none",
      "targetableBy": [
        "building",
        "resource"
      ],
      "blocksGroundPathing": true,
      "blocksAirPathing": false
    }
  },
  {
    "id": "dark-elixir-drill",
    "name": "Foreuse d'Élixir Noir",
    "category": "resource",
    "size": 3,
    "levels": [
      {
        "level": 1,
        "hp": 800,
        "townHall": 7
      },
      {
        "level": 2,
        "hp": 860,
        "townHall": 7
      },
      {
        "level": 3,
        "hp": 920,
        "townHall": 7
      },
      {
        "level": 4,
        "hp": 980,
        "townHall": 9
      },
      {
        "level": 5,
        "hp": 1060,
        "townHall": 9
      },
      {
        "level": 6,
        "hp": 1160,
        "townHall": 9
      },
      {
        "level": 7,
        "hp": 1280,
        "townHall": 10
      },
      {
        "level": 8,
        "hp": 1380,
        "townHall": 11
      },
      {
        "level": 9,
        "hp": 1480,
        "townHall": 12
      },
      {
        "level": 10,
        "hp": 1550,
        "townHall": 14
      }
    ],
    "targetTags": [
      "building",
      "resource"
    ],
    "canAttack": false,
    "isDefense": false,
    "isNeutral": true,
    "maxTownHallIncluded": 15,
    "behavior": {
      "attack": "none",
      "targetableBy": [
        "building",
        "resource"
      ],
      "blocksGroundPathing": true,
      "blocksAirPathing": false
    }
  },
  {
    "id": "blacksmith",
    "name": "Forgeron",
    "category": "building",
    "size": 3,
    "levels": [
      {
        "level": 1,
        "hp": 700,
        "townHall": 8
      },
      {
        "level": 2,
        "hp": 800,
        "townHall": 9
      },
      {
        "level": 3,
        "hp": 900,
        "townHall": 10
      },
      {
        "level": 4,
        "hp": 1000,
        "townHall": 11
      },
      {
        "level": 5,
        "hp": 1100,
        "townHall": 12
      },
      {
        "level": 6,
        "hp": 1200,
        "townHall": 13
      },
      {
        "level": 7,
        "hp": 1300,
        "townHall": 14
      },
      {
        "level": 8,
        "hp": 1400,
        "townHall": 15
      }
    ],
    "targetTags": [
      "building"
    ],
    "canAttack": false,
    "isDefense": false,
    "isNeutral": true,
    "maxTownHallIncluded": 15,
    "behavior": {
      "attack": "none",
      "targetableBy": [
        "building"
      ],
      "blocksGroundPathing": true,
      "blocksAirPathing": false
    },
    "notes": "Bâtiment destructible neutre pour l'instant. Logique équipements à ajouter plus tard."
  },
  {
    "id": "hero-hall",
    "name": "Hall des Héros",
    "category": "special",
    "size": 4,
    "levels": [
      {
        "level": 1,
        "hp": 2000,
        "townHall": 7
      },
      {
        "level": 2,
        "hp": 2400,
        "townHall": 8
      },
      {
        "level": 3,
        "hp": 2800,
        "townHall": 9
      },
      {
        "level": 4,
        "hp": 3200,
        "townHall": 10
      },
      {
        "level": 5,
        "hp": 3600,
        "townHall": 11
      },
      {
        "level": 6,
        "hp": 3800,
        "townHall": 12
      },
      {
        "level": 7,
        "hp": 4200,
        "townHall": 13
      },
      {
        "level": 8,
        "hp": 4600,
        "townHall": 14
      },
      {
        "level": 9,
        "hp": 5000,
        "townHall": 15
      }
    ],
    "targetTags": [
      "building",
      "special"
    ],
    "canAttack": false,
    "isDefense": false,
    "isNeutral": true,
    "maxTownHallIncluded": 15,
    "behavior": {
      "attack": "none",
      "targetableBy": [
        "building",
        "special"
      ],
      "blocksGroundPathing": true,
      "blocksAirPathing": false
    },
    "notes": "Bâtiment destructible neutre pour l'instant. Logique liée aux héros à ajouter plus tard."
  },
  {
    "id": "laboratory",
    "name": "Laboratoire",
    "category": "building",
    "size": 3,
    "levels": [
      {
        "level": 1,
        "hp": 500,
        "townHall": 3
      },
      {
        "level": 2,
        "hp": 550,
        "townHall": 4
      },
      {
        "level": 3,
        "hp": 600,
        "townHall": 5
      },
      {
        "level": 4,
        "hp": 650,
        "townHall": 6
      },
      {
        "level": 5,
        "hp": 700,
        "townHall": 7
      },
      {
        "level": 6,
        "hp": 750,
        "townHall": 8
      },
      {
        "level": 7,
        "hp": 830,
        "townHall": 9
      },
      {
        "level": 8,
        "hp": 950,
        "townHall": 10
      },
      {
        "level": 9,
        "hp": 1070,
        "townHall": 11
      },
      {
        "level": 10,
        "hp": 1140,
        "townHall": 12
      },
      {
        "level": 11,
        "hp": 1210,
        "townHall": 13
      },
      {
        "level": 12,
        "hp": 1280,
        "townHall": 14
      },
      {
        "level": 13,
        "hp": 1350,
        "townHall": 15
      }
    ],
    "targetTags": [
      "building"
    ],
    "canAttack": false,
    "isDefense": false,
    "isNeutral": true,
    "maxTownHallIncluded": 15,
    "behavior": {
      "attack": "none",
      "targetableBy": [
        "building"
      ],
      "blocksGroundPathing": true,
      "blocksAirPathing": false
    }
  },
  {
    "id": "gold-mine",
    "name": "Mine d'Or",
    "category": "resource",
    "size": 3,
    "levels": [
      {
        "level": 1,
        "hp": 400,
        "townHall": 1
      },
      {
        "level": 2,
        "hp": 440,
        "townHall": 1
      },
      {
        "level": 3,
        "hp": 480,
        "townHall": 2
      },
      {
        "level": 4,
        "hp": 520,
        "townHall": 2
      },
      {
        "level": 5,
        "hp": 560,
        "townHall": 3
      },
      {
        "level": 6,
        "hp": 600,
        "townHall": 3
      },
      {
        "level": 7,
        "hp": 640,
        "townHall": 4
      },
      {
        "level": 8,
        "hp": 680,
        "townHall": 4
      },
      {
        "level": 9,
        "hp": 720,
        "townHall": 5
      },
      {
        "level": 10,
        "hp": 780,
        "townHall": 5
      },
      {
        "level": 11,
        "hp": 860,
        "townHall": 7
      },
      {
        "level": 12,
        "hp": 960,
        "townHall": 8
      },
      {
        "level": 13,
        "hp": 1080,
        "townHall": 10
      },
      {
        "level": 14,
        "hp": 1180,
        "townHall": 11
      },
      {
        "level": 15,
        "hp": 1280,
        "townHall": 12
      },
      {
        "level": 16,
        "hp": 1350,
        "townHall": 14
      }
    ],
    "targetTags": [
      "building",
      "resource"
    ],
    "canAttack": false,
    "isDefense": false,
    "isNeutral": true,
    "maxTownHallIncluded": 15,
    "behavior": {
      "attack": "none",
      "targetableBy": [
        "building",
        "resource"
      ],
      "blocksGroundPathing": true,
      "blocksAirPathing": false
    }
  },
  {
    "id": "gold-storage",
    "name": "Réserve d'Or",
    "category": "resource",
    "size": 3,
    "levels": [
      {
        "level": 1,
        "hp": 400,
        "townHall": 1
      },
      {
        "level": 2,
        "hp": 600,
        "townHall": 2
      },
      {
        "level": 3,
        "hp": 800,
        "townHall": 2
      },
      {
        "level": 4,
        "hp": 1000,
        "townHall": 3
      },
      {
        "level": 5,
        "hp": 1200,
        "townHall": 3
      },
      {
        "level": 6,
        "hp": 1400,
        "townHall": 3
      },
      {
        "level": 7,
        "hp": 1600,
        "townHall": 4
      },
      {
        "level": 8,
        "hp": 1700,
        "townHall": 4
      },
      {
        "level": 9,
        "hp": 1800,
        "townHall": 5
      },
      {
        "level": 10,
        "hp": 1900,
        "townHall": 6
      },
      {
        "level": 11,
        "hp": 2100,
        "townHall": 7
      },
      {
        "level": 12,
        "hp": 2500,
        "townHall": 11
      },
      {
        "level": 13,
        "hp": 2900,
        "townHall": 12
      },
      {
        "level": 14,
        "hp": 3300,
        "townHall": 13
      },
      {
        "level": 15,
        "hp": 3700,
        "townHall": 14
      },
      {
        "level": 16,
        "hp": 3900,
        "townHall": 15
      }
    ],
    "targetTags": [
      "building",
      "resource"
    ],
    "canAttack": false,
    "isDefense": false,
    "isNeutral": true,
    "maxTownHallIncluded": 15,
    "behavior": {
      "attack": "none",
      "targetableBy": [
        "building",
        "resource"
      ],
      "blocksGroundPathing": true,
      "blocksAirPathing": false
    }
  },
  {
    "id": "elixir-storage",
    "name": "Réservoir d'Élixir",
    "category": "resource",
    "size": 3,
    "levels": [
      {
        "level": 1,
        "hp": 400,
        "townHall": 1
      },
      {
        "level": 2,
        "hp": 600,
        "townHall": 2
      },
      {
        "level": 3,
        "hp": 800,
        "townHall": 2
      },
      {
        "level": 4,
        "hp": 1000,
        "townHall": 3
      },
      {
        "level": 5,
        "hp": 1200,
        "townHall": 3
      },
      {
        "level": 6,
        "hp": 1400,
        "townHall": 3
      },
      {
        "level": 7,
        "hp": 1600,
        "townHall": 4
      },
      {
        "level": 8,
        "hp": 1700,
        "townHall": 4
      },
      {
        "level": 9,
        "hp": 1800,
        "townHall": 5
      },
      {
        "level": 10,
        "hp": 1900,
        "townHall": 6
      },
      {
        "level": 11,
        "hp": 2100,
        "townHall": 7
      },
      {
        "level": 12,
        "hp": 2500,
        "townHall": 11
      },
      {
        "level": 13,
        "hp": 2900,
        "townHall": 12
      },
      {
        "level": 14,
        "hp": 3300,
        "townHall": 13
      },
      {
        "level": 15,
        "hp": 3700,
        "townHall": 14
      },
      {
        "level": 16,
        "hp": 3900,
        "townHall": 15
      }
    ],
    "targetTags": [
      "building",
      "resource"
    ],
    "canAttack": false,
    "isDefense": false,
    "isNeutral": true,
    "maxTownHallIncluded": 15,
    "behavior": {
      "attack": "none",
      "targetableBy": [
        "building",
        "resource"
      ],
      "blocksGroundPathing": true,
      "blocksAirPathing": false
    }
  },
  {
    "id": "dark-elixir-storage",
    "name": "Réservoir d'Élixir Noir",
    "category": "resource",
    "size": 3,
    "levels": [
      {
        "level": 1,
        "hp": 2000,
        "townHall": 7
      },
      {
        "level": 2,
        "hp": 2200,
        "townHall": 7
      },
      {
        "level": 3,
        "hp": 2400,
        "townHall": 8
      },
      {
        "level": 4,
        "hp": 2600,
        "townHall": 8
      },
      {
        "level": 5,
        "hp": 2900,
        "townHall": 9
      },
      {
        "level": 6,
        "hp": 3200,
        "townHall": 9
      },
      {
        "level": 7,
        "hp": 3500,
        "townHall": 12
      },
      {
        "level": 8,
        "hp": 3800,
        "townHall": 13
      },
      {
        "level": 9,
        "hp": 4100,
        "townHall": 14
      },
      {
        "level": 10,
        "hp": 4300,
        "townHall": 15
      }
    ],
    "targetTags": [
      "building",
      "resource"
    ],
    "canAttack": false,
    "isDefense": false,
    "isNeutral": true,
    "maxTownHallIncluded": 15,
    "behavior": {
      "attack": "none",
      "targetableBy": [
        "building",
        "resource"
      ],
      "blocksGroundPathing": true,
      "blocksAirPathing": false
    }
  },
  {
    "id": "spell-factory",
    "name": "Usine de Sorts",
    "category": "building",
    "size": 3,
    "levels": [
      {
        "level": 1,
        "hp": 425,
        "townHall": 5
      },
      {
        "level": 2,
        "hp": 470,
        "townHall": 6
      },
      {
        "level": 3,
        "hp": 520,
        "townHall": 7
      },
      {
        "level": 4,
        "hp": 600,
        "townHall": 9
      },
      {
        "level": 5,
        "hp": 720,
        "townHall": 10
      },
      {
        "level": 6,
        "hp": 840,
        "townHall": 11
      },
      {
        "level": 7,
        "hp": 960,
        "townHall": 13
      },
      {
        "level": 8,
        "hp": 1080,
        "townHall": 15
      }
    ],
    "targetTags": [
      "building"
    ],
    "canAttack": false,
    "isDefense": false,
    "isNeutral": true,
    "maxTownHallIncluded": 15,
    "behavior": {
      "attack": "none",
      "targetableBy": [
        "building"
      ],
      "blocksGroundPathing": true,
      "blocksAirPathing": false
    }
  },
  {
    "id": "dark-spell-factory",
    "name": "Usine de Sorts Noirs",
    "category": "building",
    "size": 3,
    "levels": [
      {
        "level": 1,
        "hp": 600,
        "townHall": 8
      },
      {
        "level": 2,
        "hp": 660,
        "townHall": 8
      },
      {
        "level": 3,
        "hp": 720,
        "townHall": 9
      },
      {
        "level": 4,
        "hp": 780,
        "townHall": 9
      },
      {
        "level": 5,
        "hp": 840,
        "townHall": 10
      },
      {
        "level": 6,
        "hp": 950,
        "townHall": 12
      },
      {
        "level": 7,
        "hp": 1010,
        "townHall": 14
      }
    ],
    "targetTags": [
      "building"
    ],
    "canAttack": false,
    "isDefense": false,
    "isNeutral": true,
    "maxTownHallIncluded": 15,
    "behavior": {
      "attack": "none",
      "targetableBy": [
        "building"
      ],
      "blocksGroundPathing": true,
      "blocksAirPathing": false
    }
  }
] as const;

export type NeutralBuilding = (typeof NEUTRAL_BUILDINGS)[number];

export function getNeutralBuildingById(id: string): NeutralBuilding | undefined {
  return NEUTRAL_BUILDINGS.find((b) => b.id === id);
}
