import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
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

interface TodosParams {
  status?: 'suggested' | 'accepted' | 'completed'
  note_id?: string
  limit?: number
  offset?: number
}

export function useTodos(params?: TodosParams) {
  return useQuery({
    queryKey: ['todos', params],
    queryFn: () => fetchTodos(params),
  })
}

export function useTodo(todoId: string) {
  return useQuery({
    queryKey: ['todo', todoId],
    queryFn: () => fetchTodo(todoId),
    enabled: !!todoId,
  })
}

export function useTodosForNote(noteId: string) {
  return useQuery({
    queryKey: ['noteTodos', noteId],
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
      queryClient.invalidateQueries({ queryKey: ['todos'] })
    },
  })
}

export function useUpdateTodo() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ todoId, data }: { todoId: string; data: { title?: string; description?: string } }) =>
      updateTodo(todoId, data),
    onSuccess: (updatedTodo: Todo) => {
      queryClient.setQueryData(['todo', updatedTodo.id], updatedTodo)
      queryClient.invalidateQueries({ queryKey: ['todos'] })
      if (updatedTodo.note_id) {
        queryClient.invalidateQueries({ queryKey: ['noteTodos', updatedTodo.note_id] })
      }
    },
  })
}

export function useDeleteTodo() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (todoId: string) => deleteTodo(todoId),
    onSuccess: (_data, todoId) => {
      queryClient.removeQueries({ queryKey: ['todo', todoId] })
      queryClient.invalidateQueries({ queryKey: ['todos'] })
      queryClient.invalidateQueries({ queryKey: ['noteTodos'] })
    },
  })
}

export function useAcceptTodo() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (todoId: string) => acceptTodo(todoId),
    onSuccess: (updatedTodo: Todo) => {
      queryClient.setQueryData(['todo', updatedTodo.id], updatedTodo)
      queryClient.invalidateQueries({ queryKey: ['todos'] })
      if (updatedTodo.note_id) {
        queryClient.invalidateQueries({ queryKey: ['noteTodos', updatedTodo.note_id] })
      }
    },
  })
}

export function useCompleteTodo() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (todoId: string) => completeTodo(todoId),
    onSuccess: (updatedTodo: Todo) => {
      queryClient.setQueryData(['todo', updatedTodo.id], updatedTodo)
      queryClient.invalidateQueries({ queryKey: ['todos'] })
      if (updatedTodo.note_id) {
        queryClient.invalidateQueries({ queryKey: ['noteTodos', updatedTodo.note_id] })
      }
    },
  })
}

export function useDismissTodo() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (todoId: string) => dismissTodo(todoId),
    onSuccess: (_data, todoId) => {
      queryClient.removeQueries({ queryKey: ['todo', todoId] })
      queryClient.invalidateQueries({ queryKey: ['todos'] })
      queryClient.invalidateQueries({ queryKey: ['noteTodos'] })
    },
  })
}

export function useAcceptNoteTodos() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ noteId, todoIds }: { noteId: string; todoIds: string[] }) =>
      acceptNoteTodos(noteId, todoIds),
    onSuccess: (_data, { noteId }) => {
      queryClient.invalidateQueries({ queryKey: ['todos'] })
      queryClient.invalidateQueries({ queryKey: ['noteTodos', noteId] })
    },
  })
}
