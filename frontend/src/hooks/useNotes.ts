/**
 * TanStack Query hooks for data fetching and mutations
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import * as api from '../lib/api'

// ============================================================================
// Query Hooks
// ============================================================================

/**
 * Fetch folder hierarchy with auto-refresh
 */
export function useFolderTree() {
  return useQuery({
    queryKey: ['folders'],
    queryFn: api.fetchFolders,
    refetchInterval: 5000, // Auto-refresh every 5 seconds
    staleTime: 3000, // Consider stale after 3 seconds
  })
}

/**
 * Fetch notes (optionally filtered by folder)
 */
export function useNotes(folder?: string, limit = 50, offset = 0) {
  return useQuery({
    queryKey: ['notes', folder, limit, offset],
    queryFn: () => api.fetchNotes(folder, limit, offset),
    staleTime: 10000, // Consider stale after 10 seconds
  })
}

/**
 * Fetch a specific note by ID
 */
export function useNote(noteId: string) {
  return useQuery({
    queryKey: ['note', noteId],
    queryFn: () => api.fetchNote(noteId),
    enabled: !!noteId, // Only fetch if noteId is provided
  })
}

/**
 * Search notes
 */
export function useSearchNotes(query: string) {
  return useQuery({
    queryKey: ['search', query],
    queryFn: () => api.searchNotes(query),
    enabled: query.trim().length > 0, // Only search if query is not empty
    staleTime: 30000, // Search results stay fresh for 30 seconds
  })
}

/**
 * Fetch all tags
 */
export function useTags() {
  return useQuery({
    queryKey: ['tags'],
    queryFn: api.fetchTags,
    staleTime: 60000, // Tags don't change often, stay fresh for 1 minute
  })
}

/**
 * Fetch notes filtered by tag
 */
export function useNotesByTag(tag: string | null, limit = 50) {
  return useQuery({
    queryKey: ['notes', 'tag', tag, limit],
    queryFn: () => (tag ? api.fetchNotesByTag(tag, limit) : Promise.resolve([])),
    enabled: !!tag, // Only fetch if tag is provided
    staleTime: 10000, // Consider stale after 10 seconds
  })
}

// ============================================================================
// Mutation Hooks
// ============================================================================

/**
 * Transcribe audio mutation
 * Automatically invalidates folders and notes on success
 */
export function useTranscribeAudio() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (audioBlob: Blob) => api.transcribeAudio(audioBlob),
    onSuccess: () => {
      // Invalidate folders and notes to trigger refetch
      queryClient.invalidateQueries({ queryKey: ['folders'] })
      queryClient.invalidateQueries({ queryKey: ['notes'] })
      queryClient.invalidateQueries({ queryKey: ['tags'] })
    },
  })
}

/**
 * Delete note mutation
 * Automatically invalidates folders and notes on success
 */
export function useDeleteNote() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (noteId: string) => api.deleteNote(noteId),
    onSuccess: () => {
      // Invalidate to trigger refetch
      queryClient.invalidateQueries({ queryKey: ['folders'] })
      queryClient.invalidateQueries({ queryKey: ['notes'] })
      queryClient.invalidateQueries({ queryKey: ['tags'] })
    },
  })
}

/**
 * Ask notes mutation
 */
export function useAskNotes() {
  return useMutation({
    mutationFn: (args: { query: string; maxResults?: number; debug?: boolean }) =>
      api.askNotes(args.query, args.maxResults ?? 12, args.debug ?? false),
  })
}

