import { CalendarCheck } from 'lucide-react'
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
      <div className="border-line bg-surface-muted/30 rounded-xl border border-dashed px-4 py-8 text-center">
        <CalendarCheck className="text-line-strong mx-auto size-6" aria-hidden />
        <p className="text-ink-subtle mt-2 text-[13px]">{emptyMessage}</p>
      </div>
    )
  }

  return (
    <div className="space-y-1.5">
      {todos.map((todo) => (
        <TodoItem key={todo.id} todo={todo} showNoteLink={showNoteLinks} />
      ))}
    </div>
  )
}
