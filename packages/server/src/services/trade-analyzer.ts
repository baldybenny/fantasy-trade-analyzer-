/**
 * Trade Analyzer — Main Orchestrator
 *
 * Ported from Python trade_analyzer.py lines 63-186.
 *
 * Orchestrates all other analytical services to produce a comprehensive
 * {@link TradeAnalysis} for a proposed trade:
 *
 *   1. Calculate SGP and auction values for every player involved.
 *   2. Compute surplus value comparison (auction value - salary).
 *   3. Run standings simulation (before / after).
 *   4. Evaluate roster fit for both sides.
 *   5. Derive a fairness score, category-by-category impact, warnings,
 *      and a recommendation.
 */

import type {
  TradeAnalysis,
  TradeSide,
  CategoryImpact,
  RosterFitResult,
  FantasyTeam,
  Player,
  LeagueSettings,
} from '@fta/shared';
import {
  isPitcher as isPitcherFn,
  getPlayerSurplusValue,
  getAllCategories,
  clamp,
} from '@fta/shared';
import { calculateSgpValue } from './sgp.js';
import { calculateAuctionValues } from './auction-values.js';
import {
  simulateTradeStandings,
  type StandingsSnapshot,
  type TeamStanding,
} from './standings-simulator.js';
import { evaluateRosterFit } from './roster-optimizer.js';

// ---------------------------------------------------------------------------
// Internal Types
// ---------------------------------------------------------------------------

interface TradeProposalInput {
  teamA: FantasyTeam;
  teamB: FantasyTeam;
  teamAGives: Player[];
  teamBGives: Player[];
  allTeams: FantasyTeam[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Compute the total auction dollar value for a set of players.
 * Uses the pre-computed `auctionValue` on each Player if available,
 * otherwise computes on-the-fly via SGP.
 */
function sumPlayerValues(
  players: Player[],
  settings: LeagueSettings,
  numTeams: number,
  auctionMap: Map<number, number>,
): number {
  let total = 0;
  for (const p of players) {
    total += auctionMap.get(p.id) ?? p.auctionValue ?? 1;
  }
  return total;
}

/**
 * Compute the total salary for a set of players.
 */
function sumSalaries(players: Player[]): number {
  return players.reduce((sum, p) => sum + (p.contract?.salary ?? 0), 0);
}

/**
 * Build a category impact record by comparing a team's standings before and
 * after the trade.
 */
function buildCategoryImpacts(
  teamId: number,
  before: StandingsSnapshot,
  after: StandingsSnapshot,
): CategoryImpact[] {
  const beforeTeam = before.teamStandings.find((t) => t.teamId === teamId);
  const afterTeam = after.teamStandings.find((t) => t.teamId === teamId);
  if (!beforeTeam || !afterTeam) return [];

  const impacts: CategoryImpact[] = [];

  for (const bCat of beforeTeam.standings) {
    const aCat = afterTeam.standings.find((c) => c.category === bCat.category);
    if (!aCat) continue;

    impacts.push({
      category: bCat.category,
      before: bCat.value,
      after: aCat.value,
      change: Math.round((aCat.value - bCat.value) * 1000) / 1000,
      rankBefore: bCat.rank,
      rankAfter: aCat.rank,
      rankChange: bCat.rank - aCat.rank, // positive = improved (lower rank number = better)
    });
  }

  return impacts;
}

/**
 * Build a TradeSide for one team.
 */
function buildTradeSide(
  team: FantasyTeam,
  playersOut: Player[],
  playersIn: Player[],
  categoryImpacts: CategoryImpact[],
  auctionMap: Map<number, number>,
): TradeSide {
  const valueOut = playersOut.reduce(
    (sum, p) => sum + (auctionMap.get(p.id) ?? p.auctionValue ?? 1),
    0,
  );
  const valueIn = playersIn.reduce(
    (sum, p) => sum + (auctionMap.get(p.id) ?? p.auctionValue ?? 1),
    0,
  );

  return {
    teamId: team.id,
    teamName: team.name,
    playersOut,
    playersIn,
    salaryOut: sumSalaries(playersOut),
    salaryIn: sumSalaries(playersIn),
    valueOut: Math.round(valueOut * 10) / 10,
    valueIn: Math.round(valueIn * 10) / 10,
    categoryImpacts,
  };
}

/**
 * Derive the fairness score.
 *
 *   fairnessScore = 50 + (valueDiff / totalValue) * 50
 *
 * Clamped to [0, 100]. A score of 50 means perfectly fair.
 * Scores above 50 favour side A; below 50 favour side B.
 */
function calculateFairnessScore(
  valueA: number,
  valueB: number,
): number {
  const totalValue = valueA + valueB;
  if (totalValue === 0) return 50;
  const diff = valueA - valueB;
  const raw = 50 + (diff / totalValue) * 50;
  return Math.round(clamp(raw, 0, 100) * 10) / 10;
}

/**
 * Generate warnings about trade concerns.
 */
function generateWarnings(
  sideA: TradeSide,
  sideB: TradeSide,
  valueDifference: number,
): string[] {
  const warnings: string[] = [];

  // Value imbalance warning (>$20 difference)
  if (Math.abs(valueDifference) > 20) {
    const winner = valueDifference > 0 ? sideA.teamName : sideB.teamName;
    warnings.push(
      `Significant value imbalance: $${Math.abs(Math.round(valueDifference * 10) / 10)} in favour of ${winner}`,
    );
  }

  // Keeper contract alerts
  for (const p of sideA.playersOut) {
    if (p.contract?.isKeeper) {
      warnings.push(
        `${sideA.teamName} is trading away keeper ${p.name} ($${p.contract.salary}, ${p.contract.yearsRemaining}yr remaining)`,
      );
    }
  }
  for (const p of sideB.playersOut) {
    if (p.contract?.isKeeper) {
      warnings.push(
        `${sideB.teamName} is trading away keeper ${p.name} ($${p.contract.salary}, ${p.contract.yearsRemaining}yr remaining)`,
      );
    }
  }

  // Salary mismatch warning
  const salaryDiff = Math.abs(sideA.salaryOut - sideB.salaryOut);
  if (salaryDiff > 30) {
    warnings.push(
      `Large salary differential: $${Math.round(salaryDiff)} between the two sides`,
    );
  }

  return warnings;
}

/**
 * Generate a human-readable recommendation string.
 */
function generateRecommendation(
  sideA: TradeSide,
  sideB: TradeSide,
  fairnessScore: number,
  rosterFitA: RosterFitResult,
  rosterFitB: RosterFitResult,
): string {
  const parts: string[] = [];

  // Fairness assessment
  if (fairnessScore >= 45 && fairnessScore <= 55) {
    parts.push('This trade is approximately fair in terms of player value.');
  } else if (fairnessScore > 55) {
    const diff = Math.round(sideA.valueIn - sideA.valueOut);
    parts.push(
      `${sideA.teamName} receives approximately $${Math.abs(diff)} more value in this trade.`,
    );
  } else {
    const diff = Math.round(sideB.valueIn - sideB.valueOut);
    parts.push(
      `${sideB.teamName} receives approximately $${Math.abs(diff)} more value in this trade.`,
    );
  }

  // Roster fit assessment
  if (rosterFitA.score >= 70 && rosterFitB.score >= 70) {
    parts.push('Both teams improve their roster construction.');
  } else if (rosterFitA.score >= 70) {
    parts.push(
      `${sideA.teamName} significantly improves roster fit (score: ${rosterFitA.score}).`,
    );
  } else if (rosterFitB.score >= 70) {
    parts.push(
      `${sideB.teamName} significantly improves roster fit (score: ${rosterFitB.score}).`,
    );
  }

  // Positional notes
  if (rosterFitA.unfilledSlots.length > 0) {
    parts.push(
      `${sideA.teamName} will have unfilled slots: ${rosterFitA.unfilledSlots.join(', ')}.`,
    );
  }
  if (rosterFitB.unfilledSlots.length > 0) {
    parts.push(
      `${sideB.teamName} will have unfilled slots: ${rosterFitB.unfilledSlots.join(', ')}.`,
    );
  }

  return parts.join(' ');
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Perform a comprehensive analysis of a proposed trade.
 *
 * @param proposal - The trade proposal containing both teams, the players
 *                   each side gives up, and the full league roster.
 * @param settings - League settings for valuation and standings simulation.
 * @returns A complete {@link TradeAnalysis} with value comparison, standings
 *          impact, roster fit, fairness score, warnings, and recommendation.
 */
export function analyzeTrade(
  proposal: TradeProposalInput,
  settings: LeagueSettings,
): TradeAnalysis {
  const { teamA, teamB, teamAGives, teamBGives, allTeams } = proposal;
  const numTeams = allTeams.length;

  // ------------------------------------------------------------------
  // Step 1: Calculate auction values for all involved players
  // ------------------------------------------------------------------
  const allInvolvedPlayers = [...teamAGives, ...teamBGives];
  const allLeaguePlayers = allTeams.flatMap((t) => t.roster);

  const auctionResults = calculateAuctionValues(
    allLeaguePlayers,
    settings,
    numTeams,
  );

  // Build a lookup map for quick access
  const auctionMap = new Map<number, number>();
  for (const av of auctionResults) {
    auctionMap.set(av.playerId, av.totalValue);
  }

  // ------------------------------------------------------------------
  // Step 2: Run standings simulation
  // ------------------------------------------------------------------
  const { before, after } = simulateTradeStandings(
    allTeams,
    settings,
    teamA.id,
    teamB.id,
    teamAGives,
    teamBGives,
  );

  // ------------------------------------------------------------------
  // Step 3: Build category impacts
  // ------------------------------------------------------------------
  const impactsA = buildCategoryImpacts(teamA.id, before, after);
  const impactsB = buildCategoryImpacts(teamB.id, before, after);

  // ------------------------------------------------------------------
  // Step 4: Build trade sides
  // ------------------------------------------------------------------
  // Side A gives teamAGives, receives teamBGives
  const sideA = buildTradeSide(teamA, teamAGives, teamBGives, impactsA, auctionMap);
  // Side B gives teamBGives, receives teamAGives
  const sideB = buildTradeSide(teamB, teamBGives, teamAGives, impactsB, auctionMap);

  // ------------------------------------------------------------------
  // Step 5: Value difference (positive = side A wins)
  // ------------------------------------------------------------------
  const valueDifference =
    Math.round((sideA.valueIn - sideA.valueOut) * 10) / 10;

  // ------------------------------------------------------------------
  // Step 6: Fairness score
  // ------------------------------------------------------------------
  const fairnessScore = calculateFairnessScore(sideA.valueIn, sideB.valueIn);

  // ------------------------------------------------------------------
  // Step 7: Category-by-category summary
  // ------------------------------------------------------------------
  const categorySummary: Record<
    string,
    { teamA: CategoryImpact; teamB: CategoryImpact }
  > = {};

  for (const impactA of impactsA) {
    const impactB = impactsB.find((i) => i.category === impactA.category);
    if (impactB) {
      categorySummary[impactA.category] = {
        teamA: impactA,
        teamB: impactB,
      };
    }
  }

  // ------------------------------------------------------------------
  // Step 8: Roster fit for both sides
  // ------------------------------------------------------------------
  const rosterFitA = evaluateRosterFit(
    teamA.roster,
    teamBGives,  // team A receives what team B gives
    teamAGives,  // team A gives away these players
    settings,
  );

  const rosterFitB = evaluateRosterFit(
    teamB.roster,
    teamAGives,  // team B receives what team A gives
    teamBGives,  // team B gives away these players
    settings,
  );

  // ------------------------------------------------------------------
  // Step 9: Warnings
  // ------------------------------------------------------------------
  const warnings = generateWarnings(sideA, sideB, valueDifference);

  // ------------------------------------------------------------------
  // Step 10: Recommendation
  // ------------------------------------------------------------------
  const recommendation = generateRecommendation(
    sideA,
    sideB,
    fairnessScore,
    rosterFitA,
    rosterFitB,
  );

  // ------------------------------------------------------------------
  // Assemble final analysis
  // ------------------------------------------------------------------
  return {
    sideA,
    sideB,
    valueDifference,
    fairnessScore,
    categorySummary,
    rosterFitA,
    rosterFitB,
    warnings,
    recommendation,
  };
}
