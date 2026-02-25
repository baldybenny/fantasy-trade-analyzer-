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
});
