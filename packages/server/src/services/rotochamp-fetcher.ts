/**
 * RotoChamp Projection Fetcher
 *
 * RotoChamp serves server-rendered ASP.NET pages with HTML tables.
 * Uses cheerio to scrape projection data.
 */

import * as cheerio from 'cheerio';
import type { FanGraphsTransformResult } from './fangraphs-fetcher.js';
import type { ProjectionSource } from '@fta/shared';

const SOURCE: ProjectionSource = 'rotochamp';

const BATTING_URL = 'https://www.rotochamp.com/baseball/PlayerProjections.aspx?type=Hitter';
const PITCHING_URL = 'https://www.rotochamp.com/baseball/PlayerProjections.aspx?type=Pitcher';

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml',
};

/**
 * Parse a header row to build a column-name → index map.
 */
function buildColumnMap($: cheerio.CheerioAPI, table: ReturnType<cheerio.CheerioAPI>): Record<string, number> {
  const map: Record<string, number> = {};
  table.find('thead tr th, thead tr td').each((i, el) => {
    const text = $(el).text().trim().toUpperCase();
    map[text] = i;
  });
  return map;
}

function col(cells: ReturnType<cheerio.CheerioAPI>, map: Record<string, number>, ...names: string[]): string {
  for (const name of names) {
    const idx = map[name.toUpperCase()];
    if (idx !== undefined) {
      return cells.eq(idx).text().trim();
    }
  }
  return '';
}

/**
 * Fetch and parse RotoChamp batting projections.
 */
export async function fetchRotoChampBatting(): Promise<FanGraphsTransformResult[]> {
  const res = await fetch(BATTING_URL, { headers: HEADERS });
  if (!res.ok) {
    throw new Error(`RotoChamp batting fetch failed: ${res.status} ${res.statusText}`);
  }

  const html = await res.text();
  const $ = cheerio.load(html);
  const results: FanGraphsTransformResult[] = [];

  // RotoChamp uses a GridView table with a known ID pattern
  const table = $('table.rgMasterTable, table[id*="GridView"], table.table');
  if (table.length === 0) {
    throw new Error('RotoChamp: Could not find projection table. Page structure may have changed.');
  }

  const colMap = buildColumnMap($, table);
  const rows = table.find('tbody tr, tr').not(':first-child');

  rows.each((_i, row) => {
    const cells = $(row).find('td');
    if (cells.length < 8) return;

    const playerName = col(cells, colMap, 'PLAYER', 'NAME', 'PLAYERNAME')
      || cells.eq(0).find('a').text().trim()
      || cells.eq(0).text().trim();

    if (!playerName || playerName.toUpperCase() === 'PLAYER') return;

    const team = col(cells, colMap, 'TEAM', 'TM');

    const ab = parseFloat(col(cells, colMap, 'AB')) || 0;
    const runs = parseFloat(col(cells, colMap, 'R', 'RUNS')) || 0;
    const hits = parseFloat(col(cells, colMap, 'H', 'HITS')) || 0;
    const doubles = parseFloat(col(cells, colMap, '2B')) || 0;
    const triples = parseFloat(col(cells, colMap, '3B')) || 0;
    const hr = parseFloat(col(cells, colMap, 'HR')) || 0;
    const rbi = parseFloat(col(cells, colMap, 'RBI')) || 0;
    const sb = parseFloat(col(cells, colMap, 'SB')) || 0;
    const bb = parseFloat(col(cells, colMap, 'BB')) || 0;
    const so = parseFloat(col(cells, colMap, 'SO', 'K')) || 0;
    const pa = parseFloat(col(cells, colMap, 'PA')) || (ab + bb);

    results.push({
      playerName,
      source: SOURCE,
      isPitcher: false,
      team: team || undefined,
      pa,
      ab,
      hits,
      doubles,
      triples,
      hr,
      runs,
      rbi,
      sb,
      cs: 0,
      bb,
      so,
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
  });

  if (results.length === 0) {
    throw new Error(
      'RotoChamp: No batting data parsed. The page structure may have changed — try CSV import instead.',
    );
  }

  return results;
}

/**
 * Fetch and parse RotoChamp pitching projections.
 */
export async function fetchRotoChampPitching(): Promise<FanGraphsTransformResult[]> {
  const res = await fetch(PITCHING_URL, { headers: HEADERS });
  if (!res.ok) {
    throw new Error(`RotoChamp pitching fetch failed: ${res.status} ${res.statusText}`);
  }

  const html = await res.text();
  const $ = cheerio.load(html);
  const results: FanGraphsTransformResult[] = [];

  const table = $('table.rgMasterTable, table[id*="GridView"], table.table');
  if (table.length === 0) {
    throw new Error('RotoChamp: Could not find pitching projection table. Page structure may have changed.');
  }

  const colMap = buildColumnMap($, table);
  const rows = table.find('tbody tr, tr').not(':first-child');

  rows.each((_i, row) => {
    const cells = $(row).find('td');
    if (cells.length < 8) return;

    const playerName = col(cells, colMap, 'PLAYER', 'NAME', 'PLAYERNAME')
      || cells.eq(0).find('a').text().trim()
      || cells.eq(0).text().trim();

    if (!playerName || playerName.toUpperCase() === 'PLAYER') return;

    const team = col(cells, colMap, 'TEAM', 'TM');

    const ip = parseFloat(col(cells, colMap, 'IP')) || 0;
    const wins = parseFloat(col(cells, colMap, 'W', 'WINS')) || 0;
    const losses = parseFloat(col(cells, colMap, 'L', 'LOSSES')) || 0;
    const saves = parseFloat(col(cells, colMap, 'SV', 'SAVES')) || 0;
    const strikeouts = parseFloat(col(cells, colMap, 'SO', 'K')) || 0;
    const bbAllowed = parseFloat(col(cells, colMap, 'BB')) || 0;
    const hitsAllowed = parseFloat(col(cells, colMap, 'H', 'HITS')) || 0;
    const er = parseFloat(col(cells, colMap, 'ER')) || 0;

    results.push({
      playerName,
      source: SOURCE,
      isPitcher: true,
      position: saves >= 5 ? 'RP' : 'SP',
      team: team || undefined,
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
      ip,
      wins,
      losses,
      saves,
      qs: 0,
      er,
      hitsAllowed,
      bbAllowed,
      strikeouts,
    });
  });

  if (results.length === 0) {
    throw new Error(
      'RotoChamp: No pitching data parsed. The page structure may have changed — try CSV import instead.',
    );
  }

  return results;
}
