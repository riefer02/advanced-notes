/**
 * Notes, search, ask, digests, and ask history API.
 */
import { apiRequest, apiUpload, audioFormData } from './core'

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

export interface ExtractedTodo {
  id: string
  user_id: string
  note_id: string | null
  title: string
  description: string | null
  status: 'suggested' | 'accepted' | 'completed'
  confidence: number | null
  extraction_context: string | null
  created_at: string
  updated_at: string
  completed_at: string | null
}

export interface TranscriptionResponse {
  text: string
  meta: TranscriptionMeta
  categorization: CategoryResult
  todos: ExtractedTodo[]
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
  ask_id: string
  debug?: Record<string, unknown>
}

export interface DigestResult {
  summary: string
  key_themes: string[]
  action_items: string[]
  digest_id: string
}

export interface DigestHistoryItem {
  id: string
  user_id: string
  content: string
  created_at: string
}

export interface DigestsResponse {
  digests: DigestHistoryItem[]
  total: number
  limit: number
  offset: number
}

export interface AskHistoryItem {
  id: string
  user_id: string
  query: string
  query_plan_json: string
  answer_markdown: string
  cited_note_ids_json: string
  source_scores_json: string | null
  created_at: string
}

export interface AskHistoryResponse {
  items: AskHistoryItem[]
  total: number
  limit: number
  offset: number
}

// ============================================================================
// API Functions
// ============================================================================

export async function transcribeAudio(audioBlob: Blob): Promise<TranscriptionResponse> {
  return apiUpload<TranscriptionResponse>('/api/transcribe', audioFormData(audioBlob, 'recording'))
}

export async function fetchFolders(): Promise<FolderNode> {
  const data = await apiRequest<FolderTree>('GET', '/api/folders')
  return data.folders
}

export async function fetchNotes(folder?: string, limit = 50, offset = 0): Promise<NotesResponse> {
  return apiRequest<NotesResponse>('GET', '/api/notes', {
    params: { folder, limit, offset },
  })
}

export async function fetchNote(noteId: string): Promise<Note> {
  return apiRequest<Note>('GET', `/api/notes/${noteId}`)
}

export async function deleteNote(noteId: string): Promise<void> {
  await apiRequest<{ success: boolean }>('DELETE', `/api/notes/${noteId}`)
}

export async function searchNotes(query: string): Promise<SearchResult[]> {
  if (!query.trim()) {
    return []
  }
  const data = await apiRequest<SearchResponse>('GET', '/api/search', { params: { q: query } })
  return data.results
}

export async function fetchTags(): Promise<string[]> {
  const data = await apiRequest<TagsResponse>('GET', '/api/tags')
  return data.tags
}

export async function fetchNotesByTag(tag: string, limit = 50): Promise<Note[]> {
  const data = await apiRequest<{ notes: Note[] }>(
    'GET',
    `/api/tags/${encodeURIComponent(tag)}/notes`,
    { params: { limit } }
  )
  return data.notes
}

export async function generateSummary(): Promise<DigestResult> {
  return apiRequest<DigestResult>('POST', '/api/summarize')
}

export async function askNotes(
  query: string,
  maxResults = 12,
  debug = false
): Promise<AskResponse> {
  return apiRequest<AskResponse>('POST', '/api/ask', {
    body: { query, max_results: maxResults, debug },
  })
}

export async function fetchDigests(limit = 50, offset = 0): Promise<DigestsResponse> {
  return apiRequest<DigestsResponse>('GET', '/api/digests', { params: { limit, offset } })
}

export async function fetchDigest(digestId: string): Promise<DigestHistoryItem> {
  return apiRequest<DigestHistoryItem>('GET', `/api/digests/${digestId}`)
}

export async function deleteDigest(digestId: string): Promise<void> {
  await apiRequest<{ success: boolean }>('DELETE', `/api/digests/${digestId}`)
}

export async function fetchAskHistory(limit = 50, offset = 0): Promise<AskHistoryResponse> {
  return apiRequest<AskHistoryResponse>('GET', '/api/ask-history', { params: { limit, offset } })
}

export async function fetchAskHistoryItem(askId: string): Promise<AskHistoryItem> {
  return apiRequest<AskHistoryItem>('GET', `/api/ask-history/${askId}`)
}

export async function deleteAskHistoryItem(askId: string): Promise<void> {
  await apiRequest<{ success: boolean }>('DELETE', `/api/ask-history/${askId}`)
}
