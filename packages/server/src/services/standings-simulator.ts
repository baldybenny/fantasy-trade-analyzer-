/**
 * Standings Simulator
 *
 * Ported from Python category_analysis.py + team.py.
 *
 * Simulates rotisserie standings by:
 *   1. Computing each team's ROS projected category totals (actuals + ROS
 *      projections for rostered players).
 *   2. Ranking all teams in each category (ascending for inverse stats like
 *      ERA/WHIP, descending for everything else).
 *   3. Assigning roto points = (num_teams - rank + 1) * category_weight.
 *   4. Summing total roto points across all categories for final standings.
 *
 * For trade simulations the roster swap is applied and standings are
 * recalculated, returning both before and after snapshots.
 */

import type {
  FantasyTeam,
  LeagueSettings,
  CategoryStanding,
  Player,
  CategoryTotals,
} from '@fta/shared';
import {
  calculateCategoryTotals,
  getAllCategories,
  getCategoryWeight,
  isInverseCategory,
} from '@fta/shared';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TeamStanding {
  teamId: number;
  teamName: string;
  standings: CategoryStanding[];
  totalPoints: number;
  rank: number;
}

export interface StandingsSnapshot {
  teamStandings: TeamStanding[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Extract the numeric value for a named category from a CategoryTotals
 * object. Rate stats can be null (insufficient data), in which case we
 * return a penalty value so the team ranks last.
 */
function getCategoryValue(
  totals: CategoryTotals,
  category: string,
  inverse: boolean,
): number {
  const val = totals[category as keyof CategoryTotals];
  if (val === null || val === undefined) {
    // Missing rate stat: give worst-possible value for ranking
    return inverse ? 99 : -99;
  }
  return val as number;
}

/**
 * Build a standings snapshot from a set of teams and their computed
 * category totals.
 */
function buildSnapshot(
  teams: FantasyTeam[],
  teamTotals: Map<number, CategoryTotals>,
  settings: LeagueSettings,
): StandingsSnapshot {
  const allCategories = getAllCategories(settings);
  const numTeams = teams.length;

  // ------------------------------------------------------------------
  // For each category, rank the teams
  // ------------------------------------------------------------------
  // Map of category -> sorted array of { teamId, value }
  const categoryRankings = new Map<string, { teamId: number; value: number }[]>();

  for (const cat of allCategories) {
    const entries: { teamId: number; value: number }[] = [];
    for (const team of teams) {
      const totals = teamTotals.get(team.id);
      if (!totals) continue;
      const value = getCategoryValue(totals, cat.name, cat.inverse);
      entries.push({ teamId: team.id, value });
    }

    // Sort: ascending for inverse stats (ERA, WHIP – lower is better,
    // so the lowest value gets the best rank = most points).
    // Descending for normal stats (higher is better).
    if (cat.inverse) {
      entries.sort((a, b) => a.value - b.value);
    } else {
      entries.sort((a, b) => b.value - a.value);
    }

    categoryRankings.set(cat.name, entries);
  }

  // ------------------------------------------------------------------
  // Build per-team standing rows
  // ------------------------------------------------------------------
  // Collect per-team category standings
  const teamStandingsMap = new Map<number, CategoryStanding[]>();
  const teamTotalPointsMap = new Map<number, number>();

  for (const team of teams) {
    teamStandingsMap.set(team.id, []);
    teamTotalPointsMap.set(team.id, 0);
  }

  for (const cat of allCategories) {
    const ranked = categoryRankings.get(cat.name) ?? [];
    const weight = getCategoryWeight(settings, cat.name);

    for (let i = 0; i < ranked.length; i++) {
      const entry = ranked[i];
      const rank = i + 1; // 1-based rank
      const points = numTeams - rank + 1;
      const weightedPoints = points * weight;

      const standing: CategoryStanding = {
        category: cat.name,
        value: entry.value,
        rank,
        points,
        weightedPoints,
      };

      teamStandingsMap.get(entry.teamId)?.push(standing);

      const prev = teamTotalPointsMap.get(entry.teamId) ?? 0;
      teamTotalPointsMap.set(entry.teamId, prev + weightedPoints);
    }
  }

  // ------------------------------------------------------------------
  // Aggregate and rank by total points
  // ------------------------------------------------------------------
  const standings: TeamStanding[] = teams.map((team) => ({
    teamId: team.id,
    teamName: team.name,
    standings: teamStandingsMap.get(team.id) ?? [],
    totalPoints: Math.round((teamTotalPointsMap.get(team.id) ?? 0) * 100) / 100,
    rank: 0, // will be filled below
  }));

  // Sort descending by totalPoints
  standings.sort((a, b) => b.totalPoints - a.totalPoints);

  for (let i = 0; i < standings.length; i++) {
    standings[i].rank = i + 1;
  }

  return { teamStandings: standings };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Calculate full rotisserie standings for all teams using their current
 * rosters and ROS projections.
 *
 * @param teams    - All fantasy teams with rosters populated.
 * @param settings - League settings containing categories and weights.
 * @returns A {@link StandingsSnapshot} with per-team category standings,
 *          total roto points, and overall rank.
 */
export function calculateStandings(
  teams: FantasyTeam[],
  settings: LeagueSettings,
): StandingsSnapshot {
  // Compute category totals for each team from their roster
  const teamTotals = new Map<number, CategoryTotals>();
  for (const team of teams) {
    teamTotals.set(team.id, calculateCategoryTotals(team.roster));
  }

  return buildSnapshot(teams, teamTotals, settings);
}

/**
 * Simulate the standings impact of a trade.
 *
 * Creates a "before" snapshot with current rosters, then swaps the specified
 * players between the two teams and creates an "after" snapshot.
 *
 * @param teams      - All fantasy teams (full league).
 * @param settings   - League settings.
 * @param teamAId    - The ID of team A.
 * @param teamBId    - The ID of team B.
 * @param teamAGives - Players team A sends to team B.
 * @param teamBGives - Players team B sends to team A.
 * @returns Before and after standings snapshots.
 */
export function simulateTradeStandings(
  teams: FantasyTeam[],
  settings: LeagueSettings,
  teamAId: number,
  teamBId: number,
  teamAGives: Player[],
  teamBGives: Player[],
): { before: StandingsSnapshot; after: StandingsSnapshot } {
  // ---- Before snapshot (current rosters) --------------------------------
  const before = calculateStandings(teams, settings);

  // ---- Build post-trade rosters -----------------------------------------
  const teamAGiveIds = new Set(teamAGives.map((p) => p.id));
  const teamBGiveIds = new Set(teamBGives.map((p) => p.id));

  const modifiedTeams: FantasyTeam[] = teams.map((team) => {
    if (team.id === teamAId) {
      // Remove players team A gives, add players team B gives
      const newRoster = team.roster
        .filter((p) => !teamAGiveIds.has(p.id))
        .concat(teamBGives);
      return { ...team, roster: newRoster };
    }
    if (team.id === teamBId) {
      // Remove players team B gives, add players team A gives
      const newRoster = team.roster
        .filter((p) => !teamBGiveIds.has(p.id))
        .concat(teamAGives);
      return { ...team, roster: newRoster };
    }
    return team;
  });

  // ---- After snapshot (post-trade rosters) -------------------------------
  const after = calculateStandings(modifiedTeams, settings);

  return { before, after };
}
