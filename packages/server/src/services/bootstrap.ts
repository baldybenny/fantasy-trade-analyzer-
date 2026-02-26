import { db } from '../db/database.js';
import * as schema from '../db/schema.js';

/**
 * Auto-bootstrap: if the DB is empty (no Fantrax config), sync all data
 * from scratch by hitting the server's own API endpoints.
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
  const envKeys = Object.keys(process.env).filter((k) => !k.startsWith('npm_')).sort();
  console.log(`[Bootstrap] Env vars available: ${envKeys.join(', ')}`);
  const leagueId = process.env.FANTRAX_LEAGUE_ID;
  const cookie = process.env.FANTRAX_COOKIE;
  console.log(`[Bootstrap] FANTRAX_LEAGUE_ID=${leagueId ? 'set' : 'missing'}, FANTRAX_COOKIE=${cookie ? 'set' : 'missing'}`);
  if (!leagueId || !cookie) {
    console.log('[Bootstrap] FANTRAX_LEAGUE_ID or FANTRAX_COOKIE not set — skipping');
    return;
  }

  console.log('[Bootstrap] Empty DB detected — starting full sync...');

  // Helper for POST requests to our own server
  async function post(path: string, body: Record<string, unknown> = {}): Promise<Record<string, any>> {
    const res = await fetch(`${base}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`POST ${path} failed (${res.status}): ${text}`);
    }
    return res.json() as Promise<Record<string, any>>;
  }

  // 3. Save Fantrax config
  console.log('[Bootstrap] Saving Fantrax config...');
  await post('/api/fantrax/config', { leagueId, cookie });
  console.log('[Bootstrap] Fantrax config saved');

  // 4. Sync rosters
  console.log('[Bootstrap] Syncing Fantrax rosters...');
  const syncResult = await post('/api/fantrax/sync');
  console.log(`[Bootstrap] Rosters synced — ${syncResult.players?.total ?? 0} players`);

  // 5. Fetch all projections
  const fangraphsSystems = ['steamer', 'zips', 'atc', 'thebat', 'thebatx', 'fangraphsdc'] as const;
  const statTypes = ['bat', 'pit'] as const;

  for (const system of fangraphsSystems) {
    for (const statType of statTypes) {
      try {
        console.log(`[Bootstrap] Fetching FanGraphs ${system} ${statType}...`);
        const result = await post('/api/projections/import/fetch-projections', { system, statType });
        console.log(`[Bootstrap] ${system} ${statType}: ${result.imported} imported`);
      } catch (err) {
        console.error(`[Bootstrap] ${system} ${statType} failed:`, err instanceof Error ? err.message : err);
      }
    }
  }

  for (const statType of statTypes) {
    try {
      console.log(`[Bootstrap] Fetching FantasyPros ${statType}...`);
      const result = await post('/api/projections/import/fetch-fantasypros', { statType });
      console.log(`[Bootstrap] FantasyPros ${statType}: ${result.imported} imported`);
    } catch (err) {
      console.error(`[Bootstrap] FantasyPros ${statType} failed:`, err instanceof Error ? err.message : err);
    }
  }

  for (const statType of statTypes) {
    try {
      console.log(`[Bootstrap] Fetching RotoChamp ${statType}...`);
      const result = await post('/api/projections/import/fetch-rotochamp', { statType });
      console.log(`[Bootstrap] RotoChamp ${statType}: ${result.imported} imported`);
    } catch (err) {
      console.error(`[Bootstrap] RotoChamp ${statType} failed:`, err instanceof Error ? err.message : err);
    }
  }

  try {
    console.log('[Bootstrap] Fetching Savant data...');
    const result = await post('/api/projections/import/fetch-savant');
    console.log(`[Bootstrap] Savant: ${result.imported} imported`);
  } catch (err) {
    console.error('[Bootstrap] Savant failed:', err instanceof Error ? err.message : err);
  }

  // 6. Seed news sources
  try {
    console.log('[Bootstrap] Seeding news sources...');
    const result = await post('/api/news/sources/seed-defaults');
    console.log(`[Bootstrap] News sources: ${result.added} added`);
  } catch (err) {
    console.error('[Bootstrap] News seed failed:', err instanceof Error ? err.message : err);
  }

  // 7. Calculate auction values
  try {
    console.log('[Bootstrap] Calculating auction values...');
    const result = await post('/api/values/calculate');
    console.log(`[Bootstrap] Auction values: ${result.playersUpdated} players updated`);
  } catch (err) {
    console.error('[Bootstrap] Auction values failed:', err instanceof Error ? err.message : err);
  }

  console.log('[Bootstrap] Complete!');
}
