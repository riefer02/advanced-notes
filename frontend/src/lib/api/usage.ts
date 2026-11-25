/**
 * Usage and quota API types and functions.
 */
import { apiRequest } from './core'

// ============================================================================
// Types
// ============================================================================

/** Mirrors the backend `UsageSummary` (services/usage_tracking.py). */
export interface UsageSummary {
  user_id: string
  period_start: string
  period_end: string
  transcription_minutes_used: number
  transcription_minutes_limit: number
  ai_calls_used: number
  ai_calls_limit: number
  estimated_cost_usd: number
  tier: string
}

// ============================================================================
// API Functions
// ============================================================================

export async function fetchUsage(): Promise<UsageSummary> {
  return apiRequest<UsageSummary>('GET', '/api/usage')
}
