import { useMemo } from 'react'
import { useMeals } from '../hooks/useMeals'
import SlideOver from './ui/SlideOver'
import type { MealType } from '../lib/api'

interface DayMealsSlideOverProps {
  isOpen: boolean
  onClose: () => void
  date: string | null
  onSelectMeal: (mealId: string) => void
}

const MEAL_TYPE_ORDER: MealType[] = ['breakfast', 'lunch', 'dinner', 'snack']

const MEAL_TYPE_LABELS: Record<MealType, string> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  dinner: 'Dinner',
  snack: 'Snack',
}

const MEAL_TYPE_ICONS: Record<MealType, string> = {
  breakfast: '🌅',
  lunch: '☀️',
  dinner: '🌙',
  snack: '🍿',
}

const MEAL_TYPE_COLORS: Record<MealType, { bg: string; border: string; text: string }> = {
  breakfast: { bg: 'bg-yellow-50', border: 'border-yellow-200', text: 'text-yellow-800' },
  lunch: { bg: 'bg-green-50', border: 'border-green-200', text: 'text-green-800' },
  dinner: { bg: 'bg-blue-50', border: 'border-blue-200', text: 'text-blue-800' },
  snack: { bg: 'bg-purple-50', border: 'border-purple-200', text: 'text-purple-800' },
}

export default function DayMealsSlideOver({
  isOpen,
  onClose,
  date,
  onSelectMeal,
}: DayMealsSlideOverProps) {
  const { data, isLoading } = useMeals({
    start_date: date || '',
    end_date: date || '',
    limit: 50,
  })

  const mealsByType = useMemo(() => {
    if (!data?.meals) return {}
    const grouped: Partial<Record<MealType, typeof data.meals>> = {}
    for (const meal of data.meals) {
      if (!grouped[meal.meal_type]) {
        grouped[meal.meal_type] = []
      }
      grouped[meal.meal_type]!.push(meal)
    }
    return grouped
  }, [data?.meals])

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return ''
    const d = new Date(dateStr + 'T00:00:00')
    return d.toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    })
  }

  return (
    <SlideOver
      isOpen={isOpen}
      onClose={onClose}
      title={
        <div className="flex items-center gap-2">
          <svg className="w-5 h-5 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
            />
          </svg>
          <span>{formatDate(date)}</span>
        </div>
      }
      width="max-w-md"
    >
      <div className="pb-8">
        {isLoading ? (
          <div className="flex justify-center py-8">
            <div className="w-8 h-8 border-2 border-gray-200 border-t-gray-600 rounded-full animate-spin" />
          </div>
        ) : !data?.meals.length ? (
          <div className="text-center py-12">
            <div className="text-4xl mb-3">🍽️</div>
            <p className="text-gray-600 font-medium">No meals logged</p>
            <p className="text-sm text-gray-500 mt-1">
              Record a meal to see it here
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {MEAL_TYPE_ORDER.map((mealType) => {
              const meals = mealsByType[mealType]
              if (!meals?.length) return null

              const colors = MEAL_TYPE_COLORS[mealType]

              return (
                <div key={mealType}>
                  <h3 className={`text-sm font-semibold ${colors.text} uppercase tracking-wider mb-2`}>
                    {MEAL_TYPE_ICONS[mealType]} {MEAL_TYPE_LABELS[mealType]}
                  </h3>
                  <div className="space-y-2">
                    {meals.map((meal) => (
                      <button
                        key={meal.id}
                        type="button"
                        onClick={() => onSelectMeal(meal.id)}
                        className={`w-full text-left p-3 rounded-lg border ${colors.bg} ${colors.border} hover:shadow-sm transition-shadow`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            {meal.items.length > 0 ? (
                              <div className="flex flex-wrap gap-1.5">
                                {meal.items.slice(0, 4).map((item) => (
                                  <span
                                    key={item.id}
                                    className="text-sm text-gray-700"
                                  >
                                    {item.name}
                                    {item !== meal.items[Math.min(3, meal.items.length - 1)] && ','}
                                  </span>
                                ))}
                                {meal.items.length > 4 && (
                                  <span className="text-sm text-gray-500">
                                    +{meal.items.length - 4} more
                                  </span>
                                )}
                              </div>
                            ) : (
                              <p className="text-sm text-gray-500 italic truncate">
                                {meal.transcription}
                              </p>
                            )}
                            {meal.meal_time && (
                              <p className="text-xs text-gray-500 mt-1">
                                at {meal.meal_time}
                              </p>
                            )}
                          </div>
                          <svg
                            className="w-5 h-5 text-gray-400 flex-shrink-0"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M9 5l7 7-7 7"
                            />
                          </svg>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </SlideOver>
  )
}
