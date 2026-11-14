import { ReactNode } from 'react'

interface EmptyStateProps {
  icon?: ReactNode
  title: string
  description?: string
  action?: ReactNode
}

/**
 * Unified empty state component for consistent empty state styling.
 *
 * @example
 * <EmptyState
 *   title="No notes yet"
 *   description="Start recording your first voice note"
 *   action={<button>Start Recording</button>}
 * />
 */
export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="border-line bg-surface-muted/40 rounded-xl border border-dashed p-8 text-center">
      {icon || (
        <svg
          className="text-line-strong mx-auto size-10"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
          />
        </svg>
      )}
      <h3 className="text-ink mt-3 text-sm font-semibold">{title}</h3>
      {description && (
        <p className="text-ink-muted mx-auto mt-1.5 max-w-sm text-[13px] leading-5">
          {description}
        </p>
      )}
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}

/**
 * Empty state specifically for no search results
 */
export function NoResultsState({ query }: { query?: string }) {
  return (
    <EmptyState
      icon={
        <svg
          className="text-line-strong mx-auto size-10"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
          />
        </svg>
      }
      title="No results found"
      description={
        query
          ? `No matches for "${query}". Try adjusting your search terms.`
          : 'Try adjusting your search terms or browse all items.'
      }
    />
  )
}

/**
 * Empty state for no notes
 */
export function NoNotesState() {
  return (
    <EmptyState
      title="No notes yet"
      description="Start recording your first voice note to get organized with AI-powered tagging."
      action={
        <p className="text-ink-subtle text-xs">
          Use the <span className="text-ink font-medium">Start Recording</span> button in the left
          panel to create your first note.
        </p>
      }
    />
  )
}

/**
 * Empty state for no todos
 */
export function NoTodosState({ status }: { status?: string }) {
  const descriptions: Record<string, string> = {
    suggested: 'No suggested todos. Record voice notes mentioning tasks to see AI-extracted todos.',
    accepted: 'No accepted todos. Accept suggested todos to add them to your list.',
    completed: 'No completed todos yet. Mark todos as complete when you finish them.',
  }

  return (
    <EmptyState
      icon={
        <svg
          className="text-line-strong mx-auto size-10"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
      }
      title={status ? `No ${status} todos` : 'No todos yet'}
      description={
        status
          ? descriptions[status]
          : 'Create todos manually or let AI extract them from your voice notes.'
      }
    />
  )
}
