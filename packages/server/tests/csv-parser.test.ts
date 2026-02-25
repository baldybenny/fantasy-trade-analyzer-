import { describe, it, expect } from 'vitest';
import { detectFormat, parseNumber } from '../src/importers/csv-parser.js';
import { importFanGraphsBatting, importFanGraphsPitching } from '../src/importers/fangraphs-importer.js';
import { importSavant } from '../src/importers/savant-importer.js';
import { importFanTraxRoster } from '../src/importers/fantrax-importer.js';

describe('CSV Parser', () => {
  describe('detectFormat', () => {
    it('detects FanGraphs batting format', () => {
      const csv = 'Name,Team,PA,AB,H,2B,3B,HR,R,RBI,SB,CS,BB,SO\nMike Trout,LAA,600,520,160,30,3,35,100,90,10,3,80,140';
      expect(detectFormat(csv)).toBe('fangraphs-batting');
    });

    it('detects FanGraphs pitching format', () => {
      const csv = 'Name,Team,W,L,SV,IP,H,ER,SO,BB,ERA,WHIP,QS\nGerrit Cole,NYY,15,6,0,200,150,55,220,50,2.48,1.00,25';
      expect(detectFormat(csv)).toBe('fangraphs-pitching');
    });

    it('detects Savant format', () => {
      const csv = 'last_name,first_name,player_id,xba,xslg,xwoba,exit_velocity_avg,barrel_batted_rate\nTrout,Mike,545361,0.280,0.520,0.380,92.5,15.0';
      expect(detectFormat(csv)).toBe('savant');
    });

    it('detects Fantrax roster format', () => {
      const csv = 'Player,Status,Team,Pos,Salary,Owner\nMike Trout,Active,LAA,OF,$35,Team Alpha';
      expect(detectFormat(csv)).toBe('fantrax-roster');
    });

    it('returns unknown for unrecognized format', () => {
      const csv = 'foo,bar,baz\n1,2,3';
      expect(detectFormat(csv)).toBe('unknown');
    });
  });

  describe('parseNumber', () => {
    it('parses regular numbers', () => {
      expect(parseNumber('42')).toBe(42);
      expect(parseNumber('3.14')).toBeCloseTo(3.14);
    });

    it('strips dollar signs and commas', () => {
      expect(parseNumber('$25')).toBe(25);
      expect(parseNumber('1,000')).toBe(1000);
    });

    it('returns 0 for empty/missing values', () => {
      expect(parseNumber('')).toBe(0);
      expect(parseNumber(undefined)).toBe(0);
      expect(parseNumber('-')).toBe(0);
    });
  });

  describe('FanGraphs Batting Import', () => {
    const csv = [
      'Name,Team,PA,AB,H,2B,3B,HR,R,RBI,SB,CS,BB,SO',
      'Mike Trout,LAA,600,520,160,30,3,35,100,90,20,5,80,140',
      'Shohei Ohtani,LAD,580,500,150,28,2,40,95,100,10,3,70,150',
    ].join('\n');

    it('parses batting CSV correctly', () => {
      const result = importFanGraphsBatting(csv, 'steamer');
      expect(result.rowCount).toBe(2);
      expect(result.detectedFormat).toBe('fangraphs-batting');
    });

    it('maps column values correctly', () => {
      const result = importFanGraphsBatting(csv, 'steamer');
      const trout = result.data[0];
      expect(trout.playerName).toBe('Mike Trout');
      expect(trout.pa).toBe(600);
      expect(trout.hr).toBe(35);
      expect(trout.runs).toBe(100);
      expect(trout.sb).toBe(20);
      expect(trout.isPitcher).toBe(false);
      expect(trout.source).toBe('steamer');
    });
  });

  describe('FanGraphs Pitching Import', () => {
    const csv = [
      'Name,Team,W,L,SV,IP,H,ER,SO,BB,QS',
      'Gerrit Cole,NYY,15,6,0,200,150,55,220,50,25',
      'Max Scherzer,TEX,10,8,0,170,140,65,190,40,18',
    ].join('\n');

    it('parses pitching CSV correctly', () => {
      const result = importFanGraphsPitching(csv, 'zips');
      expect(result.rowCount).toBe(2);
    });

    it('maps pitching columns correctly', () => {
      const result = importFanGraphsPitching(csv, 'zips');
      const cole = result.data[0];
      expect(cole.playerName).toBe('Gerrit Cole');
      expect(cole.wins).toBe(15);
      expect(cole.ip).toBe(200);
      expect(cole.strikeouts).toBe(220);
      expect(cole.er).toBe(55);
      expect(cole.qs).toBe(25);
      expect(cole.isPitcher).toBe(true);
      expect(cole.source).toBe('zips');
    });
  });

  describe('Savant Import', () => {
    const csv = [
      'last_name,first_name,player_id,xba,xslg,xwoba,exit_velocity_avg,barrel_batted_rate,hard_hit_percent,sprint_speed',
      'Trout,Mike,545361,0.280,0.520,0.380,92.5,15.0,45.0,28.0',
    ].join('\n');

    it('parses Savant CSV correctly', () => {
      const result = importSavant(csv);
      expect(result.rowCount).toBe(1);
      expect(result.detectedFormat).toBe('savant');
    });

    it('maps Savant columns correctly', () => {
      const result = importSavant(csv);
      const trout = result.data[0];
      expect(trout.playerName).toBe('Mike Trout');
      expect(trout.mlbamId).toBe(545361);
      expect(trout.xba).toBeCloseTo(0.280);
      expect(trout.xwoba).toBeCloseTo(0.380);
      expect(trout.exitVeloAvg).toBeCloseTo(92.5);
    });
  });

  describe('Fantrax Roster Import', () => {
    const csv = [
      'Player,Status,Team,Pos,Salary,Owner',
      'Mike Trout,Active,LAA,OF/DH,$35,Team Alpha',
      'Gerrit Cole,Active,NYY,SP,$28,Team Beta',
    ].join('\n');

    it('parses Fantrax roster CSV correctly', () => {
      const result = importFanTraxRoster(csv);
      expect(result.rowCount).toBe(2);
      expect(result.detectedFormat).toBe('fantrax-roster');
    });

    it('maps roster columns correctly', () => {
      const result = importFanTraxRoster(csv);
      const trout = result.data[0];
      expect(trout.playerName).toBe('Mike Trout');
      expect(trout.salary).toBe(35);
      expect(trout.positions).toContain('OF');
      expect(trout.fantasyTeam).toBe('Team Alpha');
    });
  });
});
