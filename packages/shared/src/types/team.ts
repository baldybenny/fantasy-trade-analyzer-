import type { Player, PlayerStats, Position } from './player.js';
import {
  computeAvg,
  computeOps,
  computeEra,
  computeWhip,
} from './player.js';

export interface RosterSlot {
  position: Position;
  playerId: number | null;
}

export interface CategoryStanding {
  category: string;
  value: number;
  rank: number;
  points: number;
  weightedPoints: number;
}

export interface FantasyTeam {
  id: number;
  name: string;
  owner: string;
  roster: Player[];
  totalBudget: number;
  spent: number;
  keepers: Player[];
  categoryStandings: CategoryStanding[];
  totalPoints: number;
  rank: number;
}

export function getRemainingBudget(team: FantasyTeam): number {
  return team.totalBudget - team.spent;
}

export function getHitters(team: FantasyTeam): Player[] {
  return team.roster.filter((p) =>
    p.positions.some((pos) => pos !== 'SP' && pos !== 'RP'),
  );
}

export function getPitchers(team: FantasyTeam): Player[] {
  return team.roster.filter((p) =>
    p.positions.some((pos) => pos === 'SP' || pos === 'RP'),
  );
}

export function getCategoryValue(team: FantasyTeam, category: string): number | undefined {
  return team.categoryStandings.find((cs) => cs.category === category)?.value;
}

export function getCategoryRank(team: FantasyTeam, category: string): number | undefined {
  return team.categoryStandings.find((cs) => cs.category === category)?.rank;
}

export interface CategoryTotals {
  R: number;
  HR: number;
  RBI: number;
  SB: number;
  AVG: number | null;
  OPS: number | null;
  W: number;
  QS: number;
  SV: number;
  K: number;
  ERA: number | null;
  WHIP: number | null;
}

/**
 * Calculate category totals from a roster of players using their ROS projections.
 * Rate stats are computed from component counting stats, never averaged directly.
 */
export function calculateCategoryTotals(roster: Player[]): CategoryTotals {
  let totalR = 0, totalHR = 0, totalRBI = 0, totalSB = 0;
  let totalH = 0, totalAB = 0;
  let totalHits_obp = 0, totalBB_obp = 0, totalAB_obp = 0, totalBB_obp_denom = 0;
  let totalTB = 0;
  let totalW = 0, totalQS = 0, totalSV = 0, totalK = 0;
  let totalER = 0, totalIP = 0, totalHA = 0, totalBBA = 0;

  for (const player of roster) {
    const stats = player.rosProjection;
    if (!stats) continue;

    // Hitting counting stats
    totalR += stats.runs;
    totalHR += stats.hr;
    totalRBI += stats.rbi;
    totalSB += stats.sb;

    // Components for rate stats
    totalH += stats.hits;
    totalAB += stats.ab;
    totalBB_obp += stats.bb;
    totalAB_obp += stats.ab;
    totalBB_obp_denom += stats.bb;

    const singles = stats.hits - stats.doubles - stats.triples - stats.hr;
    totalTB += singles + stats.doubles * 2 + stats.triples * 3 + stats.hr * 4;
    totalHits_obp += stats.hits;

    // Pitching counting stats
    totalW += stats.wins;
    totalQS += stats.qs;
    totalSV += stats.saves;
    totalK += stats.strikeouts;

    // Pitching components for rate stats
    totalER += stats.er;
    totalIP += stats.ip;
    totalHA += stats.hitsAllowed;
    totalBBA += stats.bbAllowed;
  }

  const avg = totalAB > 0 ? totalH / totalAB : null;
  const obp = (totalAB_obp + totalBB_obp_denom) > 0
    ? (totalHits_obp + totalBB_obp) / (totalAB_obp + totalBB_obp_denom)
    : null;
  const slg = totalAB > 0 ? totalTB / totalAB : null;
  const ops = obp !== null && slg !== null ? obp + slg : null;
  const era = totalIP > 0 ? (totalER * 9) / totalIP : null;
  const whip = totalIP > 0 ? (totalHA + totalBBA) / totalIP : null;

  return {
    R: totalR,
    HR: totalHR,
    RBI: totalRBI,
    SB: totalSB,
    AVG: avg,
    OPS: ops,
    W: totalW,
    QS: totalQS,
    SV: totalSV,
    K: totalK,
    ERA: era,
    WHIP: whip,
  };
}
