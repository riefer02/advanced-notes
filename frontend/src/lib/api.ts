/**
 * API Client for Advanced Notes Backend
 * 
 * All API calls go through this module for consistency and type safety.
 */

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5001'

// ============================================================================
// Types
// ============================================================================

export interface TranscriptionMeta {
  device: string
  model: string
  sample_rate?: number
  duration?: number
  duration_sec?: number
}

export interface CategoryResult {
  note_id: string
  action: string
  folder_path: string
  filename: string
  tags: string[]
  confidence: number
  reasoning: string
}

export interface TranscriptionResponse {
  text: string
  meta: TranscriptionMeta
  categorization: CategoryResult
}

export interface Note {
  id: string
  title: string
  content: string
  folder_path: string
  filename: string
  tags: string[]
  confidence: number
  transcription_duration: number | null
  model_version: string | null
  word_count: number
  created_at: string
  updated_at: string
}

export interface FolderNode {
  name: string
  path: string
  note_count: number
  subfolders: FolderNode[]
}

export interface FolderTree {
  folders: FolderNode
}

export interface SearchResult {
  id: string
  title: string
  content: string
  folder_path: string
  snippet: string
  rank: number
  tags: string[]
  created_at: string
}

export interface NotesResponse {
  notes: Note[]
  total: number
  limit: number
  offset: number
}

export interface SearchResponse {
  query: string
  results: SearchResult[]
}

export interface TagsResponse {
  tags: string[]
}

// ============================================================================
// API Functions
// ============================================================================

/**
 * Transcribe audio and get AI categorization
 */
export async function transcribeAudio(audioBlob: Blob): Promise<TranscriptionResponse> {
  const formData = new FormData()
  formData.append('file', audioBlob, 'recording.webm')

  const response = await fetch(`${API_BASE_URL}/api/transcribe`, {
    method: 'POST',
    body: formData,
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(error || 'Transcription failed')
  }

  return response.json()
}

/**
 * Get folder hierarchy tree
 */
export async function fetchFolders(): Promise<FolderNode> {
  const response = await fetch(`${API_BASE_URL}/api/folders`)

  if (!response.ok) {
    throw new Error('Failed to fetch folders')
  }

  const data: FolderTree = await response.json()
  return data.folders
}

/**
 * Get notes (optionally filtered by folder)
 */
export async function fetchNotes(folder?: string, limit = 50, offset = 0): Promise<NotesResponse> {
  const params = new URLSearchParams({
    limit: limit.toString(),
    offset: offset.toString(),
  })

  if (folder) {
    params.set('folder', folder)
  }

  const response = await fetch(`${API_BASE_URL}/api/notes?${params}`)

  if (!response.ok) {
    throw new Error('Failed to fetch notes')
  }

  return response.json()
}

/**
 * Get a specific note by ID
 */
export async function fetchNote(noteId: string): Promise<Note> {
  const response = await fetch(`${API_BASE_URL}/api/notes/${noteId}`)

  if (!response.ok) {
    throw new Error('Note not found')
  }

  return response.json()
}

/**
 * Delete a note
 */
export async function deleteNote(noteId: string): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/api/notes/${noteId}`, {
    method: 'DELETE',
  })

  if (!response.ok) {
    throw new Error('Failed to delete note')
  }
}

/**
 * Search notes
 */
export async function searchNotes(query: string): Promise<SearchResult[]> {
  if (!query.trim()) {
    return []
  }

  const params = new URLSearchParams({ q: query })
  const response = await fetch(`${API_BASE_URL}/api/search?${params}`)

  if (!response.ok) {
    throw new Error('Search failed')
  }

  const data: SearchResponse = await response.json()
  return data.results
}

/**
 * Get all tags
 */
export async function fetchTags(): Promise<string[]> {
  const response = await fetch(`${API_BASE_URL}/api/tags`)

  if (!response.ok) {
    throw new Error('Failed to fetch tags')
  }

  const data: TagsResponse = await response.json()
  return data.tags
}

