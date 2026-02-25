import type { FetchedArticle } from '@fta/shared';

type ScraperFn = (url: string, credential: string) => Promise<FetchedArticle[]>;

const scraperRegistry = new Map<string, ScraperFn>();

export function registerScraper(key: string, fn: ScraperFn): void {
  scraperRegistry.set(key, fn);
}

export async function fetchAuthenticated(
  url: string,
  _authType: string,
  credential: string,
  scraperKey: string,
): Promise<FetchedArticle[]> {
  const scraper = scraperRegistry.get(scraperKey);
  if (!scraper) {
    throw new Error(`No scraper registered for key: ${scraperKey}`);
  }
  return scraper(url, credential);
}

export function getRegisteredScrapers(): string[] {
  return Array.from(scraperRegistry.keys());
}
