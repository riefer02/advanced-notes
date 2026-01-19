import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
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

// ============================================================================
// Query Hooks
// ============================================================================

interface MealsParams {
  start_date: string
  end_date: string
  meal_type?: MealType
  limit?: number
  offset?: number
}

export function useMeals(params: MealsParams) {
  return useQuery({
    queryKey: ['meals', params],
    queryFn: () => fetchMeals(params),
    enabled: !!params.start_date && !!params.end_date,
  })
}

export function useMealsCalendar(year: number, month: number) {
  return useQuery({
    queryKey: ['mealsCalendar', year, month],
    queryFn: () => fetchMealsCalendar(year, month),
    enabled: !!year && !!month,
  })
}

export function useMeal(mealId: string | null) {
  return useQuery({
    queryKey: ['meal', mealId],
    queryFn: () => fetchMeal(mealId!),
    enabled: !!mealId,
  })
}

// ============================================================================
// Mutation Hooks
// ============================================================================

export function useTranscribeMeal() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (audioBlob: Blob) => transcribeMeal(audioBlob),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['meals'] })
      queryClient.invalidateQueries({ queryKey: ['mealsCalendar'] })
    },
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
      queryClient.setQueryData(['meal', updatedMeal.id], updatedMeal)
      queryClient.invalidateQueries({ queryKey: ['meals'] })
      queryClient.invalidateQueries({ queryKey: ['mealsCalendar'] })
    },
  })
}

export function useDeleteMeal() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (mealId: string) => deleteMeal(mealId),
    onSuccess: (_data, mealId) => {
      queryClient.removeQueries({ queryKey: ['meal', mealId] })
      queryClient.invalidateQueries({ queryKey: ['meals'] })
      queryClient.invalidateQueries({ queryKey: ['mealsCalendar'] })
    },
  })
}

export function useAddMealItem() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ mealId, data }: { mealId: string; data: { name: string; portion?: string } }) =>
      addMealItem(mealId, data),
    onSuccess: (newItem: MealItem) => {
      // Invalidate the specific meal query to refetch with new item
      queryClient.invalidateQueries({ queryKey: ['meal', newItem.meal_entry_id] })
      queryClient.invalidateQueries({ queryKey: ['mealsCalendar'] })
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
      queryClient.invalidateQueries({ queryKey: ['meal', updatedItem.meal_entry_id] })
    },
  })
}

export function useDeleteMealItem() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ mealId, itemId }: { mealId: string; itemId: string }) =>
      deleteMealItem(mealId, itemId),
    onSuccess: (_data, { mealId }) => {
      queryClient.invalidateQueries({ queryKey: ['meal', mealId] })
      queryClient.invalidateQueries({ queryKey: ['mealsCalendar'] })
    },
  })
}
