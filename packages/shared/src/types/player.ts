import { z } from 'zod';

export enum Position {
  C = 'C',
  '1B' = '1B',
  '2B' = '2B',
  '3B' = '3B',
  SS = 'SS',
  OF = 'OF',
  DH = 'DH',
  SP = 'SP',
  RP = 'RP',
  UTIL = 'UTIL',
}

export enum RosterStatus {
  FA = 'FA',
  ROSTER = 'ROSTER',
  IL = 'IL',
  MINORS = 'MINORS',
}

export interface Contract {
  salary: number;
  yearsRemaining: number;
  contractStatus: string; // "1st", "2nd", "3rd", or a year like "2026", "2027"
  isKeeper: boolean;
  extensionYear: number;
  guaranteed: boolean;
  droppable: boolean;
}

export interface PlayerStats {
  // Hitting
  games: number;
  pa: number;
  ab: number;
  runs: number;
  hits: number;
  doubles: number;
  triples: number;
  hr: number;
  rbi: number;
  sb: number;
  cs: number;
  bb: number;
  so: number;

  // Pitching
  ip: number;
  wins: number;
  losses: number;
  saves: number;
  holds: number;
  qs: number;
  er: number;
  hitsAllowed: number;
  bbAllowed: number;
  strikeouts: number;

  // Advanced hitting
  wrcPlus?: number;
  woba?: number;
  xwoba?: number;
  barrelPct?: number;
  hardHitPct?: number;
  exitVelo?: number;
  launchAngle?: number;
  sprintSpeed?: number;

  // Advanced pitching
  fip?: number;
  xfip?: number;
  siera?: number;
  kPct?: number;
  bbPct?: number;
  hr9?: number;
}

/** Computed rate stats from counting stats */
export function computeAvg(stats: PlayerStats): number | null {
  return stats.ab > 0 ? stats.hits / stats.ab : null;
}

export function computeObp(stats: PlayerStats): number | null {
  const denom = stats.ab + stats.bb;
  return denom > 0 ? (stats.hits + stats.bb) / denom : null;
}

export function computeSlg(stats: PlayerStats): number | null {
  if (stats.ab === 0) return null;
  const singles = stats.hits - stats.doubles - stats.triples - stats.hr;
  const tb = singles + stats.doubles * 2 + stats.triples * 3 + stats.hr * 4;
  return tb / stats.ab;
}

export function computeOps(stats: PlayerStats): number | null {
  const obp = computeObp(stats);
  const slg = computeSlg(stats);
  return obp !== null && slg !== null ? obp + slg : null;
}

export function computeEra(stats: PlayerStats): number | null {
  return stats.ip > 0 ? (stats.er * 9) / stats.ip : null;
}

export function computeWhip(stats: PlayerStats): number | null {
  return stats.ip > 0 ? (stats.hitsAllowed + stats.bbAllowed) / stats.ip : null;
}

export interface Player {
  id: number;
  mlbamId?: number;
  name: string;
  team: string;
  positions: Position[];
  bats?: string;
  throws?: string;
  birthDate?: string;

  // Fantasy
  fantasyTeamId?: number;
  contract?: Contract;
  rosterStatus: RosterStatus;

  // Stats
  currentSeason?: PlayerStats;
  rosProjection?: PlayerStats;

  // Values
  auctionValue?: number;
  inflatedValue?: number;
  vorp?: number;
  sgpValue?: number;
  categoryValues?: Record<string, number>;
}

export function getPlayerSurplusValue(player: Player): number | null {
  if (player.auctionValue === undefined || !player.contract) return null;
  return player.auctionValue - player.contract.salary;
}

export function isHitter(player: Player): boolean {
  return player.positions.some(
    (p) => p !== Position.SP && p !== Position.RP,
  );
}

export function isPitcher(player: Player): boolean {
  return player.positions.some(
    (p) => p === Position.SP || p === Position.RP,
  );
}

export function primaryPosition(player: Player): Position {
  const priorityOrder: Position[] = [
    Position.C,
    Position.SS,
    Position['2B'],
    Position['3B'],
    Position['1B'],
    Position.OF,
    Position.SP,
    Position.RP,
    Position.DH,
    Position.UTIL,
  ];
  for (const pos of priorityOrder) {
    if (player.positions.includes(pos)) return pos;
  }
  return player.positions[0] ?? Position.UTIL;
}

// Zod schema for validation
export const PlayerStatsSchema = z.object({
  games: z.number().default(0),
  pa: z.number().default(0),
  ab: z.number().default(0),
  runs: z.number().default(0),
  hits: z.number().default(0),
  doubles: z.number().default(0),
  triples: z.number().default(0),
  hr: z.number().default(0),
  rbi: z.number().default(0),
  sb: z.number().default(0),
  cs: z.number().default(0),
  bb: z.number().default(0),
  so: z.number().default(0),
  ip: z.number().default(0),
  wins: z.number().default(0),
  losses: z.number().default(0),
  saves: z.number().default(0),
  holds: z.number().default(0),
  qs: z.number().default(0),
  er: z.number().default(0),
  hitsAllowed: z.number().default(0),
  bbAllowed: z.number().default(0),
  strikeouts: z.number().default(0),
  wrcPlus: z.number().optional(),
  woba: z.number().optional(),
  xwoba: z.number().optional(),
  barrelPct: z.number().optional(),
  hardHitPct: z.number().optional(),
  exitVelo: z.number().optional(),
  launchAngle: z.number().optional(),
  sprintSpeed: z.number().optional(),
  fip: z.number().optional(),
  xfip: z.number().optional(),
  siera: z.number().optional(),
  kPct: z.number().optional(),
  bbPct: z.number().optional(),
  hr9: z.number().optional(),
});

export const ContractSchema = z.object({
  salary: z.number(),
  yearsRemaining: z.number(),
  contractStatus: z.string().default(''),
  isKeeper: z.boolean(),
  extensionYear: z.number().default(0),
  guaranteed: z.boolean().default(true),
  droppable: z.boolean().default(true),
});
