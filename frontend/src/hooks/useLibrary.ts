import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'

import {
  fetchLibrary,
  type LibraryApiItem,
  type LibraryKind,
  type MealEntry,
  type Note,
  type Todo,
  type VinylRecord,
} from '../lib/api'
import { queryKeys } from '../lib/queryKeys'

export type { LibraryKind }

export type LibraryItem =
  | { kind: 'note'; id: string; timestamp: string; note: Note }
  | { kind: 'meal'; id: string; timestamp: string; meal: MealEntry }
  | { kind: 'vinyl'; id: string; timestamp: string; record: VinylRecord }
  | { kind: 'todo'; id: string; timestamp: string; todo: Todo }

function timestampValue(value: string): number {
  const parsed = Date.parse(value)
  return Number.isNaN(parsed) ? 0 : parsed
}

/** Defensive sort; the API already returns newest first. */
export function mergeLibraryItems(items: LibraryItem[]): LibraryItem[] {
  return [...items].sort((a, b) => timestampValue(b.timestamp) - timestampValue(a.timestamp))
}

function toLibraryItem(item: LibraryApiItem): LibraryItem {
  switch (item.kind) {
    case 'note':
      return { kind: 'note', id: item.id, timestamp: item.timestamp, note: item.data }
    case 'meal':
      return { kind: 'meal', id: item.id, timestamp: item.timestamp, meal: item.data }
    case 'vinyl':
      return { kind: 'vinyl', id: item.id, timestamp: item.timestamp, record: item.data }
    case 'todo':
      return { kind: 'todo', id: item.id, timestamp: item.timestamp, todo: item.data }
  }
}

export function useLibrary(limit = 25) {
  const query = useQuery({
    queryKey: queryKeys.library(limit),
    queryFn: () => fetchLibrary({ limit }),
    staleTime: 15_000,
  })

  const items = useMemo(
    () => mergeLibraryItems((query.data?.items ?? []).map(toLibraryItem)),
    [query.data]
  )

  return {
    items,
    isLoading: query.isLoading,
    allFailed: query.isError && !query.data,
    hasError: query.isError,
    hasMore: query.data?.has_more ?? false,
    refetch: query.refetch,
  }
}
