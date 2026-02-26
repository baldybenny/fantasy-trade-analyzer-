import { Router } from 'express';
import { eq, sql } from 'drizzle-orm';
import { db } from '../db/database.js';
import * as schema from '../db/schema.js';
import { calculateAuctionValues } from '../services/auction-values.js';
import { calculateInflation, applyInflation } from '../services/inflation.js';
import type { LeagueSettings, ProjectionSource } from '@fta/shared';
import { DEFAULT_LEAGUE_SETTINGS, DEFAULT_PROJECTION_WEIGHTS } from '@fta/shared';
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

    // Load league settings for the calculator (needed for projection weights)
    const settingsRows = await db.select().from(schema.leagueSettings);
    const settingsMap: Record<string, string> = {};
    for (const row of settingsRows) {
      settingsMap[row.key] = row.value;
    }

    const settings: LeagueSettings = { ...DEFAULT_LEAGUE_SETTINGS };
    for (const [key, val] of Object.entries(settingsMap)) {
      try {
        (settings as any)[key] = JSON.parse(val);
      } catch {
        (settings as any)[key] = val;
      }
    }

    // Build weighted composite projection for each player
    const weights: Record<string, number> = settings.projectionWeights ?? { ...DEFAULT_PROJECTION_WEIGHTS };

    for (const player of players) {
      const projs = projectionsByPlayer[player.id];
      if (projs && projs.length > 0) {
        // Calculate total weight of available sources for this player
        let totalWeight = 0;
        for (const p of projs) {
          totalWeight += weights[p.source] ?? 0;
        }

        // Fall back to equal weighting if no configured weights match
        if (totalWeight === 0) {
          totalWeight = projs.length;
          for (const p of projs) {
            (p as any)._weight = 1;
          }
        } else {
          for (const p of projs) {
            (p as any)._weight = weights[p.source] ?? 0;
          }
        }

        // Weighted average across all available projection sources
        const stats = {
          games: 0,
          pa: 0, ab: 0, runs: 0, hits: 0, doubles: 0, triples: 0,
          hr: 0, rbi: 0, sb: 0, cs: 0, bb: 0, so: 0,
          ip: 0, wins: 0, losses: 0, saves: 0, holds: 0,
          qs: 0, er: 0, hitsAllowed: 0, bbAllowed: 0, strikeouts: 0,
        };

        for (const p of projs) {
          const w = (p as any)._weight / totalWeight;
          stats.pa += (p.pa ?? 0) * w;
          stats.ab += (p.ab ?? 0) * w;
          stats.runs += (p.runs ?? 0) * w;
          stats.hits += (p.hits ?? 0) * w;
          stats.doubles += (p.doubles ?? 0) * w;
          stats.triples += (p.triples ?? 0) * w;
          stats.hr += (p.hr ?? 0) * w;
          stats.rbi += (p.rbi ?? 0) * w;
          stats.sb += (p.sb ?? 0) * w;
          stats.cs += (p.cs ?? 0) * w;
          stats.bb += (p.bb ?? 0) * w;
          stats.so += (p.so ?? 0) * w;
          stats.ip += (p.ip ?? 0) * w;
          stats.wins += (p.wins ?? 0) * w;
          stats.losses += (p.losses ?? 0) * w;
          stats.saves += (p.saves ?? 0) * w;
          stats.qs += (p.qs ?? 0) * w;
          stats.er += (p.er ?? 0) * w;
          stats.hitsAllowed += (p.hitsAllowed ?? 0) * w;
          stats.bbAllowed += (p.bbAllowed ?? 0) * w;
          stats.strikeouts += (p.strikeouts ?? 0) * w;
        }

        player.rosProjection = stats;
        // Persist to DB for future use
        await db
          .update(schema.players)
          .set({ rosProjection: JSON.stringify(stats), updatedAt: new Date().toISOString() })
          .where(eq(schema.players.id, player.id));
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

    // Compute inflation from keeper data
    // We need players with their freshly-computed auction values for inflation calc
    const playersWithValues = players.map((p) => {
      const vp = valuedPlayers.find((v) => v.playerId === p.id);
      return vp ? { ...p, auctionValue: vp.totalValue } : p;
    });
    const inflation = calculateInflation(playersWithValues, settings, numTeams);

    // Add inflatedValue to each valued player
    const valuedWithInflation = valuedPlayers.map((vp) => ({
      ...vp,
      inflatedValue: applyInflation(vp.totalValue, inflation.inflationRate),
    }));

    // Update player records in DB with computed values
    for (const vp of valuedWithInflation) {
      await db
        .update(schema.players)
        .set({
          auctionValue: vp.totalValue ?? null,
          inflatedValue: vp.inflatedValue ?? null,
          vorp: vp.vorp ?? null,
          sgpValue: vp.sgpValue ?? null,
          categoryValues: JSON.stringify(vp.categoryValues),
          updatedAt: new Date().toISOString(),
        })
        .where(eq(schema.players.id, vp.playerId));
    }

    // Sort by totalValue descending
    valuedWithInflation.sort((a, b) => (b.totalValue ?? 0) - (a.totalValue ?? 0));

    res.json({
      success: true,
      playersUpdated: valuedWithInflation.length,
      inflationRate: inflation.inflationRate,
      inflationPercentage: inflation.inflationPercentage,
      players: valuedWithInflation,
    });
  } catch (error) {
    console.error('Error calculating auction values:', error);
    res.status(500).json({ error: 'Failed to calculate auction values' });
  }
});

export const valuesRoutes = router;
