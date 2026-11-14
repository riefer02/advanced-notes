import { createFileRoute, Link } from '@tanstack/react-router'
import { ChevronRight } from 'lucide-react'
import { useAuth } from '@clerk/clerk-react'
import { useState, useCallback, useMemo } from 'react'
import MealCalendar from '../components/MealCalendar'
import MealRecorder from '../components/MealRecorder'
import DayMealsSlideOver from '../components/DayMealsSlideOver'
import MealDetailSlideOver from '../components/MealDetailSlideOver'
import SharedContentBanner from '../components/SharedContentBanner'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useShares } from '../hooks/useSharing'

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
  const { userId } = useAuth()
  const { calendar_owner: calendarOwner } = Route.useSearch()
  const isSharedView = !!calendarOwner
  const { data: sharesData } = useShares()
  const canEdit =
    !calendarOwner ||
    sharesData?.received?.some(
      (s) =>
        s.owner_id === calendarOwner &&
        s.resource_type === 'meal_calendar' &&
        s.permission === 'edit' &&
        s.status === 'accepted'
    ) ||
    false

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

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Shared Content Banner */}
      {isSharedView && calendarOwner && (
        <div className="px-4 pt-4 lg:px-8 lg:pt-6">
          <SharedContentBanner
            ownerId={calendarOwner}
            backTo="/meals"
            backLabel="Meal Calendar"
            canEdit={canEdit}
          />
        </div>
      )}

      {/* Share Calendar link (own view only) */}
      {!isSharedView && (
        <div className="px-4 pt-3 lg:px-8 lg:pt-4 flex justify-end">
          <Link
            to="/friends"
            search={{ tab: 'shares' }}
            className="text-xs text-ink-subtle hover:text-ink transition-colors"
          >
            Share Calendar
          </Link>
        </div>
      )}

      {/* Mobile Tabs */}
      {(!isSharedView || canEdit) && (
        <div className="lg:hidden bg-surface shrink-0 px-4 pt-2">
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
        {/* Left Pane: Record Controls (40%) — hidden in view-only shared view */}
        {(!isSharedView || canEdit) && (
          <div
            className={`lg:w-[40%] lg:border-r lg:border-line bg-surface lg:bg-surface-muted overflow-y-auto ${
              activeTab === 'record' ? 'block' : 'hidden lg:block'
            }`}
          >
            <div className="mx-auto max-w-xl px-5 py-6 sm:px-8">
              <MealRecorder onMealCreated={handleMealCreated} calendarOwner={calendarOwner} />

              {/* Quick Actions */}
              <div className="border-line mt-7 border-t pt-5">
                <h3 className="section-label mb-2.5">Quick view</h3>
                <button
                  type="button"
                  onClick={() => handleSelectDate(todayStr)}
                  className="border-line bg-surface hover:border-line-strong hover:shadow-card focus-visible:ring-ring flex w-full items-center justify-between rounded-xl border p-3 transition-[border-color,box-shadow] focus-visible:ring-2 focus-visible:outline-none"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-lg">📅</span>
                    <span className="text-sm text-ink">Today&apos;s meals</span>
                  </div>
                  <ChevronRight className="text-ink-subtle size-4" aria-hidden />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Right Pane: Calendar */}
        <div
          className={`${isSharedView && !canEdit ? 'w-full' : 'lg:w-[60%]'} overflow-y-auto bg-surface-muted ${
            (isSharedView && !canEdit) || activeTab === 'calendar' ? 'block' : 'hidden lg:block'
          }`}
        >
          <div className="px-5 py-6 sm:px-8">
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
        calendarOwner={calendarOwner}
      />

      {/* Meal Detail SlideOver */}
      <MealDetailSlideOver
        isOpen={!!selectedMealId}
        onClose={handleCloseMealDetail}
        mealId={selectedMealId}
        onDeleted={handleMealDeleted}
        calendarOwner={calendarOwner}
        currentUserId={userId ?? undefined}
      />
    </div>
  )
}
