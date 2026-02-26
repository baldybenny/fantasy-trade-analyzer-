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

  // Keepers = players explicitly marked as keepers, OR rostered players
  // whose auction value exceeds their salary (positive surplus = likely kept)
  const keepers = players.filter(
    (p) =>
      p.fantasyTeamId != null &&
      p.contract != null &&
      p.contract.salary > 0 &&
      p.auctionValue != null &&
      (p.contract.isKeeper || (p.auctionValue ?? 0) > p.contract.salary),
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
 * Can this player be extended, or are they expiring / on a guaranteed-year deal?
 *
 *   "1st" / "2nd" → extension-eligible (regular contract cycle)
 *   "3rd"         → expiring, no extension possible
 *   "2026" etc.   → guaranteed through that year, no extension cycle
 *   ""            → assume extensible (legacy data)
 */
function canExtend(contract: Player['contract']): boolean {
  const status = contract?.contractStatus ?? '';
  if (!status) return true; // legacy data without status
  if (/^\d{4}$/.test(status)) return false; // guaranteed-year deal
  if (status.toLowerCase().includes('3rd')) return false; // expiring
  return true;
}

/**
 * Project keeper value over multiple future years.
 *
 * Value decays 5% per year. Extension cost is $5 per year of extension,
 * added all at once (e.g. 1-year ext = +$5, 2-year ext = +$10).
 *
 * Players on guaranteed-year contracts or in their 3rd (expiring) year
 * cannot be extended — projection stops after their contract expires.
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
  const extensible = canExtend(player.contract);

  for (let year = 1; year <= yearsForward; year++) {
    // If contract expired and player can't extend, stop projecting
    if (year > contractYears && !extensible) break;

    const projectedValue = Math.round(baseValue * Math.pow(0.95, year) * 10) / 10;

    let projectedSalary: number;
    if (year <= contractYears) {
      projectedSalary = baseSalary;
    } else {
      // Each year of extension costs $5 added to base salary all at once.
      // Year-by-year extensions: year 1 past contract = +$5, year 2 = +$10, etc.
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
