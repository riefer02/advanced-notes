import { useMutation, useQuery, useQueryClient, QueryClient } from '@tanstack/react-query'
import {
  fetchTodos,
  fetchTodo,
  createTodo,
  updateTodo,
  deleteTodo,
  acceptTodo,
  completeTodo,
  dismissTodo,
  fetchNoteTodos,
  acceptNoteTodos,
  type Todo,
} from '../lib/api'
import { queryKeys } from '../lib/queryKeys'

interface TodosParams {
  status?: 'suggested' | 'accepted' | 'completed'
  note_id?: string
  limit?: number
  offset?: number
}

// ============================================================================
// Mutation Factory Helpers
// ============================================================================

/**
 * Shared invalidation logic for todo mutations that return an updated todo.
 */
function invalidateTodoQueries(queryClient: QueryClient, updatedTodo: Todo) {
  queryClient.setQueryData(queryKeys.todos.detail(updatedTodo.id), updatedTodo)
  queryClient.invalidateQueries({ queryKey: queryKeys.todos.all })
  if (updatedTodo.note_id) {
    queryClient.invalidateQueries({ queryKey: queryKeys.todos.forNote(updatedTodo.note_id) })
  }
}

/**
 * Shared invalidation logic for todo delete mutations.
 */
function invalidateDeletedTodoQueries(queryClient: QueryClient, todoId: string) {
  queryClient.removeQueries({ queryKey: queryKeys.todos.detail(todoId) })
  queryClient.invalidateQueries({ queryKey: queryKeys.todos.all })
  queryClient.invalidateQueries({ queryKey: queryKeys.todos.forNotePrefix })
}

export function useTodos(params?: TodosParams) {
  return useQuery({
    queryKey: queryKeys.todos.list(params),
    queryFn: () => fetchTodos(params),
  })
}

export function useTodo(todoId: string) {
  return useQuery({
    queryKey: queryKeys.todos.detail(todoId),
    queryFn: () => fetchTodo(todoId),
    enabled: !!todoId,
  })
}

export function useTodosForNote(noteId: string) {
  return useQuery({
    queryKey: queryKeys.todos.forNote(noteId),
    queryFn: () => fetchNoteTodos(noteId),
    enabled: !!noteId,
  })
}

export function useCreateTodo() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (data: { title: string; description?: string; note_id?: string }) =>
      createTodo(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.todos.all })
    },
  })
}

export function useUpdateTodo() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({
      todoId,
      data,
    }: {
      todoId: string
      data: { title?: string; description?: string }
    }) => updateTodo(todoId, data),
    onSuccess: (updatedTodo: Todo) => invalidateTodoQueries(queryClient, updatedTodo),
  })
}

export function useDeleteTodo() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (todoId: string) => deleteTodo(todoId),
    onSuccess: (_data, todoId) => invalidateDeletedTodoQueries(queryClient, todoId),
  })
}

export function useAcceptTodo() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (todoId: string) => acceptTodo(todoId),
    onSuccess: (updatedTodo: Todo) => invalidateTodoQueries(queryClient, updatedTodo),
  })
}

export function useCompleteTodo() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (todoId: string) => completeTodo(todoId),
    onSuccess: (updatedTodo: Todo) => invalidateTodoQueries(queryClient, updatedTodo),
  })
}

export function useDismissTodo() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (todoId: string) => dismissTodo(todoId),
    onSuccess: (_data, todoId) => invalidateDeletedTodoQueries(queryClient, todoId),
  })
}

export function useAcceptNoteTodos() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ noteId, todoIds }: { noteId: string; todoIds: string[] }) =>
      acceptNoteTodos(noteId, todoIds),
    onSuccess: (_data, { noteId }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.todos.all })
      queryClient.invalidateQueries({ queryKey: queryKeys.todos.forNote(noteId) })
    },
  })
}
