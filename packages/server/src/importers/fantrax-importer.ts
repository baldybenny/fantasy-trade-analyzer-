import { parseCSV, parseNumber, type ColumnMapping, type ParseResult } from './csv-parser.js';
import { Position, RosterStatus } from '@fta/shared';
import { parseContractYears } from '../services/fantrax-api.js';

export interface FanTraxRosterRecord {
  playerName: string;
  status: string;
  team: string;
  positions: Position[];
  salary: number;
  contractYears: number;
  contractStatus: string;
  owner: string;
  fantasyTeam: string;
}

const FANTRAX_COLUMNS: ColumnMapping = {
  player: ['Player', 'Name', 'PlayerName'],
  status: ['Status'],
  team: ['Team', 'MLB Team'],
  position: ['Pos', 'Position', 'Eligible'],
  salary: ['Salary', 'Contract', 'Cost'],
  contract: ['Contract', 'Years', 'Contract Years'],
  owner: ['Owner', 'Fantasy Team', 'Roster'],
};

function parsePositions(posStr: string | undefined): Position[] {
  if (!posStr) return [];
  const parts = posStr.split(/[,/]/).map((p) => p.trim());
  const positions: Position[] = [];

  for (const part of parts) {
    const upper = part.toUpperCase();
    // Map common variations
    const mapped = upper === 'LF' || upper === 'CF' || upper === 'RF' ? 'OF' : upper;
    if (Object.values(Position).includes(mapped as Position)) {
      positions.push(mapped as Position);
    }
  }

  return [...new Set(positions)]; // deduplicate
}

function parseRosterStatus(status: string | undefined): RosterStatus {
  if (!status) return RosterStatus.FA;
  const upper = status.toUpperCase();
  if (upper.includes('IL') || upper.includes('DL')) return RosterStatus.IL;
  if (upper.includes('MINOR') || upper.includes('NA')) return RosterStatus.MINORS;
  if (upper.includes('ROSTER') || upper.includes('ACTIVE')) return RosterStatus.ROSTER;
  return RosterStatus.ROSTER; // Default to ROSTER if we have a status
}

export function importFanTraxRoster(csvContent: string): ParseResult<FanTraxRosterRecord> {
  const result = parseCSV(csvContent, FANTRAX_COLUMNS, (row) => {
    const name = row.player;
    if (!name) return null;

    const contractRaw = (row.contract ?? '').trim();
    return {
      playerName: name,
      status: row.status ?? '',
      team: row.team ?? '',
      positions: parsePositions(row.position),
      salary: parseNumber(row.salary),
      contractYears: parseContractYears(contractRaw),
      contractStatus: contractRaw,
      owner: row.owner ?? '',
      fantasyTeam: row.owner ?? '',
    };
  });

  return { ...result, detectedFormat: 'fantrax-roster' };
}
