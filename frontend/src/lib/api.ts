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
}): Promise<MealsResponse> {
  return apiRequest<MealsResponse>('GET', '/api/meals', { params })
}

/**
 * Get meals for calendar view
 */
export async function fetchMealsCalendar(
  year: number,
  month: number
): Promise<MealsCalendarResponse> {
  return apiRequest<MealsCalendarResponse>('GET', '/api/meals/calendar', {
    params: { year, month },
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
