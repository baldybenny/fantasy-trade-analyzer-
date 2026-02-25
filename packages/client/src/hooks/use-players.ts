import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api.js';

export function usePlayers(page = 1, limit = 50) {
  return useQuery({
    queryKey: ['players', page, limit],
    queryFn: () => api.getPlayers(page, limit),
  });
}

export function usePlayerSearch(query: string) {
  return useQuery({
    queryKey: ['players', 'search', query],
    queryFn: () => api.searchPlayers(query),
    enabled: query.length >= 2,
  });
}
