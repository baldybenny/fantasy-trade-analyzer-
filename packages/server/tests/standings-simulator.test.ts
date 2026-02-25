import { describe, it, expect } from 'vitest';
import { calculateStandings, simulateTradeStandings } from '../src/services/standings-simulator.js';
import type { FantasyTeam, Player, PlayerStats, LeagueSettings } from '@fta/shared';
import { DEFAULT_LEAGUE_SETTINGS, Position, RosterStatus } from '@fta/shared';

const settings: LeagueSettings = DEFAULT_LEAGUE_SETTINGS;

function makeStats(overrides: Partial<PlayerStats> = {}): PlayerStats {
  return {
    games: 150, pa: 600, ab: 550, runs: 80, hits: 150, doubles: 25,
    triples: 2, hr: 25, rbi: 80, sb: 10, cs: 3, bb: 50, so: 120,
    ip: 0, wins: 0, losses: 0, saves: 0, holds: 0, qs: 0,
    er: 0, hitsAllowed: 0, bbAllowed: 0, strikeouts: 0,
    ...overrides,
  };
}

function makePlayer(id: number, name: string, stats: Partial<PlayerStats>): Player {
  return {
    id,
    name,
    team: 'NYY',
    positions: [Position.OF],
    rosterStatus: RosterStatus.ROSTER,
    rosProjection: makeStats(stats),
  };
}

function makeTeam(id: number, name: string, players: Player[]): FantasyTeam {
  return {
    id,
    name,
    owner: `Owner ${id}`,
    roster: players,
    totalBudget: 260,
    spent: 0,
    keepers: [],
    categoryStandings: [],
    totalPoints: 0,
    rank: 0,
  };
}

describe('Standings Simulator', () => {
  const teams: FantasyTeam[] = [
    makeTeam(1, 'Power Team', [
      makePlayer(1, 'Slugger', { runs: 100, hr: 40, rbi: 110, sb: 5, hits: 160, ab: 550 }),
      makePlayer(2, 'Slugger2', { runs: 90, hr: 35, rbi: 100, sb: 3, hits: 150, ab: 550 }),
    ]),
    makeTeam(2, 'Speed Team', [
      makePlayer(3, 'Speedster', { runs: 95, hr: 10, rbi: 50, sb: 40, hits: 170, ab: 550 }),
      makePlayer(4, 'Speedster2', { runs: 85, hr: 8, rbi: 45, sb: 35, hits: 165, ab: 550 }),
    ]),
    makeTeam(3, 'Balanced Team', [
      makePlayer(5, 'Balanced1', { runs: 85, hr: 25, rbi: 80, sb: 15, hits: 155, ab: 550 }),
      makePlayer(6, 'Balanced2', { runs: 80, hr: 22, rbi: 75, sb: 12, hits: 150, ab: 550 }),
    ]),
  ];

  it('ranks teams correctly for counting stats', () => {
    const result = calculateStandings(teams, settings);

    expect(result.teamStandings).toHaveLength(3);

    // Power team should rank #1 in HR
    const powerTeam = result.teamStandings.find((t) => t.teamId === 1)!;
    const hrStanding = powerTeam.standings.find((s) => s.category === 'HR')!;
    expect(hrStanding.rank).toBe(1);

    // Speed team should rank #1 in SB
    const speedTeam = result.teamStandings.find((t) => t.teamId === 2)!;
    const sbStanding = speedTeam.standings.find((s) => s.category === 'SB')!;
    expect(sbStanding.rank).toBe(1);
  });

  it('assigns correct roto points (numTeams - rank + 1)', () => {
    const result = calculateStandings(teams, settings);
    const numTeams = 3;

    for (const teamStanding of result.teamStandings) {
      for (const cs of teamStanding.standings) {
        expect(cs.points).toBe(numTeams - cs.rank + 1);
      }
    }
  });

  it('all ranks are valid (1 to numTeams)', () => {
    const result = calculateStandings(teams, settings);
    const numTeams = 3;

    for (const cat of result.teamStandings[0].standings.map((s) => s.category)) {
      const ranks = result.teamStandings.map(
        (t) => t.standings.find((s) => s.category === cat)!.rank,
      );
      // Every rank from 1 to numTeams should appear exactly once
      ranks.sort((a, b) => a - b);
      expect(ranks).toEqual([1, 2, 3]);
    }
  });

  it('total points is sum of all weighted points', () => {
    const result = calculateStandings(teams, settings);

    for (const teamStanding of result.teamStandings) {
      const sum = teamStanding.standings.reduce((acc, cs) => acc + cs.weightedPoints, 0);
      expect(teamStanding.totalPoints).toBeCloseTo(sum, 5);
    }
  });

  it('simulateTradeStandings returns before and after', () => {
    // Trade: Power team gives Slugger, Speed team gives Speedster
    const slugger = teams[0].roster[0];
    const speedster = teams[1].roster[0];

    const { before, after } = simulateTradeStandings(
      teams, settings,
      1, 2,
      [slugger], [speedster],
    );

    expect(before.teamStandings).toHaveLength(3);
    expect(after.teamStandings).toHaveLength(3);

    // After trade, Power team should get worse in HR (lost Slugger, got Speedster)
    const powerBefore = before.teamStandings.find((t) => t.teamId === 1)!;
    const powerAfter = after.teamStandings.find((t) => t.teamId === 1)!;
    const hrBefore = powerBefore.standings.find((s) => s.category === 'HR')!.value;
    const hrAfter = powerAfter.standings.find((s) => s.category === 'HR')!.value;
    expect(hrAfter).toBeLessThan(hrBefore); // Lost a slugger, gained a speedster
  });
});
