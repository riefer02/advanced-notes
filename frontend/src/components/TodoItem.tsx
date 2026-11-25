import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { Check, Pencil, Trash2 } from 'lucide-react'
import type { Todo } from '../lib/api'
import {
  useAcceptTodo,
  useCompleteTodo,
  useDeleteTodo,
  useDismissTodo,
  useUpdateTodo,
} from '../hooks/useTodos'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

interface TodoItemProps {
  todo: Todo
  showNoteLink?: boolean
}

const hoverReveal =
  '[@media(hover:hover)]:opacity-0 [@media(hover:hover)]:transition-opacity [@media(hover:hover)]:group-hover:opacity-100 [@media(hover:hover)]:focus-visible:opacity-100'

export default function TodoItem({ todo, showNoteLink = true }: TodoItemProps) {
  const completeTodo = useCompleteTodo()
  const deleteTodo = useDeleteTodo()
  const acceptTodo = useAcceptTodo()
  const updateTodo = useUpdateTodo()
  const dismissTodo = useDismissTodo()

  const [isEditing, setIsEditing] = useState(false)
  const [draftTitle, setDraftTitle] = useState(todo.title)
  const [draftDescription, setDraftDescription] = useState(todo.description ?? '')
  const [confirmDelete, setConfirmDelete] = useState(false)

  const handleComplete = () => {
    if (todo.status === 'suggested') {
      // First accept, then complete
      acceptTodo.mutate(todo.id)
    } else {
      completeTodo.mutate(todo.id)
    }
  }

  const startEditing = () => {
    setDraftTitle(todo.title)
    setDraftDescription(todo.description ?? '')
    setIsEditing(true)
  }

  const cancelEditing = () => {
    setIsEditing(false)
    setDraftTitle(todo.title)
    setDraftDescription(todo.description ?? '')
  }

  const saveEditing = async () => {
    const title = draftTitle.trim()
    if (!title) return

    try {
      await updateTodo.mutateAsync({
        todoId: todo.id,
        data: { title, description: draftDescription.trim() },
      })
      setIsEditing(false)
    } catch {
      // The mutation error is surfaced inline below the row.
    }
  }

  const handleEditKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      cancelEditing()
      return
    }
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey || e.currentTarget.tagName === 'INPUT')) {
      e.preventDefault()
      void saveEditing()
    }
  }

  const handleDelete = async () => {
    try {
      await deleteTodo.mutateAsync(todo.id)
    } catch {
      // The mutation error is surfaced inline below the row.
    }
  }

  const isCompleted = todo.status === 'completed'
  const isSuggested = todo.status === 'suggested'
  const mutationError =
    updateTodo.error ??
    deleteTodo.error ??
    dismissTodo.error ??
    acceptTodo.error ??
    completeTodo.error

  return (
    <div
      className={`group rounded-xl border px-3 py-2.5 transition-colors duration-150 ${
        isSuggested
          ? 'border-warning/25 bg-warning-soft/50'
          : isCompleted
            ? 'border-line bg-surface-muted/40'
            : 'border-line bg-surface hover:border-line-strong'
      }`}
    >
      <div className="flex flex-wrap items-start gap-2.5">
        <button
          type="button"
          onClick={handleComplete}
          disabled={completeTodo.isPending || acceptTodo.isPending || isCompleted}
          aria-label={
            isCompleted
              ? 'Completed'
              : isSuggested
                ? 'Accept and complete suggested todo'
                : 'Mark todo complete'
          }
          className="focus-visible:[&>span]:ring-ring flex size-10 shrink-0 items-start justify-center rounded-full pt-1 focus-visible:outline-none focus-visible:[&>span]:ring-2 disabled:cursor-default"
        >
          <span
            aria-hidden
            className={`grid size-4.5 place-items-center rounded-full border transition-all ${
              isCompleted
                ? 'border-positive bg-positive text-background'
                : isSuggested
                  ? 'border-warning/50 group-hover:border-warning group-hover:bg-warning-soft/60'
                  : 'border-line-strong group-hover:border-brand group-hover:bg-brand-soft'
            }`}
          >
            {isCompleted && <Check className="size-3" strokeWidth={3} />}
          </span>
        </button>

        {isEditing ? (
          <div className="min-w-0 flex-1 space-y-2">
            <Input
              value={draftTitle}
              onChange={(e) => setDraftTitle(e.target.value)}
              onKeyDown={handleEditKeyDown}
              aria-label="Todo title"
              autoFocus
            />
            <Textarea
              value={draftDescription}
              onChange={(e) => setDraftDescription(e.target.value)}
              onKeyDown={handleEditKeyDown}
              aria-label="Todo description"
              placeholder="Add details (optional)"
              rows={2}
            />
            <div className="flex items-center justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={cancelEditing}>
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={() => void saveEditing()}
                disabled={!draftTitle.trim()}
                loading={updateTodo.isPending}
              >
                Save
              </Button>
            </div>
          </div>
        ) : (
          <>
            <div className="min-w-[10rem] flex-1">
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
                    <span className="tabular-nums">
                      {Math.round(todo.confidence * 100)}% confidence
                    </span>
                  </>
                )}
              </div>
            </div>

            <div className="ml-auto flex shrink-0 items-center gap-1">
              {isSuggested && (
                <>
                  <Button
                    size="xs"
                    onClick={() => acceptTodo.mutate(todo.id)}
                    disabled={acceptTodo.isPending}
                  >
                    Accept
                  </Button>
                  <Button
                    variant="ghost"
                    size="xs"
                    onClick={() => dismissTodo.mutate(todo.id)}
                    disabled={dismissTodo.isPending}
                  >
                    Dismiss
                  </Button>
                </>
              )}
              {!isCompleted && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      onClick={startEditing}
                      className={`text-ink-subtle hover:bg-surface-muted hover:text-ink focus-visible:ring-ring grid size-8 place-items-center rounded-md transition-colors focus-visible:ring-2 focus-visible:outline-none ${hoverReveal}`}
                      aria-label="Edit todo"
                    >
                      <Pencil className="size-3.5" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>Edit todo</TooltipContent>
                </Tooltip>
              )}
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={() => setConfirmDelete(true)}
                    disabled={deleteTodo.isPending}
                    className={`text-ink-subtle hover:bg-destructive/10 hover:text-destructive focus-visible:ring-ring grid size-8 place-items-center rounded-md transition-colors focus-visible:ring-2 focus-visible:outline-none disabled:opacity-50 ${hoverReveal}`}
                    aria-label="Delete todo"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent>Delete todo</TooltipContent>
              </Tooltip>
            </div>
          </>
        )}
      </div>

      {mutationError && (
        <p className="text-destructive mt-1.5 text-[11px] leading-4" role="status">
          {mutationError.message}
        </p>
      )}

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Delete this todo?"
        description={<>“{todo.title}” will be removed from your list. This cannot be undone.</>}
        confirmLabel="Delete"
        variant="destructive"
        pending={deleteTodo.isPending}
        onConfirm={handleDelete}
      />
    </div>
  )
}
