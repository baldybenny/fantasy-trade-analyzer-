import type { CategoryConfig } from '../types/league.js';

export const DEFAULT_HITTING_CATEGORIES: CategoryConfig[] = [
  { name: 'R', weight: 1.0, inverse: false },
  { name: 'HR', weight: 1.0, inverse: false },
  { name: 'RBI', weight: 1.0, inverse: false },
  { name: 'SB', weight: 1.0, inverse: false },
  { name: 'AVG', weight: 0.5, inverse: false },
  { name: 'OPS', weight: 0.5, inverse: false },
];

export const DEFAULT_PITCHING_CATEGORIES: CategoryConfig[] = [
  { name: 'W', weight: 0.5, inverse: false },
  { name: 'QS', weight: 0.5, inverse: false },
  { name: 'SV', weight: 1.0, inverse: false },
  { name: 'K', weight: 1.0, inverse: false },
  { name: 'ERA', weight: 1.0, inverse: true },
  { name: 'WHIP', weight: 1.0, inverse: true },
];

export const RATE_STAT_BASELINES: Record<string, number> = {
  AVG: 0.260,
  OPS: 0.720,
  ERA: 4.50,
  WHIP: 1.30,
};

export const COUNTING_HITTING_CATEGORIES = ['R', 'HR', 'RBI', 'SB'];
export const RATE_HITTING_CATEGORIES = ['AVG', 'OPS'];
export const COUNTING_PITCHING_CATEGORIES = ['W', 'QS', 'SV', 'K'];
export const RATE_PITCHING_CATEGORIES = ['ERA', 'WHIP'];
