export const WALL_HP: Record<number, number> = {
  1: 100, 2: 200,  3: 400,  4: 800,  5: 1200,
  6: 1800, 7: 2400, 8: 3000, 9: 3500, 10: 4000,
  11: 5000, 12: 7000, 13: 8000, 14: 9000, 15: 10000, 16: 11000,
};

export const MAX_WALL_LEVEL = 16;

export interface WallPlacement {
  instanceId: string;
  x:          number; // top-left tile x
  y:          number; // top-left tile y
  level:      number;
}
