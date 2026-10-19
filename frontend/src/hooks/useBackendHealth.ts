import { useQuery } from '@tanstack/react-query'

import { fetchHealth } from '../lib/api'

export function useBackendHealth() {
  return useQuery({
    queryKey: ['backendHealth'],
    queryFn: fetchHealth,
    retry: false,
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
    staleTime: 10_000,
  })
}
