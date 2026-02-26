import { db } from '../db/database.js';
import * as schema from '../db/schema.js';
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
import type { ProjectionSource } from '@fta/shared';

/**
 * Auto-bootstrap: if the DB is empty (no Fantrax config), sync all data.
 * Uses direct service calls for projections (non-blocking) and self-requests
 * only for Fantrax config/sync (complex route handler logic).
 *
 * Requires env vars: FANTRAX_LEAGUE_ID, FANTRAX_COOKIE
 */
export async function bootstrap(port: string | number): Promise<void> {
  const base = `http://localhost:${port}`;

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

  // Helper for POST requests to our own server (only used for Fantrax endpoints)
  async function post(path: string, body: Record<string, unknown> = {}): Promise<Record<string, any>> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 120_000);
    try {
      const res = await fetch(`${base}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`POST ${path} failed (${res.status}): ${text}`);
      }
      return res.json() as Promise<Record<string, any>>;
    } finally {
      clearTimeout(timeout);
    }
  }

  // 3. Save Fantrax config
  console.log('[Bootstrap] Saving Fantrax config...');
  await post('/api/fantrax/config', { leagueId, cookie });
  console.log('[Bootstrap] Fantrax config saved');

  // 4. Sync rosters
  console.log('[Bootstrap] Syncing Fantrax rosters...');
  const syncResult = await post('/api/fantrax/sync');
  console.log(`[Bootstrap] Rosters synced — ${syncResult.players?.total ?? 0} players`);

  // 5. Fetch all projections (direct service calls — no self-HTTP requests)
  const fangraphsSystems: ProjectionSource[] = ['steamer', 'zips', 'atc', 'thebat', 'thebatx', 'fangraphsdc'];

  for (const system of fangraphsSystems) {
    for (const statType of ['bat', 'pit'] as const) {
      try {
        console.log(`[Bootstrap] Fetching FanGraphs ${system} ${statType}...`);
        const rawRows = await fetchFanGraphsProjections(system, statType);
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

  // 6. Seed news sources (direct DB call, no external fetch needed)
  try {
    console.log('[Bootstrap] Seeding news sources...');
    await post('/api/news/sources/seed-defaults');
    console.log('[Bootstrap] News sources seeded');
  } catch (err) {
    console.error('[Bootstrap] News seed failed:', err instanceof Error ? err.message : err);
  }

  // 7. Calculate auction values
  try {
    console.log('[Bootstrap] Calculating auction values...');
    await post('/api/values/calculate');
    console.log('[Bootstrap] Auction values calculated');
  } catch (err) {
    console.error('[Bootstrap] Auction values failed:', err instanceof Error ? err.message : err);
  }

  console.log('[Bootstrap] Complete!');
}
