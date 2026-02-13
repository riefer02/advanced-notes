/**
 * Todo API types and functions.
 */
import { apiRequest } from './core'

// ============================================================================
// Types
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

export async function fetchTodos(params?: {
  status?: 'suggested' | 'accepted' | 'completed'
  note_id?: string
  limit?: number
  offset?: number
}): Promise<TodosResponse> {
  return apiRequest<TodosResponse>('GET', '/api/todos', { params })
}

export async function fetchTodo(todoId: string): Promise<Todo> {
  return apiRequest<Todo>('GET', `/api/todos/${todoId}`)
}

export async function createTodo(data: {
  title: string
  description?: string
  note_id?: string
}): Promise<Todo> {
  return apiRequest<Todo>('POST', '/api/todos', { body: data })
}

export async function updateTodo(
  todoId: string,
  data: {
    title?: string
    description?: string
  }
): Promise<Todo> {
  return apiRequest<Todo>('PUT', `/api/todos/${todoId}`, { body: data })
}

export async function deleteTodo(todoId: string): Promise<void> {
  await apiRequest<{ success: boolean }>('DELETE', `/api/todos/${todoId}`)
}

export async function acceptTodo(todoId: string): Promise<Todo> {
  return apiRequest<Todo>('POST', `/api/todos/${todoId}/accept`)
}

export async function completeTodo(todoId: string): Promise<Todo> {
  return apiRequest<Todo>('POST', `/api/todos/${todoId}/complete`)
}

export async function dismissTodo(todoId: string): Promise<void> {
  await apiRequest<{ success: boolean }>('POST', `/api/todos/${todoId}/dismiss`)
}

export async function fetchNoteTodos(noteId: string): Promise<{ todos: Todo[] }> {
  return apiRequest<{ todos: Todo[] }>('GET', `/api/notes/${noteId}/todos`)
}

export async function acceptNoteTodos(
  noteId: string,
  todoIds: string[]
): Promise<{ accepted: number }> {
  return apiRequest<{ accepted: number }>('POST', `/api/notes/${noteId}/todos/accept`, {
    body: { todo_ids: todoIds },
  })
}
