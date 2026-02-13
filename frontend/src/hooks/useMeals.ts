import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import {
  fetchMeals,
  fetchMealsCalendar,
  fetchMeal,
  updateMeal,
  deleteMeal,
  addMealItem,
  updateMealItem,
  deleteMealItem,
  transcribeMeal,
  type MealEntry,
  type MealItem,
  type MealType,
} from '../lib/api'
import { queryKeys } from '../lib/queryKeys'

// ============================================================================
// Invalidation Helpers
// ============================================================================

function invalidateMealQueries(queryClient: QueryClient) {
  queryClient.invalidateQueries({ queryKey: queryKeys.meals.all })
  queryClient.invalidateQueries({ queryKey: queryKeys.meals.calendarPrefix })
}

function invalidateDeletedMealQueries(queryClient: QueryClient, mealId: string) {
  queryClient.removeQueries({ queryKey: queryKeys.meals.detail(mealId) })
  invalidateMealQueries(queryClient)
}

// ============================================================================
// Query Hooks
// ============================================================================

interface MealsParams {
  start_date: string
  end_date: string
  meal_type?: MealType
  limit?: number
  offset?: number
  calendar_owner?: string
}

export function useMeals(params: MealsParams) {
  return useQuery({
    queryKey: queryKeys.meals.list(params),
    queryFn: () => fetchMeals(params),
    enabled: !!params.start_date && !!params.end_date,
  })
}

export function useMealsCalendar(year: number, month: number, calendarOwner?: string) {
  return useQuery({
    queryKey: queryKeys.meals.calendar(year, month, calendarOwner),
    queryFn: () => fetchMealsCalendar(year, month, calendarOwner),
    enabled: !!year && !!month,
  })
}

export function useMeal(mealId: string | null, calendarOwner?: string) {
  return useQuery({
    queryKey: queryKeys.meals.detail(mealId, calendarOwner),
    queryFn: () => fetchMeal(mealId!, calendarOwner),
    enabled: !!mealId,
  })
}

// ============================================================================
// Mutation Hooks
// ============================================================================

export function useTranscribeMeal(calendarOwner?: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (audioBlob: Blob) => transcribeMeal(audioBlob, calendarOwner),
    onSuccess: () => invalidateMealQueries(queryClient),
  })
}

export function useUpdateMeal() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({
      mealId,
      data,
    }: {
      mealId: string
      data: {
        meal_type?: MealType
        meal_date?: string
        meal_time?: string
        transcription?: string
      }
    }) => updateMeal(mealId, data),
    onSuccess: (updatedMeal: MealEntry) => {
      queryClient.setQueryData(queryKeys.meals.detail(updatedMeal.id), updatedMeal)
      invalidateMealQueries(queryClient)
    },
  })
}

export function useDeleteMeal() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (mealId: string) => deleteMeal(mealId),
    onSuccess: (_data, mealId) => invalidateDeletedMealQueries(queryClient, mealId),
  })
}

export function useAddMealItem() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ mealId, data }: { mealId: string; data: { name: string; portion?: string } }) =>
      addMealItem(mealId, data),
    onSuccess: (newItem: MealItem) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.meals.detail(newItem.meal_entry_id) })
      queryClient.invalidateQueries({ queryKey: queryKeys.meals.calendarPrefix })
    },
  })
}

export function useUpdateMealItem() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({
      mealId,
      itemId,
      data,
    }: {
      mealId: string
      itemId: string
      data: { name?: string; portion?: string }
    }) => updateMealItem(mealId, itemId, data),
    onSuccess: (updatedItem: MealItem) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.meals.detail(updatedItem.meal_entry_id),
      })
    },
  })
}

export function useDeleteMealItem() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ mealId, itemId }: { mealId: string; itemId: string }) =>
      deleteMealItem(mealId, itemId),
    onSuccess: (_data, { mealId }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.meals.detail(mealId) })
      queryClient.invalidateQueries({ queryKey: queryKeys.meals.calendarPrefix })
    },
  })
}
