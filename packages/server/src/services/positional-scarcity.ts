/**
 * Positional Scarcity Calculator
 *
 * Ported from Python analysis/auction_values.py lines 290-320.
 *
 * Groups players by primary position, computes value distributions, and
 * calculates scarcity multipliers.
 */

import type { Player, PositionalScarcity } from '@fta/shared';
import { primaryPosition } from '@fta/shared';

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Calculate positional scarcity across all players with auction values.
 *
 * scarcityMultiplier = overallAvgValue / positionAvgValue
 *   - > 1.2 → scarce (fewer valuable players at this position)
 *   - < 0.8 → deep (many valuable players)
 *   - else → normal
 *
 * Sorted by multiplier descending (scarcest first).
 */
export function calculatePositionalScarcity(
  players: Player[],
): PositionalScarcity[] {
  const valuedPlayers = players.filter(
    (p) => p.auctionValue != null && p.auctionValue > 1,
  );

  if (valuedPlayers.length === 0) return [];

  // Group by primary position
  const byPosition: Record<string, Player[]> = {};
  for (const player of valuedPlayers) {
    const pos = primaryPosition(player);
    if (!byPosition[pos]) byPosition[pos] = [];
    byPosition[pos].push(player);
  }

  // Overall average value
  const overallAvgValue =
    valuedPlayers.reduce((sum, p) => sum + (p.auctionValue ?? 0), 0) /
    valuedPlayers.length;

  const results: PositionalScarcity[] = [];

  for (const [position, posPlayers] of Object.entries(byPosition)) {
    const values = posPlayers.map((p) => p.auctionValue ?? 0).sort((a, b) => b - a);

    const avgValue = values.reduce((s, v) => s + v, 0) / values.length;
    const medianValue = median(values);
    const topPlayerValue = values[0] ?? 0;
    const replacementValue = values[values.length - 1] ?? 0;

    const scarcityMultiplier =
      avgValue > 0 ? overallAvgValue / avgValue : 1;

    let tier: 'scarce' | 'normal' | 'deep';
    if (scarcityMultiplier > 1.2) {
      tier = 'scarce';
    } else if (scarcityMultiplier < 0.8) {
      tier = 'deep';
    } else {
      tier = 'normal';
    }

    results.push({
      position,
      avgValue: Math.round(avgValue * 10) / 10,
      medianValue: Math.round(medianValue * 10) / 10,
      topPlayerValue: Math.round(topPlayerValue * 10) / 10,
      replacementValue: Math.round(replacementValue * 10) / 10,
      scarcityMultiplier: Math.round(scarcityMultiplier * 100) / 100,
      playerCount: posPlayers.length,
      tier,
    });
  }

  // Sort by scarcity multiplier descending (scarcest first)
  results.sort((a, b) => b.scarcityMultiplier - a.scarcityMultiplier);

  return results;
}
