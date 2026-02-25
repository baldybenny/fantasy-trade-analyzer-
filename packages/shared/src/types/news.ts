import { z } from 'zod';

// --- Enums & literal types ---

export type NewsSourceType = 'rss' | 'substack' | 'authenticated' | 'google-news';

// --- Source ---

export interface NewsSource {
  id: number;
  name: string;
  type: NewsSourceType;
  url: string;
  enabled: boolean;
  authType?: string | null;
  authCredential?: string | null;
  scraperKey?: string | null;
  searchQuery?: string | null;
  fetchIntervalMinutes: number;
  lastFetchedAt?: string | null;
  lastFetchError?: string | null;
  articleCount: number;
  createdAt: string;
}

export const CreateNewsSourceSchema = z.object({
  name: z.string().min(1),
  type: z.enum(['rss', 'substack', 'authenticated', 'google-news']),
  url: z.string().url(),
  enabled: z.boolean().default(true),
  authType: z.string().optional(),
  authCredential: z.string().optional(),
  scraperKey: z.string().optional(),
  searchQuery: z.string().optional(),
  fetchIntervalMinutes: z.number().int().min(5).default(60),
});

export const UpdateNewsSourceSchema = CreateNewsSourceSchema.partial();

// --- Article ---

export interface NewsArticle {
  id: number;
  sourceId: number;
  sourceName?: string;
  title: string;
  url: string;
  author?: string | null;
  excerpt?: string | null;
  publishedAt?: string | null;
  fetchedAt: string;
  imageUrl?: string | null;
  isRead: boolean;
  isBookmarked: boolean;
  taggedPlayers?: Array<{ id: number; name: string }>;
}

// --- Filters ---

export interface NewsArticleFilters {
  sourceId?: number;
  playerId?: number;
  search?: string;
  unreadOnly?: boolean;
  bookmarkedOnly?: boolean;
  page?: number;
  limit?: number;
}

// --- Stats ---

export interface NewsStats {
  unreadCount: number;
  totalToday: number;
}

// --- Fetched article (from RSS/scraper before DB storage) ---

export interface FetchedArticle {
  title: string;
  url: string;
  author?: string;
  excerpt?: string;
  publishedAt?: string;
  imageUrl?: string;
}
