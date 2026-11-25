/**
 * Unified Library feed API.
 */
import type { MealEntry } from './meals'
import type { Note } from './notes'
import { apiRequest } from './core'
import type { Todo } from './todos'
import type { VinylRecord } from './vinyl'

export type LibraryKind = 'note' | 'meal' | 'vinyl' | 'todo'

export type LibraryApiItem =
  | { kind: 'note'; id: string; timestamp: string; data: Note }
  | { kind: 'meal'; id: string; timestamp: string; data: MealEntry }
  | { kind: 'vinyl'; id: string; timestamp: string; data: VinylRecord }
  | { kind: 'todo'; id: string; timestamp: string; data: Todo }

export interface LibraryResponse {
  items: LibraryApiItem[]
  counts: Record<LibraryKind, number>
  limit: number
  has_more: boolean
}

export async function fetchLibrary(params?: {
  limit?: number
  type?: LibraryKind
}): Promise<LibraryResponse> {
  return apiRequest<LibraryResponse>('GET', '/api/library', {
    params: { limit: params?.limit, type: params?.type },
  })
}
