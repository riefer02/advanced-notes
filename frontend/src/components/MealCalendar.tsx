import { useMemo } from 'react'
import { useMealsCalendar } from '../hooks/useMeals'
import type { MealType } from '../lib/api'
import { ChevronLeft, ChevronRight, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface MealCalendarProps {
  year: number
  month: number
  onPrevMonth: () => void
  onNextMonth: () => void
  onSelectDate: (date: string) => void
  selectedDate: string | null
  calendarOwner?: string
}

const MEAL_TYPE_COLORS: Record<MealType, string> = {
  breakfast: 'bg-warning',
  lunch: 'bg-positive',
  dinner: 'bg-brand',
  snack: 'bg-domain-vinyl',
}

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
]

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export default function MealCalendar({
  year,
  month,
  onPrevMonth,
  onNextMonth,
  onSelectDate,
  selectedDate,
  calendarOwner,
}: MealCalendarProps) {
  const { data, isLoading } = useMealsCalendar(year, month, calendarOwner)

  const calendarDays = useMemo(() => {
    const firstDay = new Date(year, month - 1, 1)
    const lastDay = new Date(year, month, 0)
    const daysInMonth = lastDay.getDate()
    const startDayOfWeek = firstDay.getDay()

    const days: Array<{ date: string | null; dayNum: number | null }> = []

    // Add empty slots for days before the first day of the month
    for (let i = 0; i < startDayOfWeek; i++) {
      days.push({ date: null, dayNum: null })
    }

    // Add the days of the month
    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
      days.push({ date: dateStr, dayNum: day })
    }

    // Pad the final week so the grid keeps its borders.
    const remainder = days.length % 7
    if (remainder !== 0) {
      for (let i = 0; i < 7 - remainder; i++) days.push({ date: null, dayNum: null })
    }

    return days
  }, [year, month])

  const isToday = (dateStr: string) => {
    const today = new Date()
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
    return dateStr === todayStr
  }

  return (
    <div className="bg-surface rounded-xl border border-line overflow-hidden">
      {/* Header with navigation */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-line bg-surface-muted">
        <Button variant="ghost" size="icon-sm" onClick={onPrevMonth} aria-label="Previous month">
          <ChevronLeft className="size-4" />
        </Button>
        <div className="flex items-center gap-2">
          <h2 className="text-ink text-[15px] font-semibold tracking-[-0.015em]">
            {MONTH_NAMES[month - 1]} {year}
          </h2>
          {isLoading && (
            <Loader2 className="text-ink-subtle size-3.5 animate-spin" aria-label="Loading meals" />
          )}
        </div>
        <Button variant="ghost" size="icon-sm" onClick={onNextMonth} aria-label="Next month">
          <ChevronRight className="size-4" />
        </Button>
      </div>

      {/* Day names header */}
      <div className="grid grid-cols-7 border-b border-line">
        {DAY_NAMES.map((day) => (
          <div
            key={day}
            className="text-ink-subtle py-2 text-center text-[10px] font-medium tracking-[0.08em] uppercase"
          >
            {day}
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="grid grid-cols-7" aria-busy={isLoading}>
        {calendarDays.map((day, index) => {
          if (!day.date) {
            return (
              <div key={`empty-${index}`} className="border-line h-16 border-r border-b sm:h-20" />
            )
          }

          const meals = data?.calendar[day.date] || []
          const isSelected = selectedDate === day.date
          const today = isToday(day.date)

          return (
            <button
              key={day.date}
              type="button"
              onClick={() => onSelectDate(day.date!)}
              aria-label={`${MONTH_NAMES[month - 1]} ${day.dayNum}, ${year}${
                meals.length ? `, ${meals.length} meal${meals.length === 1 ? '' : 's'}` : ''
              }`}
              aria-current={today ? 'date' : undefined}
              className={`border-line hover:bg-surface-muted relative h-16 border-r border-b p-1 text-left transition-colors sm:h-20 ${
                isSelected ? 'bg-brand-soft ring-brand/40 ring-1 ring-inset' : ''
              }`}
            >
              <span
                className={`text-sm font-medium ${
                  today
                    ? 'bg-brand text-brand-foreground flex size-6 items-center justify-center rounded-full'
                    : 'text-ink'
                }`}
              >
                {day.dayNum}
              </span>

              {/* Meal indicators */}
              {meals.length > 0 && (
                <div className="mt-1 flex flex-wrap gap-0.5">
                  {meals.slice(0, 4).map((meal) => (
                    <span
                      key={meal.id}
                      className={`size-1.5 rounded-full ${MEAL_TYPE_COLORS[meal.meal_type]}`}
                      title={`${meal.meal_type}: ${meal.item_count} item(s)`}
                    />
                  ))}
                  {meals.length > 4 && (
                    <span className="text-ink-subtle text-[10px]">+{meals.length - 4}</span>
                  )}
                </div>
              )}

              {/* Loading indicator */}
              {isLoading && (
                <div className="bg-surface/60 absolute inset-0 flex items-center justify-center">
                  <div className="w-3 h-3 border border-line-strong border-t-ink-muted rounded-full animate-spin" />
                </div>
              )}
            </button>
          )
        })}
      </div>

      {/* Legend */}
      <div className="px-4 py-3 border-t border-line bg-surface-muted">
        <div className="flex flex-wrap gap-4 text-[11px]">
          {(Object.entries(MEAL_TYPE_COLORS) as [MealType, string][]).map(([type, color]) => (
            <div key={type} className="flex items-center gap-1.5">
              <span className={`size-2 rounded-full ${color}`} />
              <span className="text-ink-muted capitalize">{type}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
