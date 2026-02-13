import { useQuery } from '@tanstack/react-query'
import { fetchDashboardStats } from '../lib/api'
import { queryKeys } from '../lib/queryKeys'

export function useDashboardStats() {
  return useQuery({
    queryKey: queryKeys.dashboard,
    queryFn: fetchDashboardStats,
    staleTime: 30_000,
  })
}
