import { Router } from 'express';
import { eq } from 'drizzle-orm';
import { db } from '../db/database.js';
import * as schema from '../db/schema.js';
import type { FantasyTeam, CategoryStanding } from '@fta/shared';
import { dbRowToPlayer } from '../db/helpers.js';

const router = Router();

/**
 * GET / - List all teams with basic info.
 */
router.get('/', async (_req, res) => {
  try {
    const allTeams = await db.select().from(schema.teams);

    const teamsWithBasicInfo = allTeams.map((t) => ({
      id: t.id,
      name: t.name,
      owner: t.owner,
      totalBudget: t.totalBudget,
      spent: t.spent,
      totalPoints: t.totalPoints,
      rank: t.rank,
      createdAt: t.createdAt,
    }));

    res.json(teamsWithBasicInfo);
  } catch (error) {
    console.error('Error fetching teams:', error);
    res.status(500).json({ error: 'Failed to fetch teams' });
  }
});

/**
 * GET /:id - Get team detail with full roster (join players) and category standings.
 */
router.get('/:id', async (req, res) => {
  try {
    const teamId = parseInt(req.params.id, 10);
    if (isNaN(teamId)) {
      return res.status(400).json({ error: 'Invalid team ID' });
    }

    const teamRows = await db
      .select()
      .from(schema.teams)
      .where(eq(schema.teams.id, teamId))
      .limit(1);

    if (teamRows.length === 0) {
      return res.status(404).json({ error: 'Team not found' });
    }

    const team = teamRows[0];

    // Fetch roster (players assigned to this team)
    const rosterRows = await db
      .select()
      .from(schema.players)
      .where(eq(schema.players.fantasyTeamId, teamId));

    const roster = rosterRows.map(dbRowToPlayer);

    // Fetch category standings for this team
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

    // Identify keepers from roster
    const keepers = roster.filter((p) => p.contract?.isKeeper);

    const result: FantasyTeam = {
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

    res.json(result);
  } catch (error) {
    console.error('Error fetching team detail:', error);
    res.status(500).json({ error: 'Failed to fetch team detail' });
  }
});

/**
 * POST / - Create a new team.
 */
router.post('/', async (req, res) => {
  try {
    const { name, owner, totalBudget } = req.body as {
      name?: string;
      owner?: string;
      totalBudget?: number;
    };

    if (!name) {
      return res.status(400).json({ error: 'Team name is required' });
    }

    const result = await db.insert(schema.teams).values({
      name,
      owner: owner ?? '',
      totalBudget: totalBudget ?? 260,
    }).returning();

    res.status(201).json(result[0]);
  } catch (error) {
    console.error('Error creating team:', error);
    res.status(500).json({ error: 'Failed to create team' });
  }
});

export const teamRoutes = router;
