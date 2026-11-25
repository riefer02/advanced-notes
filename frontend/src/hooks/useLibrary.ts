import { useMemo } from 'react'

import type { MealEntry, Note, Todo, VinylRecord } from '../lib/api'
import { useMeals } from './useMeals'
import { useNotes } from './useNotes'
import { useTodos } from './useTodos'
import { useVinylRecords } from './useVinyl'

export type LibraryKind = 'note' | 'meal' | 'vinyl' | 'todo'

export type LibraryItem =
  | { kind: 'note'; id: string; timestamp: string; note: Note }
  | { kind: 'meal'; id: string; timestamp: string; meal: MealEntry }
  | { kind: 'vinyl'; id: string; timestamp: string; record: VinylRecord }
  | { kind: 'todo'; id: string; timestamp: string; todo: Todo }

function timestampValue(value: string): number {
  const parsed = Date.parse(value)
  return Number.isNaN(parsed) ? 0 : parsed
}

/** Newest first across every captured object type. */
export function mergeLibraryItems(items: LibraryItem[]): LibraryItem[] {
  return [...items].sort((a, b) => timestampValue(b.timestamp) - timestampValue(a.timestamp))
}

export function useLibrary(limit = 25) {
  const notesQuery = useNotes(undefined, limit)
  const mealsQuery = useMeals({
    start_date: '1900-01-01',
    end_date: '2100-12-31',
    limit,
  })
  const vinylQuery = useVinylRecords({ limit })
  const todosQuery = useTodos({ limit })

  const items = useMemo(() => {
    const merged: LibraryItem[] = []

    for (const note of notesQuery.data?.notes ?? []) {
      merged.push({
        kind: 'note',
        id: note.id,
        timestamp: note.updated_at || note.created_at,
        note,
      })
    }

    for (const meal of mealsQuery.data?.meals ?? []) {
      merged.push({
        kind: 'meal',
        id: meal.id,
        timestamp: meal.created_at,
        meal,
      })
    }

    for (const record of vinylQuery.data?.records ?? []) {
      merged.push({
        kind: 'vinyl',
        id: record.id,
        timestamp: record.created_at,
        record,
      })
    }

    for (const todo of todosQuery.data?.todos ?? []) {
      if (todo.status === 'suggested') continue
      merged.push({
        kind: 'todo',
        id: todo.id,
        timestamp: todo.created_at,
        todo,
      })
    }

    return mergeLibraryItems(merged)
  }, [notesQuery.data, mealsQuery.data, vinylQuery.data, todosQuery.data])

  const queries = [notesQuery, mealsQuery, vinylQuery, todosQuery]
  const isLoading = queries.some((query) => query.isLoading)
  const allFailed = queries.every((query) => query.isError)
  const hasError = queries.some((query) => query.isError)
  const hasMore =
    (notesQuery.data?.notes.length ?? 0) >= limit ||
    (mealsQuery.data?.meals.length ?? 0) >= limit ||
    (vinylQuery.data?.records.length ?? 0) >= limit ||
    (todosQuery.data?.todos.length ?? 0) >= limit

  const refetch = () => Promise.all(queries.map((query) => query.refetch()))

  return { items, isLoading, allFailed, hasError, hasMore, refetch }
}
