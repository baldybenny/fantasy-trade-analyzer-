import type { Express } from 'express';
import { leagueRoutes } from './league.js';
import { teamRoutes } from './teams.js';
import { playerRoutes } from './players.js';
import { importRoutes } from './import.js';
import { standingsRoutes } from './standings.js';
import { tradeRoutes } from './trade.js';
import { valuesRoutes } from './values.js';
import { fantraxRoutes } from './fantrax.js';
import { keeperRoutes } from './keepers.js';

export function registerRoutes(app: Express) {
  app.use('/api/league', leagueRoutes);
  app.use('/api/teams', teamRoutes);
  app.use('/api/players', playerRoutes);
  app.use('/api/projections', importRoutes);
  app.use('/api/rosters', importRoutes);
  app.use('/api/standings', standingsRoutes);
  app.use('/api/trade', tradeRoutes);
  app.use('/api/values', valuesRoutes);
  app.use('/api/fantrax', fantraxRoutes);
  app.use('/api/keepers', keeperRoutes);
}
