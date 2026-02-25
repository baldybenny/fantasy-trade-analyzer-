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

  // Import
  importData: (data: { type: string; source: string; csvContent: string }) =>
    request<any>('/projections/import', { method: 'POST', body: JSON.stringify(data) }),

  importRosters: (data: { type: string; source: string; csvContent: string }) =>
    request<any>('/rosters/import', { method: 'POST', body: JSON.stringify(data) }),

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
};
