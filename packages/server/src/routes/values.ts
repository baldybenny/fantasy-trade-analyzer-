import { Router } from 'express';
import { eq, sql } from 'drizzle-orm';
import { db } from '../db/database.js';
import * as schema from '../db/schema.js';
import { calculateAuctionValues } from '../services/auction-values.js';
import type { LeagueSettings } from '@fta/shared';
import { DEFAULT_LEAGUE_SETTINGS } from '@fta/shared';
import { dbRowToPlayer } from '../db/helpers.js';

const router = Router();

/**
 * GET / - Get current auction values for all players, sorted by value descending.
 */
router.get('/', async (_req, res) => {
  try {
    const rows = await db
      .select()
      .from(schema.players)
      .orderBy(sql`${schema.players.auctionValue} DESC`);

    const players = rows
      .filter((r) => r.auctionValue != null)
      .map(dbRowToPlayer);

    res.json(players);
  } catch (error) {
    console.error('Error fetching auction values:', error);
    res.status(500).json({ error: 'Failed to fetch auction values' });
  }
});

/**
 * POST /calculate - Recalculate auction values for all players.
 *
 * Loads all players with their projections, runs the auction value calculation
 * service, updates player records in DB, and returns sorted results.
 */
router.post('/calculate', async (_req, res) => {
  try {
    // Load all players
    const playerRows = await db.select().from(schema.players);
    const players = playerRows.map(dbRowToPlayer);

    // Load all projections to attach to players
    const projectionRows = await db.select().from(schema.projections);

    // Build a map of playerId -> projections and attach as rosProjection
    const projectionsByPlayer: Record<number, typeof projectionRows> = {};
    for (const proj of projectionRows) {
      if (proj.playerId) {
        if (!projectionsByPlayer[proj.playerId]) {
          projectionsByPlayer[proj.playerId] = [];
        }
        projectionsByPlayer[proj.playerId].push(proj);
      }
    }

    // Attach projections as rosProjection on each player (and persist to DB)
    for (const player of players) {
      const projs = projectionsByPlayer[player.id];
      if (projs && projs.length > 0 && !player.rosProjection) {
        // Use the first available projection source as ROS projection
        const p = projs[0];
        const stats = {
          games: 0, pa: p.pa ?? 0, ab: p.ab ?? 0, runs: p.runs ?? 0,
          hits: p.hits ?? 0, doubles: p.doubles ?? 0, triples: p.triples ?? 0,
          hr: p.hr ?? 0, rbi: p.rbi ?? 0, sb: p.sb ?? 0, cs: p.cs ?? 0,
          bb: p.bb ?? 0, so: p.so ?? 0,
          ip: p.ip ?? 0, wins: p.wins ?? 0, losses: p.losses ?? 0,
          saves: p.saves ?? 0, holds: 0, qs: p.qs ?? 0, er: p.er ?? 0,
          hitsAllowed: p.hitsAllowed ?? 0, bbAllowed: p.bbAllowed ?? 0,
          strikeouts: p.strikeouts ?? 0,
        };
        player.rosProjection = stats;
        // Persist to DB for future use
        await db
          .update(schema.players)
          .set({ rosProjection: JSON.stringify(stats), updatedAt: new Date().toISOString() })
          .where(eq(schema.players.id, player.id));
      }
    }

    // Load league settings for the calculator
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

    // Determine number of teams from DB
    const allTeamRows = await db.select().from(schema.teams);
    const numTeams = allTeamRows.length || 12;

    // Run the auction value calculation
    const valuedPlayers = calculateAuctionValues(
      players,
      settings,
      numTeams,
    );

    // Update player records in DB with computed values
    for (const vp of valuedPlayers) {
      await db
        .update(schema.players)
        .set({
          auctionValue: vp.totalValue ?? null,
          vorp: null,
          sgpValue: vp.sgpValue ?? null,
          updatedAt: new Date().toISOString(),
        })
        .where(eq(schema.players.id, vp.playerId));
    }

    // Sort by totalValue descending
    valuedPlayers.sort((a, b) => (b.totalValue ?? 0) - (a.totalValue ?? 0));

    res.json({
      success: true,
      playersUpdated: valuedPlayers.length,
      players: valuedPlayers,
    });
  } catch (error) {
    console.error('Error calculating auction values:', error);
    res.status(500).json({ error: 'Failed to calculate auction values' });
  }
});

export const valuesRoutes = router;
