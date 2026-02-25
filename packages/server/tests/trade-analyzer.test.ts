import { describe, it, expect } from 'vitest';
import { analyzeTrade } from '../src/services/trade-analyzer.js';
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

function makePlayer(id: number, name: string, pos: Position[], overrides: Partial<Player> = {}): Player {
  return {
    id,
    name,
    team: 'NYY',
    positions: pos,
    rosterStatus: RosterStatus.ROSTER,
    rosProjection: makeStats(),
    auctionValue: 20,
    ...overrides,
  };
}

function makeTeam(id: number, name: string, players: Player[]): FantasyTeam {
  return {
    id,
    name,
    owner: `Owner ${id}`,
    roster: players,
    totalBudget: 260,
    spent: players.reduce((s, p) => s + (p.contract?.salary ?? 0), 0),
    keepers: [],
    categoryStandings: [],
    totalPoints: 0,
    rank: 0,
  };
}

describe('Trade Analyzer', () => {
  const playerA1 = makePlayer(1, 'Star Hitter', [Position.OF], {
    auctionValue: 35,
    rosProjection: makeStats({ runs: 100, hr: 35, rbi: 100, sb: 20, hits: 180, ab: 550 }),
    contract: { salary: 25, yearsRemaining: 2, isKeeper: true, extensionYear: 0, guaranteed: true, droppable: true },
  });
  const playerA2 = makePlayer(2, 'Bench Bat', [Position['1B']], {
    auctionValue: 8,
    rosProjection: makeStats({ runs: 50, hr: 12, rbi: 50, sb: 2 }),
    contract: { salary: 5, yearsRemaining: 1, isKeeper: false, extensionYear: 0, guaranteed: true, droppable: true },
  });

  const playerB1 = makePlayer(3, 'Ace Pitcher', [Position.SP], {
    auctionValue: 30,
    rosProjection: {
      ...makeStats(), ip: 200, wins: 15, qs: 25, saves: 0,
      er: 55, hitsAllowed: 150, bbAllowed: 50, strikeouts: 220,
    },
    contract: { salary: 20, yearsRemaining: 1, isKeeper: false, extensionYear: 0, guaranteed: true, droppable: true },
  });
  const playerB2 = makePlayer(4, 'Middle Reliever', [Position.RP], {
    auctionValue: 5,
    rosProjection: {
      ...makeStats(), ip: 70, wins: 4, qs: 0, saves: 10,
      er: 25, hitsAllowed: 60, bbAllowed: 20, strikeouts: 75,
    },
    contract: { salary: 2, yearsRemaining: 1, isKeeper: false, extensionYear: 0, guaranteed: true, droppable: true },
  });

  // More filler players for each team
  const fillerA = Array.from({ length: 10 }, (_, i) =>
    makePlayer(10 + i, `Filler A${i}`, [Position.OF], { auctionValue: 5, rosProjection: makeStats({ runs: 40, hr: 8, rbi: 40 }) })
  );
  const fillerB = Array.from({ length: 10 }, (_, i) =>
    makePlayer(30 + i, `Filler B${i}`, [Position.SP], {
      auctionValue: 5,
      rosProjection: { ...makeStats(), ip: 100, wins: 5, qs: 10, er: 40, hitsAllowed: 90, bbAllowed: 30, strikeouts: 90 },
    })
  );

  const teamA = makeTeam(1, 'Team Alpha', [playerA1, playerA2, ...fillerA]);
  const teamB = makeTeam(2, 'Team Beta', [playerB1, playerB2, ...fillerB]);

  // Add some more teams for a proper standings simulation
  const otherTeams = Array.from({ length: 12 }, (_, i) =>
    makeTeam(10 + i, `Team ${i + 3}`, Array.from({ length: 10 }, (_, j) =>
      makePlayer(100 + i * 10 + j, `Player ${i}-${j}`, [Position.OF], {
        auctionValue: 10,
        rosProjection: makeStats({ runs: 60, hr: 15, rbi: 60, sb: 8 }),
      })
    ))
  );

  const allTeams = [teamA, teamB, ...otherTeams];

  it('returns a valid TradeAnalysis object', () => {
    const result = analyzeTrade(
      { teamA, teamB, teamAGives: [playerA1], teamBGives: [playerB1], allTeams },
      settings,
    );

    expect(result).toBeDefined();
    expect(result.sideA).toBeDefined();
    expect(result.sideB).toBeDefined();
    expect(result.fairnessScore).toBeGreaterThanOrEqual(0);
    expect(result.fairnessScore).toBeLessThanOrEqual(100);
    expect(result.recommendation).toBeTruthy();
  });

  it('calculates fairness score near 50 for an even trade', () => {
    // Trade two similarly-valued players
    const result = analyzeTrade(
      { teamA, teamB, teamAGives: [playerA1], teamBGives: [playerB1], allTeams },
      settings,
    );

    // Both valued around $30-35, so fairness should be somewhere near 50
    expect(result.fairnessScore).toBeGreaterThan(30);
    expect(result.fairnessScore).toBeLessThan(70);
  });

  it('detects value imbalance in a lopsided trade', () => {
    // Trade star player for middle reliever
    const result = analyzeTrade(
      { teamA, teamB, teamAGives: [playerA1], teamBGives: [playerB2], allTeams },
      settings,
    );

    // Star hitter ($35) vs middle reliever ($5) — should be clearly lopsided
    expect(result.warnings.length).toBeGreaterThan(0);
    // Should have a value imbalance warning
    expect(result.warnings.some((w) => w.includes('imbalance') || w.includes('value'))).toBe(true);
  });

  it('warns about trading keepers', () => {
    const result = analyzeTrade(
      { teamA, teamB, teamAGives: [playerA1], teamBGives: [playerB1], allTeams },
      settings,
    );

    // playerA1 is a keeper
    const keeperWarnings = result.warnings.filter((w) => w.includes('keeper'));
    expect(keeperWarnings.length).toBeGreaterThan(0);
  });

  it('has correct team names in the sides', () => {
    const result = analyzeTrade(
      { teamA, teamB, teamAGives: [playerA1], teamBGives: [playerB1], allTeams },
      settings,
    );

    expect(result.sideA.teamName).toBe('Team Alpha');
    expect(result.sideB.teamName).toBe('Team Beta');
  });

  it('correctly assigns players to sides', () => {
    const result = analyzeTrade(
      { teamA, teamB, teamAGives: [playerA1], teamBGives: [playerB1], allTeams },
      settings,
    );

    expect(result.sideA.playersOut.map((p) => p.id)).toContain(playerA1.id);
    expect(result.sideA.playersIn.map((p) => p.id)).toContain(playerB1.id);
    expect(result.sideB.playersOut.map((p) => p.id)).toContain(playerB1.id);
    expect(result.sideB.playersIn.map((p) => p.id)).toContain(playerA1.id);
  });

  it('includes roster fit scores', () => {
    const result = analyzeTrade(
      { teamA, teamB, teamAGives: [playerA1], teamBGives: [playerB1], allTeams },
      settings,
    );

    expect(result.rosterFitA.score).toBeGreaterThanOrEqual(0);
    expect(result.rosterFitA.score).toBeLessThanOrEqual(100);
    expect(result.rosterFitB.score).toBeGreaterThanOrEqual(0);
    expect(result.rosterFitB.score).toBeLessThanOrEqual(100);
  });
});
