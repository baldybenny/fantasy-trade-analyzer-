import Parser from 'rss-parser';
import type { FetchedArticle } from '@fta/shared';

const parser = new Parser({
  timeout: 15000,
  headers: {
    'User-Agent': 'FantasyTradeAnalyzer/1.0',
  },
});

function truncate(text: string | undefined, maxLen: number): string | undefined {
  if (!text) return undefined;
  // Strip HTML tags
  const clean = text.replace(/<[^>]*>/g, '').trim();
  if (clean.length <= maxLen) return clean;
  return clean.slice(0, maxLen).replace(/\s+\S*$/, '') + '…';
}

export async function fetchRssFeed(url: string): Promise<FetchedArticle[]> {
  const feed = await parser.parseURL(url);

  return (feed.items || []).map((item) => ({
    title: item.title || 'Untitled',
    url: item.link || item.guid || url,
    author: item.creator || item['dc:creator'] || item.author || undefined,
    excerpt: truncate(item.contentSnippet || item.content || item.summary, 500),
    publishedAt: item.isoDate || item.pubDate || undefined,
    imageUrl: item.enclosure?.url || undefined,
  }));
}
