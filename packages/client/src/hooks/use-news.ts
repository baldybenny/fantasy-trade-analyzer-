import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api.js';
import type { NewsArticleFilters } from '@fta/shared';

export function useNewsSources() {
  return useQuery({
    queryKey: ['news', 'sources'],
    queryFn: api.getNewsSources,
  });
}

export function useNewsArticles(filters: NewsArticleFilters = {}) {
  return useQuery({
    queryKey: ['news', 'articles', filters],
    queryFn: () => api.getNewsArticles(filters),
  });
}

export function usePlayerNews(playerId: number | null) {
  return useQuery({
    queryKey: ['news', 'player', playerId],
    queryFn: () => api.getPlayerNews(playerId!),
    enabled: playerId !== null,
  });
}

export function useNewsStats() {
  return useQuery({
    queryKey: ['news', 'stats'],
    queryFn: api.getNewsStats,
    refetchInterval: 60000, // Refresh stats every minute
  });
}

export function useFetchAllNews() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: api.fetchAllNews,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['news'] });
    },
  });
}

export function useSeedDefaultSources() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: api.seedDefaultSources,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['news', 'sources'] });
    },
  });
}

export function useMarkArticleRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: api.markArticleRead,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['news'] });
    },
  });
}

export function useToggleBookmark() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: api.toggleArticleBookmark,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['news'] });
    },
  });
}

export function useMarkAllRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: api.markAllArticlesRead,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['news'] });
    },
  });
}

export function useCreateNewsSource() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: api.createNewsSource,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['news', 'sources'] });
    },
  });
}

export function useUpdateNewsSource() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, updates }: { id: number; updates: any }) => api.updateNewsSource(id, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['news', 'sources'] });
    },
  });
}

export function useDeleteNewsSource() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: api.deleteNewsSource,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['news'] });
    },
  });
}
