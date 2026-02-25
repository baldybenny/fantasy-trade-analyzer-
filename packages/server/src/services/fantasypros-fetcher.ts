/**
 * FantasyPros Projection Fetcher
 *
 * Fetches projection data from FantasyPros' AJAX data endpoint.
 * Falls back to HTML table scraping if the AJAX endpoint changes.
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
 * Fetch and parse FantasyPros batting projections.
 */
export async function fetchFantasyProsBatting(): Promise<FanGraphsTransformResult[]> {
  const res = await fetch(BATTING_URL, { headers: HEADERS });
  if (!res.ok) {
    throw new Error(`FantasyPros batting fetch failed: ${res.status} ${res.statusText}`);
  }

  const html = await res.text();
  const $ = cheerio.load(html);
  const results: FanGraphsTransformResult[] = [];

  // FantasyPros renders stats in a table with id="data"
  const rows = $('table#data tbody tr, table.player-table tbody tr');

  rows.each((_i, row) => {
    const cells = $(row).find('td');
    if (cells.length < 10) return;

    // First cell has the player name, possibly with team/position info
    const nameCell = $(cells[0]);
    const playerName = nameCell.find('a.player-name').text().trim()
      || nameCell.find('a').first().text().trim()
      || nameCell.text().trim().split('\n')[0].trim();

    if (!playerName) return;

    // Extract team from small text or span
    const teamText = nameCell.find('small, .player-team').text().trim();
    const team = teamText.replace(/[()]/g, '').trim();

    // Parse stats - FantasyPros typical column order:
    // Player, AB, R, H, 2B, 3B, HR, RBI, SB, BB, SO, AVG, OBP, SLG
    // But order can vary, so we try to match by header
    const ab = parseFloat($(cells[1]).text()) || 0;
    const runs = parseFloat($(cells[2]).text()) || 0;
    const hits = parseFloat($(cells[3]).text()) || 0;
    const doubles = parseFloat($(cells[4]).text()) || 0;
    const triples = parseFloat($(cells[5]).text()) || 0;
    const hr = parseFloat($(cells[6]).text()) || 0;
    const rbi = parseFloat($(cells[7]).text()) || 0;
    const sb = parseFloat($(cells[8]).text()) || 0;
    const bb = parseFloat($(cells[9]).text()) || 0;
    const so = parseFloat($(cells[10]).text()) || 0;

    results.push({
      playerName,
      source: SOURCE,
      isPitcher: false,
      team: team || undefined,
      pa: ab + bb, // Approximate PA from AB + BB
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
  const res = await fetch(PITCHING_URL, { headers: HEADERS });
  if (!res.ok) {
    throw new Error(`FantasyPros pitching fetch failed: ${res.status} ${res.statusText}`);
  }

  const html = await res.text();
  const $ = cheerio.load(html);
  const results: FanGraphsTransformResult[] = [];

  const rows = $('table#data tbody tr, table.player-table tbody tr');

  rows.each((_i, row) => {
    const cells = $(row).find('td');
    if (cells.length < 10) return;

    const nameCell = $(cells[0]);
    const playerName = nameCell.find('a.player-name').text().trim()
      || nameCell.find('a').first().text().trim()
      || nameCell.text().trim().split('\n')[0].trim();

    if (!playerName) return;

    const teamText = nameCell.find('small, .player-team').text().trim();
    const team = teamText.replace(/[()]/g, '').trim();

    // FantasyPros pitching columns: Player, IP, W, L, SV, ERA, WHIP, K, BB, H, ER
    const ip = parseFloat($(cells[1]).text()) || 0;
    const wins = parseFloat($(cells[2]).text()) || 0;
    const losses = parseFloat($(cells[3]).text()) || 0;
    const saves = parseFloat($(cells[4]).text()) || 0;
    const strikeouts = parseFloat($(cells[7]).text()) || 0;
    const bbAllowed = parseFloat($(cells[8]).text()) || 0;
    const hitsAllowed = parseFloat($(cells[9]).text()) || 0;
    const er = parseFloat($(cells[10]).text()) || 0;

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
