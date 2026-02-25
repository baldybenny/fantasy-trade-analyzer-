export type ProjectionSource =
  | 'steamer'
  | 'zips'
  | 'atc'
  | 'thebat'
  | 'thebatx'
  | 'fangraphsdc'
  | 'fantasypros'
  | 'rotochamp'
  | 'manual';

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
  steamer: 0.18,
  zips: 0.18,
  thebatx: 0.16,
  thebat: 0.14,
  fangraphsdc: 0.12,
  atc: 0.10,
  fantasypros: 0.07,
  rotochamp: 0.05,
  manual: 0,
};
