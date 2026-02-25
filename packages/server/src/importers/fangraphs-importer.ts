import { parseCSV, parseNumber, type ColumnMapping, type ParseResult } from './csv-parser.js';
import type { ProjectionRecord, ProjectionSource } from '@fta/shared';

const BATTING_COLUMNS: ColumnMapping = {
  name: ['Name', 'PlayerName'],
  team: ['Team'],
  pa: ['PA'],
  ab: ['AB'],
  hits: ['H'],
  doubles: ['2B'],
  triples: ['3B'],
  hr: ['HR'],
  runs: ['R'],
  rbi: ['RBI'],
  sb: ['SB'],
  cs: ['CS'],
  bb: ['BB'],
  so: ['SO', 'K'],
};

const PITCHING_COLUMNS: ColumnMapping = {
  name: ['Name', 'PlayerName'],
  team: ['Team'],
  wins: ['W'],
  losses: ['L'],
  saves: ['SV'],
  ip: ['IP'],
  hitsAllowed: ['H'],
  er: ['ER'],
  strikeouts: ['SO', 'K'],
  bbAllowed: ['BB'],
  qs: ['QS'],
};

export function importFanGraphsBatting(
  csvContent: string,
  source: ProjectionSource = 'steamer',
): ParseResult<Omit<ProjectionRecord, 'id' | 'playerId'>> {
  const result = parseCSV(csvContent, BATTING_COLUMNS, (row) => {
    const name = row.name;
    if (!name) return null;

    return {
      playerName: name,
      source,
      isPitcher: false,
      pa: parseNumber(row.pa),
      ab: parseNumber(row.ab),
      hits: parseNumber(row.hits),
      doubles: parseNumber(row.doubles),
      triples: parseNumber(row.triples),
      hr: parseNumber(row.hr),
      runs: parseNumber(row.runs),
      rbi: parseNumber(row.rbi),
      sb: parseNumber(row.sb),
      cs: parseNumber(row.cs),
      bb: parseNumber(row.bb),
      so: parseNumber(row.so),
      // Zero out pitching fields
      ip: 0, wins: 0, losses: 0, saves: 0, qs: 0,
      er: 0, hitsAllowed: 0, bbAllowed: 0, strikeouts: 0,
    };
  });

  return { ...result, detectedFormat: 'fangraphs-batting' };
}

export function importFanGraphsPitching(
  csvContent: string,
  source: ProjectionSource = 'steamer',
): ParseResult<Omit<ProjectionRecord, 'id' | 'playerId'>> {
  const result = parseCSV(csvContent, PITCHING_COLUMNS, (row) => {
    const name = row.name;
    if (!name) return null;

    return {
      playerName: name,
      source,
      isPitcher: true,
      // Zero out hitting fields
      pa: 0, ab: 0, hits: 0, doubles: 0, triples: 0,
      hr: 0, runs: 0, rbi: 0, sb: 0, cs: 0, bb: 0, so: 0,
      // Pitching
      ip: parseNumber(row.ip),
      wins: parseNumber(row.wins),
      losses: parseNumber(row.losses),
      saves: parseNumber(row.saves),
      qs: parseNumber(row.qs),
      er: parseNumber(row.er),
      hitsAllowed: parseNumber(row.hitsAllowed),
      bbAllowed: parseNumber(row.bbAllowed),
      strikeouts: parseNumber(row.strikeouts),
    };
  });

  return { ...result, detectedFormat: 'fangraphs-pitching' };
}
