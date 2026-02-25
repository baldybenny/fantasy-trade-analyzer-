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
  {
    name: 'RotoWorld / NBC Sports',
    type: 'rss',
    url: 'https://www.nbcsportsedge.com/baseball/news/rss',
    fetchIntervalMinutes: 60,
  },
  {
    name: 'RotoWire',
    type: 'rss',
    url: 'https://www.rotowire.com/baseball/news.php?view=rss',
    fetchIntervalMinutes: 60,
  },
  {
    name: 'Imaginary Brick Wall',
    type: 'substack',
    url: 'https://imaginarybrickwall.substack.com/feed',
    fetchIntervalMinutes: 120,
  },
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
