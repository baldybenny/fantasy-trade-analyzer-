import { Router } from 'express';
import { eq } from 'drizzle-orm';
import { db } from '../db/database.js';
import * as schema from '../db/schema.js';
import { dbRowToPlayer } from '../db/helpers.js';
import { DEFAULT_LEAGUE_SETTINGS } from '@fta/shared';
import type { LeagueSettings } from '@fta/shared';
import { calculateInflation, analyzeKeepers } from '../services/inflation.js';
import { calculatePositionalScarcity } from '../services/positional-scarcity.js';

const router = Router();

/**
 * Load all players as typed Player objects.
 */
async function loadAllPlayers() {
  const rows = await db.select().from(schema.players);
  return rows.map(dbRowToPlayer);
}

/**
 * Load league settings from DB.
 */
async function loadSettings(): Promise<LeagueSettings> {
  const settingsRows = await db.select().from(schema.leagueSettings);
  const settings: LeagueSettings = { ...DEFAULT_LEAGUE_SETTINGS };
  for (const row of settingsRows) {
    try {
      (settings as any)[row.key] = JSON.parse(row.value);
    } catch {
      (settings as any)[row.key] = row.value;
    }
  }
  return settings;
}

/**
 * Get the number of teams.
 */
async function getNumTeams(): Promise<number> {
  const rows = await db.select().from(schema.teams);
  return rows.length || 12;
}

/**
 * GET /inflation - League-wide inflation data.
 */
router.get('/inflation', async (_req, res) => {
  try {
    const [players, settings, numTeams] = await Promise.all([
      loadAllPlayers(),
      loadSettings(),
      getNumTeams(),
    ]);

    const inflation = calculateInflation(players, settings, numTeams);
    res.json(inflation);
  } catch (error) {
    console.error('Error calculating inflation:', error);
    res.status(500).json({ error: 'Failed to calculate inflation' });
  }
});

/**
 * GET /scarcity - Positional scarcity breakdown.
 */
router.get('/scarcity', async (_req, res) => {
  try {
    const players = await loadAllPlayers();
    const scarcity = calculatePositionalScarcity(players);
    res.json(scarcity);
  } catch (error) {
    console.error('Error calculating positional scarcity:', error);
    res.status(500).json({ error: 'Failed to calculate positional scarcity' });
  }
});

/**
 * GET /analysis?teamId=N - Keeper candidates for a team (or all teams).
 *
 * Returns inflation, scarcity, and keeper candidates.
 */
router.get('/analysis', async (req, res) => {
  try {
    const teamId = req.query.teamId ? Number(req.query.teamId) : null;

    const [allPlayers, settings, numTeams] = await Promise.all([
      loadAllPlayers(),
      loadSettings(),
      getNumTeams(),
    ]);

    const inflation = calculateInflation(allPlayers, settings, numTeams);
    const scarcity = calculatePositionalScarcity(allPlayers);

    // Filter to team players if teamId provided, otherwise all rostered players
    const teamPlayers = teamId != null
      ? allPlayers.filter((p) => p.fantasyTeamId === teamId)
      : allPlayers.filter((p) => p.fantasyTeamId != null);

    const candidates = analyzeKeepers(teamPlayers, settings, inflation.inflationRate);

    res.json({
      inflation,
      scarcity,
      candidates,
    });
  } catch (error) {
    console.error('Error analyzing keepers:', error);
    res.status(500).json({ error: 'Failed to analyze keepers' });
  }
});

export const keeperRoutes = router;
