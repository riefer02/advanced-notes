/**
 * Cross-domain search for the command palette.
 *
 * Notes use the server's FTS search. Vinyl has server-side search. Meals are
 * filtered over the last 90 days because the meals API is date-scoped.
 *
 * The three domains run as independent queries so a fast notes result appears
 * immediately instead of waiting for the slower meal scan.
 */
import { useQueries } from '@tanstack/react-query'

import {
  fetchMeals,
  fetchVinylRecords,
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

function isoDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate()
  ).padStart(2, '0')}`
}

async function searchMeals(query: string): Promise<MealEntry[]> {
  const end = new Date()
  const start = new Date(end)
  start.setDate(start.getDate() - 90)

  const response = await fetchMeals({
    start_date: isoDate(start),
    end_date: isoDate(end),
    limit: 200,
  })

  const needle = query.trim().toLowerCase()
  return response.meals
    .filter((meal) => {
      if (!needle) return false
      if (meal.transcription.toLowerCase().includes(needle)) return true
      return meal.items.some((item) => item.name.toLowerCase().includes(needle))
    })
    .slice(0, 6)
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
        queryFn: () => searchMeals(q),
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
        meals: mealsQuery.data ?? [],
      }
    : undefined

  return {
    data,
    isFetching: queries.some((result) => result.isFetching),
    error: allFailed ? notesQuery.error : null,
  }
}
