/**
 * Feedback API types and functions.
 */
import { apiRequest } from './core'

// ============================================================================
// Types
// ============================================================================

export type FeedbackType = 'bug' | 'feature' | 'general'

export interface Feedback {
  id: string
  user_id: string
  feedback_type: FeedbackType
  title: string
  description: string | null
  rating: number | null
  created_at: string
}

export interface FeedbackListResponse {
  feedback: Feedback[]
  total: number
  limit: number
  offset: number
}

// ============================================================================
// API Functions
// ============================================================================

export async function submitFeedback(data: {
  feedback_type: FeedbackType
  title: string
  description?: string
  rating?: number
}): Promise<Feedback> {
  return apiRequest<Feedback>('POST', '/api/feedback', { body: data })
}

export async function fetchFeedback(params?: {
  limit?: number
  offset?: number
}): Promise<FeedbackListResponse> {
  return apiRequest<FeedbackListResponse>('GET', '/api/feedback', { params })
}
