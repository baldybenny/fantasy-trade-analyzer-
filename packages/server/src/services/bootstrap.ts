import { eq } from 'drizzle-orm';
import { db } from '../db/database.js';
import * as schema from '../db/schema.js';
import {
  FantraxClient,
  parseRosterRow,
  parseContractYears,
} from './fantrax-api.js';
import {
  fetchFanGraphsProjections,
  transformFanGraphsBatting,
  transformFanGraphsPitching,
} from './fangraphs-fetcher.js';
import { fetchFantasyProsBatting, fetchFantasyProsPitching } from './fantasypros-fetcher.js';
import { fetchRotoChampBatting, fetchRotoChampPitching } from './rotochamp-fetcher.js';
import { fetchSavantData } from './savant-fetcher.js';
import { importSavant } from '../importers/index.js';
import {
  upsertBattingProjections,
  upsertPitchingProjections,
  upsertSavantData,
} from '../routes/import.js';
import { DEFAULT_NEWS_SOURCES } from './news/default-sources.js';
import { calculateAuctionValues } from './auction-values.js';
import { calculateInflation, applyInflation } from './inflation.js';
import { dbRowToPlayer } from '../db/helpers.js';
import { DEFAULT_LEAGUE_SETTINGS, DEFAULT_PROJECTION_WEIGHTS } from '@fta/shared';
import type { ProjectionSource, LeagueSettings } from '@fta/shared';

/** Yield to the event loop so Express can serve requests. */
const yieldToEventLoop = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

/**
 * Auto-bootstrap: if the DB is empty, sync all data from scratch.
 * All operations are direct function calls — no self-HTTP requests —
 * so Express stays responsive throughout.
 *
 * Requires env vars: FANTRAX_LEAGUE_ID, FANTRAX_COOKIE
 */
export async function bootstrap(_port: string | number): Promise<void> {
  // 1. Check if bootstrap is needed
  const rows = await db.select().from(schema.leagueSettings);
  const hasLeagueId = rows.some((r) => r.key === 'fantraxLeagueId');
  if (hasLeagueId) {
    console.log('[Bootstrap] DB already populated — skipping');
    return;
  }

  // 2. Read env vars
  const leagueId = process.env.FANTRAX_LEAGUE_ID;
  const cookie = process.env.FANTRAX_COOKIE;
  if (!leagueId || !cookie) {
    console.log('[Bootstrap] FANTRAX_LEAGUE_ID or FANTRAX_COOKIE not set — skipping');
    return;
  }

  console.log('[Bootstrap] Empty DB detected — starting full sync...');

  // 3. Save Fantrax config directly to DB
  console.log('[Bootstrap] Saving Fantrax config...');
  for (const [key, value] of [
    ['fantraxLeagueId', leagueId],
    ['fantraxCookie', cookie],
  ] as const) {
    const existing = await db
      .select().from(schema.leagueSettings)
      .where(eq(schema.leagueSettings.key, key)).limit(1);
    if (existing.length > 0) {
      await db.update(schema.leagueSettings)
        .set({ value: JSON.stringify(value) })
        .where(eq(schema.leagueSettings.key, key));
    } else {
      await db.insert(schema.leagueSettings).values({ key, value: JSON.stringify(value) });
    }
  }
  console.log('[Bootstrap] Fantrax config saved');

  // 4. Sync rosters directly via FantraxClient
  console.log('[Bootstrap] Syncing Fantrax rosters...');
  try {
    const client = new FantraxClient(leagueId, cookie);
    const { leagueName, teams: allRosters } = await client.getAllRosters();
    await upsertSetting('name', leagueName);
    await upsertSetting('leagueId', leagueId);

    const teamMap: Record<string, number> = {};
    for (const { fantraxId, name: teamName } of allRosters) {
      const existing = await db.select().from(schema.teams)
        .where(eq(schema.teams.name, teamName)).limit(1);
      if (existing.length > 0) {
        teamMap[fantraxId] = existing[0].id;
      } else {
        const inserted = await db.insert(schema.teams)
          .values({ name: teamName, owner: teamName }).returning();
        teamMap[fantraxId] = inserted[0].id;
      }
    }

    let totalPlayers = 0;
    for (const { fantraxId, roster } of allRosters) {
      const dbTeamId = teamMap[fantraxId];
      if (!dbTeamId) continue;
      for (const table of roster.tables ?? []) {
        for (const row of table.rows ?? []) {
          if (!row.scorer) continue;
          totalPlayers++;
          const parsed = parseRosterRow(row);
          const contractYears = parseContractYears(parsed.contractYear);
          const contractStatus = parsed.contractYear.trim();
          const existing = await db.select().from(schema.players)
            .where(eq(schema.players.name, parsed.name)).limit(1);
          if (existing.length === 0) {
            await db.insert(schema.players).values({
              name: parsed.name, team: parsed.mlbTeam,
              positions: JSON.stringify(parsed.positions),
              fantasyTeamId: dbTeamId, rosterStatus: parsed.rosterStatus,
              contractSalary: parsed.salary > 0 ? parsed.salary : null,
              contractYears, contractStatus: contractStatus || null,
              updatedAt: new Date().toISOString(),
            });
          } else {
            const player = existing[0];
            await db.update(schema.players).set({
              team: parsed.mlbTeam || player.team,
              positions: parsed.positions.length > 0 ? JSON.stringify(parsed.positions) : player.positions,
              fantasyTeamId: dbTeamId, rosterStatus: parsed.rosterStatus,
              contractSalary: parsed.salary > 0 ? parsed.salary : player.contractSalary,
              contractYears, contractStatus: contractStatus || player.contractStatus,
              updatedAt: new Date().toISOString(),
            }).where(eq(schema.players.id, player.id));
          }
        }
      }
      // Update team spending
      const teamPlayers = await db.select().from(schema.players)
        .where(eq(schema.players.fantasyTeamId, dbTeamId));
      const totalSpent = teamPlayers.reduce((sum, p) => sum + (p.contractSalary ?? 0), 0);
      await db.update(schema.teams).set({ spent: totalSpent }).where(eq(schema.teams.id, dbTeamId));
      await yieldToEventLoop();
    }
    console.log(`[Bootstrap] Rosters synced — ${totalPlayers} players`);
  } catch (err) {
    console.error('[Bootstrap] Roster sync failed:', err instanceof Error ? err.message : err);
  }

  // 5. Fetch all projections
  const fangraphsSystems: ProjectionSource[] = ['steamer', 'zips', 'atc', 'thebat', 'thebatx', 'fangraphsdc'];

  for (const system of fangraphsSystems) {
    for (const statType of ['bat', 'pit'] as const) {
      try {
        console.log(`[Bootstrap] Fetching FanGraphs ${system} ${statType}...`);
        const rawRows = await fetchFanGraphsProjections(system, statType);
        await yieldToEventLoop();
        if (statType === 'bat') {
          const records = transformFanGraphsBatting(rawRows, system);
          const result = await upsertBattingProjections(records, system);
          console.log(`[Bootstrap] ${system} ${statType}: ${result.imported} imported`);
        } else {
          const records = transformFanGraphsPitching(rawRows, system);
          const result = await upsertPitchingProjections(records, system);
          console.log(`[Bootstrap] ${system} ${statType}: ${result.imported} imported`);
        }
      } catch (err) {
        console.error(`[Bootstrap] ${system} ${statType} failed:`, err instanceof Error ? err.message : err);
      }
      await yieldToEventLoop();
    }
  }

  for (const statType of ['bat', 'pit'] as const) {
    try {
      console.log(`[Bootstrap] Fetching FantasyPros ${statType}...`);
      if (statType === 'bat') {
        const records = await fetchFantasyProsBatting();
        const result = await upsertBattingProjections(records, 'fantasypros');
        console.log(`[Bootstrap] FantasyPros ${statType}: ${result.imported} imported`);
      } else {
        const records = await fetchFantasyProsPitching();
        const result = await upsertPitchingProjections(records, 'fantasypros');
        console.log(`[Bootstrap] FantasyPros ${statType}: ${result.imported} imported`);
      }
    } catch (err) {
      console.error(`[Bootstrap] FantasyPros ${statType} failed:`, err instanceof Error ? err.message : err);
    }
    await yieldToEventLoop();
  }

  for (const statType of ['bat', 'pit'] as const) {
    try {
      console.log(`[Bootstrap] Fetching RotoChamp ${statType}...`);
      if (statType === 'bat') {
        const records = await fetchRotoChampBatting();
        const result = await upsertBattingProjections(records, 'rotochamp');
        console.log(`[Bootstrap] RotoChamp ${statType}: ${result.imported} imported`);
      } else {
        const records = await fetchRotoChampPitching();
        const result = await upsertPitchingProjections(records, 'rotochamp');
        console.log(`[Bootstrap] RotoChamp ${statType}: ${result.imported} imported`);
      }
    } catch (err) {
      console.error(`[Bootstrap] RotoChamp ${statType} failed:`, err instanceof Error ? err.message : err);
    }
    await yieldToEventLoop();
  }

  try {
    console.log('[Bootstrap] Fetching Savant data...');
    const csvContent = await fetchSavantData();
    const parsed = importSavant(csvContent);
    const result = await upsertSavantData(parsed.data);
    console.log(`[Bootstrap] Savant: ${result.imported} imported`);
  } catch (err) {
    console.error('[Bootstrap] Savant failed:', err instanceof Error ? err.message : err);
  }

  // 6. Seed news sources
  try {
    console.log('[Bootstrap] Seeding news sources...');
    let added = 0;
    for (const source of DEFAULT_NEWS_SOURCES) {
      const existing = db.select().from(schema.newsSources)
        .where(eq(schema.newsSources.url, source.url)).get();
      if (!existing) {
        db.insert(schema.newsSources).values({
          name: source.name, type: source.type, url: source.url,
          searchQuery: source.searchQuery || null,
          fetchIntervalMinutes: source.fetchIntervalMinutes,
          createdAt: new Date().toISOString(),
        }).run();
        added++;
      }
    }
    console.log(`[Bootstrap] News sources: ${added} added`);
  } catch (err) {
    console.error('[Bootstrap] News seed failed:', err instanceof Error ? err.message : err);
  }

  // 7. Calculate auction values
  try {
    console.log('[Bootstrap] Calculating auction values...');
    const playerRows = await db.select().from(schema.players);
    const players = playerRows.map(dbRowToPlayer);
    const projectionRows = await db.select().from(schema.projections);
    const projectionsByPlayer: Record<number, typeof projectionRows> = {};
    for (const proj of projectionRows) {
      if (proj.playerId) {
        if (!projectionsByPlayer[proj.playerId]) projectionsByPlayer[proj.playerId] = [];
        projectionsByPlayer[proj.playerId].push(proj);
      }
    }
    const settingsRows = await db.select().from(schema.leagueSettings);
    const settingsMap: Record<string, string> = {};
    for (const row of settingsRows) settingsMap[row.key] = row.value;
    const settings: LeagueSettings = { ...DEFAULT_LEAGUE_SETTINGS };
    for (const [key, val] of Object.entries(settingsMap)) {
      try { (settings as any)[key] = JSON.parse(val); } catch { (settings as any)[key] = val; }
    }
    const weights: Record<string, number> = settings.projectionWeights ?? { ...DEFAULT_PROJECTION_WEIGHTS };
    for (const player of players) {
      const projs = projectionsByPlayer[player.id];
      if (!projs || projs.length === 0) continue;
      let totalWeight = 0;
      for (const p of projs) totalWeight += weights[p.source] ?? 0;
      if (totalWeight === 0) { totalWeight = projs.length; for (const p of projs) (p as any)._weight = 1; }
      else { for (const p of projs) (p as any)._weight = weights[p.source] ?? 0; }
      const stats = { games: 0, pa: 0, ab: 0, runs: 0, hits: 0, doubles: 0, triples: 0, hr: 0, rbi: 0, sb: 0, cs: 0, bb: 0, so: 0, ip: 0, wins: 0, losses: 0, saves: 0, holds: 0, qs: 0, er: 0, hitsAllowed: 0, bbAllowed: 0, strikeouts: 0 };
      for (const p of projs) {
        const w = (p as any)._weight / totalWeight;
        stats.pa += (p.pa ?? 0) * w; stats.ab += (p.ab ?? 0) * w;
        stats.runs += (p.runs ?? 0) * w; stats.hits += (p.hits ?? 0) * w;
        stats.doubles += (p.doubles ?? 0) * w; stats.triples += (p.triples ?? 0) * w;
        stats.hr += (p.hr ?? 0) * w; stats.rbi += (p.rbi ?? 0) * w;
        stats.sb += (p.sb ?? 0) * w; stats.cs += (p.cs ?? 0) * w;
        stats.bb += (p.bb ?? 0) * w; stats.so += (p.so ?? 0) * w;
        stats.ip += (p.ip ?? 0) * w; stats.wins += (p.wins ?? 0) * w;
        stats.losses += (p.losses ?? 0) * w; stats.saves += (p.saves ?? 0) * w;
        stats.qs += (p.qs ?? 0) * w; stats.er += (p.er ?? 0) * w;
        stats.hitsAllowed += (p.hitsAllowed ?? 0) * w; stats.bbAllowed += (p.bbAllowed ?? 0) * w;
        stats.strikeouts += (p.strikeouts ?? 0) * w;
      }
      player.rosProjection = stats;
      await db.update(schema.players)
        .set({ rosProjection: JSON.stringify(stats), updatedAt: new Date().toISOString() })
        .where(eq(schema.players.id, player.id));
    }
    await yieldToEventLoop();
    const allTeamRows = await db.select().from(schema.teams);
    const numTeams = allTeamRows.length || 12;
    const valuedPlayers = calculateAuctionValues(players, settings, numTeams);
    const playersWithValues = players.map((p) => {
      const vp = valuedPlayers.find((v) => v.playerId === p.id);
      return vp ? { ...p, auctionValue: vp.totalValue } : p;
    });
    const inflation = calculateInflation(playersWithValues, settings, numTeams);
    for (const vp of valuedPlayers) {
      const inflatedValue = applyInflation(vp.totalValue, inflation.inflationRate);
      await db.update(schema.players).set({
        auctionValue: vp.totalValue ?? null, inflatedValue: inflatedValue ?? null,
        vorp: vp.vorp ?? null, sgpValue: vp.sgpValue ?? null,
        categoryValues: JSON.stringify(vp.categoryValues),
        updatedAt: new Date().toISOString(),
      }).where(eq(schema.players.id, vp.playerId));
    }
    console.log(`[Bootstrap] Auction values: ${valuedPlayers.length} players updated`);
  } catch (err) {
    console.error('[Bootstrap] Auction values failed:', err instanceof Error ? err.message : err);
  }

  console.log('[Bootstrap] Complete!');
}

async function upsertSetting(key: string, value: string) {
  const existing = await db.select().from(schema.leagueSettings)
    .where(eq(schema.leagueSettings.key, key)).limit(1);
  if (existing.length > 0) {
    await db.update(schema.leagueSettings)
      .set({ value: JSON.stringify(value) })
      .where(eq(schema.leagueSettings.key, key));
  } else {
    await db.insert(schema.leagueSettings).values({ key, value: JSON.stringify(value) });
  }
}
