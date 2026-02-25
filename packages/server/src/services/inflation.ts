/**
 * Inflation Calculator & Keeper Analysis
 *
 * Ported from Python analysis/inflation.py.
 *
 * In keeper leagues, players kept below their auction value remove value from
 * the pool while removing less salary. This "inflates" the cost of remaining
 * players in the auction.
 */

import type {
  Player,
  LeagueSettings,
  InflationResult,
  KeeperCandidate,
  YearProjection,
} from '@fta/shared';
import { primaryPosition } from '@fta/shared';

/**
 * Calculate league-wide inflation from keepers.
 *
 *   inflationRate = remainingBudget / remainingValue
 *
 * Where:
 *   remainingBudget = totalLeagueBudget - totalKeeperSalary
 *   remainingValue  = totalLeagueBudget - totalKeeperValue
 */
export function calculateInflation(
  players: Player[],
  settings: LeagueSettings,
  numTeams: number,
): InflationResult {
  const totalLeagueBudget = settings.totalBudget * numTeams;

  // Keepers = rostered players with salary > 0 and an auction value
  const keepers = players.filter(
    (p) =>
      p.fantasyTeamId != null &&
      p.contract != null &&
      p.contract.salary > 0 &&
      p.auctionValue != null,
  );

  const totalKeeperSalary = keepers.reduce(
    (sum, p) => sum + (p.contract?.salary ?? 0),
    0,
  );
  const totalKeeperValue = keepers.reduce(
    (sum, p) => sum + (p.auctionValue ?? 0),
    0,
  );

  const remainingBudget = totalLeagueBudget - totalKeeperSalary;
  const remainingValue = totalLeagueBudget - totalKeeperValue;

  const inflationRate = remainingValue > 0 ? remainingBudget / remainingValue : 1;
  const inflationPercentage = (inflationRate - 1) * 100;

  const avgKeeperDiscount =
    keepers.length > 0
      ? keepers.reduce(
          (sum, p) => sum + ((p.auctionValue ?? 0) - (p.contract?.salary ?? 0)),
          0,
        ) / keepers.length
      : 0;

  return {
    inflationRate,
    inflationPercentage: Math.round(inflationPercentage * 10) / 10,
    totalKeeperSalary: Math.round(totalKeeperSalary * 10) / 10,
    totalKeeperValue: Math.round(totalKeeperValue * 10) / 10,
    remainingBudget: Math.round(remainingBudget * 10) / 10,
    remainingValue: Math.round(remainingValue * 10) / 10,
    numKeepers: keepers.length,
    avgKeeperDiscount: Math.round(avgKeeperDiscount * 10) / 10,
  };
}

/**
 * Apply inflation to a base auction value.
 */
export function applyInflation(baseValue: number, inflationRate: number): number {
  return Math.round(baseValue * inflationRate * 10) / 10;
}

/**
 * Project keeper value over multiple future years.
 *
 * Value decays 5% per year. Salary grows by extensionCostPerYear after
 * the initial contract expires.
 */
export function projectKeeperValue(
  player: Player,
  settings: LeagueSettings,
  yearsForward: number = 3,
): YearProjection[] {
  const projections: YearProjection[] = [];
  const baseSalary = player.contract?.salary ?? 0;
  const baseValue = player.auctionValue ?? 0;
  const contractYears = player.contract?.yearsRemaining ?? 1;

  for (let year = 1; year <= yearsForward; year++) {
    const projectedValue = Math.round(baseValue * Math.pow(0.95, year) * 10) / 10;

    let projectedSalary: number;
    if (year <= contractYears) {
      projectedSalary = baseSalary;
    } else {
      const extensions = year - contractYears;
      projectedSalary = baseSalary + settings.extensionCostPerYear * extensions;
    }

    const surplusValue = Math.round((projectedValue - projectedSalary) * 10) / 10;

    projections.push({
      year,
      projectedSalary,
      projectedValue,
      surplusValue,
      keepRecommendation: surplusValue > 0,
    });
  }

  return projections;
}

/**
 * Analyze keeper candidates for a set of players (typically one team's roster).
 *
 * Returns candidates sorted by surplus descending, with multi-year projections.
 */
export function analyzeKeepers(
  teamPlayers: Player[],
  settings: LeagueSettings,
  inflationRate: number,
): KeeperCandidate[] {
  const candidates: KeeperCandidate[] = teamPlayers
    .filter(
      (p) =>
        p.contract != null &&
        p.contract.salary > 0 &&
        p.auctionValue != null,
    )
    .map((p) => {
      const salary = p.contract!.salary;
      const auctionValue = p.auctionValue ?? 0;
      const vorp = p.vorp ?? 0;
      const inflatedValue = applyInflation(auctionValue, inflationRate);
      const surplusValue = Math.round((auctionValue - salary) * 10) / 10;
      const inflatedSurplus = Math.round((inflatedValue - salary) * 10) / 10;
      const multiYearProjection = projectKeeperValue(p, settings);

      return {
        playerId: p.id,
        playerName: p.name,
        position: primaryPosition(p),
        salary,
        auctionValue,
        vorp,
        inflatedValue,
        surplusValue,
        inflatedSurplus,
        yearsRemaining: p.contract!.yearsRemaining,
        keepRecommendation: inflatedSurplus > 0,
        multiYearProjection,
      };
    });

  // Sort by inflated surplus descending
  candidates.sort((a, b) => b.inflatedSurplus - a.inflatedSurplus);

  return candidates;
}
