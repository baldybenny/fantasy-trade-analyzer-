/**
 * FanGraphs Projection Fetcher
 *
 * Fetches projection data directly from FanGraphs' internal JSON API.
 */

import type { ProjectionRecord, ProjectionSource } from '@fta/shared';

export type FanGraphsStatType = 'bat' | 'pit';

interface FanGraphsBattingRow {
  PlayerName: string;
  Team: string;
  xMLBAMID?: number;
  playerid?: number;
  PA: number;
  AB: number;
  H: number;
  '2B': number;
  '3B': number;
  HR: number;
  R: number;
  RBI: number;
  SB: number;
  CS: number;
  BB: number;
  SO: number;
}

interface FanGraphsPitchingRow {
  PlayerName: string;
  Team: string;
  xMLBAMID?: number;
  playerid?: number;
  W: number;
  L: number;
  SV: number;
  IP: number;
  H: number;
  ER: number;
  SO: number;
  BB: number;
  QS: number;
}

/**
 * Fetch raw projection JSON from FanGraphs API.
 */
export async function fetchFanGraphsProjections(
  system: ProjectionSource,
  statType: FanGraphsStatType,
): Promise<Record<string, any>[]> {
  const url = `https://www.fangraphs.com/api/projections?type=${system}&stats=${statType}&pos=all&team=0&players=0&lg=all`;

  const res = await fetch(url, {
    headers: {
      'User-Agent': 'FantasyTradeAnalyzer/1.0',
      'Accept': 'application/json',
    },
  });

  if (!res.ok) {
    throw new Error(`FanGraphs API error: ${res.status} ${res.statusText}`);
  }

  return res.json() as Promise<Record<string, any>[]>;
}

/**
 * Transform FanGraphs batting JSON rows to ProjectionRecord shape.
 */
export interface FanGraphsTransformResult extends Omit<ProjectionRecord, 'id' | 'playerId'> {
  position?: string;
  team?: string;
  mlbamId?: number;
}

export function transformFanGraphsBatting(
  rows: Record<string, any>[],
  source: ProjectionSource,
): FanGraphsTransformResult[] {
  return rows
    .filter((r) => r.PlayerName)
    .map((r) => ({
      playerName: r.PlayerName as string,
      source,
      isPitcher: false,
      position: (r.minpos as string | undefined) ?? undefined,
      team: (r.Team as string | undefined) ?? undefined,
      mlbamId: r.xMLBAMID ? Number(r.xMLBAMID) : undefined,
      pa: Number(r.PA) || 0,
      ab: Number(r.AB) || 0,
      hits: Number(r.H) || 0,
      doubles: Number(r['2B']) || 0,
      triples: Number(r['3B']) || 0,
      hr: Number(r.HR) || 0,
      runs: Number(r.R) || 0,
      rbi: Number(r.RBI) || 0,
      sb: Number(r.SB) || 0,
      cs: Number(r.CS) || 0,
      bb: Number(r.BB) || 0,
      so: Number(r.SO) || 0,
      // Zero out pitching
      ip: 0,
      wins: 0,
      losses: 0,
      saves: 0,
      qs: 0,
      er: 0,
      hitsAllowed: 0,
      bbAllowed: 0,
      strikeouts: 0,
    }));
}

/**
 * Transform FanGraphs pitching JSON rows to ProjectionRecord shape.
 */
export function transformFanGraphsPitching(
  rows: Record<string, any>[],
  source: ProjectionSource,
): FanGraphsTransformResult[] {
  return rows
    .filter((r) => r.PlayerName)
    .map((r) => ({
      playerName: r.PlayerName as string,
      source,
      isPitcher: true,
      position: (Number(r.SV) || 0) >= 5 ? 'RP' : 'SP',
      team: (r.Team as string | undefined) ?? undefined,
      mlbamId: r.xMLBAMID ? Number(r.xMLBAMID) : undefined,
      // Zero out hitting
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
      // Pitching
      ip: Number(r.IP) || 0,
      wins: Number(r.W) || 0,
      losses: Number(r.L) || 0,
      saves: Number(r.SV) || 0,
      qs: Number(r.QS) || 0,
      er: Number(r.ER) || 0,
      hitsAllowed: Number(r.H) || 0,
      bbAllowed: Number(r.BB) || 0,
      strikeouts: Number(r.SO) || 0,
    }));
}
