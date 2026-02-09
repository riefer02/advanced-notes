import { createFileRoute, Link } from '@tanstack/react-router'
import { useAuth } from '@clerk/clerk-react'
import { useState, useCallback, useMemo } from 'react'
import MealCalendar from '../components/MealCalendar'
import MealRecorder from '../components/MealRecorder'
import DayMealsSlideOver from '../components/DayMealsSlideOver'
import MealDetailSlideOver from '../components/MealDetailSlideOver'
import SharedContentBanner from '../components/SharedContentBanner'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'

interface MealsSearch {
  calendar_owner?: string
}

export const Route = createFileRoute('/meals')({
  component: MealsPage,
  validateSearch: (search: Record<string, unknown>): MealsSearch => ({
    calendar_owner: typeof search.calendar_owner === 'string' ? search.calendar_owner : undefined,
  }),
})

const MOBILE_TABS = [
  { id: 'record', label: 'Record' },
  { id: 'calendar', label: 'Calendar' },
] as const

function MealsPage() {
  const { isLoaded, isSignedIn } = useAuth()
  const { calendar_owner: calendarOwner } = Route.useSearch()
  const isSharedView = !!calendarOwner

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
      {/* Shared Content Banner */}
      {isSharedView && calendarOwner && (
        <div className="px-4 pt-4 lg:px-8 lg:pt-6">
          <SharedContentBanner ownerId={calendarOwner} backTo="/meals" backLabel="Meal Calendar" />
        </div>
      )}

      {/* Share Calendar link (own view only) */}
      {!isSharedView && (
        <div className="px-4 pt-3 lg:px-8 lg:pt-4 flex justify-end">
          <Link
            to="/friends"
            search={{ tab: 'shares' }}
            className="text-xs text-gray-500 hover:text-gray-700 transition-colors"
          >
            Share Calendar
          </Link>
        </div>
      )}

      {/* Mobile Tabs */}
      {!isSharedView && (
        <div className="lg:hidden bg-white shrink-0 px-4 pt-2">
          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'record' | 'calendar')}>
            <TabsList className="w-full">
              {MOBILE_TABS.map((t) => (
                <TabsTrigger key={t.id} value={t.id} className="flex-1">
                  {t.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </div>
      )}

      {/* Desktop Split-Pane Layout */}
      <div className="flex-1 lg:flex overflow-hidden">
        {/* Left Pane: Record Controls (40%) — hidden in shared view */}
        {!isSharedView && (
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
                  className="w-full flex items-center justify-between p-3 bg-white border border-gray-200 rounded-lg hover:border-blue-300 hover:shadow-xs transition-all"
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
        )}

        {/* Right Pane: Calendar */}
        <div
          className={`${isSharedView ? 'w-full' : 'lg:w-[60%]'} overflow-y-auto bg-gray-50 ${
            isSharedView || activeTab === 'calendar' ? 'block' : 'hidden lg:block'
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
              calendarOwner={calendarOwner}
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
