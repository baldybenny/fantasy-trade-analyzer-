export interface InflationResult {
  inflationRate: number;
  inflationPercentage: number;
  totalKeeperSalary: number;
  totalKeeperValue: number;
  remainingBudget: number;
  remainingValue: number;
  numKeepers: number;
  avgKeeperDiscount: number;
}

export interface YearProjection {
  year: number;
  projectedSalary: number;
  projectedValue: number;
  surplusValue: number;
  keepRecommendation: boolean;
}

export interface KeeperCandidate {
  playerId: number;
  playerName: string;
  position: string;
  salary: number;
  auctionValue: number;
  vorp: number;
  inflatedValue: number;
  surplusValue: number;
  inflatedSurplus: number;
  yearsRemaining: number;
  contractStatus: string;
  keepRecommendation: boolean;
  multiYearProjection: YearProjection[];
}

export interface PositionalScarcity {
  position: string;
  avgValue: number;
  medianValue: number;
  topPlayerValue: number;
  replacementValue: number;
  scarcityMultiplier: number;
  playerCount: number;
  tier: 'scarce' | 'normal' | 'deep';
}
