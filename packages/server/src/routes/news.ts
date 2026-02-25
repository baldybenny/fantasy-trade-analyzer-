import { Router } from 'express';
import { eq, desc, sql, and, like } from 'drizzle-orm';
import { db } from '../db/database.js';
import * as schema from '../db/schema.js';
import { CreateNewsSourceSchema, UpdateNewsSourceSchema } from '@fta/shared';
import { DEFAULT_NEWS_SOURCES } from '../services/news/default-sources.js';
import { fetchSource, fetchAllSources, fetchStaleSources } from '../services/news/aggregator.js';

const router = Router();

// ─── Sources ────────────────────────────────────────

router.get('/sources', (_req, res) => {
  const sources = db.select().from(schema.newsSources).orderBy(schema.newsSources.name).all();
  res.json(sources);
});

router.post('/sources', (req, res) => {
  const parsed = CreateNewsSourceSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten().fieldErrors });
    return;
  }

  const result = db.insert(schema.newsSources).values({
    name: parsed.data.name,
    type: parsed.data.type,
    url: parsed.data.url,
    enabled: parsed.data.enabled,
    authType: parsed.data.authType || null,
    authCredential: parsed.data.authCredential || null,
    scraperKey: parsed.data.scraperKey || null,
    searchQuery: parsed.data.searchQuery || null,
    fetchIntervalMinutes: parsed.data.fetchIntervalMinutes,
    createdAt: new Date().toISOString(),
  }).run();

  const source = db.select().from(schema.newsSources).where(eq(schema.newsSources.id, Number(result.lastInsertRowid))).get();
  res.status(201).json(source);
});

router.put('/sources/:id', (req, res) => {
  const id = Number(req.params.id);
  const parsed = UpdateNewsSourceSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten().fieldErrors });
    return;
  }

  const existing = db.select().from(schema.newsSources).where(eq(schema.newsSources.id, id)).get();
  if (!existing) {
    res.status(404).json({ error: 'Source not found' });
    return;
  }

  const updates: Record<string, unknown> = {};
  if (parsed.data.name !== undefined) updates.name = parsed.data.name;
  if (parsed.data.type !== undefined) updates.type = parsed.data.type;
  if (parsed.data.url !== undefined) updates.url = parsed.data.url;
  if (parsed.data.enabled !== undefined) updates.enabled = parsed.data.enabled;
  if (parsed.data.authType !== undefined) updates.authType = parsed.data.authType;
  if (parsed.data.authCredential !== undefined) updates.authCredential = parsed.data.authCredential;
  if (parsed.data.scraperKey !== undefined) updates.scraperKey = parsed.data.scraperKey;
  if (parsed.data.searchQuery !== undefined) updates.searchQuery = parsed.data.searchQuery;
  if (parsed.data.fetchIntervalMinutes !== undefined) updates.fetchIntervalMinutes = parsed.data.fetchIntervalMinutes;

  db.update(schema.newsSources).set(updates).where(eq(schema.newsSources.id, id)).run();

  const updated = db.select().from(schema.newsSources).where(eq(schema.newsSources.id, id)).get();
  res.json(updated);
});

router.delete('/sources/:id', (req, res) => {
  const id = Number(req.params.id);
  // Delete articles first (cascade should handle, but be explicit)
  const articles = db.select({ id: schema.newsArticles.id }).from(schema.newsArticles).where(eq(schema.newsArticles.sourceId, id)).all();
  for (const article of articles) {
    db.delete(schema.articlePlayers).where(eq(schema.articlePlayers.articleId, article.id)).run();
  }
  db.delete(schema.newsArticles).where(eq(schema.newsArticles.sourceId, id)).run();
  db.delete(schema.newsSources).where(eq(schema.newsSources.id, id)).run();
  res.json({ ok: true });
});

router.post('/sources/seed-defaults', (_req, res) => {
  let added = 0;
  for (const source of DEFAULT_NEWS_SOURCES) {
    const existing = db.select().from(schema.newsSources).where(eq(schema.newsSources.url, source.url)).get();
    if (!existing) {
      db.insert(schema.newsSources).values({
        name: source.name,
        type: source.type,
        url: source.url,
        searchQuery: source.searchQuery || null,
        fetchIntervalMinutes: source.fetchIntervalMinutes,
        createdAt: new Date().toISOString(),
      }).run();
      added++;
    }
  }
  const sources = db.select().from(schema.newsSources).orderBy(schema.newsSources.name).all();
  res.json({ added, sources });
});

// ─── Fetch ──────────────────────────────────────────

router.post('/fetch', async (_req, res) => {
  try {
    const result = await fetchAllSources();
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Fetch failed' });
  }
});

router.post('/fetch/:sourceId', async (req, res) => {
  const id = Number(req.params.sourceId);
  const source = db.select().from(schema.newsSources).where(eq(schema.newsSources.id, id)).get();
  if (!source) {
    res.status(404).json({ error: 'Source not found' });
    return;
  }
  try {
    const result = await fetchSource(source);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Fetch failed' });
  }
});

router.post('/fetch-stale', async (_req, res) => {
  try {
    const result = await fetchStaleSources();
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Fetch failed' });
  }
});

// ─── Articles ───────────────────────────────────────

router.get('/articles', (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 25));
  const offset = (page - 1) * limit;
  const sourceId = req.query.sourceId ? Number(req.query.sourceId) : undefined;
  const playerId = req.query.playerId ? Number(req.query.playerId) : undefined;
  const search = req.query.search ? String(req.query.search) : undefined;
  const unreadOnly = req.query.unreadOnly === 'true';
  const bookmarkedOnly = req.query.bookmarkedOnly === 'true';

  const conditions: ReturnType<typeof eq>[] = [];
  if (sourceId) conditions.push(eq(schema.newsArticles.sourceId, sourceId));
  if (unreadOnly) conditions.push(eq(schema.newsArticles.isRead, false));
  if (bookmarkedOnly) conditions.push(eq(schema.newsArticles.isBookmarked, true));
  if (search) conditions.push(like(schema.newsArticles.title, `%${search}%`));

  // If playerId filter, get article IDs from junction table first
  if (playerId) {
    const links = db.select({ articleId: schema.articlePlayers.articleId })
      .from(schema.articlePlayers)
      .where(eq(schema.articlePlayers.playerId, playerId))
      .all();

    if (links.length === 0) {
      res.json({ articles: [], total: 0, page, limit });
      return;
    }

    const ids = links.map((l) => l.articleId);
    conditions.push(sql`${schema.newsArticles.id} IN (${sql.join(ids.map(id => sql`${id}`), sql`,`)})`);
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  // Count
  const countResult = db.select({ count: sql<number>`COUNT(*)` })
    .from(schema.newsArticles)
    .where(whereClause)
    .get();
  const total = countResult?.count ?? 0;

  // Fetch page
  const rows = db.select({
    article: schema.newsArticles,
    sourceName: schema.newsSources.name,
  })
    .from(schema.newsArticles)
    .innerJoin(schema.newsSources, eq(schema.newsArticles.sourceId, schema.newsSources.id))
    .where(whereClause)
    .orderBy(desc(schema.newsArticles.publishedAt))
    .limit(limit)
    .offset(offset)
    .all();

  const articles = attachPlayers(rows.map((r) => ({
    ...r.article,
    sourceName: r.sourceName,
  })));

  res.json({ articles, total, page, limit });
});

function attachPlayers(articles: Array<Record<string, unknown>>): unknown[] {
  return articles.map((article) => {
    const articleId = article.id as number;
    const playerLinks = db.select({
      playerId: schema.articlePlayers.playerId,
      playerName: schema.players.name,
    })
      .from(schema.articlePlayers)
      .innerJoin(schema.players, eq(schema.articlePlayers.playerId, schema.players.id))
      .where(eq(schema.articlePlayers.articleId, articleId))
      .all();

    return {
      ...article,
      taggedPlayers: playerLinks.map((p) => ({ id: p.playerId, name: p.playerName })),
    };
  });
}

router.patch('/articles/:id/read', (req, res) => {
  const id = Number(req.params.id);
  db.update(schema.newsArticles)
    .set({ isRead: true })
    .where(eq(schema.newsArticles.id, id))
    .run();
  res.json({ ok: true });
});

router.patch('/articles/:id/bookmark', (req, res) => {
  const id = Number(req.params.id);
  const article = db.select({ isBookmarked: schema.newsArticles.isBookmarked })
    .from(schema.newsArticles)
    .where(eq(schema.newsArticles.id, id))
    .get();

  if (!article) {
    res.status(404).json({ error: 'Article not found' });
    return;
  }

  db.update(schema.newsArticles)
    .set({ isBookmarked: !article.isBookmarked })
    .where(eq(schema.newsArticles.id, id))
    .run();
  res.json({ ok: true, isBookmarked: !article.isBookmarked });
});

router.post('/articles/mark-all-read', (_req, res) => {
  db.update(schema.newsArticles)
    .set({ isRead: true })
    .where(eq(schema.newsArticles.isRead, false))
    .run();
  res.json({ ok: true });
});

router.get('/articles/player/:playerId', (req, res) => {
  const playerId = Number(req.params.playerId);
  const links = db.select({ articleId: schema.articlePlayers.articleId })
    .from(schema.articlePlayers)
    .where(eq(schema.articlePlayers.playerId, playerId))
    .all();

  if (links.length === 0) {
    res.json([]);
    return;
  }

  const ids = links.map((l) => l.articleId);
  const articles = db.select({
    article: schema.newsArticles,
    sourceName: schema.newsSources.name,
  })
    .from(schema.newsArticles)
    .innerJoin(schema.newsSources, eq(schema.newsArticles.sourceId, schema.newsSources.id))
    .where(sql`${schema.newsArticles.id} IN (${sql.join(ids.map(id => sql`${id}`), sql`,`)})`)
    .orderBy(desc(schema.newsArticles.publishedAt))
    .all();

  const result = articles.map((r) => ({ ...r.article, sourceName: r.sourceName }));
  res.json(result);
});

// ─── Stats ──────────────────────────────────────────

router.get('/stats', (_req, res) => {
  const unreadResult = db.select({ count: sql<number>`COUNT(*)` })
    .from(schema.newsArticles)
    .where(eq(schema.newsArticles.isRead, false))
    .get();

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayResult = db.select({ count: sql<number>`COUNT(*)` })
    .from(schema.newsArticles)
    .where(sql`${schema.newsArticles.fetchedAt} >= ${todayStart.toISOString()}`)
    .get();

  res.json({
    unreadCount: unreadResult?.count ?? 0,
    totalToday: todayResult?.count ?? 0,
  });
});

export const newsRoutes = router;
