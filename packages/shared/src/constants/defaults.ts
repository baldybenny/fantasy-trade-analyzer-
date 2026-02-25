import type { LeagueSettings } from '../types/league.js';
import { DEFAULT_HITTING_CATEGORIES, DEFAULT_PITCHING_CATEGORIES } from './categories.js';
import { DEFAULT_POSITION_SLOTS, DEFAULT_REPLACEMENT_LEVEL, DEFAULT_SGP_MULTIPLIERS } from './positions.js';

export const DEFAULT_LEAGUE_SETTINGS: LeagueSettings = {
  leagueId: '7jbvtkklmka7miso',
  name: 'Fantasy Baseball League',
  format: 'roto',
  platform: 'fantrax',
  totalBudget: 260,
  rosterSpots: 23,
  hittingCategories: DEFAULT_HITTING_CATEGORIES,
  pitchingCategories: DEFAULT_PITCHING_CATEGORIES,
  initialContractYears: 2,
  extensionCostPerYear: 5,
  keepersGuaranteed: true,
  keepersDroppable: true,
  positionSlots: DEFAULT_POSITION_SLOTS,
  replacementLevel: DEFAULT_REPLACEMENT_LEVEL,
  sgpMultipliers: DEFAULT_SGP_MULTIPLIERS,
};
