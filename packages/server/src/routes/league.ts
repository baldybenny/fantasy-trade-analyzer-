import { Router } from 'express';
import { eq } from 'drizzle-orm';
import { db } from '../db/database.js';
import * as schema from '../db/schema.js';
import type { LeagueSettings } from '@fta/shared';
import { DEFAULT_LEAGUE_SETTINGS } from '@fta/shared';

const router = Router();

/**
 * GET / - Get all league settings assembled into a LeagueSettings object.
 * Falls back to DEFAULT_LEAGUE_SETTINGS for any missing keys.
 */
router.get('/', async (_req, res) => {
  try {
    const rows = await db.select().from(schema.leagueSettings);

    // Build a map of stored key-value pairs
    const stored: Record<string, string> = {};
    for (const row of rows) {
      stored[row.key] = row.value;
    }

    // Assemble settings, using defaults for any missing keys
    const settings: LeagueSettings = {
      leagueId: stored.leagueId
        ? JSON.parse(stored.leagueId)
        : DEFAULT_LEAGUE_SETTINGS.leagueId,
      name: stored.name
        ? JSON.parse(stored.name)
        : DEFAULT_LEAGUE_SETTINGS.name,
      format: stored.format
        ? JSON.parse(stored.format)
        : DEFAULT_LEAGUE_SETTINGS.format,
      platform: stored.platform
        ? JSON.parse(stored.platform)
        : DEFAULT_LEAGUE_SETTINGS.platform,
      totalBudget: stored.totalBudget
        ? JSON.parse(stored.totalBudget)
        : DEFAULT_LEAGUE_SETTINGS.totalBudget,
      rosterSpots: stored.rosterSpots
        ? JSON.parse(stored.rosterSpots)
        : DEFAULT_LEAGUE_SETTINGS.rosterSpots,
      hittingCategories: stored.hittingCategories
        ? JSON.parse(stored.hittingCategories)
        : DEFAULT_LEAGUE_SETTINGS.hittingCategories,
      pitchingCategories: stored.pitchingCategories
        ? JSON.parse(stored.pitchingCategories)
        : DEFAULT_LEAGUE_SETTINGS.pitchingCategories,
      initialContractYears: stored.initialContractYears
        ? JSON.parse(stored.initialContractYears)
        : DEFAULT_LEAGUE_SETTINGS.initialContractYears,
      extensionCostPerYear: stored.extensionCostPerYear
        ? JSON.parse(stored.extensionCostPerYear)
        : DEFAULT_LEAGUE_SETTINGS.extensionCostPerYear,
      keepersGuaranteed: stored.keepersGuaranteed
        ? JSON.parse(stored.keepersGuaranteed)
        : DEFAULT_LEAGUE_SETTINGS.keepersGuaranteed,
      keepersDroppable: stored.keepersDroppable
        ? JSON.parse(stored.keepersDroppable)
        : DEFAULT_LEAGUE_SETTINGS.keepersDroppable,
      positionSlots: stored.positionSlots
        ? JSON.parse(stored.positionSlots)
        : DEFAULT_LEAGUE_SETTINGS.positionSlots,
      replacementLevel: stored.replacementLevel
        ? JSON.parse(stored.replacementLevel)
        : DEFAULT_LEAGUE_SETTINGS.replacementLevel,
      sgpMultipliers: stored.sgpMultipliers
        ? JSON.parse(stored.sgpMultipliers)
        : DEFAULT_LEAGUE_SETTINGS.sgpMultipliers,
    };

    res.json(settings);
  } catch (error) {
    console.error('Error fetching league settings:', error);
    res.status(500).json({ error: 'Failed to fetch league settings' });
  }
});

/**
 * PUT / - Update league settings.
 * Accepts a full LeagueSettings body and upserts each field as a key-value pair.
 */
router.put('/', async (req, res) => {
  try {
    const body = req.body as LeagueSettings;

    if (!body || typeof body !== 'object') {
      return res.status(400).json({ error: 'Request body must be a LeagueSettings object' });
    }

    const entries = Object.entries(body);

    for (const [key, value] of entries) {
      const jsonValue = JSON.stringify(value);

      // Try to find existing row
      const existing = await db
        .select()
        .from(schema.leagueSettings)
        .where(eq(schema.leagueSettings.key, key))
        .limit(1);

      if (existing.length > 0) {
        await db
          .update(schema.leagueSettings)
          .set({ value: jsonValue })
          .where(eq(schema.leagueSettings.key, key));
      } else {
        await db.insert(schema.leagueSettings).values({ key, value: jsonValue });
      }
    }

    // Return the updated settings
    const rows = await db.select().from(schema.leagueSettings);
    const stored: Record<string, string> = {};
    for (const row of rows) {
      stored[row.key] = row.value;
    }

    const updated: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(stored)) {
      try {
        updated[key] = JSON.parse(val);
      } catch {
        updated[key] = val;
      }
    }

    res.json(updated as unknown as LeagueSettings);
  } catch (error) {
    console.error('Error updating league settings:', error);
    res.status(500).json({ error: 'Failed to update league settings' });
  }
});

/**
 * POST /defaults - Reset league settings to defaults from @fta/shared.
 */
router.post('/defaults', async (_req, res) => {
  try {
    const entries = Object.entries(DEFAULT_LEAGUE_SETTINGS);

    for (const [key, value] of entries) {
      const jsonValue = JSON.stringify(value);

      const existing = await db
        .select()
        .from(schema.leagueSettings)
        .where(eq(schema.leagueSettings.key, key))
        .limit(1);

      if (existing.length > 0) {
        await db
          .update(schema.leagueSettings)
          .set({ value: jsonValue })
          .where(eq(schema.leagueSettings.key, key));
      } else {
        await db.insert(schema.leagueSettings).values({ key, value: jsonValue });
      }
    }

    res.json(DEFAULT_LEAGUE_SETTINGS);
  } catch (error) {
    console.error('Error resetting league settings to defaults:', error);
    res.status(500).json({ error: 'Failed to reset league settings' });
  }
});

export const leagueRoutes = router;
