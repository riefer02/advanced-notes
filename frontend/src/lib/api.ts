/**
 * API Client for Chisos Backend
 * 
 * All API calls go through this module for consistency and type safety.
 */

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5001'

// ============================================================================
// Auth Helper
// ============================================================================

/**
 * Get headers with authentication token
 * Note: This function should be called from within a component that has access to Clerk
 */
let getAuthToken: (() => Promise<string | null>) | null = null

export function setAuthTokenGetter(getter: () => Promise<string | null>) {
  getAuthToken = getter
}

async function getAuthHeaders(): Promise<HeadersInit> {
  const headers: HeadersInit = {}
  
  if (getAuthToken) {
    const token = await getAuthToken()
    if (token) {
      headers['Authorization'] = `Bearer ${token}`
    }
  }
  
  return headers
}

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
  note: Note
  rank: number
  snippet: string
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

export interface AskTimeRange {
  start_date: string | null
  end_date: string | null
  timezone: string | null
  is_confident: boolean
}

export interface AskQueryPlan {
  intent: 'fact_lookup' | 'summary' | 'trend' | 'list' | 'timeline'
  time_range: AskTimeRange | null
  include_tags: string[]
  exclude_tags: string[]
  folder_paths: string[] | null
  keywords: string[]
  semantic_query: string
  result_limit: number
}

export interface AskSource {
  note_id: string
  title: string
  updated_at: string
  tags: string[]
  snippet: string
  score: number
}

export interface AskResponse {
  answer_markdown: string
  query_plan: AskQueryPlan
  sources: AskSource[]
  warnings: string[]
  followups: string[]
  debug?: Record<string, unknown>
}

// ============================================================================
// API Functions
// ============================================================================

/**
 * Transcribe audio and get AI categorization
 */
export async function transcribeAudio(audioBlob: Blob): Promise<TranscriptionResponse> {
  // Map MIME types to file extensions
  const mimeToExt: Record<string, string> = {
    'audio/webm': 'webm',
    'audio/mp4': 'mp4',
    'audio/mpeg': 'mp3',
    'audio/wav': 'wav',
    'audio/ogg': 'ogg',
    'audio/m4a': 'm4a',
  }
  
  // Get file extension from blob type, default to webm
  const baseType = audioBlob.type.split(';')[0].trim()
  const extension = mimeToExt[baseType] || 'webm'
  const filename = `recording.${extension}`
  
  const formData = new FormData()
  formData.append('file', audioBlob, filename)

  const headers = await getAuthHeaders()

  const response = await fetch(`${API_BASE_URL}/api/transcribe`, {
    method: 'POST',
    headers,
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
  const headers = await getAuthHeaders()
  
  const response = await fetch(`${API_BASE_URL}/api/folders`, { headers })

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

  const headers = await getAuthHeaders()
  const response = await fetch(`${API_BASE_URL}/api/notes?${params}`, { headers })

  if (!response.ok) {
    throw new Error('Failed to fetch notes')
  }

  return response.json()
}

/**
 * Get a specific note by ID
 */
export async function fetchNote(noteId: string): Promise<Note> {
  const headers = await getAuthHeaders()
  const response = await fetch(`${API_BASE_URL}/api/notes/${noteId}`, { headers })

  if (!response.ok) {
    throw new Error('Note not found')
  }

  return response.json()
}

/**
 * Delete a note
 */
export async function deleteNote(noteId: string): Promise<void> {
  const headers = await getAuthHeaders()
  const response = await fetch(`${API_BASE_URL}/api/notes/${noteId}`, {
    method: 'DELETE',
    headers,
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
  const headers = await getAuthHeaders()
  const response = await fetch(`${API_BASE_URL}/api/search?${params}`, { headers })

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
  const headers = await getAuthHeaders()
  const response = await fetch(`${API_BASE_URL}/api/tags`, { headers })

  if (!response.ok) {
    throw new Error('Failed to fetch tags')
  }

  const data: TagsResponse = await response.json()
  return data.tags
}

/**
 * Get notes filtered by tag
 */
export async function fetchNotesByTag(tag: string, limit = 50): Promise<Note[]> {
  const headers = await getAuthHeaders()
  const response = await fetch(`${API_BASE_URL}/api/tags/${encodeURIComponent(tag)}/notes?limit=${limit}`, { headers })

  if (!response.ok) {
    throw new Error('Failed to fetch notes by tag')
  }

  const data = await response.json()
  return data.notes
}

/**
 * Generate a smart summary digest
 */
export interface DigestResult {
  summary: string
  key_themes: string[]
  action_items: string[]
  digest_id: string
}

export async function generateSummary(): Promise<DigestResult> {
  const headers = await getAuthHeaders()
  const response = await fetch(`${API_BASE_URL}/api/summarize`, {
    method: 'POST',
    headers,
  })

  if (!response.ok) {
    const errorText = await response.text()
    try {
      const errorJson = JSON.parse(errorText)
      throw new Error(errorJson.error || 'Summarization failed')
    } catch {
      throw new Error('Summarization failed')
    }
  }

  return response.json()
}

/**
 * Ask a natural-language question about your notes (AI planned + hybrid retrieval).
 */
export async function askNotes(query: string, maxResults = 12, debug = false): Promise<AskResponse> {
  const headers = await getAuthHeaders()
  headers['Content-Type'] = 'application/json'

  const response = await fetch(`${API_BASE_URL}/api/ask`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ query, max_results: maxResults, debug }),
  })

  if (!response.ok) {
    const errorText = await response.text()
    try {
      const errorJson = JSON.parse(errorText)
      throw new Error(errorJson.error || 'Ask failed')
    } catch {
      throw new Error('Ask failed')
    }
  }

  return response.json()
}

