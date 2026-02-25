import { Router } from 'express';
import { eq, sql } from 'drizzle-orm';
import { db } from '../db/database.js';
import * as schema from '../db/schema.js';
import { analyzeTrade } from '../services/trade-analyzer.js';
import type { FantasyTeam, TradeProposal, TradeAnalysis, CategoryStanding, LeagueSettings } from '@fta/shared';
import { DEFAULT_LEAGUE_SETTINGS } from '@fta/shared';
import { dbRowToPlayer } from '../db/helpers.js';

const router = Router();

/**
 * Safely parse a JSON string, returning a default value on failure.
 */
function parseJsonSafe<T>(value: string | null | undefined, defaultValue: T): T {
  if (!value) return defaultValue;
  try {
    return JSON.parse(value) as T;
  } catch {
    return defaultValue;
  }
}

/**
 * Load a full FantasyTeam from the database by ID.
 */
async function loadTeamWithRoster(teamId: number): Promise<FantasyTeam | null> {
  const teamRows = await db
    .select()
    .from(schema.teams)
    .where(eq(schema.teams.id, teamId))
    .limit(1);

  if (teamRows.length === 0) return null;
  const team = teamRows[0];

  const rosterRows = await db
    .select()
    .from(schema.players)
    .where(eq(schema.players.fantasyTeamId, teamId));

  const roster = rosterRows.map(dbRowToPlayer);
  const keepers = roster.filter((p) => p.contract?.isKeeper);

  const standingRows = await db
    .select()
    .from(schema.categoryStandings)
    .where(eq(schema.categoryStandings.teamId, teamId));

  const categoryStandings: CategoryStanding[] = standingRows.map((s) => ({
    category: s.category,
    value: s.value,
    rank: s.rank,
    points: s.points,
    weightedPoints: s.weightedPoints,
  }));

  return {
    id: team.id,
    name: team.name,
    owner: team.owner,
    roster,
    totalBudget: team.totalBudget,
    spent: team.spent,
    keepers,
    categoryStandings,
    totalPoints: team.totalPoints ?? 0,
    rank: team.rank ?? 0,
  };
}

/**
 * POST /analyze - Analyze a trade proposal.
 *
 * Body: { teamAId: number, teamBId: number, teamAGives: number[], teamBGives: number[] }
 */
router.post('/analyze', async (req, res) => {
  try {
    const { teamAId, teamBId, teamAGives, teamBGives } = req.body as TradeProposal;

    // Validate required fields
    if (!teamAId || !teamBId) {
      return res.status(400).json({ error: 'Both teamAId and teamBId are required' });
    }
    if (!Array.isArray(teamAGives) || !Array.isArray(teamBGives)) {
      return res.status(400).json({ error: 'teamAGives and teamBGives must be arrays of player IDs' });
    }
    if (teamAGives.length === 0 && teamBGives.length === 0) {
      return res.status(400).json({ error: 'At least one side must offer players' });
    }

    // Load teams with full rosters
    const teamA = await loadTeamWithRoster(teamAId);
    if (!teamA) {
      return res.status(404).json({ error: `Team A (id: ${teamAId}) not found` });
    }

    const teamB = await loadTeamWithRoster(teamBId);
    if (!teamB) {
      return res.status(404).json({ error: `Team B (id: ${teamBId}) not found` });
    }

    // Load the specific players being traded
    const teamAPlayerRows = await Promise.all(
      teamAGives.map(async (playerId) => {
        const rows = await db
          .select()
          .from(schema.players)
          .where(eq(schema.players.id, playerId))
          .limit(1);
        return rows[0] ?? null;
      }),
    );

    const teamBPlayerRows = await Promise.all(
      teamBGives.map(async (playerId) => {
        const rows = await db
          .select()
          .from(schema.players)
          .where(eq(schema.players.id, playerId))
          .limit(1);
        return rows[0] ?? null;
      }),
    );

    // Check that all players exist
    const missingA = teamAGives.filter(
      (id, i) => teamAPlayerRows[i] === null,
    );
    const missingB = teamBGives.filter(
      (id, i) => teamBPlayerRows[i] === null,
    );

    if (missingA.length > 0 || missingB.length > 0) {
      return res.status(404).json({
        error: 'Some players not found',
        missingPlayerIds: [...missingA, ...missingB],
      });
    }

    const teamAPlayers = teamAPlayerRows
      .filter((r) => r !== null)
      .map(dbRowToPlayer);
    const teamBPlayers = teamBPlayerRows
      .filter((r) => r !== null)
      .map(dbRowToPlayer);

    // Load league settings for the analyzer
    const settingsRows = await db.select().from(schema.leagueSettings);
    const settingsMap: Record<string, string> = {};
    for (const row of settingsRows) {
      settingsMap[row.key] = row.value;
    }

    // Build a proper LeagueSettings from stored key-value pairs
    const settings: LeagueSettings = { ...DEFAULT_LEAGUE_SETTINGS };
    for (const [key, val] of Object.entries(settingsMap)) {
      try {
        (settings as any)[key] = JSON.parse(val);
      } catch {
        (settings as any)[key] = val;
      }
    }

    // Load all teams for the full league context
    const allTeamRows = await db.select().from(schema.teams);
    const allTeams: FantasyTeam[] = await Promise.all(
      allTeamRows.map(async (t) => {
        if (t.id === teamA.id) return teamA;
        if (t.id === teamB.id) return teamB;
        const rosterRows = await db
          .select()
          .from(schema.players)
          .where(eq(schema.players.fantasyTeamId, t.id));
        const roster = rosterRows.map(dbRowToPlayer);
        return {
          id: t.id,
          name: t.name,
          owner: t.owner,
          roster,
          totalBudget: t.totalBudget,
          spent: t.spent,
          keepers: roster.filter((p) => p.contract?.isKeeper),
          categoryStandings: [],
          totalPoints: t.totalPoints ?? 0,
          rank: t.rank ?? 0,
        };
      }),
    );

    // Run the trade analysis
    const analysis = analyzeTrade(
      { teamA, teamB, teamAGives: teamAPlayers, teamBGives: teamBPlayers, allTeams },
      settings,
    );

    res.json(analysis);
  } catch (error) {
    console.error('Error analyzing trade:', error);
    res.status(500).json({ error: 'Failed to analyze trade' });
  }
});

/**
 * GET /history - Get saved trade analyses, ordered by most recent first.
 */
router.get('/history', async (_req, res) => {
  try {
    const rows = await db
      .select()
      .from(schema.tradeHistory)
      .orderBy(sql`${schema.tradeHistory.createdAt} DESC`);

    const history = rows.map((row) => ({
      id: row.id,
      teamAId: row.teamAId,
      teamBId: row.teamBId,
      teamAPlayerIds: parseJsonSafe(row.teamAPlayerIds, []),
      teamBPlayerIds: parseJsonSafe(row.teamBPlayerIds, []),
      analysis: parseJsonSafe<TradeAnalysis | null>(row.analysis, null),
      createdAt: row.createdAt,
    }));

    res.json(history);
  } catch (error) {
    console.error('Error fetching trade history:', error);
    res.status(500).json({ error: 'Failed to fetch trade history' });
  }
});

/**
 * POST /save - Save a trade analysis to history.
 *
 * Body: { teamAId, teamBId, teamAPlayerIds, teamBPlayerIds, analysis }
 */
router.post('/save', async (req, res) => {
  try {
    const { teamAId, teamBId, teamAPlayerIds, teamBPlayerIds, analysis } = req.body as {
      teamAId: number;
      teamBId: number;
      teamAPlayerIds: number[];
      teamBPlayerIds: number[];
      analysis: TradeAnalysis;
    };

    if (!teamAId || !teamBId) {
      return res.status(400).json({ error: 'Both teamAId and teamBId are required' });
    }
    if (!analysis) {
      return res.status(400).json({ error: 'Trade analysis data is required' });
    }

    const result = await db.insert(schema.tradeHistory).values({
      teamAId,
      teamBId,
      teamAPlayerIds: JSON.stringify(teamAPlayerIds ?? []),
      teamBPlayerIds: JSON.stringify(teamBPlayerIds ?? []),
      analysis: JSON.stringify(analysis),
    }).returning();

    res.status(201).json(result[0]);
  } catch (error) {
    console.error('Error saving trade:', error);
    res.status(500).json({ error: 'Failed to save trade' });
  }
});

export const tradeRoutes = router;
