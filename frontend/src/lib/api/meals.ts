/**
 * Meal tracking API types and functions.
 */
import { apiRequest, apiUpload, audioFormData } from './core'

// ============================================================================
// Types
// ============================================================================

export type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack'

export interface MealItem {
  id: string
  user_id: string
  meal_entry_id: string
  name: string
  portion: string | null
  confidence: number | null
  created_at: string
}

export interface MealEntry {
  id: string
  user_id: string
  meal_type: MealType
  meal_date: string
  meal_time: string | null
  transcription: string
  confidence: number | null
  transcription_duration: number | null
  model_version: string | null
  items: MealItem[]
  created_at: string
  updated_at: string
}

export interface MealTranscriptionMeta {
  device: string
  model: string
  sample_rate?: number
  duration?: number
}

export interface MealTranscriptionResponse {
  text: string
  meta: MealTranscriptionMeta
  audio: {
    clip_id: string
    storage_key: string
  }
  meal: MealEntry | null
  extraction: {
    confidence: number
    reasoning: string
  }
}

export interface MealsResponse {
  meals: MealEntry[]
  total: number
  limit: number
  offset: number
}

export interface MealsCalendarEntry {
  id: string
  meal_type: MealType
  item_count: number
  user_id?: string
}

export interface MealsCalendarResponse {
  calendar: Record<string, MealsCalendarEntry[]>
  year: number
  month: number
}

// ============================================================================
// API Functions
// ============================================================================

export async function transcribeMeal(
  audioBlob: Blob,
  calendarOwner?: string
): Promise<MealTranscriptionResponse> {
  const endpoint = calendarOwner
    ? `/api/meals/transcribe?calendar_owner=${encodeURIComponent(calendarOwner)}`
    : '/api/meals/transcribe'
  return apiUpload<MealTranscriptionResponse>(endpoint, audioFormData(audioBlob, 'meal-recording'))
}

export async function fetchMeals(params: {
  start_date: string
  end_date: string
  meal_type?: MealType
  limit?: number
  offset?: number
  calendar_owner?: string
}): Promise<MealsResponse> {
  return apiRequest<MealsResponse>('GET', '/api/meals', { params })
}

export async function fetchMealsCalendar(
  year: number,
  month: number,
  calendarOwner?: string
): Promise<MealsCalendarResponse> {
  return apiRequest<MealsCalendarResponse>('GET', '/api/meals/calendar', {
    params: { year, month, calendar_owner: calendarOwner },
  })
}

export async function fetchMeal(mealId: string, calendarOwner?: string): Promise<MealEntry> {
  return apiRequest<MealEntry>('GET', `/api/meals/${mealId}`, {
    params: calendarOwner ? { calendar_owner: calendarOwner } : undefined,
  })
}

export async function updateMeal(
  mealId: string,
  data: {
    meal_type?: MealType
    meal_date?: string
    meal_time?: string
    transcription?: string
  }
): Promise<MealEntry> {
  return apiRequest<MealEntry>('PUT', `/api/meals/${mealId}`, { body: data })
}

export async function deleteMeal(mealId: string): Promise<void> {
  await apiRequest<{ success: boolean }>('DELETE', `/api/meals/${mealId}`)
}

export async function addMealItem(
  mealId: string,
  data: { name: string; portion?: string }
): Promise<MealItem> {
  return apiRequest<MealItem>('POST', `/api/meals/${mealId}/items`, { body: data })
}

export async function updateMealItem(
  mealId: string,
  itemId: string,
  data: { name?: string; portion?: string }
): Promise<MealItem> {
  return apiRequest<MealItem>('PUT', `/api/meals/${mealId}/items/${itemId}`, { body: data })
}

export async function deleteMealItem(mealId: string, itemId: string): Promise<void> {
  await apiRequest<{ success: boolean }>('DELETE', `/api/meals/${mealId}/items/${itemId}`)
}
