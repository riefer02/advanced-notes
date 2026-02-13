/**
 * TanStack Query hooks for data fetching and mutations
 */

import { useQuery, useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query'
import * as api from '../lib/api'
import { queryKeys } from '../lib/queryKeys'

// ============================================================================
// Invalidation Helpers
// ============================================================================

function invalidateNoteQueries(queryClient: QueryClient) {
  queryClient.invalidateQueries({ queryKey: queryKeys.folders.all })
  queryClient.invalidateQueries({ queryKey: queryKeys.notes.all })
  queryClient.invalidateQueries({ queryKey: queryKeys.tags.all })
}

// ============================================================================
// Query Hooks
// ============================================================================

/**
 * Fetch folder hierarchy with auto-refresh
 */
export function useFolderTree() {
  return useQuery({
    queryKey: queryKeys.folders.all,
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
    queryKey: queryKeys.notes.list(folder, limit, offset),
    queryFn: () => api.fetchNotes(folder, limit, offset),
    staleTime: 10000, // Consider stale after 10 seconds
  })
}

/**
 * Fetch a specific note by ID
 */
export function useNote(noteId: string) {
  return useQuery({
    queryKey: queryKeys.notes.detail(noteId),
    queryFn: () => api.fetchNote(noteId),
    enabled: !!noteId, // Only fetch if noteId is provided
  })
}

/**
 * Search notes
 */
export function useSearchNotes(query: string) {
  return useQuery({
    queryKey: queryKeys.notes.search(query),
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
    queryKey: queryKeys.tags.all,
    queryFn: api.fetchTags,
    staleTime: 60000, // Tags don't change often, stay fresh for 1 minute
  })
}

/**
 * Fetch notes filtered by tag
 */
export function useNotesByTag(tag: string | null, limit = 50) {
  return useQuery({
    queryKey: queryKeys.notes.byTag(tag, limit),
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
    onSuccess: () => invalidateNoteQueries(queryClient),
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
    onSuccess: () => invalidateNoteQueries(queryClient),
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

export function useDigests(limit = 50, offset = 0) {
  return useQuery({
    queryKey: queryKeys.digests(limit, offset),
    queryFn: () => api.fetchDigests(limit, offset),
    staleTime: 30000,
  })
}

export function useAskHistory(limit = 50, offset = 0) {
  return useQuery({
    queryKey: queryKeys.askHistory(limit, offset),
    queryFn: () => api.fetchAskHistory(limit, offset),
    staleTime: 30000,
  })
}

export function useDeleteDigest() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (digestId: string) => api.deleteDigest(digestId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.digestsPrefix })
    },
  })
}

export function useDeleteAskHistoryItem() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (askId: string) => api.deleteAskHistoryItem(askId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.askHistoryPrefix })
    },
  })
}

export function useGenerateSummary() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => api.generateSummary(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.digestsPrefix })
    },
  })
}
