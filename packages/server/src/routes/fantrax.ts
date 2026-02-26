import { Router } from 'express';
import { eq } from 'drizzle-orm';
import { db } from '../db/database.js';
import * as schema from '../db/schema.js';
import {
  FantraxClient,
  parseRosterRow,
  parseContractYears,
} from '../services/fantrax-api.js';

const router = Router();

/**
 * Helper: Load Fantrax credentials from league_settings table.
 */
async function getCredentials(): Promise<{ leagueId: string; cookie: string } | null> {
  const rows = await db.select().from(schema.leagueSettings);
  const settings: Record<string, string> = {};
  for (const row of rows) {
    settings[row.key] = row.value;
  }

  const leagueId = tryParseJson(settings.fantraxLeagueId) ?? settings.fantraxLeagueId;
  const cookie = tryParseJson(settings.fantraxCookie) ?? settings.fantraxCookie;

  if (!leagueId || !cookie) return null;
  return { leagueId, cookie };
}

function tryParseJson(val: string | undefined): string | undefined {
  if (!val) return undefined;
  try {
    const parsed = JSON.parse(val);
    return typeof parsed === 'string' ? parsed : undefined;
  } catch {
    return undefined;
  }
}

/**
 * POST /config — Save Fantrax league ID and session cookie.
 *
 * Body: { leagueId: string, cookie: string }
 */
router.post('/config', async (req, res) => {
  try {
    const { leagueId, cookie } = req.body as {
      leagueId?: string;
      cookie?: string;
    };

    if (!leagueId) {
      return res.status(400).json({ error: 'leagueId is required' });
    }
    if (!cookie) {
      return res.status(400).json({ error: 'cookie (FX_RM value) is required' });
    }

    // Upsert both settings
    for (const [key, value] of [
      ['fantraxLeagueId', leagueId],
      ['fantraxCookie', cookie],
    ] as const) {
      const existing = await db
        .select()
        .from(schema.leagueSettings)
        .where(eq(schema.leagueSettings.key, key))
        .limit(1);

      if (existing.length > 0) {
        await db
          .update(schema.leagueSettings)
          .set({ value: JSON.stringify(value) })
          .where(eq(schema.leagueSettings.key, key));
      } else {
        await db.insert(schema.leagueSettings).values({
          key,
          value: JSON.stringify(value),
        });
      }
    }

    // Test the connection
    const client = new FantraxClient(leagueId, cookie);
    const result = await client.testConnection();

    res.json({
      success: true,
      leagueName: result.leagueName,
      teamCount: result.teamCount,
    });
  } catch (error: any) {
    console.error('Error saving Fantrax config:', error);
    res.status(500).json({
      error: 'Failed to connect to Fantrax',
      details: error.message,
    });
  }
});

/**
 * GET /status — Check if Fantrax credentials are configured and valid.
 */
router.get('/status', async (_req, res) => {
  try {
    const creds = await getCredentials();
    if (!creds) {
      return res.json({
        configured: false,
        message: 'Fantrax credentials not configured. POST to /api/fantrax/config with leagueId and cookie.',
      });
    }

    const client = new FantraxClient(creds.leagueId, creds.cookie);
    const result = await client.testConnection();

    res.json({
      configured: true,
      connected: true,
      leagueId: creds.leagueId,
      leagueName: result.leagueName,
      teamCount: result.teamCount,
    });
  } catch (error: any) {
    res.json({
      configured: true,
      connected: false,
      error: error.message,
    });
  }
});

/**
 * POST /sync — Pull all rosters from Fantrax and sync into the database.
 *
 * This will:
 * 1. Fetch league info (team names/IDs)
 * 2. Fetch each team's roster
 * 3. Create/update teams in DB
 * 4. Create/update players with roster assignments, positions, salaries
 *
 * Returns a summary of what was synced.
 */
router.post('/sync', async (_req, res) => {
  try {
    const creds = await getCredentials();
    if (!creds) {
      return res.status(400).json({
        error: 'Fantrax credentials not configured. POST to /api/fantrax/config first.',
      });
    }

    const client = new FantraxClient(creds.leagueId, creds.cookie);

    // Fetch all rosters (also gets league name + team list)
    const { leagueName, teams: allRosters } = await client.getAllRosters();

    // Save league name
    await upsertSetting('name', leagueName);
    await upsertSetting('leagueId', creds.leagueId);

    // Create/update teams, build fantraxId -> dbTeamId map
    const teamMap: Record<string, number> = {};
    let teamsCreated = 0;
    let teamsUpdated = 0;

    for (const { fantraxId, name: teamName } of allRosters) {
      const existing = await db
        .select()
        .from(schema.teams)
        .where(eq(schema.teams.name, teamName))
        .limit(1);

      if (existing.length > 0) {
        teamMap[fantraxId] = existing[0].id;
        teamsUpdated++;
      } else {
        const inserted = await db
          .insert(schema.teams)
          .values({ name: teamName, owner: teamName })
          .returning();
        teamMap[fantraxId] = inserted[0].id;
        teamsCreated++;
      }
    }

    // Process each team's roster
    let playersCreated = 0;
    let playersUpdated = 0;
    let totalPlayers = 0;

    for (const { fantraxId, name: teamName, roster } of allRosters) {
      const dbTeamId = teamMap[fantraxId];
      if (!dbTeamId) continue;

      const tables = roster.tables ?? [];
      for (const table of tables) {
        const rows = table.rows ?? [];
        for (const row of rows) {
          if (!row.scorer) continue;
          totalPlayers++;

          const parsed = parseRosterRow(row);
          const contractYears = parseContractYears(parsed.contractYear);
          const contractStatus = parsed.contractYear.trim();

          // Find existing player by name
          const existing = await db
            .select()
            .from(schema.players)
            .where(eq(schema.players.name, parsed.name))
            .limit(1);

          if (existing.length === 0) {
            // Create new player
            await db.insert(schema.players).values({
              name: parsed.name,
              team: parsed.mlbTeam,
              positions: JSON.stringify(parsed.positions),
              fantasyTeamId: dbTeamId,
              rosterStatus: parsed.rosterStatus,
              contractSalary: parsed.salary > 0 ? parsed.salary : null,
              contractYears,
              contractStatus: contractStatus || null,
              updatedAt: new Date().toISOString(),
            });
            playersCreated++;
          } else {
            // Update existing player
            const player = existing[0];
            await db
              .update(schema.players)
              .set({
                team: parsed.mlbTeam || player.team,
                positions: parsed.positions.length > 0
                  ? JSON.stringify(parsed.positions)
                  : player.positions,
                fantasyTeamId: dbTeamId,
                rosterStatus: parsed.rosterStatus,
                contractSalary: parsed.salary > 0 ? parsed.salary : player.contractSalary,
                contractYears,
                contractStatus: contractStatus || player.contractStatus,
                updatedAt: new Date().toISOString(),
              })
              .where(eq(schema.players.id, player.id));
            playersUpdated++;
          }
        }
      }

      // Update team spending total
      const teamPlayers = await db
        .select()
        .from(schema.players)
        .where(eq(schema.players.fantasyTeamId, dbTeamId));

      const totalSpent = teamPlayers.reduce(
        (sum, p) => sum + (p.contractSalary ?? 0),
        0,
      );

      await db
        .update(schema.teams)
        .set({ spent: totalSpent })
        .where(eq(schema.teams.id, dbTeamId));
    }

    res.json({
      success: true,
      leagueName,
      teams: {
        total: allRosters.length,
        created: teamsCreated,
        updated: teamsUpdated,
        names: allRosters.map((r) => r.name),
      },
      players: {
        total: totalPlayers,
        created: playersCreated,
        updated: playersUpdated,
      },
    });
  } catch (error: any) {
    console.error('Error syncing from Fantrax:', error);
    res.status(500).json({
      error: 'Failed to sync from Fantrax',
      details: error.message,
    });
  }
});

/**
 * POST /sync/standings — Pull current standings from Fantrax.
 */
router.post('/sync/standings', async (_req, res) => {
  try {
    const creds = await getCredentials();
    if (!creds) {
      return res.status(400).json({
        error: 'Fantrax credentials not configured.',
      });
    }

    const client = new FantraxClient(creds.leagueId, creds.cookie);
    const standings = await client.getStandings();

    res.json({
      success: true,
      standings,
    });
  } catch (error: any) {
    console.error('Error fetching Fantrax standings:', error);
    res.status(500).json({
      error: 'Failed to fetch standings from Fantrax',
      details: error.message,
    });
  }
});

/** Upsert a league_settings key-value pair. */
async function upsertSetting(key: string, value: string) {
  const existing = await db
    .select()
    .from(schema.leagueSettings)
    .where(eq(schema.leagueSettings.key, key))
    .limit(1);

  if (existing.length > 0) {
    await db
      .update(schema.leagueSettings)
      .set({ value: JSON.stringify(value) })
      .where(eq(schema.leagueSettings.key, key));
  } else {
    await db.insert(schema.leagueSettings).values({
      key,
      value: JSON.stringify(value),
    });
  }
}

export const fantraxRoutes = router;
