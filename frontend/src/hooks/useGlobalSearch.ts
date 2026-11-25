/**
 * Cross-domain search for the command palette.
 *
 * Notes use the server's FTS search. Meals and vinyl use their existing list
 * endpoints: vinyl has server-side search; meals are filtered over the last
 * 90 days because the meals API is date-scoped.
 */
import { useQuery } from '@tanstack/react-query'

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

async function searchAll(query: string): Promise<GlobalSearchResults> {
  const end = new Date()
  const start = new Date(end)
  start.setDate(start.getDate() - 90)

  const [notesResult, recordsResult, mealsResult] = await Promise.allSettled([
    searchNotes(query),
    fetchVinylRecords({ search: query, limit: 6 }),
    fetchMeals({
      start_date: isoDate(start),
      end_date: isoDate(end),
      limit: 200,
    }),
  ])

  // If every domain failed, surface the original error instead of pretending
  // the library is empty.
  if (
    notesResult.status === 'rejected' &&
    recordsResult.status === 'rejected' &&
    mealsResult.status === 'rejected'
  ) {
    throw notesResult.reason
  }

  const notes = notesResult.status === 'fulfilled' ? notesResult.value : []
  const records = recordsResult.status === 'fulfilled' ? recordsResult.value.records : []
  const meals = mealsResult.status === 'fulfilled' ? mealsResult.value.meals : []

  const needle = query.trim().toLowerCase()
  const matchingMeals = meals
    .filter((meal) => {
      if (!needle) return false
      if (meal.transcription.toLowerCase().includes(needle)) return true
      return meal.items.some((item) => item.name.toLowerCase().includes(needle))
    })
    .slice(0, 6)

  return {
    notes: notes.slice(0, 6),
    meals: matchingMeals,
    records: records.slice(0, 6),
  }
}

export function useGlobalSearch(query: string) {
  const q = query.trim()

  return useQuery({
    queryKey: ['global-search', q],
    queryFn: () => searchAll(q),
    enabled: q.length >= 2,
    staleTime: 30_000,
  })
}
