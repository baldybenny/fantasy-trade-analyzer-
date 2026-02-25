import { useState } from 'react';
import type { NewsArticleFilters, NewsSource, NewsArticle, NewsStats } from '@fta/shared';
import {
  useNewsSources,
  useNewsArticles,
  useNewsStats,
  useFetchAllNews,
  useSeedDefaultSources,
  useMarkArticleRead,
  useToggleBookmark,
  useMarkAllRead,
  useCreateNewsSource,
  useUpdateNewsSource,
  useDeleteNewsSource,
} from '../hooks/use-news.js';

function timeAgo(dateStr: string | null | undefined): string {
  if (!dateStr) return '';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function SourceSidebar({
  sources,
  selectedSourceId,
  onSelectSource,
}: {
  sources: NewsSource[];
  selectedSourceId: number | undefined;
  onSelectSource: (id: number | undefined) => void;
}) {
  return (
    <div className="space-y-1">
      <button
        onClick={() => onSelectSource(undefined)}
        className={`w-full text-left px-3 py-2 rounded text-sm transition-colors ${
          !selectedSourceId
            ? 'bg-blue-600/20 text-blue-400'
            : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800/50'
        }`}
      >
        All Sources
      </button>
      {sources.map((source) => (
        <button
          key={source.id}
          onClick={() => onSelectSource(source.id)}
          className={`w-full text-left px-3 py-2 rounded text-sm transition-colors flex items-center gap-2 ${
            selectedSourceId === source.id
              ? 'bg-blue-600/20 text-blue-400'
              : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800/50'
          }`}
        >
          <span
            className={`w-2 h-2 rounded-full shrink-0 ${
              !source.enabled
                ? 'bg-gray-600'
                : source.lastFetchError
                  ? 'bg-red-500'
                  : 'bg-green-500'
            }`}
          />
          <span className="truncate flex-1">{source.name}</span>
          {source.articleCount > 0 && (
            <span className="text-xs text-gray-600">{source.articleCount}</span>
          )}
        </button>
      ))}
    </div>
  );
}

function ArticleCard({
  article,
  onMarkRead,
  onToggleBookmark,
}: {
  article: NewsArticle;
  onMarkRead: (id: number) => void;
  onToggleBookmark: (id: number) => void;
}) {
  return (
    <div
      className={`bg-gray-900 border rounded-lg p-4 ${
        article.isRead ? 'border-gray-800/50' : 'border-gray-700'
      }`}
    >
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 text-xs text-gray-500 mb-1">
            {article.sourceName && <span>{article.sourceName}</span>}
            {article.author && (
              <>
                <span>·</span>
                <span>{article.author}</span>
              </>
            )}
            {article.publishedAt && (
              <>
                <span>·</span>
                <span>{timeAgo(article.publishedAt)}</span>
              </>
            )}
          </div>
          <a
            href={article.url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => onMarkRead(article.id)}
            className={`text-sm font-medium hover:underline block ${
              article.isRead ? 'text-gray-400' : 'text-white'
            }`}
          >
            {article.title}
          </a>
          {article.excerpt && (
            <p className="text-xs text-gray-500 mt-1 line-clamp-2">{article.excerpt}</p>
          )}
          {article.taggedPlayers && article.taggedPlayers.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {article.taggedPlayers.map((p) => (
                <span
                  key={p.id}
                  className="px-1.5 py-0.5 bg-blue-900/30 text-blue-400 text-xs rounded"
                >
                  {p.name}
                </span>
              ))}
            </div>
          )}
        </div>
        <button
          onClick={() => onToggleBookmark(article.id)}
          className={`shrink-0 text-lg ${
            article.isBookmarked ? 'text-yellow-400' : 'text-gray-600 hover:text-gray-400'
          }`}
          title={article.isBookmarked ? 'Remove bookmark' : 'Bookmark'}
        >
          {article.isBookmarked ? '★' : '☆'}
        </button>
      </div>
    </div>
  );
}

function AddSourceModal({
  onClose,
  onAdd,
}: {
  onClose: () => void;
  onAdd: (source: any) => void;
}) {
  const [name, setName] = useState('');
  const [type, setType] = useState<'rss' | 'substack' | 'authenticated' | 'google-news'>('rss');
  const [url, setUrl] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [interval, setInterval] = useState(60);

  const isGoogleNews = type === 'google-news';

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isGoogleNews) {
      const googleUrl = `https://news.google.com/rss/search?q=${encodeURIComponent(searchQuery)}&hl=en-US&gl=US&ceid=US:en`;
      onAdd({
        name: name || `Google News — ${searchQuery}`,
        type,
        url: googleUrl,
        searchQuery,
        fetchIntervalMinutes: interval,
      });
    } else {
      onAdd({ name, type, url, fetchIntervalMinutes: interval });
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-gray-900 border border-gray-700 rounded-lg p-6 w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-medium text-white mb-4">Add News Source</h3>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="text-xs text-gray-400">Type</label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value as typeof type)}
              className="w-full mt-1 px-3 py-2 bg-gray-800 border border-gray-700 rounded text-sm text-white"
            >
              <option value="rss">RSS</option>
              <option value="substack">Substack</option>
              <option value="authenticated">Authenticated</option>
              <option value="google-news">Google News Search</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-400">Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={isGoogleNews && searchQuery ? `Google News — ${searchQuery}` : ''}
              className="w-full mt-1 px-3 py-2 bg-gray-800 border border-gray-700 rounded text-sm text-white"
              required={!isGoogleNews}
            />
          </div>
          {isGoogleNews ? (
            <div>
              <label className="text-xs text-gray-400">Search Query</label>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="e.g. fantasy baseball, MLB trades"
                className="w-full mt-1 px-3 py-2 bg-gray-800 border border-gray-700 rounded text-sm text-white"
                required
              />
              <p className="text-xs text-gray-500 mt-1">
                Articles will be fetched from Google News RSS for this query.
              </p>
            </div>
          ) : (
            <div>
              <label className="text-xs text-gray-400">Feed URL</label>
              <input
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                className="w-full mt-1 px-3 py-2 bg-gray-800 border border-gray-700 rounded text-sm text-white"
                required
              />
            </div>
          )}
          <div>
            <label className="text-xs text-gray-400">Fetch Interval (minutes)</label>
            <input
              type="number"
              value={interval}
              onChange={(e) => setInterval(Number(e.target.value))}
              min={5}
              className="w-full mt-1 px-3 py-2 bg-gray-800 border border-gray-700 rounded text-sm text-white"
            />
          </div>
          <div className="flex gap-2 justify-end pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 text-sm text-gray-400 hover:text-gray-200"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-500"
            >
              Add Source
            </button>
          </div>
          <div className="border-t border-gray-800 pt-3 mt-1">
            <p className="text-xs text-gray-500">
              <span className="text-gray-400 font-medium">Twitter/X tip:</span>{' '}
              Twitter doesn't provide RSS feeds directly. Use an RSS bridge service like{' '}
              <span className="text-gray-400">nitter.net</span> or{' '}
              <span className="text-gray-400">rss.app</span> to generate an RSS feed URL
              from any Twitter account, then add it here as an RSS source.
            </p>
          </div>
        </form>
      </div>
    </div>
  );
}

function ManageSourcesModal({
  sources,
  onClose,
  onUpdate,
  onDelete,
}: {
  sources: NewsSource[];
  onClose: () => void;
  onUpdate: (id: number, updates: any) => void;
  onDelete: (id: number) => void;
}) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <div
        className="bg-gray-900 border border-gray-700 rounded-lg p-6 w-full max-w-lg max-h-[80vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-lg font-medium text-white mb-4">Manage Sources</h3>
        <div className="space-y-3">
          {sources.map((source) => (
            <div
              key={source.id}
              className="flex items-center gap-3 p-3 bg-gray-800 rounded border border-gray-700"
            >
              <div className="flex-1 min-w-0">
                <div className="text-sm text-white truncate">{source.name}</div>
                <div className="text-xs text-gray-500 truncate">{source.url}</div>
                {source.lastFetchError && (
                  <div className="text-xs text-red-400 mt-1 truncate">
                    {source.lastFetchError}
                  </div>
                )}
              </div>
              <button
                onClick={() => onUpdate(source.id, { enabled: !source.enabled })}
                className={`px-2 py-1 text-xs rounded ${
                  source.enabled
                    ? 'bg-green-900/30 text-green-400'
                    : 'bg-gray-700 text-gray-500'
                }`}
              >
                {source.enabled ? 'ON' : 'OFF'}
              </button>
              <button
                onClick={() => {
                  if (confirm(`Delete "${source.name}"?`)) onDelete(source.id);
                }}
                className="text-red-400 hover:text-red-300 text-sm"
              >
                Delete
              </button>
            </div>
          ))}
          {sources.length === 0 && (
            <p className="text-gray-500 text-sm text-center py-4">No sources configured.</p>
          )}
        </div>
        <div className="flex justify-end pt-4">
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-sm text-gray-400 hover:text-gray-200"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

export default function News() {
  const [filters, setFilters] = useState<NewsArticleFilters>({ page: 1, limit: 25 });
  const [showAddSource, setShowAddSource] = useState(false);
  const [showManageSources, setShowManageSources] = useState(false);
  const [searchInput, setSearchInput] = useState('');

  const { data: sources = [] } = useNewsSources();
  const { data: articlesData, isLoading: articlesLoading } = useNewsArticles(filters);
  const { data: stats } = useNewsStats();

  const fetchAll = useFetchAllNews();
  const seedDefaults = useSeedDefaultSources();
  const markRead = useMarkArticleRead();
  const toggleBookmark = useToggleBookmark();
  const markAllRead = useMarkAllRead();
  const createSource = useCreateNewsSource();
  const updateSource = useUpdateNewsSource();
  const deleteSource = useDeleteNewsSource();

  const articles: NewsArticle[] = articlesData?.articles ?? [];
  const total: number = articlesData?.total ?? 0;
  const totalPages = Math.ceil(total / (filters.limit || 25));
  const newsStats: NewsStats | undefined = stats;

  const handleSearch = () => {
    setFilters((f) => ({ ...f, search: searchInput || undefined, page: 1 }));
  };

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <h2 className="text-2xl font-bold text-white">News</h2>
          {newsStats && (
            <span className="text-xs text-gray-500">
              {newsStats.unreadCount} unread · {newsStats.totalToday} today
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {sources.length === 0 && (
            <button
              onClick={() => seedDefaults.mutate()}
              disabled={seedDefaults.isPending}
              className="px-3 py-1.5 text-xs bg-green-600 text-white rounded hover:bg-green-500 disabled:opacity-50"
            >
              {seedDefaults.isPending ? 'Seeding...' : 'Seed Default Sources'}
            </button>
          )}
          <button
            onClick={() => markAllRead.mutate()}
            disabled={markAllRead.isPending}
            className="px-3 py-1.5 text-xs text-gray-400 hover:text-gray-200 border border-gray-700 rounded"
          >
            Mark All Read
          </button>
          <button
            onClick={() => fetchAll.mutate()}
            disabled={fetchAll.isPending}
            className="px-3 py-1.5 text-xs bg-blue-600 text-white rounded hover:bg-blue-500 disabled:opacity-50"
          >
            {fetchAll.isPending ? 'Refreshing...' : 'Refresh All'}
          </button>
        </div>
      </div>

      <div className="flex gap-6">
        {/* Source sidebar */}
        <div className="w-52 shrink-0">
          <div className="bg-gray-900 border border-gray-800 rounded-lg p-3">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-medium text-gray-400 uppercase tracking-wide">Sources</span>
              <div className="flex gap-1">
                <button
                  onClick={() => setShowAddSource(true)}
                  className="text-xs text-blue-400 hover:text-blue-300"
                  title="Add Source"
                >
                  +
                </button>
                <button
                  onClick={() => setShowManageSources(true)}
                  className="text-xs text-gray-500 hover:text-gray-300"
                  title="Manage Sources"
                >
                  ...
                </button>
              </div>
            </div>
            <SourceSidebar
              sources={sources}
              selectedSourceId={filters.sourceId}
              onSelectSource={(id) => setFilters((f) => ({ ...f, sourceId: id, page: 1 }))}
            />
          </div>
        </div>

        {/* Main feed */}
        <div className="flex-1 min-w-0">
          {/* Filter bar */}
          <div className="flex items-center gap-2 mb-4">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSearch();
              }}
              className="flex-1 flex gap-2"
            >
              <input
                type="text"
                placeholder="Search articles..."
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                className="flex-1 px-3 py-1.5 bg-gray-900 border border-gray-800 rounded text-sm text-white placeholder-gray-600"
              />
              <button
                type="submit"
                className="px-3 py-1.5 text-xs bg-gray-800 text-gray-400 rounded hover:text-gray-200"
              >
                Search
              </button>
            </form>
            <button
              onClick={() =>
                setFilters((f) => ({
                  ...f,
                  unreadOnly: !f.unreadOnly,
                  page: 1,
                }))
              }
              className={`px-3 py-1.5 text-xs rounded border ${
                filters.unreadOnly
                  ? 'border-blue-500 text-blue-400 bg-blue-900/20'
                  : 'border-gray-800 text-gray-500 hover:text-gray-300'
              }`}
            >
              Unread
            </button>
            <button
              onClick={() =>
                setFilters((f) => ({
                  ...f,
                  bookmarkedOnly: !f.bookmarkedOnly,
                  page: 1,
                }))
              }
              className={`px-3 py-1.5 text-xs rounded border ${
                filters.bookmarkedOnly
                  ? 'border-yellow-500 text-yellow-400 bg-yellow-900/20'
                  : 'border-gray-800 text-gray-500 hover:text-gray-300'
              }`}
            >
              Bookmarked
            </button>
          </div>

          {/* Articles */}
          {articlesLoading ? (
            <div className="text-center py-12 text-gray-500 text-sm">Loading articles...</div>
          ) : articles.length === 0 ? (
            <div className="bg-gray-900 border border-gray-800 rounded-lg p-8 text-center">
              <p className="text-gray-500 text-sm">
                {sources.length === 0
                  ? 'No news sources configured. Click "Seed Default Sources" to get started.'
                  : 'No articles found. Click "Refresh All" to fetch news.'}
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {articles.map((article) => (
                <ArticleCard
                  key={article.id}
                  article={article}
                  onMarkRead={(id) => markRead.mutate(id)}
                  onToggleBookmark={(id) => toggleBookmark.mutate(id)}
                />
              ))}
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 mt-4">
              <button
                onClick={() => setFilters((f) => ({ ...f, page: Math.max(1, (f.page || 1) - 1) }))}
                disabled={(filters.page || 1) <= 1}
                className="px-3 py-1.5 text-xs text-gray-400 border border-gray-800 rounded hover:text-gray-200 disabled:opacity-30"
              >
                Prev
              </button>
              <span className="text-xs text-gray-500">
                Page {filters.page || 1} of {totalPages}
              </span>
              <button
                onClick={() => setFilters((f) => ({ ...f, page: Math.min(totalPages, (f.page || 1) + 1) }))}
                disabled={(filters.page || 1) >= totalPages}
                className="px-3 py-1.5 text-xs text-gray-400 border border-gray-800 rounded hover:text-gray-200 disabled:opacity-30"
              >
                Next
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Modals */}
      {showAddSource && (
        <AddSourceModal
          onClose={() => setShowAddSource(false)}
          onAdd={(source) => createSource.mutate(source)}
        />
      )}
      {showManageSources && (
        <ManageSourcesModal
          sources={sources}
          onClose={() => setShowManageSources(false)}
          onUpdate={(id, updates) => updateSource.mutate({ id, updates })}
          onDelete={(id) => deleteSource.mutate(id)}
        />
      )}
    </div>
  );
}
