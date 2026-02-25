import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api.js';

export function useTeams() {
  return useQuery({
    queryKey: ['teams'],
    queryFn: api.getTeams,
  });
}

export function useTeam(id: number | null) {
  return useQuery({
    queryKey: ['teams', id],
    queryFn: () => api.getTeam(id!),
    enabled: id !== null,
  });
}
