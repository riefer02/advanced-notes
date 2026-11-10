/**
 * TanStack Query hooks for data fetching and mutations
 */

import {
  useQuery,
  useMutation,
  useQueryClient,
  keepPreviousData,
  type QueryClient,
} from '@tanstack/react-query'
import * as api from '../lib/api'
import { queryKeys } from '../lib/queryKeys'

// ============================================================================
// Invalidation Helpers
// ============================================================================

function invalidateNoteQueries(queryClient: QueryClient) {
  queryClient.invalidateQueries({ queryKey: queryKeys.folders.all })
  queryClient.invalidateQueries({ queryKey: queryKeys.notes.all })
  queryClient.invalidateQueries({ queryKey: queryKeys.notes.detailPrefix })
  queryClient.invalidateQueries({ queryKey: queryKeys.notes.searchPrefix })
  queryClient.invalidateQueries({ queryKey: queryKeys.tags.all })
  queryClient.invalidateQueries({ queryKey: queryKeys.dashboard })
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
    // Mutations invalidate this key; polling was unnecessary background load.
    staleTime: 3000,
  })
}

/**
 * Fetch notes (optionally filtered by folder and lifecycle view)
 */
export function useNotes(
  folder?: string,
  limit = 50,
  offset = 0,
  enabled = true,
  view: api.NoteView = 'active'
) {
  return useQuery({
    queryKey: queryKeys.notes.list(folder, limit, offset, view),
    queryFn: () => api.fetchNotes(folder, limit, offset, view),
    enabled,
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
 * Fetch the source audio for a note (404/501 when audio clips are disabled).
 */
export function useNoteAudio(noteId: string, enabled = true) {
  return useQuery({
    queryKey: queryKeys.notes.audio(noteId),
    queryFn: () => api.fetchNoteAudio(noteId),
    enabled: !!noteId && enabled,
    retry: false,
    staleTime: 5 * 60 * 1000,
  })
}

/**
 * Fetch a note's saved revisions (newest first).
 */
export function useNoteRevisions(noteId: string, enabled = true) {
  return useQuery({
    queryKey: queryKeys.notes.revisions(noteId),
    queryFn: () => api.fetchNoteRevisions(noteId),
    enabled: !!noteId && enabled,
    staleTime: 10000,
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
    // Refining a query should not blank the list into a skeleton.
    placeholderData: keepPreviousData,
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
export function useNotesByTag(tag: string | null, limit = 50, enabled = true) {
  return useQuery({
    queryKey: queryKeys.notes.byTag(tag, limit),
    queryFn: () => (tag ? api.fetchNotesByTag(tag, limit) : Promise.resolve([])),
    enabled: !!tag && enabled,
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
 * Create a manual (typed) note.
 * Seed the detail cache so opening it immediately never refetches, then
 * refresh list, folders, tags, search, and the dashboard.
 */
export function useCreateNote() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: api.CreateNoteInput) => api.createNote(input),
    onSuccess: (note) => {
      queryClient.setQueryData(queryKeys.notes.detail(note.id), note)
      invalidateNoteQueries(queryClient)
    },
  })
}

/**
 * Update note mutation
 * Refreshes the list, folders, tags, and the selected note detail.
 */
export function useUpdateNote() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ noteId, input }: { noteId: string; input: api.UpdateNoteInput }) =>
      api.updateNote(noteId, input),
    onSuccess: (note) => {
      invalidateNoteQueries(queryClient)
      queryClient.invalidateQueries({ queryKey: queryKeys.notes.detail(note.id) })
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
    onSuccess: (_result, noteId) => {
      // Soft delete: keep the caches so the note can be opened from Trash.
      queryClient.invalidateQueries({ queryKey: queryKeys.notes.detail(noteId) })
      invalidateNoteQueries(queryClient)
    },
  })
}

export function usePinNote() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ noteId, pinned }: { noteId: string; pinned: boolean }) =>
      api.pinNote(noteId, pinned),
    onSuccess: (note) => {
      queryClient.setQueryData(queryKeys.notes.detail(note.id), note)
      invalidateNoteQueries(queryClient)
    },
  })
}

export function useArchiveNote() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ noteId, archived }: { noteId: string; archived: boolean }) =>
      api.archiveNote(noteId, archived),
    onSuccess: (note) => {
      queryClient.setQueryData(queryKeys.notes.detail(note.id), note)
      invalidateNoteQueries(queryClient)
    },
  })
}

export function useRestoreNote() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (noteId: string) => api.restoreNote(noteId),
    onSuccess: (note) => {
      queryClient.setQueryData(queryKeys.notes.detail(note.id), note)
      invalidateNoteQueries(queryClient)
    },
  })
}

export function usePurgeNote() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (noteId: string) => api.purgeNote(noteId),
    onSuccess: (_result, noteId) => {
      queryClient.removeQueries({ queryKey: queryKeys.notes.detail(noteId) })
      queryClient.removeQueries({ queryKey: queryKeys.notes.audio(noteId) })
      invalidateNoteQueries(queryClient)
    },
  })
}

export function useRestoreNoteRevision() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ noteId, version }: { noteId: string; version: number }) =>
      api.restoreNoteRevision(noteId, version),
    onSuccess: (note) => {
      queryClient.setQueryData(queryKeys.notes.detail(note.id), note)
      invalidateNoteQueries(queryClient)
    },
  })
}

/**
 * Ask notes mutation
 */
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
