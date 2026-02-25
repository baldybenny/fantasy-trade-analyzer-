import type { Player } from './player.js';
import type { FantasyTeam, CategoryStanding } from './team.js';

export interface CategoryImpact {
  category: string;
  before: number;
  after: number;
  change: number;
  rankBefore: number;
  rankAfter: number;
  rankChange: number;
}

export interface TradeSide {
  teamId: number;
  teamName: string;
  playersOut: Player[];
  playersIn: Player[];
  salaryOut: number;
  salaryIn: number;
  valueOut: number;
  valueIn: number;
  categoryImpacts: CategoryImpact[];
}

export interface RosterFitResult {
  score: number; // 0-100
  positionsFilled: string[];
  positionsLost: string[];
  multiEligibilityBonus: number;
  unfilledSlots: string[];
  notes: string[];
}

export interface TradeProposal {
  teamAId: number;
  teamBId: number;
  teamAGives: number[]; // player IDs
  teamBGives: number[]; // player IDs
}

export interface TradeAnalysis {
  id?: number;
  createdAt?: string;
  sideA: TradeSide;
  sideB: TradeSide;
  valueDifference: number; // positive = side A wins
  fairnessScore: number; // 0-100, 50 = perfectly fair
  categorySummary: Record<string, { teamA: CategoryImpact; teamB: CategoryImpact }>;
  rosterFitA: RosterFitResult;
  rosterFitB: RosterFitResult;
  warnings: string[];
  recommendation: string;
}
