import { Position } from '../types/player.js';

export const HITTING_POSITIONS: Position[] = [
  Position.C,
  Position['1B'],
  Position['2B'],
  Position['3B'],
  Position.SS,
  Position.OF,
  Position.DH,
  Position.UTIL,
];

export const PITCHING_POSITIONS: Position[] = [Position.SP, Position.RP];

export const DEFAULT_POSITION_SLOTS: Record<string, number> = {
  C: 2,
  '1B': 1,
  '2B': 1,
  '3B': 1,
  SS: 1,
  CI: 1,
  MI: 1,
  OF: 5,
  UTIL: 1,
  P: 9,
};

export const DEFAULT_REPLACEMENT_LEVEL: Record<string, number> = {
  C: 24,
  '1B': 18,
  '2B': 18,
  '3B': 18,
  SS: 18,
  OF: 60,
  DH: 120,
  UTIL: 120,
  SP: 72,
  RP: 36,
};

export const DEFAULT_SGP_MULTIPLIERS: Record<string, number> = {
  R: 19.2,
  HR: 9,
  RBI: 20.6,
  SB: 8,
  AVG: 0.0017,
  OPS: 0.006,
  W: 2.5,
  QS: 2.9,
  SV: 4.4,
  K: 22.1,
  ERA: 0.08,
  WHIP: 0.0155,
};
