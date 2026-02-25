const API_BASE = '/api';

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body.error || `HTTP ${res.status}`);
  }

  return res.json();
}

export const api = {
  // League settings
  getSettings: () => request<any>('/league'),
  updateSettings: (settings: any) =>
    request<any>('/league', { method: 'PUT', body: JSON.stringify(settings) }),

  // Teams
  getTeams: () => request<any[]>('/teams'),
  getTeam: (id: number) => request<any>(`/teams/${id}`),

  // Players
  getPlayers: (page = 1, limit = 50) => request<any>(`/players?page=${page}&limit=${limit}`),
  searchPlayers: (query: string) => request<any[]>(`/players/search?q=${encodeURIComponent(query)}`),
  getPlayer: (id: number) => request<any>(`/players/${id}`),

  // Import (CSV)
  importData: (data: { type: string; source: string; csvContent: string }) =>
    request<any>('/projections/import', { method: 'POST', body: JSON.stringify(data) }),

  importRosters: (data: { type: string; source: string; csvContent: string }) =>
    request<any>('/rosters/import', { method: 'POST', body: JSON.stringify(data) }),

  // Auto-fetch
  fetchProjections: (system: string, statType: string) =>
    request<any>('/projections/import/fetch-projections', {
      method: 'POST',
      body: JSON.stringify({ system, statType }),
    }),

  fetchSavant: (year?: number) =>
    request<any>('/projections/import/fetch-savant', {
      method: 'POST',
      body: JSON.stringify({ year }),
    }),

  fetchFantasyPros: (statType: string) =>
    request<any>('/projections/import/fetch-fantasypros', {
      method: 'POST',
      body: JSON.stringify({ statType }),
    }),

  fetchRotoChamp: (statType: string) =>
    request<any>('/projections/import/fetch-rotochamp', {
      method: 'POST',
      body: JSON.stringify({ statType }),
    }),

  // Standings
  getStandings: () => request<any>('/standings'),

  // Trade
  analyzeTrade: (proposal: { teamAId: number; teamBId: number; teamAGives: number[]; teamBGives: number[] }) =>
    request<any>('/trade/analyze', { method: 'POST', body: JSON.stringify(proposal) }),
  getTradeHistory: () => request<any[]>('/trade/history'),
  saveTrade: (analysis: any) =>
    request<any>('/trade/save', { method: 'POST', body: JSON.stringify(analysis) }),

  // Values
  calculateValues: () => request<any>('/values/calculate', { method: 'POST' }),
  getValues: () => request<any[]>('/values'),

  // Fantrax
  fantraxStatus: () => request<any>('/fantrax/status'),
  fantraxConfigure: (leagueId: string, cookie: string) =>
    request<any>('/fantrax/config', { method: 'POST', body: JSON.stringify({ leagueId, cookie }) }),
  fantraxSync: () => request<any>('/fantrax/sync', { method: 'POST' }),

  // Keepers
  getInflation: () => request<any>('/keepers/inflation'),
  getScarcity: () => request<any[]>('/keepers/scarcity'),
  getKeeperAnalysis: (teamId?: number) =>
    request<any>(teamId != null ? `/keepers/analysis?teamId=${teamId}` : '/keepers/analysis'),

  // News - Sources
  getNewsSources: () => request<any[]>('/news/sources'),
  createNewsSource: (source: any) =>
    request<any>('/news/sources', { method: 'POST', body: JSON.stringify(source) }),
  updateNewsSource: (id: number, updates: any) =>
    request<any>(`/news/sources/${id}`, { method: 'PUT', body: JSON.stringify(updates) }),
  deleteNewsSource: (id: number) =>
    request<any>(`/news/sources/${id}`, { method: 'DELETE' }),
  seedDefaultSources: () =>
    request<any>('/news/sources/seed-defaults', { method: 'POST' }),

  // News - Fetch
  fetchAllNews: () => request<any>('/news/fetch', { method: 'POST' }),
  fetchNewsSource: (sourceId: number) =>
    request<any>(`/news/fetch/${sourceId}`, { method: 'POST' }),
  fetchStaleNews: () => request<any>('/news/fetch-stale', { method: 'POST' }),

  // News - Articles
  getNewsArticles: (filters: {
    page?: number;
    limit?: number;
    sourceId?: number;
    playerId?: number;
    search?: string;
    unreadOnly?: boolean;
    bookmarkedOnly?: boolean;
  } = {}) => {
    const params = new URLSearchParams();
    if (filters.page) params.set('page', String(filters.page));
    if (filters.limit) params.set('limit', String(filters.limit));
    if (filters.sourceId) params.set('sourceId', String(filters.sourceId));
    if (filters.playerId) params.set('playerId', String(filters.playerId));
    if (filters.search) params.set('search', filters.search);
    if (filters.unreadOnly) params.set('unreadOnly', 'true');
    if (filters.bookmarkedOnly) params.set('bookmarkedOnly', 'true');
    const qs = params.toString();
    return request<any>(`/news/articles${qs ? `?${qs}` : ''}`);
  },
  markArticleRead: (id: number) =>
    request<any>(`/news/articles/${id}/read`, { method: 'PATCH' }),
  toggleArticleBookmark: (id: number) =>
    request<any>(`/news/articles/${id}/bookmark`, { method: 'PATCH' }),
  markAllArticlesRead: () =>
    request<any>('/news/articles/mark-all-read', { method: 'POST' }),
  getPlayerNews: (playerId: number) =>
    request<any[]>(`/news/articles/player/${playerId}`),

  // News - Stats
  getNewsStats: () => request<any>('/news/stats'),
};
