import { z } from 'zod';
import type { Position } from './player.js';

export interface CategoryConfig {
  name: string;
  weight: number;
  inverse: boolean;
}

export interface LeagueSettings {
  leagueId: string;
  name: string;
  format: 'roto' | 'h2h' | 'points';
  platform: 'fantrax' | 'espn' | 'yahoo';

  // Budget
  totalBudget: number;
  rosterSpots: number;

  // Categories
  hittingCategories: CategoryConfig[];
  pitchingCategories: CategoryConfig[];

  // Keepers
  initialContractYears: number;
  extensionCostPerYear: number;
  keepersGuaranteed: boolean;
  keepersDroppable: boolean;

  // Position requirements
  positionSlots: Record<string, number>;
  replacementLevel: Record<string, number>;
  sgpMultipliers: Record<string, number>;
}

export function getAllCategories(settings: LeagueSettings): CategoryConfig[] {
  return [...settings.hittingCategories, ...settings.pitchingCategories];
}

export function getTotalCategoryWeight(settings: LeagueSettings): number {
  return getAllCategories(settings).reduce((sum, c) => sum + c.weight, 0);
}

export function getCategoryWeight(settings: LeagueSettings, categoryName: string): number {
  const cat = getAllCategories(settings).find((c) => c.name === categoryName);
  return cat?.weight ?? 1.0;
}

export function isInverseCategory(settings: LeagueSettings, categoryName: string): boolean {
  const cat = getAllCategories(settings).find((c) => c.name === categoryName);
  return cat?.inverse ?? false;
}

export const CategoryConfigSchema = z.object({
  name: z.string(),
  weight: z.number().default(1.0),
  inverse: z.boolean().default(false),
});

export const LeagueSettingsSchema = z.object({
  leagueId: z.string(),
  name: z.string(),
  format: z.enum(['roto', 'h2h', 'points']),
  platform: z.enum(['fantrax', 'espn', 'yahoo']),
  totalBudget: z.number().default(260),
  rosterSpots: z.number().default(23),
  hittingCategories: z.array(CategoryConfigSchema),
  pitchingCategories: z.array(CategoryConfigSchema),
  initialContractYears: z.number().default(2),
  extensionCostPerYear: z.number().default(5),
  keepersGuaranteed: z.boolean().default(true),
  keepersDroppable: z.boolean().default(true),
  positionSlots: z.record(z.string(), z.number()),
  replacementLevel: z.record(z.string(), z.number()),
  sgpMultipliers: z.record(z.string(), z.number()),
});
