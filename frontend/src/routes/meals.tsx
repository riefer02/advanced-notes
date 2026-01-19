import { createFileRoute } from '@tanstack/react-router'
import { useAuth } from '@clerk/clerk-react'
import { useState, useCallback, useMemo } from 'react'
import MealCalendar from '../components/MealCalendar'
import MealRecorder from '../components/MealRecorder'
import DayMealsSlideOver from '../components/DayMealsSlideOver'
import MealDetailSlideOver from '../components/MealDetailSlideOver'

export const Route = createFileRoute('/meals')({
  component: MealsPage,
})

function MealsPage() {
  const { isLoaded, isSignedIn } = useAuth()

  // Calendar state
  const now = new Date()
  const [calendarYear, setCalendarYear] = useState(now.getFullYear())
  const [calendarMonth, setCalendarMonth] = useState(now.getMonth() + 1)

  // Selection state
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [selectedMealId, setSelectedMealId] = useState<string | null>(null)

  // Mobile tab state
  const [activeTab, setActiveTab] = useState<'record' | 'calendar'>('record')

  const handlePrevMonth = useCallback(() => {
    setCalendarMonth((m) => {
      if (m === 1) {
        setCalendarYear((y) => y - 1)
        return 12
      }
      return m - 1
    })
  }, [])

  const handleNextMonth = useCallback(() => {
    setCalendarMonth((m) => {
      if (m === 12) {
        setCalendarYear((y) => y + 1)
        return 1
      }
      return m + 1
    })
  }, [])

  const handleSelectDate = useCallback((date: string) => {
    setSelectedDate(date)
  }, [])

  const handleSelectMeal = useCallback((mealId: string) => {
    setSelectedMealId(mealId)
  }, [])

  const handleMealCreated = useCallback((mealId: string) => {
    // Switch to calendar tab on mobile after creating a meal
    setActiveTab('calendar')
    // Optionally open the meal detail
    setSelectedMealId(mealId)
  }, [])

  const handleCloseDayMeals = useCallback(() => {
    setSelectedDate(null)
  }, [])

  const handleCloseMealDetail = useCallback(() => {
    setSelectedMealId(null)
  }, [])

  const handleMealDeleted = useCallback(() => {
    setSelectedMealId(null)
    // Keep the day panel open to show remaining meals
  }, [])

  // Derived: today's date string
  const todayStr = useMemo(() => {
    const today = new Date()
    return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
  }, [])

  // Show loading state while Clerk is loading
  if (!isLoaded) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-600">Loading...</div>
      </div>
    )
  }

  // Redirect to sign-in if not authenticated
  if (!isSignedIn) {
    window.location.href = '/sign-in'
    return null
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Mobile Tabs */}
      <div className="lg:hidden border-b bg-white flex-shrink-0">
        <div className="flex">
          <button
            onClick={() => setActiveTab('record')}
            className={`flex-1 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'record'
                ? 'border-green-600 text-green-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
            aria-current={activeTab === 'record' ? 'page' : undefined}
          >
            🎤 Record
          </button>
          <button
            onClick={() => setActiveTab('calendar')}
            className={`flex-1 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'calendar'
                ? 'border-green-600 text-green-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
            aria-current={activeTab === 'calendar' ? 'page' : undefined}
          >
            📅 Calendar
          </button>
        </div>
      </div>

      {/* Desktop Split-Pane Layout */}
      <div className="flex-1 lg:flex overflow-hidden">
        {/* Left Pane: Record Controls (40%) */}
        <div
          className={`lg:w-[40%] lg:border-r lg:border-gray-200 bg-white lg:bg-gray-50 overflow-y-auto ${
            activeTab === 'record' ? 'block' : 'hidden lg:block'
          }`}
        >
          <div className="p-4 lg:p-8 max-w-xl mx-auto">
            <MealRecorder onMealCreated={handleMealCreated} />

            {/* Quick Actions */}
            <div className="mt-8 pt-6 border-t border-gray-200">
              <h3 className="text-sm font-medium text-gray-700 mb-3">Quick View</h3>
              <button
                type="button"
                onClick={() => handleSelectDate(todayStr)}
                className="w-full flex items-center justify-between p-3 bg-white border border-gray-200 rounded-lg hover:border-green-300 hover:shadow-sm transition-all"
              >
                <div className="flex items-center gap-2">
                  <span className="text-lg">📅</span>
                  <span className="text-sm text-gray-700">Today&apos;s meals</span>
                </div>
                <svg
                  className="w-5 h-5 text-gray-400"
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
              </button>
            </div>
          </div>
        </div>

        {/* Right Pane: Calendar (60%) */}
        <div
          className={`lg:w-[60%] overflow-y-auto bg-gray-50 ${
            activeTab === 'calendar' ? 'block' : 'hidden lg:block'
          }`}
        >
          <div className="p-4 lg:p-8">
            <MealCalendar
              year={calendarYear}
              month={calendarMonth}
              onPrevMonth={handlePrevMonth}
              onNextMonth={handleNextMonth}
              onSelectDate={handleSelectDate}
              selectedDate={selectedDate}
            />
          </div>
        </div>
      </div>

      {/* Day Meals SlideOver */}
      <DayMealsSlideOver
        isOpen={!!selectedDate && !selectedMealId}
        onClose={handleCloseDayMeals}
        date={selectedDate}
        onSelectMeal={handleSelectMeal}
      />

      {/* Meal Detail SlideOver */}
      <MealDetailSlideOver
        isOpen={!!selectedMealId}
        onClose={handleCloseMealDetail}
        mealId={selectedMealId}
        onDeleted={handleMealDeleted}
      />
    </div>
  )
}
