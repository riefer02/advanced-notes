import { Link } from '@tanstack/react-router'
import { Check, Trash2 } from 'lucide-react'
import type { Todo } from '../lib/api'
import { useCompleteTodo, useDeleteTodo, useAcceptTodo } from '../hooks/useTodos'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

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
      className={`group flex items-start gap-2.5 rounded-xl border px-3 py-2.5 transition-colors duration-150 ${
        isSuggested
          ? 'border-warning/25 bg-warning-soft/50'
          : isCompleted
            ? 'border-line bg-surface-muted/40'
            : 'border-line bg-surface hover:border-line-strong'
      }`}
    >
      <button
        onClick={handleComplete}
        disabled={completeTodo.isPending || acceptTodo.isPending || isCompleted}
        aria-label={isCompleted ? 'Completed' : 'Mark complete'}
        className={`focus-visible:ring-ring relative mt-0.5 grid size-4.5 shrink-0 place-items-center rounded-full border transition-all after:absolute after:-inset-1 after:content-[''] focus-visible:ring-2 focus-visible:outline-none ${
          isCompleted
            ? 'border-positive bg-positive text-background cursor-default'
            : isSuggested
              ? 'border-warning/50 hover:border-warning hover:bg-warning-soft/60'
              : 'border-line-strong hover:border-brand hover:bg-brand-soft'
        }`}
      >
        {isCompleted && <Check className="size-3" strokeWidth={3} />}
      </button>

      <div className="min-w-0 flex-1">
        <p
          className={`text-[13px] leading-5 ${
            isCompleted ? 'text-ink-subtle line-through' : 'text-ink'
          }`}
        >
          {todo.title}
        </p>
        {todo.description && (
          <p className="text-ink-subtle mt-0.5 line-clamp-1 text-[11px] leading-4">
            {todo.description}
          </p>
        )}
        <div className="text-ink-subtle mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px]">
          {isSuggested && (
            <Badge variant="warning" className="h-4 px-1.5 text-[10px] leading-none">
              Suggested
            </Badge>
          )}
          {showNoteLink && todo.note_id ? (
            <Link
              to="/notes"
              search={{ note: todo.note_id }}
              className="text-brand hover:text-brand/80 font-medium transition-colors"
            >
              Source note
            </Link>
          ) : !todo.note_id ? (
            <span>Manual</span>
          ) : null}
          {todo.confidence !== null && (
            <>
              <span aria-hidden className="bg-line-strong size-0.5 rounded-full" />
              <span className="tabular-nums">{Math.round(todo.confidence * 100)}% confidence</span>
            </>
          )}
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-1">
        {isSuggested && (
          <Button
            size="xs"
            onClick={() => acceptTodo.mutate(todo.id)}
            disabled={acceptTodo.isPending}
          >
            Accept
          </Button>
        )}
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={handleDelete}
              disabled={deleteTodo.isPending}
              className="text-ink-subtle hover:bg-destructive/10 hover:text-destructive focus-visible:ring-ring grid size-7 place-items-center rounded-md transition-colors focus-visible:ring-2 focus-visible:outline-none disabled:opacity-50 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:transition-opacity [@media(hover:hover)]:group-hover:opacity-100 [@media(hover:hover)]:focus-visible:opacity-100"
              aria-label="Delete todo"
            >
              <Trash2 className="size-3.5" />
            </button>
          </TooltipTrigger>
          <TooltipContent>Delete todo</TooltipContent>
        </Tooltip>
      </div>
    </div>
  )
}
