export type ProjectionSource = 'steamer' | 'zips' | 'atc' | 'manual';

export interface ProjectionRecord {
  id?: number;
  playerId: number;
  playerName: string;
  source: ProjectionSource;
  isPitcher: boolean;

  // Hitting
  pa: number;
  ab: number;
  hits: number;
  doubles: number;
  triples: number;
  hr: number;
  runs: number;
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
  qs: number;
  er: number;
  hitsAllowed: number;
  bbAllowed: number;
  strikeouts: number;
}

export interface CompositeProjection extends ProjectionRecord {
  sourceWeights: Record<ProjectionSource, number>;
  sources: ProjectionSource[];
}

export const DEFAULT_PROJECTION_WEIGHTS: Record<ProjectionSource, number> = {
  steamer: 0.40,
  zips: 0.35,
  atc: 0.25,
  manual: 0,
};
