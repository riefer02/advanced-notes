import { Link } from '@tanstack/react-router'
import type { Todo } from '../lib/api'
import { useCompleteTodo, useDeleteTodo, useAcceptTodo } from '../hooks/useTodos'

interface TodoItemProps {
  todo: Todo
  showNoteLink?: boolean
}

export default function TodoItem({ todo, showNoteLink = true }: TodoItemProps) {
  const completeTodo = useCompleteTodo()
  const deleteTodo = useDeleteTodo()
  const acceptTodo = useAcceptTodo()

  const handleComplete = () => {
    if (todo.status === 'suggested') {
      // First accept, then complete
      acceptTodo.mutate(todo.id)
    } else {
      completeTodo.mutate(todo.id)
    }
  }

  const handleDelete = () => {
    if (confirm('Delete this todo?')) {
      deleteTodo.mutate(todo.id)
    }
  }

  const isCompleted = todo.status === 'completed'
  const isSuggested = todo.status === 'suggested'

  return (
    <div
      className={`flex items-start gap-3 p-4 bg-white rounded-lg border ${
        isSuggested
          ? 'border-amber-200 bg-amber-50'
          : isCompleted
            ? 'border-gray-200 bg-gray-50'
            : 'border-gray-200'
      }`}
    >
      {/* Checkbox */}
      <button
        onClick={handleComplete}
        disabled={completeTodo.isPending || acceptTodo.isPending || isCompleted}
        className={`flex-shrink-0 w-5 h-5 mt-0.5 rounded border-2 flex items-center justify-center transition-colors ${
          isCompleted
            ? 'bg-green-500 border-green-500 text-white cursor-default'
            : isSuggested
              ? 'border-amber-400 hover:border-amber-500 hover:bg-amber-50'
              : 'border-gray-300 hover:border-blue-500 hover:bg-blue-50'
        }`}
      >
        {isCompleted && (
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
          </svg>
        )}
      </button>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <p className={`text-sm ${isCompleted ? 'text-gray-500 line-through' : 'text-gray-900'}`}>
          {todo.title}
        </p>
        {todo.description && <p className="text-xs text-gray-500 mt-1">{todo.description}</p>}
        <div className="flex items-center gap-2 mt-2 text-xs">
          {isSuggested && (
            <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 font-medium">
              Suggested
            </span>
          )}
          {showNoteLink && todo.note_id ? (
            <Link
              to="/notes"
              search={{ noteId: todo.note_id }}
              className="text-blue-600 hover:underline"
            >
              View source note
            </Link>
          ) : !todo.note_id ? (
            <span className="text-gray-400">Manual</span>
          ) : null}
          {todo.confidence !== null && (
            <span className="text-gray-400">{Math.round(todo.confidence * 100)}% confidence</span>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="flex-shrink-0">
        {isSuggested && (
          <button
            onClick={() => acceptTodo.mutate(todo.id)}
            disabled={acceptTodo.isPending}
            className="inline-flex items-center px-2.5 py-1 mr-2 text-xs font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50"
          >
            Accept
          </button>
        )}
        <button
          onClick={handleDelete}
          disabled={deleteTodo.isPending}
          className="text-gray-400 hover:text-red-500 transition-colors p-1 disabled:opacity-50"
          title="Delete todo"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
            />
          </svg>
        </button>
      </div>
    </div>
  )
}
