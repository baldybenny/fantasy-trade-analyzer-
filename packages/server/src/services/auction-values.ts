/**
 * Auction Value Calculator
 *
 * Ported from Python auction_values.py lines 200-288.
 *
 * Computes dollar auction values for every player by:
 *   1. Computing each player's SGP value via the SGP calculator.
 *   2. Determining replacement-level SGP for each position.
 *   3. Computing VORP (Value Over Replacement Player).
 *   4. Converting positive VORP into dollar values that sum to the league's
 *      total budget.
 */

import type { Player, LeagueSettings } from '@fta/shared';
import {
  isPitcher as isPitcherFn,
  primaryPosition,
  DEFAULT_REPLACEMENT_LEVEL,
} from '@fta/shared';
import { calculateSgpValue } from './sgp.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AuctionValue {
  playerId: number;
  playerName: string;
  position: string;
  /** Dollar value of this player */
  totalValue: number;
  /** Raw SGP value before replacement-level adjustment */
  sgpValue: number;
  /** Per-category SGP breakdown */
  categoryValues: Record<string, number>;
  /** Whether the player is above replacement level */
  isAboveReplacement: boolean;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Resolve the replacement-level roster-depth threshold for a given position.
 * The raw value is scaled by (numTeams / 12) to account for larger or smaller
 * leagues.
 *
 * @param settings  - League settings containing per-position replacement depth.
 * @param position  - The position string (e.g. "C", "SP").
 * @param numTeams  - The number of teams in the league.
 * @returns The scaled replacement-level threshold.
 */
function getReplacementThreshold(
  settings: LeagueSettings,
  position: string,
  numTeams: number,
): number {
  const base =
    settings.replacementLevel[position] ??
    DEFAULT_REPLACEMENT_LEVEL[position] ??
    12;
  return base * (numTeams / 12);
}

// ---------------------------------------------------------------------------
// Core calculations
// ---------------------------------------------------------------------------

/**
 * Calculate VORP (Value Over Replacement Player).
 *
 * VORP = playerSgp - replacementSgp
 *
 * @param playerSgp       - The player's total SGP value.
 * @param replacementSgp  - The SGP value at the replacement level for the
 *                          player's position.
 * @returns The VORP (can be negative).
 */
export function calculateVorp(
  playerSgp: number,
  replacementSgp: number,
): number {
  return playerSgp - replacementSgp;
}

/**
 * Convert VORP into a dollar auction value.
 *
 *   dollars_per_SGP = totalBudget / totalPositiveVorp
 *   value = max(minValue, vorp * dollars_per_SGP)
 *
 * @param vorp              - Player's VORP.
 * @param totalBudget       - The entire league's auction budget pool.
 * @param totalPositiveVorp - Sum of all positive VORPs across the league.
 * @param minValue          - Floor value (default = 1).
 * @returns The dollar value, floored at minValue.
 */
export function sgpToDollars(
  vorp: number,
  totalBudget: number,
  totalPositiveVorp: number,
  minValue: number = 1,
): number {
  if (totalPositiveVorp <= 0) return minValue;
  const dollarsPerSgp = totalBudget / totalPositiveVorp;
  const rawValue = vorp * dollarsPerSgp;
  return Math.max(minValue, rawValue);
}

// ---------------------------------------------------------------------------
// Main public function
// ---------------------------------------------------------------------------

/**
 * Calculate auction dollar values for every player in the pool.
 *
 * Algorithm overview:
 *   1. Compute each player's SGP and determine their primary position.
 *   2. Group players by position, sort descending by SGP within each group.
 *   3. The replacement-level SGP for a position is the SGP of the player at
 *      the replacement-threshold index for that position.
 *   4. Compute VORP for every player (SGP - replacement SGP).
 *   5. Sum all positive VORPs across the league.
 *   6. Convert each positive VORP into dollar values that collectively sum
 *      to the league's total budget (numTeams * perTeamBudget).
 *
 * @param players   - All players to evaluate.
 * @param settings  - League settings (budget, categories, multipliers, etc.).
 * @param numTeams  - Number of teams in the league.
 * @returns An array of {@link AuctionValue} objects, sorted descending by
 *          totalValue.
 */
export function calculateAuctionValues(
  players: Player[],
  settings: LeagueSettings,
  numTeams: number,
): AuctionValue[] {
  // ------------------------------------------------------------------
  // Step 1: Compute SGP for every player
  // ------------------------------------------------------------------
  interface PlayerSgpEntry {
    player: Player;
    position: string;
    sgp: number;
    breakdown: Record<string, number>;
  }

  const entries: PlayerSgpEntry[] = players
    .filter((p) => p.rosProjection != null)
    .map((p) => {
      const pitcher = isPitcherFn(p);
      const { totalSgp, categoryBreakdown } = calculateSgpValue(
        p.rosProjection!,
        pitcher,
        settings,
      );
      return {
        player: p,
        position: primaryPosition(p),
        sgp: totalSgp,
        breakdown: categoryBreakdown,
      };
    });

  // ------------------------------------------------------------------
  // Step 2: Group by position and sort descending by SGP
  // ------------------------------------------------------------------
  const byPosition: Record<string, PlayerSgpEntry[]> = {};
  for (const entry of entries) {
    const pos = entry.position;
    if (!byPosition[pos]) byPosition[pos] = [];
    byPosition[pos].push(entry);
  }

  for (const pos of Object.keys(byPosition)) {
    byPosition[pos].sort((a, b) => b.sgp - a.sgp);
  }

  // ------------------------------------------------------------------
  // Step 3: Determine replacement-level SGP per position
  // ------------------------------------------------------------------
  const replacementSgpByPosition: Record<string, number> = {};
  for (const pos of Object.keys(byPosition)) {
    const threshold = Math.floor(getReplacementThreshold(settings, pos, numTeams));
    const posPlayers = byPosition[pos];
    if (threshold > 0 && posPlayers.length >= threshold) {
      replacementSgpByPosition[pos] = posPlayers[threshold - 1].sgp;
    } else if (posPlayers.length > 0) {
      // Not enough players to reach replacement level; use last player
      replacementSgpByPosition[pos] = posPlayers[posPlayers.length - 1].sgp;
    } else {
      replacementSgpByPosition[pos] = 0;
    }
  }

  // ------------------------------------------------------------------
  // Step 4: Compute VORP for every player
  // ------------------------------------------------------------------
  interface VorpEntry extends PlayerSgpEntry {
    vorp: number;
  }

  const vorpEntries: VorpEntry[] = entries.map((e) => {
    const repSgp = replacementSgpByPosition[e.position] ?? 0;
    return { ...e, vorp: calculateVorp(e.sgp, repSgp) };
  });

  // ------------------------------------------------------------------
  // Step 5: Sum all positive VORPs
  // ------------------------------------------------------------------
  const totalPositiveVorp = vorpEntries.reduce(
    (sum, e) => sum + Math.max(0, e.vorp),
    0,
  );

  // Total league budget = per-team budget * numTeams
  const totalBudget = settings.totalBudget * numTeams;

  // ------------------------------------------------------------------
  // Step 6: Convert VORP -> dollars
  // ------------------------------------------------------------------
  const results: AuctionValue[] = vorpEntries.map((e) => {
    const isAbove = e.vorp > 0;
    const dollarValue = isAbove
      ? sgpToDollars(e.vorp, totalBudget, totalPositiveVorp, 1)
      : 1; // below-replacement players get the minimum $1

    return {
      playerId: e.player.id,
      playerName: e.player.name,
      position: e.position,
      totalValue: Math.round(dollarValue * 10) / 10, // round to 1 decimal
      sgpValue: Math.round(e.sgp * 100) / 100,
      categoryValues: e.breakdown,
      isAboveReplacement: isAbove,
    };
  });

  // Sort descending by dollar value
  results.sort((a, b) => b.totalValue - a.totalValue);

  return results;
}
