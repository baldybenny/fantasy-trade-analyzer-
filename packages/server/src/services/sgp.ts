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
 * SGP for a non-inverse rate stat (AVG, OPS):
 *   `(projected_rate - baseline) / sgp_multiplier * weight`
 */
function rateStatSgp(
  projectedRate: number,
  baseline: number,
  multiplier: number,
  weight: number,
): number {
  if (multiplier === 0) return 0;
  return ((projectedRate - baseline) / multiplier) * weight;
}

/**
 * SGP for an inverse rate stat (ERA, WHIP):
 *   `(baseline - projected_rate) / sgp_multiplier * weight`
 *
 * Lower is better, so invert the difference.
 */
function inverseRateStatSgp(
  projectedRate: number,
  baseline: number,
  multiplier: number,
  weight: number,
): number {
  if (multiplier === 0) return 0;
  return ((baseline - projectedRate) / multiplier) * weight;
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

    // Rate hitting stats (AVG, OPS)
    for (const cat of RATE_HITTING_CATEGORIES) {
      const multiplier = getMultiplier(settings, cat);
      const weight = getCategoryWeight(settings, cat);
      const baseline = getBaseline(cat);
      const projectedRate = getRateStat(stats, cat);

      if (projectedRate === null) {
        breakdown[cat] = 0;
        continue;
      }

      const sgp = rateStatSgp(projectedRate, baseline, multiplier, weight);
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

    // Rate pitching stats (ERA, WHIP)
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
        ? inverseRateStatSgp(projectedRate, baseline, multiplier, weight)
        : rateStatSgp(projectedRate, baseline, multiplier, weight);

      breakdown[cat] = sgp;
      total += sgp;
    }
  }

  return { totalSgp: total, categoryBreakdown: breakdown };
}
