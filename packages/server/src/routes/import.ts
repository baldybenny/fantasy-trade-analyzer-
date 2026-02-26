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
import type { ProjectionSource, ProjectionRecord } from '@fta/shared';
import { normalizeName, namesMatch } from '@fta/shared';
import {
  fetchFanGraphsProjections,
  transformFanGraphsBatting,
  transformFanGraphsPitching,
  type FanGraphsStatType,
  type FanGraphsTransformResult,
} from '../services/fangraphs-fetcher.js';
import { fetchSavantData } from '../services/savant-fetcher.js';
import { fetchFantasyProsBatting, fetchFantasyProsPitching } from '../services/fantasypros-fetcher.js';
import { fetchRotoChampBatting, fetchRotoChampPitching } from '../services/rotochamp-fetcher.js';
import type { StatcastRecord } from '../importers/index.js';

const router = Router();

// ---------------------------------------------------------------------------
// Player helpers
// ---------------------------------------------------------------------------

async function findPlayerByName(name: string) {
  const rows = await db
    .select()
    .from(schema.players)
    .where(eq(schema.players.name, name))
    .limit(1);
  return rows[0] ?? null;
}

/**
 * Enhanced player lookup: MLBAM ID → exact name → normalized fuzzy name.
 */
async function findPlayer(name: string, mlbamId?: number) {
  // 1. MLBAM ID lookup (most reliable)
  if (mlbamId) {
    const rows = await db
      .select()
      .from(schema.players)
      .where(eq(schema.players.mlbamId, mlbamId))
      .limit(1);
    if (rows[0]) return rows[0];
  }

  // 2. Exact name match
  const exact = await findPlayerByName(name);
  if (exact) return exact;

  // 3. Normalized fuzzy name match
  const allPlayers = await db.select().from(schema.players);
  const match = allPlayers.find((p) => namesMatch(p.name, name));
  return match ?? null;
}

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

// ---------------------------------------------------------------------------
// Shared upsert helpers (used by both CSV import and auto-fetch paths)
// ---------------------------------------------------------------------------

export async function upsertBattingProjections(
  records: FanGraphsTransformResult[],
  source: ProjectionSource,
): Promise<{ imported: number; playersCreated: number }> {
  let imported = 0;
  let playersCreated = 0;

  for (const record of records) {
    let player = await findPlayer(record.playerName, record.mlbamId);
    const pos = record.position ? record.position.split('/').filter(Boolean) : [];
    if (!player) {
      player = await createPlayer(record.playerName, record.team ?? '', pos);
      playersCreated++;
    } else if (pos.length > 0) {
      const existingPos: string[] = JSON.parse(player.positions);
      const needsUpdate = existingPos.length === 0 || existingPos.some((p) => p.includes('/'));
      if (needsUpdate) {
        await db.update(schema.players).set({
          positions: JSON.stringify(pos),
          team: record.team || player.team,
        }).where(eq(schema.players.id, player.id));
      }
    }

    // Store MLBAM ID if available and not yet set
    if (record.mlbamId && !player.mlbamId) {
      await db.update(schema.players)
        .set({ mlbamId: record.mlbamId })
        .where(eq(schema.players.id, player.id));
    }

    const existing = await db
      .select()
      .from(schema.projections)
      .where(eq(schema.projections.playerName, record.playerName))
      .limit(100);

    const existingForSource = existing.find(
      (p) => p.source === source && p.isPitcher === false,
    );

    if (existingForSource) {
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

  return { imported, playersCreated };
}

export async function upsertPitchingProjections(
  records: FanGraphsTransformResult[],
  source: ProjectionSource,
): Promise<{ imported: number; playersCreated: number }> {
  let imported = 0;
  let playersCreated = 0;

  for (const record of records) {
    let player = await findPlayer(record.playerName, record.mlbamId);
    const pos = record.position ? record.position.split('/').filter(Boolean) : ['SP'];
    if (!player) {
      player = await createPlayer(record.playerName, record.team ?? '', pos);
      playersCreated++;
    } else if (pos.length > 0) {
      const existingPos: string[] = JSON.parse(player.positions);
      const needsUpdate = existingPos.length === 0 || existingPos.some((p) => p.includes('/'));
      if (needsUpdate) {
        await db.update(schema.players).set({
          positions: JSON.stringify(pos),
          team: record.team || player.team,
        }).where(eq(schema.players.id, player.id));
      }
    }

    // Store MLBAM ID if available and not yet set
    if (record.mlbamId && !player.mlbamId) {
      await db.update(schema.players)
        .set({ mlbamId: record.mlbamId })
        .where(eq(schema.players.id, player.id));
    }

    const existing = await db
      .select()
      .from(schema.projections)
      .where(eq(schema.projections.playerName, record.playerName))
      .limit(100);

    const existingForSource = existing.find(
      (p) => p.source === source && p.isPitcher === true,
    );

    if (existingForSource) {
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

  return { imported, playersCreated };
}

export async function upsertSavantData(
  records: StatcastRecord[],
): Promise<{ imported: number; playersCreated: number }> {
  let imported = 0;
  let playersCreated = 0;

  for (const record of records) {
    let player = await findPlayerByName(record.playerName);
    if (!player) {
      player = await createPlayer(record.playerName, '', []);
      playersCreated++;
    }

    if (record.mlbamId && !player.mlbamId) {
      await db
        .update(schema.players)
        .set({ mlbamId: record.mlbamId })
        .where(eq(schema.players.id, player.id));
    }

    const existing = await db
      .select()
      .from(schema.statcastData)
      .where(eq(schema.statcastData.playerName, record.playerName))
      .limit(1);

    if (existing.length > 0) {
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

  return { imported, playersCreated };
}

// ---------------------------------------------------------------------------
// CSV import endpoint (existing)
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Auto-fetch endpoints
// ---------------------------------------------------------------------------

/**
 * POST /import/fetch-projections
 * Body: { system: 'steamer'|'zips'|'atc', statType: 'bat'|'pit' }
 */
router.post('/import/fetch-projections', async (req, res) => {
  try {
    const { system, statType } = req.body as {
      system?: string;
      statType?: string;
    };

    const fangraphsSystems = ['steamer', 'zips', 'atc', 'thebat', 'thebatx', 'fangraphsdc'];
    if (!system || !fangraphsSystems.includes(system)) {
      return res.status(400).json({ error: `system must be one of: ${fangraphsSystems.join(', ')}` });
    }
    if (!statType || !['bat', 'pit'].includes(statType)) {
      return res.status(400).json({ error: 'statType must be bat or pit' });
    }

    const source = system as ProjectionSource;
    const rawRows = await fetchFanGraphsProjections(source, statType as FanGraphsStatType);

    let result: { imported: number; playersCreated: number };

    if (statType === 'bat') {
      const records = transformFanGraphsBatting(rawRows, source);
      result = await upsertBattingProjections(records, source);
    } else {
      const records = transformFanGraphsPitching(rawRows, source);
      result = await upsertPitchingProjections(records, source);
    }

    res.json({
      success: true,
      type: statType === 'bat' ? 'batting' : 'pitching',
      source,
      imported: result.imported,
      playersCreated: result.playersCreated,
    });
  } catch (error) {
    console.error('Error fetching projections:', error);
    res.status(500).json({ error: `Failed to fetch projections: ${(error as Error).message}` });
  }
});

/**
 * POST /import/fetch-savant
 * Body: { year?: number }
 */
router.post('/import/fetch-savant', async (req, res) => {
  try {
    const { year } = req.body as { year?: number };
    const csvContent = await fetchSavantData(year);
    const parsed = importSavant(csvContent);

    if (parsed.data.length === 0) {
      return res.status(400).json({
        error: 'No valid statcast records fetched from Savant',
        parseErrors: parsed.errors,
      });
    }

    const result = await upsertSavantData(parsed.data);

    res.json({
      success: true,
      type: 'savant',
      imported: result.imported,
      playersCreated: result.playersCreated,
    });
  } catch (error) {
    console.error('Error fetching Savant data:', error);
    res.status(500).json({ error: `Failed to fetch Savant data: ${(error as Error).message}` });
  }
});

/**
 * POST /import/fetch-fantasypros
 * Body: { statType: 'bat'|'pit' }
 */
router.post('/import/fetch-fantasypros', async (req, res) => {
  try {
    const { statType } = req.body as { statType?: string };
    if (!statType || !['bat', 'pit'].includes(statType)) {
      return res.status(400).json({ error: 'statType must be bat or pit' });
    }

    const source: ProjectionSource = 'fantasypros';
    let result: { imported: number; playersCreated: number };

    if (statType === 'bat') {
      const records = await fetchFantasyProsBatting();
      result = await upsertBattingProjections(records, source);
    } else {
      const records = await fetchFantasyProsPitching();
      result = await upsertPitchingProjections(records, source);
    }

    res.json({
      success: true,
      type: statType === 'bat' ? 'batting' : 'pitching',
      source,
      imported: result.imported,
      playersCreated: result.playersCreated,
    });
  } catch (error) {
    console.error('Error fetching FantasyPros data:', error);
    res.status(500).json({ error: `Failed to fetch FantasyPros data: ${(error as Error).message}` });
  }
});

/**
 * POST /import/fetch-rotochamp
 * Body: { statType: 'bat'|'pit' }
 */
router.post('/import/fetch-rotochamp', async (req, res) => {
  try {
    const { statType } = req.body as { statType?: string };
    if (!statType || !['bat', 'pit'].includes(statType)) {
      return res.status(400).json({ error: 'statType must be bat or pit' });
    }

    const source: ProjectionSource = 'rotochamp';
    let result: { imported: number; playersCreated: number };

    if (statType === 'bat') {
      const records = await fetchRotoChampBatting();
      result = await upsertBattingProjections(records, source);
    } else {
      const records = await fetchRotoChampPitching();
      result = await upsertPitchingProjections(records, source);
    }

    res.json({
      success: true,
      type: statType === 'bat' ? 'batting' : 'pitching',
      source,
      imported: result.imported,
      playersCreated: result.playersCreated,
    });
  } catch (error) {
    console.error('Error fetching RotoChamp data:', error);
    res.status(500).json({ error: `Failed to fetch RotoChamp data: ${(error as Error).message}` });
  }
});

// ---------------------------------------------------------------------------
// CSV import handlers (refactored to use shared upsert helpers)
// ---------------------------------------------------------------------------

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

  const { imported, playersCreated } = await upsertBattingProjections(result.data, source);

  res.json({
    success: true,
    type: 'batting',
    source,
    imported,
    playersCreated,
    parseErrors: result.errors,
  });
}

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

  const { imported, playersCreated } = await upsertPitchingProjections(result.data, source);

  res.json({
    success: true,
    type: 'pitching',
    source,
    imported,
    playersCreated,
    parseErrors: result.errors,
  });
}

async function handleSavantImport(
  csvContent: string,
  res: import('express').Response,
) {
  const parsed = importSavant(csvContent);

  if (parsed.data.length === 0) {
    return res.status(400).json({
      error: 'No valid statcast records parsed from CSV',
      parseErrors: parsed.errors,
    });
  }

  const { imported, playersCreated } = await upsertSavantData(parsed.data);

  res.json({
    success: true,
    type: 'savant',
    imported,
    playersCreated,
    parseErrors: parsed.errors,
  });
}

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

  const teamNames = new Set<string>();
  for (const record of result.data) {
    if (record.fantasyTeam) {
      teamNames.add(record.fantasyTeam);
    }
  }

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

    let player = await findPlayer(record.playerName);
    if (!player) {
      player = await createPlayer(record.playerName, record.team, record.positions);
      playersCreated++;
    }

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
        contractStatus: record.contractStatus || player.contractStatus,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(schema.players.id, player.id));

    playersImported++;
  }

  for (const [_teamName, teamId] of Object.entries(teamMap)) {
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
