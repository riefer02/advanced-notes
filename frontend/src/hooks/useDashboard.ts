import { useQuery } from '@tanstack/react-query'
import { fetchDashboardStats } from '../lib/api'

export function useDashboardStats() {
  return useQuery({
    queryKey: ['dashboardStats'],
    queryFn: fetchDashboardStats,
    staleTime: 30_000,
  })
}
