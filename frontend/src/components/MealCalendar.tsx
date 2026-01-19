import { useMemo } from 'react'
import { useMealsCalendar } from '../hooks/useMeals'
import type { MealType } from '../lib/api'

interface MealCalendarProps {
  year: number
  month: number
  onPrevMonth: () => void
  onNextMonth: () => void
  onSelectDate: (date: string) => void
  selectedDate: string | null
}

const MEAL_TYPE_COLORS: Record<MealType, string> = {
  breakfast: 'bg-yellow-400',
  lunch: 'bg-green-400',
  dinner: 'bg-blue-400',
  snack: 'bg-purple-400',
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
}: MealCalendarProps) {
  const { data, isLoading } = useMealsCalendar(year, month)

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

    return days
  }, [year, month])

  const isToday = (dateStr: string) => {
    const today = new Date()
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
    return dateStr === todayStr
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      {/* Header with navigation */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 bg-gray-50">
        <button
          type="button"
          onClick={onPrevMonth}
          className="p-2 rounded-lg hover:bg-gray-200 transition-colors"
          aria-label="Previous month"
        >
          <svg className="w-5 h-5 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <h2 className="text-lg font-semibold text-gray-900">
          {MONTH_NAMES[month - 1]} {year}
        </h2>
        <button
          type="button"
          onClick={onNextMonth}
          className="p-2 rounded-lg hover:bg-gray-200 transition-colors"
          aria-label="Next month"
        >
          <svg className="w-5 h-5 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>

      {/* Day names header */}
      <div className="grid grid-cols-7 border-b border-gray-200">
        {DAY_NAMES.map((day) => (
          <div
            key={day}
            className="py-2 text-center text-xs font-medium text-gray-500 uppercase tracking-wider"
          >
            {day}
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="grid grid-cols-7">
        {calendarDays.map((day, index) => {
          if (!day.date) {
            return <div key={`empty-${index}`} className="h-20 border-b border-r border-gray-100" />
          }

          const meals = data?.calendar[day.date] || []
          const isSelected = selectedDate === day.date
          const today = isToday(day.date)

          return (
            <button
              key={day.date}
              type="button"
              onClick={() => onSelectDate(day.date!)}
              className={`h-20 p-1 border-b border-r border-gray-100 text-left hover:bg-gray-50 transition-colors relative ${
                isSelected ? 'bg-blue-50 ring-2 ring-blue-500 ring-inset' : ''
              }`}
            >
              <span
                className={`text-sm font-medium ${
                  today
                    ? 'w-6 h-6 rounded-full bg-blue-600 text-white flex items-center justify-center'
                    : 'text-gray-700'
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
                      className={`w-2 h-2 rounded-full ${MEAL_TYPE_COLORS[meal.meal_type]}`}
                      title={`${meal.meal_type}: ${meal.item_count} item(s)`}
                    />
                  ))}
                  {meals.length > 4 && (
                    <span className="text-xs text-gray-500">+{meals.length - 4}</span>
                  )}
                </div>
              )}

              {/* Loading indicator */}
              {isLoading && (
                <div className="absolute inset-0 bg-white/50 flex items-center justify-center">
                  <div className="w-3 h-3 border border-gray-300 border-t-gray-600 rounded-full animate-spin" />
                </div>
              )}
            </button>
          )
        })}
      </div>

      {/* Legend */}
      <div className="px-4 py-3 border-t border-gray-200 bg-gray-50">
        <div className="flex flex-wrap gap-4 text-xs">
          {(Object.entries(MEAL_TYPE_COLORS) as [MealType, string][]).map(([type, color]) => (
            <div key={type} className="flex items-center gap-1.5">
              <span className={`w-2.5 h-2.5 rounded-full ${color}`} />
              <span className="text-gray-600 capitalize">{type}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
