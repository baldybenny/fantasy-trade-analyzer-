import { Router } from 'express';
import { eq } from 'drizzle-orm';
import { db } from '../db/database.js';
import * as schema from '../db/schema.js';
import {
  importFanGraphsBatting,
  importFanGraphsPitching,
  importSavant,
  importFanTraxRoster,
} from '../importers/index.js';
import type { ProjectionSource } from '@fta/shared';

const router = Router();

/**
 * Find an existing player by name, or return null.
 */
async function findPlayerByName(name: string) {
  const rows = await db
    .select()
    .from(schema.players)
    .where(eq(schema.players.name, name))
    .limit(1);
  return rows[0] ?? null;
}

/**
 * Create a new player record with minimal info and return the inserted row.
 */
async function createPlayer(name: string, team: string, positions: string[]) {
  const result = await db
    .insert(schema.players)
    .values({
      name,
      team,
      positions: JSON.stringify(positions),
    })
    .returning();
  return result[0];
}

/**
 * POST /import - Import CSV data.
 *
 * Body: { type: string, source: string, csvContent: string }
 *   - type: 'batting' | 'pitching' | 'savant' | 'roster'
 *   - source: 'steamer' | 'zips' | 'atc' (for batting/pitching projections)
 *   - csvContent: raw CSV string
 */
router.post('/import', async (req, res) => {
  try {
    const { type, source, csvContent } = req.body as {
      type?: string;
      source?: string;
      csvContent?: string;
    };

    if (!type) {
      return res.status(400).json({ error: 'Import type is required' });
    }
    if (!csvContent) {
      return res.status(400).json({ error: 'csvContent is required' });
    }

    switch (type) {
      case 'batting':
        return await handleBattingImport(csvContent, (source ?? 'steamer') as ProjectionSource, res);
      case 'pitching':
        return await handlePitchingImport(csvContent, (source ?? 'steamer') as ProjectionSource, res);
      case 'savant':
        return await handleSavantImport(csvContent, res);
      case 'roster':
        return await handleRosterImport(csvContent, res);
      default:
        return res.status(400).json({ error: `Unknown import type: ${type}. Must be batting, pitching, savant, or roster.` });
    }
  } catch (error) {
    console.error('Error during import:', error);
    res.status(500).json({ error: 'Import failed' });
  }
});

/**
 * Import FanGraphs batting projections.
 */
async function handleBattingImport(
  csvContent: string,
  source: ProjectionSource,
  res: import('express').Response,
) {
  const result = importFanGraphsBatting(csvContent, source);

  if (result.data.length === 0) {
    return res.status(400).json({
      error: 'No valid batting records parsed from CSV',
      parseErrors: result.errors,
    });
  }

  let imported = 0;
  let playersCreated = 0;

  for (const record of result.data) {
    // Find or create the player
    let player = await findPlayerByName(record.playerName);
    if (!player) {
      player = await createPlayer(record.playerName, '', []);
      playersCreated++;
    }

    // Check for existing projection with same player+source
    const existing = await db
      .select()
      .from(schema.projections)
      .where(eq(schema.projections.playerName, record.playerName))
      .limit(100);

    const existingForSource = existing.find(
      (p) => p.source === source && p.isPitcher === false,
    );

    if (existingForSource) {
      // Update existing projection
      await db
        .update(schema.projections)
        .set({
          playerId: player.id,
          pa: record.pa,
          ab: record.ab,
          hits: record.hits,
          doubles: record.doubles,
          triples: record.triples,
          hr: record.hr,
          runs: record.runs,
          rbi: record.rbi,
          sb: record.sb,
          cs: record.cs,
          bb: record.bb,
          so: record.so,
        })
        .where(eq(schema.projections.id, existingForSource.id));
    } else {
      // Insert new projection
      await db.insert(schema.projections).values({
        playerId: player.id,
        playerName: record.playerName,
        source,
        isPitcher: false,
        pa: record.pa,
        ab: record.ab,
        hits: record.hits,
        doubles: record.doubles,
        triples: record.triples,
        hr: record.hr,
        runs: record.runs,
        rbi: record.rbi,
        sb: record.sb,
        cs: record.cs,
        bb: record.bb,
        so: record.so,
        ip: 0,
        wins: 0,
        losses: 0,
        saves: 0,
        qs: 0,
        er: 0,
        hitsAllowed: 0,
        bbAllowed: 0,
        strikeouts: 0,
      });
    }

    imported++;
  }

  res.json({
    success: true,
    type: 'batting',
    source,
    imported,
    playersCreated,
    parseErrors: result.errors,
  });
}

/**
 * Import FanGraphs pitching projections.
 */
async function handlePitchingImport(
  csvContent: string,
  source: ProjectionSource,
  res: import('express').Response,
) {
  const result = importFanGraphsPitching(csvContent, source);

  if (result.data.length === 0) {
    return res.status(400).json({
      error: 'No valid pitching records parsed from CSV',
      parseErrors: result.errors,
    });
  }

  let imported = 0;
  let playersCreated = 0;

  for (const record of result.data) {
    // Find or create the player
    let player = await findPlayerByName(record.playerName);
    if (!player) {
      player = await createPlayer(record.playerName, '', ['SP']);
      playersCreated++;
    }

    // Check for existing projection with same player+source
    const existing = await db
      .select()
      .from(schema.projections)
      .where(eq(schema.projections.playerName, record.playerName))
      .limit(100);

    const existingForSource = existing.find(
      (p) => p.source === source && p.isPitcher === true,
    );

    if (existingForSource) {
      // Update existing projection
      await db
        .update(schema.projections)
        .set({
          playerId: player.id,
          ip: record.ip,
          wins: record.wins,
          losses: record.losses,
          saves: record.saves,
          qs: record.qs,
          er: record.er,
          hitsAllowed: record.hitsAllowed,
          bbAllowed: record.bbAllowed,
          strikeouts: record.strikeouts,
        })
        .where(eq(schema.projections.id, existingForSource.id));
    } else {
      // Insert new projection
      await db.insert(schema.projections).values({
        playerId: player.id,
        playerName: record.playerName,
        source,
        isPitcher: true,
        pa: 0,
        ab: 0,
        hits: 0,
        doubles: 0,
        triples: 0,
        hr: 0,
        runs: 0,
        rbi: 0,
        sb: 0,
        cs: 0,
        bb: 0,
        so: 0,
        ip: record.ip,
        wins: record.wins,
        losses: record.losses,
        saves: record.saves,
        qs: record.qs,
        er: record.er,
        hitsAllowed: record.hitsAllowed,
        bbAllowed: record.bbAllowed,
        strikeouts: record.strikeouts,
      });
    }

    imported++;
  }

  res.json({
    success: true,
    type: 'pitching',
    source,
    imported,
    playersCreated,
    parseErrors: result.errors,
  });
}

/**
 * Import Baseball Savant statcast data.
 */
async function handleSavantImport(
  csvContent: string,
  res: import('express').Response,
) {
  const result = importSavant(csvContent);

  if (result.data.length === 0) {
    return res.status(400).json({
      error: 'No valid statcast records parsed from CSV',
      parseErrors: result.errors,
    });
  }

  let imported = 0;
  let playersCreated = 0;

  for (const record of result.data) {
    // Find or create the player
    let player = await findPlayerByName(record.playerName);
    if (!player) {
      player = await createPlayer(record.playerName, '', []);
      playersCreated++;
    }

    // Update player's mlbamId if we have one and they don't
    if (record.mlbamId && !player.mlbamId) {
      await db
        .update(schema.players)
        .set({ mlbamId: record.mlbamId })
        .where(eq(schema.players.id, player.id));
    }

    // Check for existing statcast data for this player
    const existing = await db
      .select()
      .from(schema.statcastData)
      .where(eq(schema.statcastData.playerName, record.playerName))
      .limit(1);

    if (existing.length > 0) {
      // Update existing statcast record
      await db
        .update(schema.statcastData)
        .set({
          playerId: player.id,
          mlbamId: record.mlbamId,
          xba: record.xba,
          xslg: record.xslg,
          xwoba: record.xwoba,
          exitVeloAvg: record.exitVeloAvg,
          barrelPct: record.barrelPct,
          hardHitPct: record.hardHitPct,
          sprintSpeed: record.sprintSpeed,
          kPct: record.kPct,
          bbPct: record.bbPct,
        })
        .where(eq(schema.statcastData.id, existing[0].id));
    } else {
      // Insert new statcast record
      await db.insert(schema.statcastData).values({
        playerId: player.id,
        playerName: record.playerName,
        mlbamId: record.mlbamId,
        xba: record.xba,
        xslg: record.xslg,
        xwoba: record.xwoba,
        exitVeloAvg: record.exitVeloAvg,
        barrelPct: record.barrelPct,
        hardHitPct: record.hardHitPct,
        sprintSpeed: record.sprintSpeed,
        kPct: record.kPct,
        bbPct: record.bbPct,
      });
    }

    imported++;
  }

  res.json({
    success: true,
    type: 'savant',
    imported,
    playersCreated,
    parseErrors: result.errors,
  });
}

/**
 * Import FanTrax roster data.
 * Creates/updates teams and assigns players to their fantasy teams.
 */
async function handleRosterImport(
  csvContent: string,
  res: import('express').Response,
) {
  const result = importFanTraxRoster(csvContent);

  if (result.data.length === 0) {
    return res.status(400).json({
      error: 'No valid roster records parsed from CSV',
      parseErrors: result.errors,
    });
  }

  // Collect unique fantasy team names from the import
  const teamNames = new Set<string>();
  for (const record of result.data) {
    if (record.fantasyTeam) {
      teamNames.add(record.fantasyTeam);
    }
  }

  // Create or find teams by name, building a name -> id map
  const teamMap: Record<string, number> = {};
  for (const teamName of teamNames) {
    const existing = await db
      .select()
      .from(schema.teams)
      .where(eq(schema.teams.name, teamName))
      .limit(1);

    if (existing.length > 0) {
      teamMap[teamName] = existing[0].id;
    } else {
      const inserted = await db
        .insert(schema.teams)
        .values({
          name: teamName,
          owner: teamName,
        })
        .returning();
      teamMap[teamName] = inserted[0].id;
    }
  }

  let playersImported = 0;
  let playersCreated = 0;
  const teamsCreated = Object.keys(teamMap).length;

  for (const record of result.data) {
    const fantasyTeamId = record.fantasyTeam ? teamMap[record.fantasyTeam] ?? null : null;

    // Find or create the player
    let player = await findPlayerByName(record.playerName);
    if (!player) {
      player = await createPlayer(record.playerName, record.team, record.positions);
      playersCreated++;
    }

    // Update the player with roster assignment data
    await db
      .update(schema.players)
      .set({
        team: record.team || player.team,
        positions: JSON.stringify(
          record.positions.length > 0 ? record.positions : JSON.parse(player.positions),
        ),
        fantasyTeamId: fantasyTeamId,
        rosterStatus: record.status || 'ROSTER',
        contractSalary: record.salary > 0 ? record.salary : player.contractSalary,
        contractYears: record.contractYears > 0 ? record.contractYears : player.contractYears,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(schema.players.id, player.id));

    playersImported++;
  }

  // Recalculate team spending totals
  for (const [teamName, teamId] of Object.entries(teamMap)) {
    const teamPlayers = await db
      .select()
      .from(schema.players)
      .where(eq(schema.players.fantasyTeamId, teamId));

    const totalSpent = teamPlayers.reduce(
      (sum, p) => sum + (p.contractSalary ?? 0),
      0,
    );

    await db
      .update(schema.teams)
      .set({ spent: totalSpent })
      .where(eq(schema.teams.id, teamId));
  }

  res.json({
    success: true,
    type: 'roster',
    playersImported,
    playersCreated,
    teamsCreated,
    teamNames: [...teamNames],
    parseErrors: result.errors,
  });
}

export const importRoutes = router;
