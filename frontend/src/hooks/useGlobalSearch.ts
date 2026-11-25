/**
 * Cross-domain search for the command palette.
 *
 * Notes, meals, and vinyl all use server-side search. The three domains run
 * as independent queries so a fast notes result appears immediately instead
 * of waiting on the other sources.
 */
import { useQueries } from '@tanstack/react-query'

import {
  fetchVinylRecords,
  searchMeals,
  searchNotes,
  type MealEntry,
  type SearchResult,
  type VinylRecord,
} from '../lib/api'

export interface GlobalSearchResults {
  notes: SearchResult[]
  meals: MealEntry[]
  records: VinylRecord[]
}

export function useGlobalSearch(query: string) {
  const q = query.trim()
  const enabled = q.length >= 2

  const [notesQuery, recordsQuery, mealsQuery] = useQueries({
    queries: [
      {
        queryKey: ['global-search', 'notes', q],
        queryFn: () => searchNotes(q),
        enabled,
        staleTime: 30_000,
      },
      {
        queryKey: ['global-search', 'vinyl', q],
        queryFn: () => fetchVinylRecords({ search: q, limit: 6 }),
        enabled,
        staleTime: 30_000,
      },
      {
        queryKey: ['global-search', 'meals', q],
        queryFn: () => searchMeals(q, 6),
        enabled,
        staleTime: 30_000,
      },
    ],
  })

  const queries = [notesQuery, recordsQuery, mealsQuery]
  const allFailed = enabled && queries.every((result) => result.isError)

  const data: GlobalSearchResults | undefined = enabled
    ? {
        notes: (notesQuery.data ?? []).slice(0, 6),
        records: (recordsQuery.data?.records ?? []).slice(0, 6),
        meals: mealsQuery.data?.meals ?? [],
      }
    : undefined

  return {
    data,
    isFetching: queries.some((result) => result.isFetching),
    error: allFailed ? notesQuery.error : null,
  }
}
