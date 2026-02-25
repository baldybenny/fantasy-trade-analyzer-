import { Router } from 'express';
import { eq } from 'drizzle-orm';
import { db } from '../db/database.js';
import * as schema from '../db/schema.js';
import { calculateStandings } from '../services/standings-simulator.js';
import type { FantasyTeam, CategoryStanding, LeagueSettings } from '@fta/shared';
import { DEFAULT_LEAGUE_SETTINGS } from '@fta/shared';
import { dbRowToPlayer } from '../db/helpers.js';
import type { StandingsSnapshot } from '../services/standings-simulator.js';

const router = Router();

/**
 * GET / - Return full standings with category breakdown.
 *
 * Loads all teams, attempts to use cached category_standings data.
 * If no cached data exists, calls the standings simulator service
 * to compute fresh standings, stores them, and returns the result.
 */
router.get('/', async (_req, res) => {
  try {
    const allTeams = await db.select().from(schema.teams);

    if (allTeams.length === 0) {
      return res.json([]);
    }

    // Check if we have cached category standings
    const cachedStandings = await db.select().from(schema.categoryStandings);

    let standings: FantasyTeam[];

    if (cachedStandings.length > 0) {
      // Use cached standings -- build FantasyTeam objects from cached data
      standings = await Promise.all(
        allTeams.map(async (team) => {
          const rosterRows = await db
            .select()
            .from(schema.players)
            .where(eq(schema.players.fantasyTeamId, team.id));

          const roster = rosterRows.map(dbRowToPlayer);
          const keepers = roster.filter((p) => p.contract?.isKeeper);

          const teamStandings = cachedStandings
            .filter((s) => s.teamId === team.id)
            .map((s) => ({
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
            categoryStandings: teamStandings,
            totalPoints: team.totalPoints ?? 0,
            rank: team.rank ?? 0,
          };
        }),
      );
    } else {
      // No cached standings -- compute fresh via service
      // Build FantasyTeam objects first
      const teamsWithRosters: FantasyTeam[] = await Promise.all(
        allTeams.map(async (team) => {
          const rosterRows = await db
            .select()
            .from(schema.players)
            .where(eq(schema.players.fantasyTeamId, team.id));

          const roster = rosterRows.map(dbRowToPlayer);
          const keepers = roster.filter((p) => p.contract?.isKeeper);

          return {
            id: team.id,
            name: team.name,
            owner: team.owner,
            roster,
            totalBudget: team.totalBudget,
            spent: team.spent,
            keepers,
            categoryStandings: [],
            totalPoints: 0,
            rank: 0,
          };
        }),
      );

      // Load league settings for the simulator
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

      const snapshot = calculateStandings(teamsWithRosters, settings);

      // Convert StandingsSnapshot back to FantasyTeam[] for caching and response
      // Map teamId -> team data from teamsWithRosters
      const teamMap = new Map(teamsWithRosters.map((t) => [t.id, t]));

      standings = snapshot.teamStandings.map((ts) => {
        const team = teamMap.get(ts.teamId)!;
        return {
          ...team,
          categoryStandings: ts.standings,
          totalPoints: ts.totalPoints,
          rank: ts.rank,
        };
      });

      // Cache the computed standings in the database
      // First clear old standings
      await db.delete(schema.categoryStandings);

      for (const team of standings) {
        // Update team totals
        await db
          .update(schema.teams)
          .set({
            totalPoints: team.totalPoints,
            rank: team.rank,
          })
          .where(eq(schema.teams.id, team.id));

        // Insert category standings
        for (const cs of team.categoryStandings) {
          await db.insert(schema.categoryStandings).values({
            teamId: team.id,
            category: cs.category,
            value: cs.value,
            rank: cs.rank,
            points: cs.points,
            weightedPoints: cs.weightedPoints,
          });
        }
      }
    }

    // Sort by total points descending
    standings.sort((a, b) => b.totalPoints - a.totalPoints);

    res.json(standings);
  } catch (error) {
    console.error('Error calculating standings:', error);
    res.status(500).json({ error: 'Failed to calculate standings' });
  }
});

export const standingsRoutes = router;
