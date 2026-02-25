import { createApp } from './app.js';

// Import and run migration on startup
import './db/migrate.js';

const app = createApp();
const PORT = process.env.PORT || 3001;

// Register routes (will be added in Phase 4)
import { registerRoutes } from './routes/index.js';
registerRoutes(app);

app.listen(PORT, () => {
  console.log(`Fantasy Trade Analyzer API running on http://localhost:${PORT}`);

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
