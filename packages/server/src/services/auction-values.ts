/**
 * Auction Value Calculator
 *
 * Two-phase calculation:
 *   Phase 1 – VORP: Compute each player's SGP, determine positional replacement
 *                    levels, and derive VORP (Value Over Replacement Player).
 *   Phase 2 – Dollars: Convert VORP into dollar auction values that sum to the
 *                       league's total budget.
 *
 * VORP is a standalone metric that can be used independently of dollar values.
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

export interface PlayerVorp {
  playerId: number;
  playerName: string;
  position: string;
  /** Raw SGP value before replacement-level adjustment */
  sgpValue: number;
  /** Value over replacement player (in SGP units) */
  vorp: number;
  /** Per-category SGP breakdown */
  categoryValues: Record<string, number>;
  /** Whether the player is above replacement level */
  isAboveReplacement: boolean;
}

export interface AuctionValue extends PlayerVorp {
  /** Dollar value of this player */
  totalValue: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Resolve the replacement-level roster-depth threshold for a given position.
 * The raw value is scaled by (numTeams / 12) to account for larger or smaller
 * leagues.
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
// Phase 1: VORP Calculation (standalone)
// ---------------------------------------------------------------------------

/**
 * Calculate VORP for every player in the pool.
 *
 * Algorithm:
 *   1. Compute each player's SGP and determine their primary position.
 *   2. Group players by position, sort descending by SGP.
 *   3. Determine replacement-level SGP per position from the roster-depth
 *      threshold. DH/UTIL players are compared against the overall hitter
 *      pool since any hitter can fill a utility slot.
 *   4. VORP = playerSgp - replacementSgp for that position.
 *
 * @returns Array of {@link PlayerVorp} objects, sorted descending by VORP.
 */
export function calculatePlayerVorp(
  players: Player[],
  settings: LeagueSettings,
  numTeams: number,
): PlayerVorp[] {
  // Step 1: Compute SGP for every player
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

  // Step 2: Group by position and sort descending by SGP
  const byPosition: Record<string, PlayerSgpEntry[]> = {};
  for (const entry of entries) {
    const pos = entry.position;
    if (!byPosition[pos]) byPosition[pos] = [];
    byPosition[pos].push(entry);
  }

  for (const pos of Object.keys(byPosition)) {
    byPosition[pos].sort((a, b) => b.sgp - a.sgp);
  }

  // Step 3: Determine replacement-level SGP per position
  const FUNGIBLE_POSITIONS = new Set(['DH', 'UTIL', 'PH', 'PH/PR']);

  const replacementSgpByPosition: Record<string, number> = {};
  for (const pos of Object.keys(byPosition)) {
    if (FUNGIBLE_POSITIONS.has(pos)) continue; // handled below
    const threshold = Math.floor(getReplacementThreshold(settings, pos, numTeams));
    const posPlayers = byPosition[pos];
    if (threshold > 0 && posPlayers.length >= threshold) {
      replacementSgpByPosition[pos] = posPlayers[threshold - 1].sgp;
    } else if (posPlayers.length > 0) {
      replacementSgpByPosition[pos] = posPlayers[posPlayers.length - 1].sgp;
    } else {
      replacementSgpByPosition[pos] = 0;
    }
  }

  // For DH/UTIL: compare against the overall hitter pool since any hitter
  // can fill a UTIL slot. Replacement = the Nth-best hitter overall, where
  // N = total hitting roster slots across the league.
  const hitterEntries = entries
    .filter((e) => !isPitcherFn(e.player))
    .sort((a, b) => b.sgp - a.sgp);
  const totalHittingSlots = (
    (settings.positionSlots?.C ?? 2) +
    (settings.positionSlots?.['1B'] ?? 1) +
    (settings.positionSlots?.['2B'] ?? 1) +
    (settings.positionSlots?.['3B'] ?? 1) +
    (settings.positionSlots?.SS ?? 1) +
    (settings.positionSlots?.CI ?? 1) +
    (settings.positionSlots?.MI ?? 1) +
    (settings.positionSlots?.OF ?? 5) +
    (settings.positionSlots?.UTIL ?? 1)
  ) * numTeams;
  const fungibleReplacementSgp = totalHittingSlots < hitterEntries.length
    ? hitterEntries[totalHittingSlots - 1].sgp
    : hitterEntries.length > 0
      ? hitterEntries[hitterEntries.length - 1].sgp
      : 0;
  for (const pos of FUNGIBLE_POSITIONS) {
    replacementSgpByPosition[pos] = fungibleReplacementSgp;
  }

  // Step 4: Compute VORP for every player
  const results: PlayerVorp[] = entries.map((e) => {
    const repSgp = replacementSgpByPosition[e.position] ?? 0;
    const vorp = e.sgp - repSgp;
    return {
      playerId: e.player.id,
      playerName: e.player.name,
      position: e.position,
      sgpValue: Math.round(e.sgp * 100) / 100,
      vorp: Math.round(vorp * 100) / 100,
      categoryValues: e.breakdown,
      isAboveReplacement: vorp > 0,
    };
  });

  results.sort((a, b) => b.vorp - a.vorp);
  return results;
}

// ---------------------------------------------------------------------------
// Phase 2: Dollar Conversion
// ---------------------------------------------------------------------------

/**
 * Convert VORP values into dollar auction values that sum to the league's
 * total budget.
 *
 *   dollarsPerVorp = totalBudget / totalPositiveVorp
 *   playerDollars  = max(minBid, vorp * dollarsPerVorp)
 *
 * @param vorpResults - Output from {@link calculatePlayerVorp}.
 * @param settings    - League settings (for totalBudget).
 * @param numTeams    - Number of teams in the league.
 * @returns Array of {@link AuctionValue} objects, sorted descending by dollar value.
 */
export function convertVorpToDollars(
  vorpResults: PlayerVorp[],
  settings: LeagueSettings,
  numTeams: number,
): AuctionValue[] {
  const totalBudget = settings.totalBudget * numTeams;
  const totalPositiveVorp = vorpResults.reduce(
    (sum, e) => sum + Math.max(0, e.vorp),
    0,
  );

  const dollarsPerVorp = totalPositiveVorp > 0
    ? totalBudget / totalPositiveVorp
    : 0;

  const results: AuctionValue[] = vorpResults.map((e) => {
    const dollarValue = e.isAboveReplacement
      ? Math.max(1, e.vorp * dollarsPerVorp)
      : 1;

    return {
      ...e,
      totalValue: Math.round(dollarValue * 10) / 10,
    };
  });

  results.sort((a, b) => b.totalValue - a.totalValue);
  return results;
}

// ---------------------------------------------------------------------------
// Combined convenience function (backwards compatible)
// ---------------------------------------------------------------------------

/**
 * Calculate auction dollar values for every player in the pool.
 * Runs both VORP calculation and dollar conversion in sequence.
 */
export function calculateAuctionValues(
  players: Player[],
  settings: LeagueSettings,
  numTeams: number,
): AuctionValue[] {
  const vorpResults = calculatePlayerVorp(players, settings, numTeams);
  return convertVorpToDollars(vorpResults, settings, numTeams);
}
