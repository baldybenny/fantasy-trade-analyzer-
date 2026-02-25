import { describe, it, expect } from 'vitest';
import { calculateSgpValue } from '../src/services/sgp.js';
import type { PlayerStats, LeagueSettings } from '@fta/shared';
import { DEFAULT_LEAGUE_SETTINGS } from '@fta/shared';

const settings: LeagueSettings = DEFAULT_LEAGUE_SETTINGS;

function makeHitterStats(overrides: Partial<PlayerStats> = {}): PlayerStats {
  return {
    games: 150, pa: 600, ab: 550, runs: 90, hits: 160, doubles: 30,
    triples: 3, hr: 30, rbi: 90, sb: 15, cs: 5, bb: 50, so: 130,
    ip: 0, wins: 0, losses: 0, saves: 0, holds: 0, qs: 0,
    er: 0, hitsAllowed: 0, bbAllowed: 0, strikeouts: 0,
    ...overrides,
  };
}

function makePitcherStats(overrides: Partial<PlayerStats> = {}): PlayerStats {
  return {
    games: 0, pa: 0, ab: 0, runs: 0, hits: 0, doubles: 0,
    triples: 0, hr: 0, rbi: 0, sb: 0, cs: 0, bb: 0, so: 0,
    ip: 180, wins: 12, losses: 8, saves: 0, holds: 0, qs: 20,
    er: 60, hitsAllowed: 150, bbAllowed: 50, strikeouts: 180,
    ...overrides,
  };
}

describe('SGP Calculator', () => {
  describe('Counting stat SGP', () => {
    it('calculates HR SGP correctly', () => {
      const stats = makeHitterStats({ hr: 30 });
      const result = calculateSgpValue(stats, false, settings);
      // HR SGP = 30 / 8 * 1.0 = 3.75
      expect(result.categoryBreakdown['HR']).toBeCloseTo(3.75, 2);
    });

    it('calculates R SGP correctly', () => {
      const stats = makeHitterStats({ runs: 100 });
      const result = calculateSgpValue(stats, false, settings);
      // R SGP = 100 / 25 * 1.0 = 4.0
      expect(result.categoryBreakdown['R']).toBeCloseTo(4.0, 2);
    });

    it('calculates SB SGP correctly', () => {
      const stats = makeHitterStats({ sb: 20 });
      const result = calculateSgpValue(stats, false, settings);
      // SB SGP = 20 / 10 * 1.0 = 2.0
      expect(result.categoryBreakdown['SB']).toBeCloseTo(2.0, 2);
    });

    it('calculates K (pitching) SGP correctly', () => {
      const stats = makePitcherStats({ strikeouts: 200 });
      const result = calculateSgpValue(stats, true, settings);
      // K SGP = 200 / 30 * 1.0 = 6.667
      expect(result.categoryBreakdown['K']).toBeCloseTo(6.667, 2);
    });

    it('applies half-weight to W category', () => {
      const stats = makePitcherStats({ wins: 12 });
      const result = calculateSgpValue(stats, true, settings);
      // W SGP = 12 / 3 * 0.5 = 2.0
      expect(result.categoryBreakdown['W']).toBeCloseTo(2.0, 2);
    });
  });

  describe('Rate stat SGP', () => {
    it('calculates AVG SGP correctly (half-weighted)', () => {
      // AVG = 160/550 ≈ .2909
      const stats = makeHitterStats({ hits: 160, ab: 550 });
      const result = calculateSgpValue(stats, false, settings);
      // AVG SGP = (0.2909 - 0.260) / 0.003 * 0.5 ≈ 5.15
      const expectedAvg = 160 / 550;
      const expectedSgp = ((expectedAvg - 0.260) / 0.003) * 0.5;
      expect(result.categoryBreakdown['AVG']).toBeCloseTo(expectedSgp, 1);
    });

    it('calculates ERA SGP correctly (inverse)', () => {
      // ERA = 60*9/180 = 3.00
      const stats = makePitcherStats({ er: 60, ip: 180 });
      const result = calculateSgpValue(stats, true, settings);
      // ERA SGP = (4.50 - 3.00) / 0.15 * 1.0 = 10.0
      expect(result.categoryBreakdown['ERA']).toBeCloseTo(10.0, 2);
    });

    it('calculates WHIP SGP correctly (inverse)', () => {
      // WHIP = (150+50)/180 ≈ 1.111
      const stats = makePitcherStats({ hitsAllowed: 150, bbAllowed: 50, ip: 180 });
      const result = calculateSgpValue(stats, true, settings);
      // WHIP SGP = (1.30 - 1.111) / 0.015 * 1.0 ≈ 12.59
      const whip = (150 + 50) / 180;
      const expected = ((1.30 - whip) / 0.015) * 1.0;
      expect(result.categoryBreakdown['WHIP']).toBeCloseTo(expected, 1);
    });

    it('returns 0 SGP for rate stat when AB is 0', () => {
      const stats = makeHitterStats({ ab: 0, hits: 0 });
      const result = calculateSgpValue(stats, false, settings);
      expect(result.categoryBreakdown['AVG']).toBe(0);
      expect(result.categoryBreakdown['OPS']).toBe(0);
    });
  });

  describe('Total SGP', () => {
    it('sums all category SGPs for a hitter', () => {
      const stats = makeHitterStats();
      const result = calculateSgpValue(stats, false, settings);
      const summed = Object.values(result.categoryBreakdown).reduce((a, b) => a + b, 0);
      expect(result.totalSgp).toBeCloseTo(summed, 5);
    });

    it('sums all category SGPs for a pitcher', () => {
      const stats = makePitcherStats();
      const result = calculateSgpValue(stats, true, settings);
      const summed = Object.values(result.categoryBreakdown).reduce((a, b) => a + b, 0);
      expect(result.totalSgp).toBeCloseTo(summed, 5);
    });

    it('only includes hitting categories for hitters', () => {
      const stats = makeHitterStats();
      const result = calculateSgpValue(stats, false, settings);
      expect(result.categoryBreakdown['W']).toBeUndefined();
      expect(result.categoryBreakdown['ERA']).toBeUndefined();
    });

    it('only includes pitching categories for pitchers', () => {
      const stats = makePitcherStats();
      const result = calculateSgpValue(stats, true, settings);
      expect(result.categoryBreakdown['R']).toBeUndefined();
      expect(result.categoryBreakdown['HR']).toBeUndefined();
    });
  });
});
