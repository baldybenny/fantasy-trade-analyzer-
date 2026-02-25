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
  C: 1,
  '1B': 1,
  '2B': 1,
  '3B': 1,
  SS: 1,
  OF: 5,
  UTIL: 1,
  SP: 7,
  RP: 5,
  Bench: 2,
};

export const DEFAULT_REPLACEMENT_LEVEL: Record<string, number> = {
  C: 12,
  '1B': 24,
  '2B': 18,
  '3B': 18,
  SS: 18,
  OF: 60,
  SP: 84,
  RP: 36,
};

export const DEFAULT_SGP_MULTIPLIERS: Record<string, number> = {
  R: 25,
  HR: 8,
  RBI: 25,
  SB: 10,
  AVG: 0.003,
  OPS: 0.008,
  W: 3,
  QS: 5,
  SV: 8,
  K: 30,
  ERA: 0.15,
  WHIP: 0.015,
};
