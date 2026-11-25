import { createFileRoute, Link } from '@tanstack/react-router'
import { CalendarDays, Camera, ChevronRight, Mic, UtensilsCrossed } from 'lucide-react'
import { useAuth } from '@clerk/clerk-react'
import { useState, useCallback, useEffect, useMemo } from 'react'
import MealCalendar from '../components/MealCalendar'
import MealRecorder from '../components/MealRecorder'
import MealComposer from '../components/MealComposer'
import DayMealsSlideOver from '../components/DayMealsSlideOver'
import MealDetailSlideOver from '../components/MealDetailSlideOver'
import SharedContentBanner from '../components/SharedContentBanner'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useShares } from '../hooks/useSharing'
import type { MealEntry } from '../lib/api'

interface MealsSearch {
  calendar_owner?: string
  /** Deep link from global search: open the day panel for this date. */
  date?: string
}

function isIsoDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const [year, month, day] = value.split('-').map(Number)
  const parsed = new Date(year, month - 1, day)
  return (
    parsed.getFullYear() === year && parsed.getMonth() === month - 1 && parsed.getDate() === day
  )
}

function todayIso(): string {
  const today = new Date()
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(
    today.getDate()
  ).padStart(2, '0')}`
}

export const Route = createFileRoute('/meals')({
  component: MealsPage,
  validateSearch: (search: Record<string, unknown>): MealsSearch => ({
    calendar_owner: typeof search.calendar_owner === 'string' ? search.calendar_owner : undefined,
    date: isIsoDate(search.date) ? search.date : undefined,
  }),
})

const MOBILE_TABS = [
  { id: 'record', label: 'Capture' },
  { id: 'calendar', label: 'Calendar' },
] as const

function MealsPage() {
  const { userId } = useAuth()
  const { calendar_owner: calendarOwner, date: dateParam } = Route.useSearch()
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

  const deepLinkDate = isIsoDate(dateParam) ? dateParam : null

  // Calendar state — a ?date= deep link opens directly on that month.
  const [calendarYear, setCalendarYear] = useState(() =>
    deepLinkDate ? Number(deepLinkDate.slice(0, 4)) : new Date().getFullYear()
  )
  const [calendarMonth, setCalendarMonth] = useState(() =>
    deepLinkDate ? Number(deepLinkDate.slice(5, 7)) : new Date().getMonth() + 1
  )

  // Selection state
  const [selectedDate, setSelectedDate] = useState<string | null>(deepLinkDate)
  const [selectedMealId, setSelectedMealId] = useState<string | null>(null)

  // Mobile tab state
  const [activeTab, setActiveTab] = useState<'record' | 'calendar'>(
    deepLinkDate ? 'calendar' : 'record'
  )

  // Capture panel mode and the date the typed composer opens with.
  const [captureMode, setCaptureMode] = useState<'speak' | 'type' | 'photo'>('speak')
  const [composerDate, setComposerDate] = useState(() => deepLinkDate || todayIso())
  // Forces the composer to remount when "Add a meal for this day" reuses a date.
  const [composerKey, setComposerKey] = useState(0)

  // Keep the day panel in sync when navigating to /meals?date=… while mounted
  // (for example from global search).
  useEffect(() => {
    if (!isIsoDate(dateParam)) return
    setCalendarYear(Number(dateParam.slice(0, 4)))
    setCalendarMonth(Number(dateParam.slice(5, 7)))
    setSelectedMealId(null)
    setSelectedDate(dateParam)
    setActiveTab('calendar')
  }, [dateParam])

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

  const handleToday = useCallback(() => {
    const today = new Date()
    setCalendarYear(today.getFullYear())
    setCalendarMonth(today.getMonth() + 1)
    setSelectedDate(todayIso())
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

  const handleTypedMealCreated = useCallback((meal: MealEntry) => {
    // Show the new meal in context rather than only toasting it.
    setCalendarYear(Number(meal.meal_date.slice(0, 4)))
    setCalendarMonth(Number(meal.meal_date.slice(5, 7)))
    setSelectedMealId(null)
    setSelectedDate(meal.meal_date)
    setActiveTab('calendar')
  }, [])

  const handleAddMealForDate = useCallback((date: string) => {
    // The day panel asked for a typed entry for a specific day.
    setSelectedMealId(null)
    setSelectedDate(null)
    setComposerDate(date)
    setComposerKey((key) => key + 1)
    setCaptureMode('type')
    setActiveTab('record')
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
  const todayStr = useMemo(() => todayIso(), [])

  // Show loading state while Clerk is loading

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <h1 className="sr-only">Meals</h1>
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
            search={{ tab: 'shares', resource: 'meal_calendar' }}
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
              <div
                role="group"
                aria-label="Capture method"
                className="border-line bg-surface mb-5 inline-flex rounded-lg border p-1"
              >
                <button
                  type="button"
                  onClick={() => setCaptureMode('speak')}
                  aria-pressed={captureMode === 'speak'}
                  className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                    captureMode === 'speak'
                      ? 'bg-brand-soft text-brand shadow-card'
                      : 'text-ink-muted hover:text-ink hover:bg-surface-muted'
                  }`}
                >
                  <Mic className="size-3.5" aria-hidden />
                  Speak
                </button>
                <button
                  type="button"
                  onClick={() => setCaptureMode('type')}
                  aria-pressed={captureMode === 'type'}
                  className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                    captureMode === 'type'
                      ? 'bg-brand-soft text-brand shadow-card'
                      : 'text-ink-muted hover:text-ink hover:bg-surface-muted'
                  }`}
                >
                  <UtensilsCrossed className="size-3.5" aria-hidden />
                  Type
                </button>
                <button
                  type="button"
                  onClick={() => setCaptureMode('photo')}
                  aria-pressed={captureMode === 'photo'}
                  className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                    captureMode === 'photo'
                      ? 'bg-brand-soft text-brand shadow-card'
                      : 'text-ink-muted hover:text-ink hover:bg-surface-muted'
                  }`}
                >
                  <Camera className="size-3.5" aria-hidden />
                  Photo
                </button>
              </div>

              {captureMode === 'speak' ? (
                <MealRecorder onMealCreated={handleMealCreated} calendarOwner={calendarOwner} />
              ) : (
                <MealComposer
                  key={`${composerDate}-${composerKey}`}
                  initialDate={composerDate}
                  onMealCreated={handleTypedMealCreated}
                  calendarOwner={calendarOwner}
                  photoMode={captureMode === 'photo'}
                />
              )}

              {/* Quick Actions */}
              <div className="border-line mt-7 border-t pt-5">
                <h3 className="section-label mb-2.5">Quick view</h3>
                <button
                  type="button"
                  onClick={() => handleSelectDate(todayStr)}
                  className="border-line bg-surface hover:border-line-strong hover:shadow-card focus-visible:ring-ring flex w-full items-center justify-between rounded-xl border p-3 transition-[border-color,box-shadow] focus-visible:ring-2 focus-visible:outline-none"
                >
                  <div className="flex items-center gap-2">
                    <CalendarDays className="text-ink-muted size-4" aria-hidden />
                    <span className="text-ink text-sm">Today&apos;s meals</span>
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
              onToday={handleToday}
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
        onAddMealForDate={canEdit ? handleAddMealForDate : undefined}
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
