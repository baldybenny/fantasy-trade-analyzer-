import { sqliteTable, text, integer, real, blob } from 'drizzle-orm/sqlite-core';

export const players = sqliteTable('players', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  mlbamId: integer('mlbam_id'),
  name: text('name').notNull(),
  team: text('team').notNull().default(''),
  positions: text('positions').notNull().default('[]'), // JSON array of Position strings
  bats: text('bats'),
  throws: text('throws'),
  birthDate: text('birth_date'),

  // Fantasy
  fantasyTeamId: integer('fantasy_team_id').references(() => teams.id),
  rosterStatus: text('roster_status').notNull().default('FA'),
  contractSalary: real('contract_salary'),
  contractYears: integer('contract_years'),
  isKeeper: integer('is_keeper', { mode: 'boolean' }).default(false),

  // Current season stats (JSON)
  currentStats: text('current_stats'), // JSON PlayerStats
  rosProjection: text('ros_projection'), // JSON PlayerStats

  // Computed values
  auctionValue: real('auction_value'),
  vorp: real('vorp'),
  sgpValue: real('sgp_value'),

  createdAt: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
  updatedAt: text('updated_at').notNull().$defaultFn(() => new Date().toISOString()),
});

export const teams = sqliteTable('teams', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  owner: text('owner').notNull().default(''),
  totalBudget: real('total_budget').notNull().default(260),
  spent: real('spent').notNull().default(0),
  totalPoints: real('total_points').default(0),
  rank: integer('rank').default(0),
  createdAt: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
});

export const leagueSettings = sqliteTable('league_settings', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  key: text('key').notNull().unique(),
  value: text('value').notNull(), // JSON-encoded
});

export const projections = sqliteTable('projections', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  playerId: integer('player_id').references(() => players.id),
  playerName: text('player_name').notNull(),
  source: text('source').notNull(), // steamer, zips, atc, manual
  isPitcher: integer('is_pitcher', { mode: 'boolean' }).notNull().default(false),

  // Hitting
  pa: real('pa').default(0),
  ab: real('ab').default(0),
  hits: real('hits').default(0),
  doubles: real('doubles').default(0),
  triples: real('triples').default(0),
  hr: real('hr').default(0),
  runs: real('runs').default(0),
  rbi: real('rbi').default(0),
  sb: real('sb').default(0),
  cs: real('cs').default(0),
  bb: real('bb').default(0),
  so: real('so').default(0),

  // Pitching
  ip: real('ip').default(0),
  wins: real('wins').default(0),
  losses: real('losses').default(0),
  saves: real('saves').default(0),
  qs: real('qs').default(0),
  er: real('er').default(0),
  hitsAllowed: real('hits_allowed').default(0),
  bbAllowed: real('bb_allowed').default(0),
  strikeouts: real('strikeouts').default(0),

  createdAt: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
});

export const categoryStandings = sqliteTable('category_standings', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  teamId: integer('team_id').notNull().references(() => teams.id),
  category: text('category').notNull(),
  value: real('value').notNull().default(0),
  rank: integer('rank').notNull().default(0),
  points: real('points').notNull().default(0),
  weightedPoints: real('weighted_points').notNull().default(0),
});

export const tradeHistory = sqliteTable('trade_history', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  teamAId: integer('team_a_id').notNull().references(() => teams.id),
  teamBId: integer('team_b_id').notNull().references(() => teams.id),
  teamAPlayerIds: text('team_a_player_ids').notNull(), // JSON array
  teamBPlayerIds: text('team_b_player_ids').notNull(), // JSON array
  analysis: text('analysis').notNull(), // Full TradeAnalysis JSON
  createdAt: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
});

export const statcastData = sqliteTable('statcast_data', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  playerId: integer('player_id').references(() => players.id),
  playerName: text('player_name').notNull(),
  mlbamId: integer('mlbam_id'),
  xba: real('xba'),
  xslg: real('xslg'),
  xwoba: real('xwoba'),
  exitVeloAvg: real('exit_velo_avg'),
  barrelPct: real('barrel_pct'),
  hardHitPct: real('hard_hit_pct'),
  sprintSpeed: real('sprint_speed'),
  kPct: real('k_pct'),
  bbPct: real('bb_pct'),
  createdAt: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
});
