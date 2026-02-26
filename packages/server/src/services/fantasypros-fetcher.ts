/**
 * FantasyPros Projection Fetcher
 *
 * Fetches projection data from FantasyPros' HTML tables.
 * Uses dynamic header-based column mapping (like the RotoChamp fetcher)
 * to be resilient to column order changes.
 */

import * as cheerio from 'cheerio';
import type { FanGraphsTransformResult } from './fangraphs-fetcher.js';
import type { ProjectionSource } from '@fta/shared';

const SOURCE: ProjectionSource = 'fantasypros';

const BATTING_URL = 'https://www.fantasypros.com/mlb/projections/hitters.php';
const PITCHING_URL = 'https://www.fantasypros.com/mlb/projections/pitchers.php';

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
 * Fetch and parse FantasyPros batting projections.
 */
export async function fetchFantasyProsBatting(): Promise<FanGraphsTransformResult[]> {
  const res = await fetch(BATTING_URL, { headers: HEADERS, signal: AbortSignal.timeout(30_000) });
  if (!res.ok) {
    throw new Error(`FantasyPros batting fetch failed: ${res.status} ${res.statusText}`);
  }

  const html = await res.text();
  const $ = cheerio.load(html);
  const results: FanGraphsTransformResult[] = [];

  const table = $('table#data, table.player-table');
  if (table.length === 0) {
    throw new Error('FantasyPros: Could not find batting projection table. Page structure may have changed.');
  }

  const colMap = buildColumnMap($, table);
  const rows = table.find('tbody tr');

  rows.each((_i, row) => {
    const cells = $(row).find('td');
    if (cells.length < 8) return;

    const nameCell = cells.eq(0);
    const playerName = nameCell.find('a.player-name').text().trim()
      || nameCell.find('a').first().text().trim()
      || nameCell.text().trim().split('\n')[0].trim();

    if (!playerName) return;

    const teamText = nameCell.find('small, .player-team').text().trim();
    const team = teamText.replace(/[()]/g, '').trim();

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
      'FantasyPros: No batting data parsed. The page structure may have changed — try CSV import instead.',
    );
  }

  return results;
}

/**
 * Fetch and parse FantasyPros pitching projections.
 */
export async function fetchFantasyProsPitching(): Promise<FanGraphsTransformResult[]> {
  const res = await fetch(PITCHING_URL, { headers: HEADERS, signal: AbortSignal.timeout(30_000) });
  if (!res.ok) {
    throw new Error(`FantasyPros pitching fetch failed: ${res.status} ${res.statusText}`);
  }

  const html = await res.text();
  const $ = cheerio.load(html);
  const results: FanGraphsTransformResult[] = [];

  const table = $('table#data, table.player-table');
  if (table.length === 0) {
    throw new Error('FantasyPros: Could not find pitching projection table. Page structure may have changed.');
  }

  const colMap = buildColumnMap($, table);
  const rows = table.find('tbody tr');

  rows.each((_i, row) => {
    const cells = $(row).find('td');
    if (cells.length < 8) return;

    const nameCell = cells.eq(0);
    const playerName = nameCell.find('a.player-name').text().trim()
      || nameCell.find('a').first().text().trim()
      || nameCell.text().trim().split('\n')[0].trim();

    if (!playerName) return;

    const teamText = nameCell.find('small, .player-team').text().trim();
    const team = teamText.replace(/[()]/g, '').trim();

    const ip = parseFloat(col(cells, colMap, 'IP')) || 0;
    const wins = parseFloat(col(cells, colMap, 'W', 'WINS')) || 0;
    const losses = parseFloat(col(cells, colMap, 'L', 'LOSSES')) || 0;
    const saves = parseFloat(col(cells, colMap, 'SV', 'SAVES')) || 0;
    const strikeouts = parseFloat(col(cells, colMap, 'K', 'SO')) || 0;
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
      'FantasyPros: No pitching data parsed. The page structure may have changed — try CSV import instead.',
    );
  }

  return results;
}
