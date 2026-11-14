import { Check, X } from 'lucide-react'
import {
  useTodosForNote,
  useAcceptTodo,
  useDismissTodo,
  useAcceptNoteTodos,
} from '../hooks/useTodos'
import type { Todo } from '../lib/api'
import { Button } from '@/components/ui/button'

interface SuggestedTodosProps {
  noteId: string
}

export default function SuggestedTodos({ noteId }: SuggestedTodosProps) {
  const { data, isLoading } = useTodosForNote(noteId)
  const acceptTodo = useAcceptTodo()
  const dismissTodo = useDismissTodo()
  const acceptAllTodos = useAcceptNoteTodos()

  if (isLoading) {
    return <div className="text-ink-subtle text-xs">Loading suggested todos…</div>
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
    <div className="border-line space-y-2 border-t pt-4">
      <div className="flex items-center justify-between gap-3">
        <span className="section-label">Suggested todos · {suggestedTodos.length}</span>
        {suggestedTodos.length > 1 && (
          <Button
            variant="ghost"
            size="xs"
            onClick={handleAcceptAll}
            disabled={acceptAllTodos.isPending}
          >
            Accept all
          </Button>
        )}
      </div>

      <div className="space-y-1.5">
        {suggestedTodos.map((todo: Todo) => (
          <div
            key={todo.id}
            className="border-line bg-surface-muted/60 group flex items-start gap-2.5 rounded-lg border px-2.5 py-2"
          >
            <div className="min-w-0 flex-1">
              <p className="text-ink text-[13px] leading-5">{todo.title}</p>
              {(todo.description || todo.confidence !== null) && (
                <p className="text-ink-subtle mt-0.5 truncate text-[11px] leading-4">
                  {todo.description || `${Math.round((todo.confidence ?? 0) * 100)}% confidence`}
                </p>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label={`Accept ${todo.title}`}
                onClick={() => handleAccept(todo.id)}
                disabled={acceptTodo.isPending}
                className="text-positive hover:bg-positive-soft hover:text-positive"
              >
                <Check />
              </Button>
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label={`Dismiss ${todo.title}`}
                onClick={() => handleDismiss(todo.id)}
                disabled={dismissTodo.isPending}
                className="text-ink-subtle hover:bg-surface-muted hover:text-ink"
              >
                <X />
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
