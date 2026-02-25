/**
 * SGP (Standings Gain Points) Calculator
 *
 * Ported from Python auction_values.py lines 68-146.
 *
 * SGP measures how many standings points a player's projected stats are worth
 * in a rotisserie league. Counting stats are divided by an SGP multiplier
 * (the amount of a stat needed to gain one standings point). Rate stats are
 * compared against a league-average baseline and then divided by the multiplier.
 */

import type { PlayerStats, LeagueSettings } from '@fta/shared';
import {
  computeAvg,
  computeOps,
  computeEra,
  computeWhip,
  RATE_STAT_BASELINES,
  COUNTING_HITTING_CATEGORIES,
  RATE_HITTING_CATEGORIES,
  COUNTING_PITCHING_CATEGORIES,
  RATE_PITCHING_CATEGORIES,
  DEFAULT_SGP_MULTIPLIERS,
  getCategoryWeight,
  isInverseCategory,
} from '@fta/shared';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SgpResult {
  /** Sum of all category SGP values */
  totalSgp: number;
  /** Per-category SGP breakdown */
  categoryBreakdown: Record<string, number>;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Resolve the SGP multiplier for a given category. Falls back to the
 * league-level `sgpMultipliers` map, then to the hard-coded defaults.
 */
function getMultiplier(settings: LeagueSettings, category: string): number {
  return settings.sgpMultipliers[category] ?? DEFAULT_SGP_MULTIPLIERS[category] ?? 1;
}

/**
 * Resolve the rate-stat baseline for a given category. Falls back to the
 * shared constant `RATE_STAT_BASELINES`.
 */
function getBaseline(category: string): number {
  return RATE_STAT_BASELINES[category] ?? 0;
}

/**
 * Extract the raw projected value for a counting stat from PlayerStats.
 */
function getCountingStat(stats: PlayerStats, category: string): number {
  switch (category) {
    // Hitting
    case 'R':   return stats.runs;
    case 'HR':  return stats.hr;
    case 'RBI': return stats.rbi;
    case 'SB':  return stats.sb;
    // Pitching
    case 'W':   return stats.wins;
    case 'QS':  return stats.qs;
    case 'SV':  return stats.saves;
    case 'K':   return stats.strikeouts;
    default:    return 0;
  }
}

/**
 * Compute the projected rate stat value from a PlayerStats object.
 * Rate stats are computed from components, never stored directly.
 */
function getRateStat(stats: PlayerStats, category: string): number | null {
  switch (category) {
    case 'AVG':  return computeAvg(stats);
    case 'OPS':  return computeOps(stats);
    case 'ERA':  return computeEra(stats);
    case 'WHIP': return computeWhip(stats);
    default:     return null;
  }
}

// ---------------------------------------------------------------------------
// Counting stat SGP
// ---------------------------------------------------------------------------

/**
 * SGP for a counting stat:
 *   `projected_stat / sgp_multiplier * category_weight`
 */
function countingStatSgp(
  projectedValue: number,
  multiplier: number,
  weight: number,
): number {
  if (multiplier === 0) return 0;
  return (projectedValue / multiplier) * weight;
}

// ---------------------------------------------------------------------------
// Rate stat SGP
// ---------------------------------------------------------------------------

/**
 * Estimated team-total playing time, used to dilute rate stats.
 *
 * SGP multipliers for rate stats (AVG .003, ERA .15, etc.) are team-level
 * metrics — the typical spread between adjacent teams in the standings. A
 * single player only moves the team's aggregate rate in proportion to their
 * share of the team's total playing time, so we scale by player_PT / team_PT.
 *
 * 13 hitting slots × ~480 avg PA ≈ 6200;  9 P slots × ~135 avg IP ≈ 1200.
 */
const TEAM_PA = 6200;
const TEAM_IP = 1200;

/**
 * SGP for a non-inverse rate stat (AVG, OPS):
 *   `(projected_rate - baseline) / sgp_multiplier * weight * (PA / teamPA)`
 *
 * The dilution factor reflects that one hitter is only a fraction of the
 * team's composite batting line.
 */
function rateStatSgp(
  projectedRate: number,
  baseline: number,
  multiplier: number,
  weight: number,
  playingTime: number,
  teamPlayingTime: number,
): number {
  if (multiplier === 0) return 0;
  const dilution = playingTime / teamPlayingTime;
  return ((projectedRate - baseline) / multiplier) * weight * dilution;
}

/**
 * SGP for an inverse rate stat (ERA, WHIP):
 *   `(baseline - projected_rate) / sgp_multiplier * weight * (IP / teamIP)`
 *
 * Lower is better, so invert the difference. Diluted by the pitcher's share
 * of team innings.
 */
function inverseRateStatSgp(
  projectedRate: number,
  baseline: number,
  multiplier: number,
  weight: number,
  playingTime: number,
  teamPlayingTime: number,
): number {
  if (multiplier === 0) return 0;
  const dilution = playingTime / teamPlayingTime;
  return ((baseline - projectedRate) / multiplier) * weight * dilution;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Calculate the total SGP value and per-category breakdown for a player's
 * projected stats within the context of the given league settings.
 *
 * @param stats      - The player's projected (typically ROS) stats.
 * @param isPitcher  - Whether to evaluate pitching categories (true) or
 *                     hitting categories (false).
 * @param settings   - League settings that supply category weights, SGP
 *                     multipliers, and inverse flags.
 * @returns An {@link SgpResult} containing totalSgp and categoryBreakdown.
 */
export function calculateSgpValue(
  stats: PlayerStats,
  isPitcher: boolean,
  settings: LeagueSettings,
): SgpResult {
  const breakdown: Record<string, number> = {};
  let total = 0;

  // ---- Hitting categories (only if NOT pitcher) --------------------------
  if (!isPitcher) {
    // Counting hitting stats
    for (const cat of COUNTING_HITTING_CATEGORIES) {
      const multiplier = getMultiplier(settings, cat);
      const weight = getCategoryWeight(settings, cat);
      const value = getCountingStat(stats, cat);
      const sgp = countingStatSgp(value, multiplier, weight);
      breakdown[cat] = sgp;
      total += sgp;
    }

    // Rate hitting stats (AVG, OPS) — weighted by PA
    for (const cat of RATE_HITTING_CATEGORIES) {
      const multiplier = getMultiplier(settings, cat);
      const weight = getCategoryWeight(settings, cat);
      const baseline = getBaseline(cat);
      const projectedRate = getRateStat(stats, cat);

      if (projectedRate === null) {
        breakdown[cat] = 0;
        continue;
      }

      const sgp = rateStatSgp(projectedRate, baseline, multiplier, weight, stats.pa, TEAM_PA);
      breakdown[cat] = sgp;
      total += sgp;
    }
  }

  // ---- Pitching categories (only if pitcher) -----------------------------
  if (isPitcher) {
    // Counting pitching stats
    for (const cat of COUNTING_PITCHING_CATEGORIES) {
      const multiplier = getMultiplier(settings, cat);
      const weight = getCategoryWeight(settings, cat);
      const value = getCountingStat(stats, cat);
      const sgp = countingStatSgp(value, multiplier, weight);
      breakdown[cat] = sgp;
      total += sgp;
    }

    // Rate pitching stats (ERA, WHIP) — weighted by IP
    for (const cat of RATE_PITCHING_CATEGORIES) {
      const multiplier = getMultiplier(settings, cat);
      const weight = getCategoryWeight(settings, cat);
      const baseline = getBaseline(cat);
      const projectedRate = getRateStat(stats, cat);

      if (projectedRate === null) {
        breakdown[cat] = 0;
        continue;
      }

      // ERA and WHIP are inverse: lower is better
      const inverse = isInverseCategory(settings, cat);
      const sgp = inverse
        ? inverseRateStatSgp(projectedRate, baseline, multiplier, weight, stats.ip, TEAM_IP)
        : rateStatSgp(projectedRate, baseline, multiplier, weight, stats.ip, TEAM_IP);

      breakdown[cat] = sgp;
      total += sgp;
    }
  }

  return { totalSgp: total, categoryBreakdown: breakdown };
}
