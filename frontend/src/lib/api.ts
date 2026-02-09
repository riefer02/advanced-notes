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
// Generic API Request Helper
// ============================================================================

interface ApiRequestOptions {
  params?: Record<string, string | number | boolean | undefined>
  body?: unknown
}

/**
 * Generic typed API request helper that handles auth, JSON, and error handling.
 *
 * @example
 * const notes = await apiRequest<NotesResponse>('GET', '/api/notes', {
 *   params: { limit: 50, offset: 0 }
 * })
 *
 * const todo = await apiRequest<Todo>('POST', '/api/todos', {
 *   body: { title: 'My todo' }
 * })
 */
export async function apiRequest<T>(
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  endpoint: string,
  options?: ApiRequestOptions
): Promise<T> {
  const headers = new Headers(await getAuthHeaders())

  let url = `${API_BASE_URL}${endpoint}`

  // Add query params for GET requests
  if (options?.params) {
    const searchParams = new URLSearchParams()
    for (const [key, value] of Object.entries(options.params)) {
      if (value !== undefined) {
        searchParams.set(key, String(value))
      }
    }
    const queryString = searchParams.toString()
    if (queryString) {
      url += `?${queryString}`
    }
  }

  const fetchOptions: RequestInit = {
    method,
    headers,
  }

  // Add JSON body for non-GET requests
  if (options?.body && method !== 'GET') {
    headers.set('Content-Type', 'application/json')
    fetchOptions.body = JSON.stringify(options.body)
  }

  const response = await fetch(url, fetchOptions)

  if (!response.ok) {
    const errorText = await response.text()
    let errorMessage: string
    try {
      const errorJson = JSON.parse(errorText)
      errorMessage = errorJson.error || `Request failed: ${response.status}`
    } catch {
      errorMessage = errorText || `Request failed: ${response.status}`
    }
    throw new Error(errorMessage)
  }

  // Handle empty responses (204 No Content)
  if (response.status === 204) {
    return undefined as T
  }

  return response.json()
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
// User Settings Types
// ============================================================================

export interface UserSettings {
  id: string
  user_id: string
  auto_accept_todos: boolean
  created_at: string
  updated_at: string
}

// ============================================================================
// Todo Types
// ============================================================================

export interface Todo {
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

export interface TodosResponse {
  todos: Todo[]
  total: number
  limit: number
  offset: number
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
  const response = await fetch(
    `${API_BASE_URL}/api/tags/${encodeURIComponent(tag)}/notes?limit=${limit}`,
    { headers }
  )

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
export async function askNotes(
  query: string,
  maxResults = 12,
  debug = false
): Promise<AskResponse> {
  const headers = new Headers(await getAuthHeaders())
  headers.set('Content-Type', 'application/json')

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

export async function fetchDigests(limit = 50, offset = 0): Promise<DigestsResponse> {
  const params = new URLSearchParams({ limit: limit.toString(), offset: offset.toString() })
  const headers = await getAuthHeaders()
  const response = await fetch(`${API_BASE_URL}/api/digests?${params}`, { headers })
  if (!response.ok) {
    throw new Error('Failed to fetch digests')
  }
  return response.json()
}

export async function fetchDigest(digestId: string): Promise<DigestHistoryItem> {
  const headers = await getAuthHeaders()
  const response = await fetch(`${API_BASE_URL}/api/digests/${digestId}`, { headers })
  if (!response.ok) {
    throw new Error('Digest not found')
  }
  return response.json()
}

export async function deleteDigest(digestId: string): Promise<void> {
  const headers = await getAuthHeaders()
  const response = await fetch(`${API_BASE_URL}/api/digests/${digestId}`, {
    method: 'DELETE',
    headers,
  })
  if (!response.ok) {
    throw new Error('Failed to delete digest')
  }
}

export async function fetchAskHistory(limit = 50, offset = 0): Promise<AskHistoryResponse> {
  const params = new URLSearchParams({ limit: limit.toString(), offset: offset.toString() })
  const headers = await getAuthHeaders()
  const response = await fetch(`${API_BASE_URL}/api/ask-history?${params}`, { headers })
  if (!response.ok) {
    throw new Error('Failed to fetch ask history')
  }
  return response.json()
}

export async function fetchAskHistoryItem(askId: string): Promise<AskHistoryItem> {
  const headers = await getAuthHeaders()
  const response = await fetch(`${API_BASE_URL}/api/ask-history/${askId}`, { headers })
  if (!response.ok) {
    throw new Error('Ask history item not found')
  }
  return response.json()
}

export async function deleteAskHistoryItem(askId: string): Promise<void> {
  const headers = await getAuthHeaders()
  const response = await fetch(`${API_BASE_URL}/api/ask-history/${askId}`, {
    method: 'DELETE',
    headers,
  })
  if (!response.ok) {
    throw new Error('Failed to delete ask history item')
  }
}

// ============================================================================
// User Settings API Functions
// ============================================================================

export async function fetchUserSettings(): Promise<UserSettings> {
  const headers = await getAuthHeaders()
  const response = await fetch(`${API_BASE_URL}/api/settings`, { headers })
  if (!response.ok) {
    throw new Error('Failed to fetch settings')
  }
  return response.json()
}

export async function updateUserSettings(settings: {
  auto_accept_todos?: boolean
}): Promise<UserSettings> {
  const headers = new Headers(await getAuthHeaders())
  headers.set('Content-Type', 'application/json')

  const response = await fetch(`${API_BASE_URL}/api/settings`, {
    method: 'PUT',
    headers,
    body: JSON.stringify(settings),
  })
  if (!response.ok) {
    throw new Error('Failed to update settings')
  }
  return response.json()
}

// ============================================================================
// Todo API Functions
// ============================================================================

export async function fetchTodos(params?: {
  status?: 'suggested' | 'accepted' | 'completed'
  note_id?: string
  limit?: number
  offset?: number
}): Promise<TodosResponse> {
  const searchParams = new URLSearchParams()
  if (params?.status) searchParams.set('status', params.status)
  if (params?.note_id) searchParams.set('note_id', params.note_id)
  if (params?.limit !== undefined) searchParams.set('limit', params.limit.toString())
  if (params?.offset !== undefined) searchParams.set('offset', params.offset.toString())

  const headers = await getAuthHeaders()
  const url = `${API_BASE_URL}/api/todos${searchParams.toString() ? '?' + searchParams.toString() : ''}`
  const response = await fetch(url, { headers })
  if (!response.ok) {
    throw new Error('Failed to fetch todos')
  }
  return response.json()
}

export async function fetchTodo(todoId: string): Promise<Todo> {
  const headers = await getAuthHeaders()
  const response = await fetch(`${API_BASE_URL}/api/todos/${todoId}`, { headers })
  if (!response.ok) {
    throw new Error('Todo not found')
  }
  return response.json()
}

export async function createTodo(data: {
  title: string
  description?: string
  note_id?: string
}): Promise<Todo> {
  const headers = new Headers(await getAuthHeaders())
  headers.set('Content-Type', 'application/json')

  const response = await fetch(`${API_BASE_URL}/api/todos`, {
    method: 'POST',
    headers,
    body: JSON.stringify(data),
  })
  if (!response.ok) {
    throw new Error('Failed to create todo')
  }
  return response.json()
}

export async function updateTodo(
  todoId: string,
  data: {
    title?: string
    description?: string
  }
): Promise<Todo> {
  const headers = new Headers(await getAuthHeaders())
  headers.set('Content-Type', 'application/json')

  const response = await fetch(`${API_BASE_URL}/api/todos/${todoId}`, {
    method: 'PUT',
    headers,
    body: JSON.stringify(data),
  })
  if (!response.ok) {
    throw new Error('Failed to update todo')
  }
  return response.json()
}

export async function deleteTodo(todoId: string): Promise<void> {
  const headers = await getAuthHeaders()
  const response = await fetch(`${API_BASE_URL}/api/todos/${todoId}`, {
    method: 'DELETE',
    headers,
  })
  if (!response.ok) {
    throw new Error('Failed to delete todo')
  }
}

export async function acceptTodo(todoId: string): Promise<Todo> {
  const headers = await getAuthHeaders()
  const response = await fetch(`${API_BASE_URL}/api/todos/${todoId}/accept`, {
    method: 'POST',
    headers,
  })
  if (!response.ok) {
    throw new Error('Failed to accept todo')
  }
  return response.json()
}

export async function completeTodo(todoId: string): Promise<Todo> {
  const headers = await getAuthHeaders()
  const response = await fetch(`${API_BASE_URL}/api/todos/${todoId}/complete`, {
    method: 'POST',
    headers,
  })
  if (!response.ok) {
    throw new Error('Failed to complete todo')
  }
  return response.json()
}

export async function dismissTodo(todoId: string): Promise<void> {
  const headers = await getAuthHeaders()
  const response = await fetch(`${API_BASE_URL}/api/todos/${todoId}/dismiss`, {
    method: 'POST',
    headers,
  })
  if (!response.ok) {
    throw new Error('Failed to dismiss todo')
  }
}

export async function fetchNoteTodos(noteId: string): Promise<{ todos: Todo[] }> {
  const headers = await getAuthHeaders()
  const response = await fetch(`${API_BASE_URL}/api/notes/${noteId}/todos`, { headers })
  if (!response.ok) {
    throw new Error('Failed to fetch note todos')
  }
  return response.json()
}

export async function acceptNoteTodos(
  noteId: string,
  todoIds: string[]
): Promise<{ accepted: number }> {
  const headers = new Headers(await getAuthHeaders())
  headers.set('Content-Type', 'application/json')

  const response = await fetch(`${API_BASE_URL}/api/notes/${noteId}/todos/accept`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ todo_ids: todoIds }),
  })
  if (!response.ok) {
    throw new Error('Failed to accept todos')
  }
  return response.json()
}

// ============================================================================
// Meal Tracking Types
// ============================================================================

export type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack'

export interface MealItem {
  id: string
  user_id: string
  meal_entry_id: string
  name: string
  portion: string | null
  confidence: number | null
  created_at: string
}

export interface MealEntry {
  id: string
  user_id: string
  meal_type: MealType
  meal_date: string
  meal_time: string | null
  transcription: string
  confidence: number | null
  transcription_duration: number | null
  model_version: string | null
  items: MealItem[]
  created_at: string
  updated_at: string
}

export interface MealTranscriptionMeta {
  device: string
  model: string
  sample_rate?: number
  duration?: number
}

export interface MealTranscriptionResponse {
  text: string
  meta: MealTranscriptionMeta
  audio: {
    clip_id: string
    storage_key: string
  }
  meal: MealEntry | null
  extraction: {
    confidence: number
    reasoning: string
  }
}

export interface MealsResponse {
  meals: MealEntry[]
  total: number
  limit: number
  offset: number
}

export interface MealsCalendarEntry {
  id: string
  meal_type: MealType
  item_count: number
  user_id?: string
}

export interface MealsCalendarResponse {
  calendar: Record<string, MealsCalendarEntry[]>
  year: number
  month: number
}

// ============================================================================
// Meal Tracking API Functions
// ============================================================================

/**
 * Transcribe audio and extract meal data
 */
export async function transcribeMeal(audioBlob: Blob): Promise<MealTranscriptionResponse> {
  const mimeToExt: Record<string, string> = {
    'audio/webm': 'webm',
    'audio/mp4': 'mp4',
    'audio/mpeg': 'mp3',
    'audio/wav': 'wav',
    'audio/ogg': 'ogg',
    'audio/m4a': 'm4a',
  }

  const baseType = audioBlob.type.split(';')[0].trim()
  const extension = mimeToExt[baseType] || 'webm'
  const filename = `meal-recording.${extension}`

  const formData = new FormData()
  formData.append('file', audioBlob, filename)

  const headers = await getAuthHeaders()

  const response = await fetch(`${API_BASE_URL}/api/meals/transcribe`, {
    method: 'POST',
    headers,
    body: formData,
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(error || 'Meal transcription failed')
  }

  return response.json()
}

/**
 * List meals within a date range
 */
export async function fetchMeals(params: {
  start_date: string
  end_date: string
  meal_type?: MealType
  limit?: number
  offset?: number
  calendar_owner?: string
}): Promise<MealsResponse> {
  return apiRequest<MealsResponse>('GET', '/api/meals', { params })
}

/**
 * Get meals for calendar view
 */
export async function fetchMealsCalendar(
  year: number,
  month: number,
  calendarOwner?: string
): Promise<MealsCalendarResponse> {
  return apiRequest<MealsCalendarResponse>('GET', '/api/meals/calendar', {
    params: { year, month, calendar_owner: calendarOwner },
  })
}

/**
 * Get a specific meal by ID
 */
export async function fetchMeal(mealId: string): Promise<MealEntry> {
  return apiRequest<MealEntry>('GET', `/api/meals/${mealId}`)
}

/**
 * Update a meal entry
 */
export async function updateMeal(
  mealId: string,
  data: {
    meal_type?: MealType
    meal_date?: string
    meal_time?: string
    transcription?: string
  }
): Promise<MealEntry> {
  return apiRequest<MealEntry>('PUT', `/api/meals/${mealId}`, { body: data })
}

/**
 * Delete a meal entry
 */
export async function deleteMeal(mealId: string): Promise<void> {
  await apiRequest<{ success: boolean }>('DELETE', `/api/meals/${mealId}`)
}

/**
 * Add a food item to a meal
 */
export async function addMealItem(
  mealId: string,
  data: { name: string; portion?: string }
): Promise<MealItem> {
  return apiRequest<MealItem>('POST', `/api/meals/${mealId}/items`, { body: data })
}

/**
 * Update a food item
 */
export async function updateMealItem(
  mealId: string,
  itemId: string,
  data: { name?: string; portion?: string }
): Promise<MealItem> {
  return apiRequest<MealItem>('PUT', `/api/meals/${mealId}/items/${itemId}`, { body: data })
}

/**
 * Delete a food item
 */
export async function deleteMealItem(mealId: string, itemId: string): Promise<void> {
  await apiRequest<{ success: boolean }>('DELETE', `/api/meals/${mealId}/items/${itemId}`)
}

// ============================================================================
// Vinyl Collection Types
// ============================================================================

export interface VinylTrack {
  id: string
  user_id: string
  vinyl_record_id: string
  side: string | null
  position: number | null
  title: string
  duration: string | null
  created_at: string
}

export interface VinylImage {
  id: string
  user_id: string
  vinyl_record_id: string
  image_type: string
  storage_key: string
  mime_type: string
  bytes: number
  status: string
  created_at: string
}

export interface VinylRecord {
  id: string
  user_id: string
  artist: string
  album_title: string
  release_year: number | null
  genre: string[]
  label: string | null
  catalog_number: string | null
  format: string | null
  pressing_country: string | null
  color: string | null
  condition: string | null
  notes: string | null
  extraction_status: string
  extraction_confidence: number | null
  cover_image_id: string | null
  cover_image_url: string | null
  tracks: VinylTrack[]
  images: VinylImage[]
  created_at: string
  updated_at: string
}

export interface VinylRecordsResponse {
  records: VinylRecord[]
  total: number
  limit: number
  offset: number
}

export interface VinylStatsResponse {
  total_records: number
  total_artists: number
}

export interface VinylSearchResponse {
  records: VinylRecord[]
  query: string
  total: number
}

export interface VinylExtractionResult {
  artist: string
  album_title: string
  release_year: number | null
  genre: string[]
  label: string | null
  catalog_number: string | null
  format: string | null
  pressing_country: string | null
  tracks: { side: string | null; position: number | null; title: string; duration: string | null }[]
  confidence: number
  reasoning: string
}

export interface VinylImageUploadResponse {
  image: VinylImage
}

// ============================================================================
// Vinyl Collection API Functions
// ============================================================================

export async function fetchVinylRecords(params?: {
  genre?: string
  decade?: number
  format?: string
  search?: string
  sort_by?: string
  limit?: number
  offset?: number
  owner?: string
}): Promise<VinylRecordsResponse> {
  return apiRequest<VinylRecordsResponse>('GET', '/api/vinyl', { params })
}

export async function fetchVinylRecord(recordId: string, owner?: string): Promise<VinylRecord> {
  return apiRequest<VinylRecord>('GET', `/api/vinyl/${recordId}`, {
    params: owner ? { owner } : undefined,
  })
}

export async function createVinylRecord(data: {
  artist: string
  album_title: string
  release_year?: number
  genre?: string[]
  label?: string
  catalog_number?: string
  format?: string
  pressing_country?: string
  color?: string
  condition?: string
  notes?: string
}): Promise<VinylRecord> {
  return apiRequest<VinylRecord>('POST', '/api/vinyl', { body: data })
}

export async function updateVinylRecord(
  recordId: string,
  data: {
    artist?: string
    album_title?: string
    release_year?: number
    genre?: string[]
    label?: string
    catalog_number?: string
    format?: string
    pressing_country?: string
    color?: string
    condition?: string
    notes?: string
    extraction_status?: string
    extraction_confidence?: number
    cover_image_id?: string
    tracks?: { side?: string; position?: number; title: string; duration?: string }[]
  }
): Promise<VinylRecord> {
  return apiRequest<VinylRecord>('PUT', `/api/vinyl/${recordId}`, { body: data })
}

export async function deleteVinylRecord(recordId: string): Promise<void> {
  await apiRequest<{ success: boolean }>('DELETE', `/api/vinyl/${recordId}`)
}

export async function fetchVinylStats(owner?: string): Promise<VinylStatsResponse> {
  return apiRequest<VinylStatsResponse>('GET', '/api/vinyl/stats', {
    params: owner ? { owner } : undefined,
  })
}

export async function searchVinylRecords(
  query: string,
  limit?: number,
  offset?: number,
  owner?: string
): Promise<VinylSearchResponse> {
  return apiRequest<VinylSearchResponse>('GET', '/api/vinyl/search', {
    params: { q: query, limit, offset, owner },
  })
}

export async function uploadVinylImage(
  recordId: string,
  file: File,
  imageType: string = 'other'
): Promise<VinylImageUploadResponse> {
  const formData = new FormData()
  formData.append('file', file)
  formData.append('image_type', imageType)

  const headers = await getAuthHeaders()
  const response = await fetch(`${API_BASE_URL}/api/vinyl/${recordId}/images`, {
    method: 'POST',
    headers,
    body: formData,
  })
  if (!response.ok) {
    const err = await response.json().catch(() => ({ error: 'Image upload failed' }))
    throw new Error(err.error || 'Image upload failed')
  }
  return response.json()
}

export async function getVinylImageUrl(
  recordId: string,
  imageId: string,
  owner?: string
): Promise<{ url: string; expires_at: string }> {
  return apiRequest<{ url: string; expires_at: string }>(
    'GET',
    `/api/vinyl/${recordId}/images/${imageId}/url`,
    { params: owner ? { owner } : undefined }
  )
}

export async function deleteVinylImage(recordId: string, imageId: string): Promise<void> {
  await apiRequest<{ success: boolean }>('DELETE', `/api/vinyl/${recordId}/images/${imageId}`)
}

export async function extractVinylMetadata(recordId: string): Promise<VinylExtractionResult> {
  return apiRequest<VinylExtractionResult>('POST', `/api/vinyl/${recordId}/extract`)
}

export async function extractVinylFromPhotos(files: File[]): Promise<VinylExtractionResult> {
  const formData = new FormData()
  files.forEach((f) => formData.append('images', f))

  const headers = await getAuthHeaders()
  const response = await fetch(`${API_BASE_URL}/api/vinyl/extract-photos`, {
    method: 'POST',
    headers,
    body: formData,
  })

  if (!response.ok) {
    const err = await response.json().catch(() => ({ error: 'Extraction failed' }))
    throw new Error(err.error || 'Extraction failed')
  }

  return response.json()
}

// ============================================================================
// Sharing & Collaboration Types
// ============================================================================

export interface UserProfile {
  id: string
  user_id: string
  display_name: string
  username: string | null
  email: string | null
  avatar_url: string | null
  bio: string | null
  discoverable: boolean
  created_at: string
  updated_at: string
}

export interface Friendship {
  id: string
  requester_id: string
  addressee_id: string
  status: 'pending' | 'accepted' | 'declined'
  requester_profile?: UserProfile
  addressee_profile?: UserProfile
  created_at: string
  updated_at: string
}

export interface ResourceShare {
  id: string
  owner_id: string
  shared_with_id: string
  resource_type: string
  permission: 'view' | 'edit'
  status: 'pending' | 'accepted' | 'declined' | 'revoked'
  owner_profile?: UserProfile
  shared_with_profile?: UserProfile
  created_at: string
  updated_at: string
}

export interface FriendsListResponse {
  friends: Friendship[]
}

export interface FriendRequestsResponse {
  requests: Friendship[]
}

export interface SentRequestsResponse {
  sent: Friendship[]
}

export interface SharesResponse {
  owned: ResourceShare[]
  received: ResourceShare[]
}

export interface ReceivedSharesResponse {
  received: ResourceShare[]
}

export interface UserSearchResponse {
  users: UserProfile[]
}

// ============================================================================
// Feedback Types
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
// Feedback API Functions
// ============================================================================

/**
 * Submit user feedback
 */
export async function submitFeedback(data: {
  feedback_type: FeedbackType
  title: string
  description?: string
  rating?: number
}): Promise<Feedback> {
  return apiRequest<Feedback>('POST', '/api/feedback', { body: data })
}

/**
 * List user's feedback submissions
 */
export async function fetchFeedback(params?: {
  limit?: number
  offset?: number
}): Promise<FeedbackListResponse> {
  return apiRequest<FeedbackListResponse>('GET', '/api/feedback', { params })
}

// ============================================================================
// Profile API Functions
// ============================================================================

export async function fetchMyProfile(): Promise<UserProfile> {
  return apiRequest<UserProfile>('GET', '/api/profile')
}

export async function updateProfile(data: {
  display_name?: string
  username?: string | null
  bio?: string
  discoverable?: boolean
}): Promise<UserProfile> {
  return apiRequest<UserProfile>('PUT', '/api/profile', { body: data })
}

export async function fetchUserProfile(userId: string): Promise<UserProfile> {
  return apiRequest<UserProfile>('GET', `/api/users/${userId}/profile`)
}

export async function uploadAvatar(file: File): Promise<UserProfile> {
  const headers = new Headers(await getAuthHeaders())
  const formData = new FormData()
  formData.append('file', file)

  const response = await fetch(`${API_BASE_URL}/api/profile/avatar`, {
    method: 'PUT',
    headers,
    body: formData,
  })

  if (!response.ok) {
    const errorText = await response.text()
    let errorMessage: string
    try {
      const errorJson = JSON.parse(errorText)
      errorMessage = errorJson.error || `Upload failed: ${response.status}`
    } catch {
      errorMessage = errorText || `Upload failed: ${response.status}`
    }
    throw new Error(errorMessage)
  }

  return response.json()
}

export async function deleteAvatar(): Promise<UserProfile> {
  return apiRequest<UserProfile>('DELETE', '/api/profile/avatar')
}

export async function checkUsernameAvailable(
  username: string
): Promise<{ available: boolean; reason?: string }> {
  return apiRequest<{ available: boolean; reason?: string }>(
    'GET',
    '/api/profile/username-available',
    { params: { username } }
  )
}

// ============================================================================
// Friends API Functions
// ============================================================================

export async function fetchFriends(): Promise<FriendsListResponse> {
  return apiRequest<FriendsListResponse>('GET', '/api/friends')
}

export async function fetchFriendRequests(): Promise<FriendRequestsResponse> {
  return apiRequest<FriendRequestsResponse>('GET', '/api/friends/requests')
}

export async function fetchSentRequests(): Promise<SentRequestsResponse> {
  return apiRequest<SentRequestsResponse>('GET', '/api/friends/sent')
}

export async function sendFriendRequest(userId: string): Promise<Friendship> {
  return apiRequest<Friendship>('POST', '/api/friends/request', {
    body: { user_id: userId },
  })
}

export async function acceptFriendRequest(friendshipId: string): Promise<Friendship> {
  return apiRequest<Friendship>('POST', `/api/friends/${friendshipId}/accept`)
}

export async function declineFriendRequest(friendshipId: string): Promise<Friendship> {
  return apiRequest<Friendship>('POST', `/api/friends/${friendshipId}/decline`)
}

export async function removeFriend(friendshipId: string): Promise<void> {
  await apiRequest<{ success: boolean }>('DELETE', `/api/friends/${friendshipId}`)
}

export async function searchUsers(query: string): Promise<UserSearchResponse> {
  return apiRequest<UserSearchResponse>('GET', '/api/friends/search', {
    params: { q: query },
  })
}

// ============================================================================
// Shares API Functions
// ============================================================================

export async function createShare(data: {
  shared_with_id: string
  resource_type: string
  permission: 'view' | 'edit'
}): Promise<ResourceShare> {
  return apiRequest<ResourceShare>('POST', '/api/shares', { body: data })
}

export async function fetchShares(): Promise<SharesResponse> {
  return apiRequest<SharesResponse>('GET', '/api/shares')
}

export async function fetchReceivedShares(): Promise<ReceivedSharesResponse> {
  return apiRequest<ReceivedSharesResponse>('GET', '/api/shares/received')
}

export async function acceptShare(shareId: string): Promise<ResourceShare> {
  return apiRequest<ResourceShare>('POST', `/api/shares/${shareId}/accept`)
}

export async function declineShare(shareId: string): Promise<ResourceShare> {
  return apiRequest<ResourceShare>('POST', `/api/shares/${shareId}/decline`)
}

export async function revokeShare(shareId: string): Promise<void> {
  await apiRequest<{ success: boolean }>('DELETE', `/api/shares/${shareId}`)
}
