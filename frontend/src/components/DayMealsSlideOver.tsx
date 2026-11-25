import { useMemo } from 'react'
import { useMeals } from '../hooks/useMeals'
import {
  CalendarDays,
  ChevronRight,
  Cookie,
  Moon,
  Plus,
  Sun,
  Sunrise,
  UtensilsCrossed,
} from 'lucide-react'
import SlideOver from './ui/SlideOver'
import { Button } from '@/components/ui/button'
import type { MealType } from '../lib/api'

interface DayMealsSlideOverProps {
  isOpen: boolean
  onClose: () => void
  date: string | null
  onSelectMeal: (mealId: string) => void
  /** Open the composer prefilled with this date. */
  onAddMealForDate?: (date: string) => void
  calendarOwner?: string
}

const MEAL_TYPE_ORDER: MealType[] = ['breakfast', 'lunch', 'dinner', 'snack']

const MEAL_TYPE_LABELS: Record<MealType, string> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  dinner: 'Dinner',
  snack: 'Snack',
}

const MEAL_TYPE_ICONS: Record<MealType, typeof Sun> = {
  breakfast: Sunrise,
  lunch: Sun,
  dinner: Moon,
  snack: Cookie,
}

const MEAL_TYPE_COLORS: Record<MealType, { bg: string; border: string; text: string }> = {
  breakfast: { bg: 'bg-warning-soft', border: 'border-warning/25', text: 'text-warning' },
  lunch: { bg: 'bg-positive-soft', border: 'border-positive/25', text: 'text-positive' },
  dinner: { bg: 'bg-brand-soft', border: 'border-brand/25', text: 'text-brand' },
  snack: { bg: 'bg-domain-vinyl/10', border: 'border-domain-vinyl/25', text: 'text-domain-vinyl' },
}

export default function DayMealsSlideOver({
  isOpen,
  onClose,
  date,
  onSelectMeal,
  onAddMealForDate,
  calendarOwner,
}: DayMealsSlideOverProps) {
  const { data, isLoading } = useMeals({
    start_date: date || '',
    end_date: date || '',
    limit: 50,
    calendar_owner: calendarOwner,
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
  }, [data])

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
          <CalendarDays className="text-ink-muted size-5" aria-hidden />
          <span>{formatDate(date)}</span>
        </div>
      }
      width="max-w-md"
    >
      <div className="pb-8">
        {isLoading ? (
          <div className="flex justify-center py-8">
            <div className="border-line border-t-ink-muted size-8 animate-spin rounded-full border-2" />
          </div>
        ) : !data?.meals.length ? (
          <div className="py-12 text-center">
            <div className="bg-surface-muted text-ink-muted mx-auto mb-3 grid size-12 place-items-center rounded-full">
              <UtensilsCrossed className="size-5" aria-hidden />
            </div>
            <p className="text-ink text-[13px] font-medium">No meals logged</p>
            <p className="text-ink-subtle mt-1 text-xs">Add one for this day without recording.</p>
            {onAddMealForDate && date && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="mt-4"
                onClick={() => onAddMealForDate(date)}
              >
                <Plus />
                Add a meal for this day
              </Button>
            )}
          </div>
        ) : (
          <div className="space-y-5">
            {MEAL_TYPE_ORDER.map((mealType) => {
              const meals = mealsByType[mealType]
              if (!meals?.length) return null

              const colors = MEAL_TYPE_COLORS[mealType]
              const Icon = MEAL_TYPE_ICONS[mealType]

              return (
                <div key={mealType}>
                  <h3 className={`section-label mb-2 flex items-center gap-1.5 ${colors.text}`}>
                    <Icon className="size-3.5" aria-hidden />
                    {MEAL_TYPE_LABELS[mealType]}
                  </h3>
                  <div className="space-y-2">
                    {meals.map((meal) => (
                      <button
                        key={meal.id}
                        type="button"
                        onClick={() => onSelectMeal(meal.id)}
                        className={`focus-visible:ring-ring w-full rounded-lg border p-2.5 text-left transition-shadow hover:shadow-card focus-visible:ring-2 focus-visible:outline-none ${colors.bg} ${colors.border}`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            {meal.items.length > 0 ? (
                              <div className="flex flex-wrap gap-1.5">
                                {meal.items.slice(0, 4).map((item) => (
                                  <span key={item.id} className="text-sm text-ink">
                                    {item.name}
                                    {item !== meal.items[Math.min(3, meal.items.length - 1)] && ','}
                                  </span>
                                ))}
                                {meal.items.length > 4 && (
                                  <span className="text-sm text-ink-subtle">
                                    +{meal.items.length - 4} more
                                  </span>
                                )}
                              </div>
                            ) : (
                              <p className="text-sm text-ink-subtle italic truncate">
                                {meal.transcription}
                              </p>
                            )}
                            {meal.meal_time && (
                              <p className="text-xs text-ink-subtle mt-1">at {meal.meal_time}</p>
                            )}
                          </div>
                          <ChevronRight className="text-ink-subtle size-4 shrink-0" aria-hidden />
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
