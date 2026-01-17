import { useTodosForNote, useAcceptTodo, useDismissTodo, useAcceptNoteTodos } from '../hooks/useTodos'
import type { Todo } from '../lib/api'

interface SuggestedTodosProps {
  noteId: string
}

export default function SuggestedTodos({ noteId }: SuggestedTodosProps) {
  const { data, isLoading } = useTodosForNote(noteId)
  const acceptTodo = useAcceptTodo()
  const dismissTodo = useDismissTodo()
  const acceptAllTodos = useAcceptNoteTodos()

  if (isLoading) {
    return (
      <div className="text-sm text-gray-500">Loading todos...</div>
    )
  }

  const suggestedTodos = data?.todos.filter((t: Todo) => t.status === 'suggested') || []

  if (suggestedTodos.length === 0) {
    return null
  }

  const handleAccept = (todoId: string) => {
    acceptTodo.mutate(todoId)
  }

  const handleDismiss = (todoId: string) => {
    dismissTodo.mutate(todoId)
  }

  const handleAcceptAll = () => {
    const todoIds = suggestedTodos.map((t: Todo) => t.id)
    acceptAllTodos.mutate({ noteId, todoIds })
  }

  return (
    <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <svg className="h-5 w-5 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
          </svg>
          <h3 className="text-sm font-semibold text-amber-900">
            Suggested Todos ({suggestedTodos.length})
          </h3>
        </div>
        {suggestedTodos.length > 1 && (
          <button
            onClick={handleAcceptAll}
            disabled={acceptAllTodos.isPending}
            className="text-xs font-medium text-amber-700 hover:text-amber-900 hover:underline disabled:opacity-50"
          >
            Accept All
          </button>
        )}
      </div>

      <div className="space-y-2">
        {suggestedTodos.map((todo: Todo) => (
          <div
            key={todo.id}
            className="flex items-start gap-3 bg-white rounded-md p-3 border border-amber-100"
          >
            <div className="flex-1 min-w-0">
              <p className="text-sm text-gray-900">{todo.title}</p>
              {todo.description && (
                <p className="text-xs text-gray-500 mt-1">{todo.description}</p>
              )}
              {todo.confidence !== null && (
                <p className="text-xs text-amber-600 mt-1">
                  {Math.round(todo.confidence * 100)}% confidence
                </p>
              )}
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <button
                onClick={() => handleAccept(todo.id)}
                disabled={acceptTodo.isPending}
                className="inline-flex items-center px-2.5 py-1 text-xs font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50"
              >
                Accept
              </button>
              <button
                onClick={() => handleDismiss(todo.id)}
                disabled={dismissTodo.isPending}
                className="inline-flex items-center px-2.5 py-1 text-xs font-medium rounded-md text-gray-600 bg-gray-100 hover:bg-gray-200 disabled:opacity-50"
              >
                Dismiss
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
