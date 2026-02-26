import { createApp, serveClient } from './app.js';
import { bootstrap } from './services/bootstrap.js';

// Import and run migration on startup
import './db/migrate.js';

const app = createApp();
const PORT = process.env.PORT || 3001;

// Register routes (will be added in Phase 4)
import { registerRoutes } from './routes/index.js';
registerRoutes(app);

// Static client serving must come after API routes
serveClient(app);

app.listen(PORT, () => {
  console.log(`Fantasy Trade Analyzer API running on http://localhost:${PORT}`);

  // Auto-bootstrap: delay 10s so server can handle health checks and traffic first
  setTimeout(() => {
    bootstrap(PORT).catch((err) => {
      console.error('[Bootstrap] Fatal error:', err instanceof Error ? err.message : err);
    });
  }, 10_000);

  // Background news polling every 15 minutes
  const POLL_INTERVAL_MS = 15 * 60 * 1000;
  setInterval(async () => {
    try {
      const { fetchStaleSources } = await import('./services/news/aggregator.js');
      const result = await fetchStaleSources();
      if (result.fetchedCount > 0) {
        console.log(`[News] Polled ${result.fetchedCount} stale sources, added ${result.totalAdded} articles`);
      }
    } catch (err) {
      console.error('[News] Background poll error:', err instanceof Error ? err.message : err);
    }
  }, POLL_INTERVAL_MS);
});
