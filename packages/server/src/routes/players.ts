import { Router } from 'express';
import { eq, like, sql } from 'drizzle-orm';
import { db } from '../db/database.js';
import * as schema from '../db/schema.js';

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
 * Parse a raw player database row into a typed player object.
 */
function parsePlayerRow(row: typeof schema.players.$inferSelect) {
  return {
    id: row.id,
    mlbamId: row.mlbamId ?? undefined,
    name: row.name,
    team: row.team,
    positions: parseJsonSafe(row.positions, []),
    bats: row.bats ?? undefined,
    throws: row.throws ?? undefined,
    birthDate: row.birthDate ?? undefined,
    fantasyTeamId: row.fantasyTeamId ?? undefined,
    rosterStatus: row.rosterStatus,
    contract: row.contractSalary != null
      ? {
          salary: row.contractSalary,
          yearsRemaining: row.contractYears ?? 1,
          isKeeper: row.isKeeper ?? false,
          extensionYear: 0,
          guaranteed: true,
          droppable: true,
        }
      : undefined,
    currentSeason: parseJsonSafe(row.currentStats, undefined),
    rosProjection: parseJsonSafe(row.rosProjection, undefined),
    auctionValue: row.auctionValue ?? undefined,
    vorp: row.vorp ?? undefined,
    sgpValue: row.sgpValue ?? undefined,
  };
}

/**
 * GET / - List all players with pagination.
 * Query params: ?page=1&limit=50
 */
router.get('/', async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string, 10) || 1);
    const limit = Math.min(200, Math.max(1, parseInt(req.query.limit as string, 10) || 50));
    const offset = (page - 1) * limit;

    const rows = await db
      .select()
      .from(schema.players)
      .limit(limit)
      .offset(offset);

    const players = rows.map(parsePlayerRow);

    // Get total count for pagination metadata
    const countResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(schema.players);
    const total = countResult[0]?.count ?? 0;

    res.json({
      data: players,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('Error fetching players:', error);
    res.status(500).json({ error: 'Failed to fetch players' });
  }
});

/**
 * GET /search - Search players by name with fuzzy match.
 * Query params: ?q=trout
 */
router.get('/search', async (req, res) => {
  try {
    const query = req.query.q as string;
    if (!query || query.trim().length === 0) {
      return res.status(400).json({ error: 'Search query parameter "q" is required' });
    }

    const searchPattern = `%${query.trim()}%`;

    const rows = await db
      .select()
      .from(schema.players)
      .where(like(schema.players.name, searchPattern))
      .limit(50);

    const players = rows.map(parsePlayerRow);

    res.json(players);
  } catch (error) {
    console.error('Error searching players:', error);
    res.status(500).json({ error: 'Failed to search players' });
  }
});

/**
 * GET /:id - Get a single player by ID with full detail.
 */
router.get('/:id', async (req, res) => {
  try {
    const playerId = parseInt(req.params.id, 10);
    if (isNaN(playerId)) {
      return res.status(400).json({ error: 'Invalid player ID' });
    }

    const rows = await db
      .select()
      .from(schema.players)
      .where(eq(schema.players.id, playerId))
      .limit(1);

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Player not found' });
    }

    const player = parsePlayerRow(rows[0]);

    // Also fetch projections for this player
    const projectionRows = await db
      .select()
      .from(schema.projections)
      .where(eq(schema.projections.playerId, playerId));

    // Fetch statcast data if available
    const statcastRows = await db
      .select()
      .from(schema.statcastData)
      .where(eq(schema.statcastData.playerId, playerId))
      .limit(1);

    res.json({
      ...player,
      projections: projectionRows,
      statcast: statcastRows[0] ?? null,
    });
  } catch (error) {
    console.error('Error fetching player:', error);
    res.status(500).json({ error: 'Failed to fetch player' });
  }
});

export const playerRoutes = router;
