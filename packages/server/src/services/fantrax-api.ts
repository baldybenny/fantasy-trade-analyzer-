/**
 * Fantrax API Client
 *
 * Communicates with Fantrax's internal /fxpa/req endpoint using cookie-based
 * session authentication (FX_RM cookie). This is the same API the Fantrax
 * web app uses internally.
 *
 * Usage:
 *   const client = new FantraxClient(leagueId, fxRmCookie);
 *   const teams = await client.getTeamList();
 *   const rosters = await client.getAllRosters();
 */

const FANTRAX_BASE = 'https://www.fantrax.com';
const FXPA_ENDPOINT = `${FANTRAX_BASE}/fxpa/req`;

// --- Types for Fantrax API responses ---

export interface FantraxTeamInfo {
  id: string;
  name: string;
  shortName: string;
  commissioner?: boolean;
  logoUrl128?: string;
  logoUrl256?: string;
}

export interface FantraxPlayerInfo {
  scorerId: string;
  name: string;
  shortName: string;
  teamName: string;        // MLB team full name
  teamShortName: string;   // MLB team abbreviation
  posShortNames: string;   // e.g. "SP", "2B,SS"
  posIds: string[];
  posIdsNoFlex: string[];
  icons?: { typeId: string }[];
  rookie?: boolean;
  minorsEligible?: boolean;
}

export interface FantraxRosterRow {
  posId: string;
  statusId: string;  // "1" = Active, "2" = Reserve, "3" = IL, "9" = Minors
  scorer: FantraxPlayerInfo;
  cells: { content: string; sortKey?: string }[];
  eligiblePosIds?: string[];
  eligibleStatusIds?: string[];
}

export interface FantraxHeaderCell {
  name: string;
  shortName: string;
  key?: string;
  sortKey?: string;
  sortType?: string;
}

export interface FantraxRosterTable {
  scGroup: number;              // 10 = Hitting, 20 = Pitching
  scGroupScorerHeader: string;  // "Hitting" or "Pitching"
  header: { cells: FantraxHeaderCell[] };
  rows: FantraxRosterRow[];
  statusTotals?: any;
}

export interface FantraxRosterResponse {
  tables: FantraxRosterTable[];
  fantasyTeams: FantraxTeamInfo[];
  miscData?: {
    salaryInfo?: {
      info: { display: string; name: string; value: number; key: string }[];
    };
  };
}

export interface FantraxLeagueHomeResponse {
  settings: {
    leagueName: string;
    sportId: string;
    leagueDisplayYear: string;
  };
  fantasyTeams: FantraxTeamInfo[];
  standings?: any;
  myTeamIds: string[];
}

export interface FantraxApiError {
  pageError?: {
    code: string;
    title: string;
  };
}

/** Parsed player from a Fantrax roster row */
export interface ParsedFantraxPlayer {
  name: string;
  mlbTeam: string;
  positions: string[];
  salary: number;
  contractYear: string;   // e.g. "1st", "2nd", "2026"
  statusId: string;
  rosterStatus: string;   // "Active", "Reserve", "IL", "Minors"
  isRookie: boolean;
  isMinorsEligible: boolean;
}

// Status ID to roster status mapping
const STATUS_MAP: Record<string, string> = {
  '1': 'Active',
  '2': 'Reserve',
  '3': 'IL',
  '9': 'Minors',
};

export class FantraxClient {
  private leagueId: string;
  private cookie: string;

  constructor(leagueId: string, fxRmCookie: string) {
    this.leagueId = leagueId;
    this.cookie = fxRmCookie;
  }

  /**
   * Make a raw call to /fxpa/req with one or more method calls.
   */
  private async callApi(
    msgs: { method: string; data: Record<string, string> }[],
  ): Promise<any[]> {
    const url = `${FXPA_ENDPOINT}?leagueId=${encodeURIComponent(this.leagueId)}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Cookie: `FX_RM=${this.cookie}`,
      },
      body: JSON.stringify({ msgs }),
      signal: AbortSignal.timeout(30_000),
    });

    if (!response.ok) {
      throw new Error(`Fantrax API returned ${response.status}: ${response.statusText}`);
    }

    const json = await response.json() as any;

    if (json.pageError) {
      const err = json.pageError;
      throw new Error(`Fantrax API error: ${err.code} - ${err.title}`);
    }

    if (!json.responses || !Array.isArray(json.responses)) {
      throw new Error('Unexpected Fantrax API response format');
    }

    return json.responses.map((r: any) => r.data);
  }

  /**
   * Fetch league home page data — includes team list, standings, league name.
   * This is the primary way to discover teams in the league.
   */
  async getLeagueHome(): Promise<FantraxLeagueHomeResponse> {
    const [data] = await this.callApi([
      { method: 'getLeagueHomeInfo', data: {} },
    ]);
    return data;
  }

  /**
   * Fetch a single team's roster with player details and salary info.
   */
  async getTeamRoster(teamId: string): Promise<FantraxRosterResponse> {
    const [data] = await this.callApi([
      {
        method: 'getTeamRosterInfo',
        data: {
          leagueId: this.leagueId,
          teamId,
          view: 'STATS',
        },
      },
    ]);
    return data;
  }

  /**
   * Get the list of all teams in the league.
   */
  async getTeamList(): Promise<FantraxTeamInfo[]> {
    const home = await this.getLeagueHome();
    return home.fantasyTeams;
  }

  /**
   * Fetch all team rosters in the league.
   * Batches roster requests to be respectful of the API.
   */
  async getAllRosters(): Promise<{
    leagueName: string;
    teams: { fantraxId: string; name: string; roster: FantraxRosterResponse }[];
  }> {
    // First get team list from league home
    const home = await this.getLeagueHome();
    const leagueName = home.settings?.leagueName ?? 'Unknown League';
    const teams = home.fantasyTeams ?? [];

    const results: { fantraxId: string; name: string; roster: FantraxRosterResponse }[] = [];

    // Fetch rosters in batches of 4
    const batchSize = 4;
    for (let i = 0; i < teams.length; i += batchSize) {
      const batch = teams.slice(i, i + batchSize);
      const msgs = batch.map((t) => ({
        method: 'getTeamRosterInfo',
        data: {
          leagueId: this.leagueId,
          teamId: t.id,
          view: 'STATS',
        },
      }));

      const responses = await this.callApi(msgs);

      for (let j = 0; j < batch.length; j++) {
        results.push({
          fantraxId: batch[j].id,
          name: batch[j].name,
          roster: responses[j],
        });
      }

      // Small delay between batches
      if (i + batchSize < teams.length) {
        await new Promise((r) => setTimeout(r, 500));
      }
    }

    return { leagueName, teams: results };
  }

  /**
   * Fetch league standings.
   */
  async getStandings(): Promise<any> {
    const [data] = await this.callApi([
      {
        method: 'getStandings',
        data: {
          leagueId: this.leagueId,
          view: 'SEASON_STATS',
        },
      },
    ]);
    return data;
  }

  /**
   * Quick connectivity check — fetches league home page.
   */
  async testConnection(): Promise<{ leagueName: string; teamCount: number; myTeamIds: string[] }> {
    const home = await this.getLeagueHome();
    return {
      leagueName: home.settings?.leagueName ?? 'Unknown',
      teamCount: home.fantasyTeams?.length ?? 0,
      myTeamIds: home.myTeamIds ?? [],
    };
  }
}

// --- Helper functions for parsing Fantrax roster data ---

/**
 * Parse Fantrax position short names into standard position abbreviations.
 * Handles comma-separated (e.g. "2B,SS") and slash-separated.
 * Normalizes LF/CF/RF -> OF. Filters out non-standard like "UT".
 */
export function parseFantraxPositions(posShortNames: string): string[] {
  if (!posShortNames) return [];
  const validPositions = new Set(['C', '1B', '2B', '3B', 'SS', 'OF', 'DH', 'SP', 'RP']);

  return posShortNames
    .split(/[,/]/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => {
      const upper = p.toUpperCase();
      if (upper === 'LF' || upper === 'CF' || upper === 'RF') return 'OF';
      if (upper === 'UT' || upper === 'UT2') return 'DH';  // Map utility to DH
      return upper;
    })
    .filter((p) => validPositions.has(p))
    .filter((v, i, a) => a.indexOf(v) === i); // deduplicate
}

/**
 * Map Fantrax status ID to a roster status string.
 */
export function fantraxStatusToString(statusId: string): string {
  return STATUS_MAP[statusId] ?? 'Active';
}

/**
 * Map Fantrax status ID to our RosterStatus enum value.
 */
export function fantraxStatusToRosterStatus(statusId: string): string {
  switch (statusId) {
    case '1': return 'ROSTER';   // Active
    case '2': return 'ROSTER';   // Reserve (still rostered)
    case '3': return 'IL';
    case '9': return 'MINORS';
    default: return 'ROSTER';
  }
}

/**
 * Parse a Fantrax roster row into a structured player object.
 * Salary is at cells[1], contract year at cells[2] based on actual response format.
 */
export function parseRosterRow(row: FantraxRosterRow): ParsedFantraxPlayer {
  const scorer = row.scorer;
  const cells = row.cells ?? [];

  // Salary is column index 1 (shortName: "Sal")
  const salaryStr = cells[1]?.content ?? '0';
  const salary = parseFloat(salaryStr.replace(/[$,]/g, '')) || 0;

  // Contract year is column index 2 (shortName: "Con")
  const contractYear = cells[2]?.content ?? '';

  return {
    name: scorer.name,
    mlbTeam: scorer.teamShortName ?? '',
    positions: parseFantraxPositions(scorer.posShortNames),
    salary,
    contractYear,
    statusId: row.statusId,
    rosterStatus: fantraxStatusToRosterStatus(row.statusId),
    isRookie: scorer.rookie ?? false,
    isMinorsEligible: scorer.minorsEligible ?? false,
  };
}

/**
 * Parse contract year string (e.g. "1st", "2nd", "2026") into years remaining.
 *
 * Contract status rules:
 *   "1st" = first year of 2-year initial contract → 2 years remaining
 *   "2nd" = extension-eligible, decision time → 1 year remaining
 *   "3rd" = expiring, last year → 1 year remaining
 *   "2026" = guaranteed through that year → computed from current year
 */
export function parseContractYears(contractYear: string): number {
  if (!contractYear) return 1;
  const trimmed = contractYear.trim().toLowerCase();

  if (trimmed.includes('1st')) return 2; // first year of 2-year initial contract
  if (trimmed.includes('2nd')) return 1; // extension-eligible
  if (trimmed.includes('3rd')) return 1; // expiring

  // If it's a year like "2026", contract runs through that year
  const yearMatch = trimmed.match(/^(\d{4})$/);
  if (yearMatch) {
    const contractEndYear = parseInt(yearMatch[1]);
    const currentYear = new Date().getFullYear();
    return Math.max(1, contractEndYear - currentYear + 1);
  }

  return 1;
}
