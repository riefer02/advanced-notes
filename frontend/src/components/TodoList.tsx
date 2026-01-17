import type { Todo } from '../lib/api'
import TodoItem from './TodoItem'

interface TodoListProps {
  todos: Todo[]
  emptyMessage?: string
  showNoteLinks?: boolean
}

export default function TodoList({
  todos,
  emptyMessage = 'No todos found.',
  showNoteLinks = true,
}: TodoListProps) {
  if (todos.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500">
        <svg
          className="mx-auto h-12 w-12 text-gray-300 mb-4"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"
          />
        </svg>
        <p className="text-sm">{emptyMessage}</p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {todos.map((todo) => (
        <TodoItem key={todo.id} todo={todo} showNoteLink={showNoteLinks} />
      ))}
    </div>
  )
}
