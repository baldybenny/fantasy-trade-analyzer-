import type { NewsSourceType } from '@fta/shared';

interface DefaultSource {
  name: string;
  type: NewsSourceType;
  url: string;
  searchQuery?: string;
  fetchIntervalMinutes: number;
}

export const DEFAULT_NEWS_SOURCES: DefaultSource[] = [
  {
    name: 'PitcherList',
    type: 'rss',
    url: 'https://www.pitcherlist.com/feed',
    fetchIntervalMinutes: 60,
  },
  {
    name: 'ESPN MLB',
    type: 'rss',
    url: 'https://www.espn.com/espn/rss/mlb/news',
    fetchIntervalMinutes: 30,
  },
  {
    name: 'MLB.com',
    type: 'rss',
    url: 'https://www.mlb.com/feeds/news/rss.xml',
    fetchIntervalMinutes: 30,
  },
  // RotoWorld / NBC Sports — removed, SSL errors (site discontinued RSS)
  // RotoWire — removed, returns HTML instead of RSS (feed discontinued)
  // Imaginary Brick Wall — removed, Substack feed returns 404
  {
    name: 'Google News — Fantasy Baseball',
    type: 'google-news',
    url: 'https://news.google.com/rss/search?q=fantasy+baseball&hl=en-US&gl=US&ceid=US:en',
    searchQuery: 'fantasy baseball',
    fetchIntervalMinutes: 30,
  },
  {
    name: 'Google News — MLB Trades & Rumors',
    type: 'google-news',
    url: 'https://news.google.com/rss/search?q=MLB+trades+rumors&hl=en-US&gl=US&ceid=US:en',
    searchQuery: 'MLB trades rumors',
    fetchIntervalMinutes: 60,
  },
  {
    name: 'Google News — MLB Injuries',
    type: 'google-news',
    url: 'https://news.google.com/rss/search?q=MLB+injury+report&hl=en-US&gl=US&ceid=US:en',
    searchQuery: 'MLB injury report',
    fetchIntervalMinutes: 60,
  },
];
