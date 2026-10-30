/**
 * User settings API types and functions.
 */
import { apiRequest } from './core'

// ============================================================================
// Types
// ============================================================================

export interface UserSettings {
  id: string
  user_id: string
  auto_accept_todos: boolean
  transcription_languages: string[]
  created_at: string
  updated_at: string
}

// ============================================================================
// API Functions
// ============================================================================

export async function fetchUserSettings(): Promise<UserSettings> {
  return apiRequest<UserSettings>('GET', '/api/settings')
}

export async function updateUserSettings(settings: {
  auto_accept_todos?: boolean
  transcription_languages?: string[]
}): Promise<UserSettings> {
  return apiRequest<UserSettings>('PUT', '/api/settings', { body: settings })
}
