import { eq, sql } from 'drizzle-orm';
import type { FetchedArticle } from '@fta/shared';
import { db } from '../../db/database.js';
import * as schema from '../../db/schema.js';
import { fetchRssFeed } from './rss-fetcher.js';
import { fetchAuthenticated } from './authenticated-scraper.js';
import { tagPlayersInText } from './player-tagger.js';

type SourceRow = typeof schema.newsSources.$inferSelect;

async function fetchArticlesForSource(source: SourceRow): Promise<FetchedArticle[]> {
  switch (source.type) {
    case 'rss':
    case 'substack':
      return fetchRssFeed(source.url);

    case 'google-news': {
      const query = source.searchQuery || '';
      const url = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-US&gl=US&ceid=US:en`;
      return fetchRssFeed(url);
    }

    case 'authenticated':
      if (!source.authType || !source.authCredential || !source.scraperKey) {
        throw new Error(`Authenticated source "${source.name}" is missing auth configuration`);
      }
      return fetchAuthenticated(source.url, source.authType, source.authCredential, source.scraperKey);

    default:
      throw new Error(`Unknown source type: ${source.type}`);
  }
}

export async function fetchSource(source: SourceRow): Promise<{ added: number; errors: string[] }> {
  const errors: string[] = [];
  let added = 0;

  try {
    const articles = await fetchArticlesForSource(source);

    for (const article of articles) {
      try {
        // Check for duplicate by URL
        const existing = db
          .select({ id: schema.newsArticles.id })
          .from(schema.newsArticles)
          .where(eq(schema.newsArticles.url, article.url))
          .get();

        if (existing) continue;

        // Insert article
        const result = db
          .insert(schema.newsArticles)
          .values({
            sourceId: source.id,
            title: article.title,
            url: article.url,
            author: article.author || null,
            excerpt: article.excerpt || null,
            publishedAt: article.publishedAt || null,
            fetchedAt: new Date().toISOString(),
            imageUrl: article.imageUrl || null,
          })
          .run();

        const articleId = Number(result.lastInsertRowid);
        added++;

        // Tag players
        const textToSearch = `${article.title} ${article.excerpt || ''}`;
        const playerIds = tagPlayersInText(textToSearch);

        for (const playerId of playerIds) {
          db.insert(schema.articlePlayers)
            .values({ articleId, playerId })
            .run();
        }
      } catch (err) {
        // Unique constraint violation means duplicate — skip silently
        const msg = err instanceof Error ? err.message : String(err);
        if (!msg.includes('UNIQUE constraint')) {
          errors.push(`Article "${article.title}": ${msg}`);
        }
      }
    }

    // Update source metadata
    db.update(schema.newsSources)
      .set({
        lastFetchedAt: new Date().toISOString(),
        lastFetchError: errors.length > 0 ? errors.join('; ') : null,
        articleCount: sql`(SELECT COUNT(*) FROM news_articles WHERE source_id = ${source.id})`,
      })
      .where(eq(schema.newsSources.id, source.id))
      .run();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    db.update(schema.newsSources)
      .set({
        lastFetchedAt: new Date().toISOString(),
        lastFetchError: msg,
      })
      .where(eq(schema.newsSources.id, source.id))
      .run();
    errors.push(msg);
  }

  return { added, errors };
}

export async function fetchAllSources(): Promise<{ totalAdded: number; sourceResults: Record<string, { added: number; errors: string[] }> }> {
  const sources = db
    .select()
    .from(schema.newsSources)
    .where(eq(schema.newsSources.enabled, true))
    .all();

  let totalAdded = 0;
  const sourceResults: Record<string, { added: number; errors: string[] }> = {};

  for (const source of sources) {
    const result = await fetchSource(source);
    totalAdded += result.added;
    sourceResults[source.name] = result;
  }

  return { totalAdded, sourceResults };
}

export async function fetchStaleSources(): Promise<{ totalAdded: number; fetchedCount: number }> {
  const sources = db
    .select()
    .from(schema.newsSources)
    .where(eq(schema.newsSources.enabled, true))
    .all();

  const now = Date.now();
  let totalAdded = 0;
  let fetchedCount = 0;

  for (const source of sources) {
    const lastFetched = source.lastFetchedAt ? new Date(source.lastFetchedAt).getTime() : 0;
    const intervalMs = source.fetchIntervalMinutes * 60 * 1000;

    if (now - lastFetched >= intervalMs) {
      const result = await fetchSource(source);
      totalAdded += result.added;
      fetchedCount++;
    }
  }

  return { totalAdded, fetchedCount };
}
