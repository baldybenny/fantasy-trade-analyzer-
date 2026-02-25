import { sqlite } from './database.js';
import * as schema from './schema.js';

/**
 * Simple push-based migration: create tables if they don't exist.
 * For a single-user analytical tool, this is simpler than versioned migrations.
 */
function migrate() {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS players (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      mlbam_id INTEGER,
      name TEXT NOT NULL,
      team TEXT NOT NULL DEFAULT '',
      positions TEXT NOT NULL DEFAULT '[]',
      bats TEXT,
      throws TEXT,
      birth_date TEXT,
      fantasy_team_id INTEGER REFERENCES teams(id),
      roster_status TEXT NOT NULL DEFAULT 'FA',
      contract_salary REAL,
      contract_years INTEGER,
      is_keeper INTEGER DEFAULT 0,
      current_stats TEXT,
      ros_projection TEXT,
      auction_value REAL,
      vorp REAL,
      sgp_value REAL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS teams (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      owner TEXT NOT NULL DEFAULT '',
      total_budget REAL NOT NULL DEFAULT 260,
      spent REAL NOT NULL DEFAULT 0,
      total_points REAL DEFAULT 0,
      rank INTEGER DEFAULT 0,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS league_settings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      key TEXT NOT NULL UNIQUE,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS projections (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      player_id INTEGER REFERENCES players(id),
      player_name TEXT NOT NULL,
      source TEXT NOT NULL,
      is_pitcher INTEGER NOT NULL DEFAULT 0,
      pa REAL DEFAULT 0,
      ab REAL DEFAULT 0,
      hits REAL DEFAULT 0,
      doubles REAL DEFAULT 0,
      triples REAL DEFAULT 0,
      hr REAL DEFAULT 0,
      runs REAL DEFAULT 0,
      rbi REAL DEFAULT 0,
      sb REAL DEFAULT 0,
      cs REAL DEFAULT 0,
      bb REAL DEFAULT 0,
      so REAL DEFAULT 0,
      ip REAL DEFAULT 0,
      wins REAL DEFAULT 0,
      losses REAL DEFAULT 0,
      saves REAL DEFAULT 0,
      qs REAL DEFAULT 0,
      er REAL DEFAULT 0,
      hits_allowed REAL DEFAULT 0,
      bb_allowed REAL DEFAULT 0,
      strikeouts REAL DEFAULT 0,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS category_standings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      team_id INTEGER NOT NULL REFERENCES teams(id),
      category TEXT NOT NULL,
      value REAL NOT NULL DEFAULT 0,
      rank INTEGER NOT NULL DEFAULT 0,
      points REAL NOT NULL DEFAULT 0,
      weighted_points REAL NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS trade_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      team_a_id INTEGER NOT NULL REFERENCES teams(id),
      team_b_id INTEGER NOT NULL REFERENCES teams(id),
      team_a_player_ids TEXT NOT NULL,
      team_b_player_ids TEXT NOT NULL,
      analysis TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS statcast_data (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      player_id INTEGER REFERENCES players(id),
      player_name TEXT NOT NULL,
      mlbam_id INTEGER,
      xba REAL,
      xslg REAL,
      xwoba REAL,
      exit_velo_avg REAL,
      barrel_pct REAL,
      hard_hit_pct REAL,
      sprint_speed REAL,
      k_pct REAL,
      bb_pct REAL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS news_sources (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'rss',
      url TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1,
      auth_type TEXT,
      auth_credential TEXT,
      scraper_key TEXT,
      search_query TEXT,
      fetch_interval_minutes INTEGER NOT NULL DEFAULT 60,
      last_fetched_at TEXT,
      last_fetch_error TEXT,
      article_count INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS news_articles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source_id INTEGER NOT NULL REFERENCES news_sources(id),
      title TEXT NOT NULL,
      url TEXT NOT NULL UNIQUE,
      author TEXT,
      excerpt TEXT,
      published_at TEXT,
      fetched_at TEXT NOT NULL,
      image_url TEXT,
      is_read INTEGER NOT NULL DEFAULT 0,
      is_bookmarked INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS article_players (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      article_id INTEGER NOT NULL REFERENCES news_articles(id) ON DELETE CASCADE,
      player_id INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_players_name ON players(name);
    CREATE INDEX IF NOT EXISTS idx_players_team ON players(fantasy_team_id);
    CREATE INDEX IF NOT EXISTS idx_projections_player ON projections(player_id);
    CREATE INDEX IF NOT EXISTS idx_projections_source ON projections(source);
    CREATE INDEX IF NOT EXISTS idx_standings_team ON category_standings(team_id);
    CREATE INDEX IF NOT EXISTS idx_news_articles_source ON news_articles(source_id);
    CREATE INDEX IF NOT EXISTS idx_news_articles_published ON news_articles(published_at);
    CREATE INDEX IF NOT EXISTS idx_news_articles_read ON news_articles(is_read);
    CREATE INDEX IF NOT EXISTS idx_article_players_article ON article_players(article_id);
    CREATE INDEX IF NOT EXISTS idx_article_players_player ON article_players(player_id);
  `);

  console.log('Database migration complete.');
}

migrate();
