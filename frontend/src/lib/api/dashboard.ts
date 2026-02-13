/**
 * Dashboard API types and functions.
 */
import { apiRequest } from './core'

// ============================================================================
// Types
// ============================================================================

export interface DashboardStats {
  notes: { total: number }
  todos: { suggested: number; accepted: number; completed: number }
  meals: { this_month: number; today: number }
  vinyl: { total_records: number; total_artists: number }
}

// ============================================================================
// API Functions
// ============================================================================

export async function fetchDashboardStats(): Promise<DashboardStats> {
  return apiRequest<DashboardStats>('GET', '/api/dashboard/stats')
}
