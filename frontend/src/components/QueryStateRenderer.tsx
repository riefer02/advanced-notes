import { ReactNode } from 'react'

interface QueryStateProps<T> {
  data: T | undefined
  isLoading: boolean
  error: unknown
  loadingComponent?: ReactNode
  errorComponent?: ReactNode
  emptyCheck?: (data: T) => boolean
  emptyComponent?: ReactNode
  children: (data: T) => ReactNode
}

/**
 * A generic component for handling query state (loading, error, empty, success).
 *
 * Reduces boilerplate for TanStack Query loading/error states across components.
 *
 * @example
 * <QueryStateRenderer
 *   data={notesQuery.data}
 *   isLoading={notesQuery.isLoading}
 *   error={notesQuery.error}
 *   emptyCheck={(data) => data.notes.length === 0}
 *   emptyComponent={<EmptyState message="No notes yet" />}
 * >
 *   {(data) => <NotesList notes={data.notes} />}
 * </QueryStateRenderer>
 */
export function QueryStateRenderer<T>({
  data,
  isLoading,
  error,
  loadingComponent,
  errorComponent,
  emptyCheck,
  emptyComponent,
  children,
}: QueryStateProps<T>) {
  if (isLoading) {
    return (
      <>
        {loadingComponent || (
          <div className="flex items-center justify-center p-8" role="status" aria-label="Loading">
            <div className="flex flex-col items-center gap-3">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-gray-300 border-t-blue-600" />
              <p className="text-sm text-gray-500">Loading...</p>
            </div>
          </div>
        )}
      </>
    )
  }

  if (error) {
    const errorMessage = error instanceof Error ? error.message : 'An error occurred'
    return (
      <>
        {errorComponent || (
          <div className="rounded-lg bg-red-50 p-4 border border-red-200">
            <div className="flex items-center gap-2">
              <svg className="h-5 w-5 text-red-500" viewBox="0 0 20 20" fill="currentColor">
                <path
                  fillRule="evenodd"
                  d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                  clipRule="evenodd"
                />
              </svg>
              <p className="text-sm text-red-800">{errorMessage}</p>
            </div>
          </div>
        )}
      </>
    )
  }

  if (data === undefined || data === null) {
    return null
  }

  if (emptyCheck && emptyCheck(data) && emptyComponent) {
    return <>{emptyComponent}</>
  }

  return <>{children(data)}</>
}

/**
 * Default loading skeleton for lists
 */
export function ListLoadingSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div className="space-y-3" role="status" aria-label="Loading">
      {[...Array(count)].map((_, i) => (
        <div key={i} className="rounded-lg border border-gray-200 bg-white p-4 animate-pulse">
          <div className="h-5 bg-gray-200 rounded w-3/4 mb-3" />
          <div className="flex items-center gap-3 mb-3">
            <div className="h-3 bg-gray-200 rounded w-24" />
            <div className="h-3 bg-gray-200 rounded w-20" />
          </div>
        </div>
      ))}
    </div>
  )
}

/**
 * Default error display component
 */
export function QueryError({ message }: { message: string }) {
  return (
    <div className="rounded-lg bg-red-50 p-4 border border-red-200">
      <div className="flex items-center gap-2">
        <svg className="h-5 w-5 text-red-500" viewBox="0 0 20 20" fill="currentColor">
          <path
            fillRule="evenodd"
            d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
            clipRule="evenodd"
          />
        </svg>
        <p className="text-sm text-red-800">{message}</p>
      </div>
    </div>
  )
}
