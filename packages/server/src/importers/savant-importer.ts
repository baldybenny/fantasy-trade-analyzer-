import { parseCSV, parseNumber, type ColumnMapping, type ParseResult } from './csv-parser.js';

export interface StatcastRecord {
  playerName: string;
  mlbamId: number;
  xba: number | null;
  xslg: number | null;
  xwoba: number | null;
  exitVeloAvg: number | null;
  barrelPct: number | null;
  hardHitPct: number | null;
  sprintSpeed: number | null;
  kPct: number | null;
  bbPct: number | null;
}

const SAVANT_COLUMNS: ColumnMapping = {
  lastName: ['last_name'],
  firstName: ['first_name'],
  playerId: ['player_id'],
  xba: ['xba', 'est_ba'],
  xslg: ['xslg', 'est_slg'],
  xwoba: ['xwoba', 'est_woba'],
  exitVelo: ['exit_velocity_avg', 'exit_velo_avg'],
  barrelPct: ['barrel_batted_rate', 'barrel_pct'],
  hardHitPct: ['hard_hit_percent', 'hard_hit_pct'],
  sprintSpeed: ['sprint_speed'],
  kPct: ['k_percent', 'k_pct'],
  bbPct: ['bb_percent', 'bb_pct'],
};

function parseNullableNumber(val: string | undefined): number | null {
  if (!val || val === '' || val === '-' || val === 'null') return null;
  const num = parseFloat(val);
  return isNaN(num) ? null : num;
}

export function importSavant(csvContent: string): ParseResult<StatcastRecord> {
  const result = parseCSV(csvContent, SAVANT_COLUMNS, (row) => {
    const firstName = row.firstName ?? '';
    const lastName = row.lastName ?? '';
    const name = `${firstName} ${lastName}`.trim();
    if (!name) return null;

    return {
      playerName: name,
      mlbamId: parseNumber(row.playerId),
      xba: parseNullableNumber(row.xba),
      xslg: parseNullableNumber(row.xslg),
      xwoba: parseNullableNumber(row.xwoba),
      exitVeloAvg: parseNullableNumber(row.exitVelo),
      barrelPct: parseNullableNumber(row.barrelPct),
      hardHitPct: parseNullableNumber(row.hardHitPct),
      sprintSpeed: parseNullableNumber(row.sprintSpeed),
      kPct: parseNullableNumber(row.kPct),
      bbPct: parseNullableNumber(row.bbPct),
    };
  });

  return { ...result, detectedFormat: 'savant' };
}
