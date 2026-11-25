import { createFileRoute, Link } from '@tanstack/react-router'
import { useAuth, useUser } from '@clerk/clerk-react'
import {
  ArrowRight,
  CheckCircle2,
  Disc3,
  Eye,
  FileText,
  MessageSquare,
  Mic,
  PenLine,
  Sparkles,
  UtensilsCrossed,
  X,
} from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { DetailCard, DetailCardHeader } from '@/components/ui/detail'
import { PageHeader } from '@/components/ui/page-header'
import { StatCard } from '@/components/ui/stat-card'
import { FirstRunChecklist } from '../components/FirstRunChecklist'
import { QueryStateRenderer } from '../components/QueryStateRenderer'
import { useAppShell } from '../components/layout/AppShell'
import { useDashboardStats } from '../hooks/useDashboard'
import { useMeals } from '../hooks/useMeals'
import { useNotes } from '../hooks/useNotes'
import { useMyProfile, useUpdateProfile } from '../hooks/useProfile'
import { useTodos } from '../hooks/useTodos'
import { formatAge, formatShortDate, pluralize } from '../lib/format'
import type { DashboardStats, MealEntry, MealType, Note } from '../lib/api'

export const Route = createFileRoute('/dashboard')({
  component: DashboardPage,
})

const MEAL_TYPE_LABELS: Record<MealType, string> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  dinner: 'Dinner',
  snack: 'Snack',
}

function getGreeting() {
  const hour = new Date().getHours()
  if (hour < 12) return 'Good morning'
  if (hour < 18) return 'Good afternoon'
  return 'Good evening'
}

/** Local calendar date (YYYY-MM-DD), matching the meals page's today. */
function toLocalIsoDate(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate()
  ).padStart(2, '0')}`
}

function isEmptyAccount(stats: DashboardStats): boolean {
  return stats.notes.total === 0 && stats.meals.this_month === 0 && stats.vinyl.total_records === 0
}

const DISCOVERABILITY_ACK_KEY = 'chisos:discoverability-ack'

function discoverabilityAckKey(userId: string | null | undefined): string {
  return `${DISCOVERABILITY_ACK_KEY}:${userId ?? 'anonymous'}`
}

function readDiscoverabilityAck(userId: string | null | undefined): boolean {
  if (typeof window === 'undefined') return false
  try {
    return window.localStorage.getItem(discoverabilityAckKey(userId)) === '1'
  } catch {
    return false
  }
}

function writeDiscoverabilityAck(userId: string | null | undefined) {
  try {
    window.localStorage.setItem(discoverabilityAckKey(userId), '1')
  } catch {
    // Storage can be unavailable; the prompt stays dismissed for this visit.
  }
}

/**
 * One-time, low-pressure check on the profile default (discoverable = true).
 * Skips itself while the profile is loading or if it cannot be read.
 */
function DiscoverabilityPrompt() {
  const { userId } = useAuth()
  const profileQuery = useMyProfile()
  const updateProfile = useUpdateProfile()
  const [acknowledged, setAcknowledged] = useState(false)
  const [decision, setDecision] = useState<'pending' | 'kept' | 'private'>('pending')

  useEffect(() => {
    setAcknowledged(readDiscoverabilityAck(userId))
  }, [userId])

  const isDiscoverable = profileQuery.data?.discoverable === true
  const shouldOffer = isDiscoverable && !acknowledged && decision === 'pending'

  if (!shouldOffer && decision !== 'private') return null

  if (decision === 'private') {
    return (
      <DetailCard className="px-4 py-3.5">
        <p className="text-ink text-[13px] leading-5 font-semibold">You&apos;re private now.</p>
        <p className="text-ink-subtle mt-0.5 text-xs leading-5">
          People can no longer find you by name, username, or email. Change this any time in
          Settings.
        </p>
      </DetailCard>
    )
  }

  const acknowledge = () => {
    writeDiscoverabilityAck(userId)
    setAcknowledged(true)
  }

  const handleKeep = () => {
    acknowledge()
    setDecision('kept')
  }

  const handlePrivate = async () => {
    try {
      await updateProfile.mutateAsync({ discoverable: false })
    } catch {
      return
    }
    acknowledge()
    setDecision('private')
  }

  return (
    <DetailCard className="px-4 py-3.5">
      <div className="flex items-start gap-3">
        <span className="bg-surface-muted text-ink-muted grid size-7 shrink-0 place-items-center rounded-md">
          <Eye className="size-3.5" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-ink text-[13px] leading-5 font-semibold">
            People can find you by name, username, or email. Keep that on?
          </p>
          <p className="text-ink-subtle mt-0.5 text-xs leading-5">
            New accounts start discoverable so friends can send requests. You can change this any
            time in Settings.
          </p>
          {updateProfile.isError && (
            <p className="text-destructive mt-1.5 text-xs">
              Couldn&apos;t save that just now. Try again from Settings.
            </p>
          )}
          <div className="mt-2.5 flex flex-wrap items-center gap-2">
            <Button size="sm" onClick={handleKeep}>
              Keep discoverable
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={handlePrivate}
              disabled={updateProfile.isPending}
            >
              {updateProfile.isPending ? 'Saving…' : 'Make me private'}
            </Button>
          </div>
        </div>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Dismiss privacy prompt"
          onClick={handleKeep}
        >
          <X className="size-4" />
        </Button>
      </div>
    </DetailCard>
  )
}

function DashboardPage() {
  const { user } = useUser()
  const statsQuery = useDashboardStats()
  const { openAsk } = useAppShell()

  const firstName = user?.firstName || 'there'
  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  })
  const stats = statsQuery.data
  const showToday = !!stats && !isEmptyAccount(stats)

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-5xl space-y-6 px-5 py-6 sm:px-8">
        <PageHeader
          title={`${getGreeting()}, ${firstName}`}
          description={today}
          actions={
            <div className="flex flex-wrap items-center gap-0.5">
              <Button variant="ghost" size="sm" asChild>
                <Link to="/notes" search={{ compose: true }}>
                  <PenLine className="size-4" />
                  Write
                </Link>
              </Button>
              <Button variant="ghost" size="sm" asChild>
                <Link to="/notes">
                  <Mic className="size-4" />
                  Record
                </Link>
              </Button>
              <Button variant="ghost" size="sm" asChild>
                <Link to="/meals">
                  <UtensilsCrossed className="size-4" />
                  Log meal
                </Link>
              </Button>
              <Button variant="ghost" size="sm" onClick={openAsk}>
                <MessageSquare className="size-4" />
                Ask notes
              </Button>
              <Button variant="ghost" size="sm" asChild>
                <Link to="/summaries">
                  <FileText className="size-4" />
                  Summarize
                </Link>
              </Button>
            </div>
          }
        />

        <DiscoverabilityPrompt />

        <QueryStateRenderer
          data={stats}
          isLoading={statsQuery.isLoading}
          error={statsQuery.error}
          loadingComponent={<StatsSkeleton />}
        >
          {(loaded: DashboardStats) => (
            <>
              {isEmptyAccount(loaded) && <FirstRunChecklist />}
              <StatsGrid stats={loaded} />
              {!isEmptyAccount(loaded) && <InsightLine stats={loaded} />}
            </>
          )}
        </QueryStateRenderer>

        {showToday && <TodayGrid />}
      </div>
    </div>
  )
}

/* ==========================================================================
   Today — the daily home. One recent-captures column plus meals and todos.
   ========================================================================== */

function TodayGrid() {
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <RecentCaptures className="lg:col-span-2" />
      <div className="space-y-4">
        <TodaysMeals />
        <ActiveTodos />
      </div>
    </div>
  )
}

function SectionSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="border-line space-y-2.5 border-t px-4 py-3" role="status" aria-label="Loading">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="animate-pulse space-y-1.5">
          <div className="bg-surface-sunken h-3 w-2/5 rounded-sm" />
          <div className="bg-surface-sunken h-2.5 w-4/5 rounded-sm" />
        </div>
      ))}
    </div>
  )
}

function SectionEmpty({ children }: { children: ReactNode }) {
  return (
    <p className="text-ink-subtle border-line border-t px-4 py-4 text-[13px] leading-5">
      {children}
    </p>
  )
}

function notePreview(note: Note): string {
  const text = (note.summary || note.content || '')
    .replace(/[#*>_`~-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return text || note.folder_path || 'No preview'
}

function mealDescription(meal: MealEntry): string {
  if (meal.items.length > 0) {
    return meal.items.map((item) => item.name).join(', ')
  }
  return meal.transcription || 'No details'
}

function RecentCaptures({ className }: { className?: string }) {
  const notesQuery = useNotes(undefined, 6)

  return (
    <DetailCard className={className}>
      <DetailCardHeader
        title="Recent captures"
        subtitle="Your latest notes, newest first"
        icon={FileText}
        action={
          <Button variant="ghost" size="xs" asChild>
            <Link to="/notes">
              View all
              <ArrowRight className="size-3" />
            </Link>
          </Button>
        }
        className="pb-2.5"
      />
      <QueryStateRenderer
        data={notesQuery.data}
        isLoading={notesQuery.isLoading}
        error={notesQuery.error}
        loadingComponent={<SectionSkeleton rows={3} />}
        emptyCheck={(data) => data.notes.length === 0}
        emptyComponent={
          <SectionEmpty>
            No active notes.{' '}
            <Link to="/notes" className="text-brand hover:underline">
              Open Notes
            </Link>{' '}
            to check the archive or capture something new.
          </SectionEmpty>
        }
      >
        {(data) => (
          <div className="border-line divide-line divide-y border-t">
            {data.notes.map((note) => (
              <Link
                key={note.id}
                to="/notes"
                search={{ note: note.id }}
                className="hover:bg-surface-muted/60 focus-visible:bg-surface-muted/60 group flex items-start justify-between gap-4 px-4 py-2.5 transition-colors focus-visible:outline-none"
              >
                <span className="min-w-0">
                  <span className="text-ink block truncate text-[13px] leading-5 font-medium">
                    {note.title || 'Untitled note'}
                  </span>
                  <span className="text-ink-subtle mt-0.5 block truncate text-xs leading-4">
                    {notePreview(note)}
                  </span>
                </span>
                <span className="text-ink-subtle shrink-0 text-[11px] leading-5">
                  {formatAge(note.created_at)}
                </span>
              </Link>
            ))}
          </div>
        )}
      </QueryStateRenderer>
    </DetailCard>
  )
}

function TodaysMeals() {
  const today = new Date()
  const todayIso = toLocalIsoDate(today)
  const mealsQuery = useMeals({ start_date: todayIso, end_date: todayIso, limit: 10 })

  return (
    <DetailCard>
      <DetailCardHeader
        title="Today's meals"
        subtitle={formatShortDate(today)}
        icon={UtensilsCrossed}
        action={
          <Button variant="ghost" size="xs" asChild>
            <Link to="/meals" search={{ date: todayIso }}>
              All meals
              <ArrowRight className="size-3" />
            </Link>
          </Button>
        }
        className="pb-2.5"
      />
      <QueryStateRenderer
        data={mealsQuery.data}
        isLoading={mealsQuery.isLoading}
        error={mealsQuery.error}
        loadingComponent={<SectionSkeleton rows={2} />}
        emptyCheck={(data) => data.meals.length === 0}
        emptyComponent={
          <SectionEmpty>
            No meals logged today.{' '}
            <Link to="/meals" className="text-brand hover:underline">
              Log a meal
            </Link>
          </SectionEmpty>
        }
      >
        {(data) => (
          <div className="border-line divide-line divide-y border-t">
            {data.meals.map((meal) => (
              <Link
                key={meal.id}
                to="/meals"
                search={{ date: meal.meal_date }}
                className="hover:bg-surface-muted/60 group flex items-start justify-between gap-3 px-4 py-2.5 transition-colors focus-visible:outline-none"
              >
                <span className="min-w-0">
                  <span className="text-ink block text-[13px] leading-5 font-medium">
                    {MEAL_TYPE_LABELS[meal.meal_type] ?? 'Meal'}
                  </span>
                  <span className="text-ink-subtle mt-0.5 block truncate text-xs leading-4">
                    {mealDescription(meal)}
                  </span>
                </span>
                <ArrowRight className="text-ink-subtle mt-1 size-3 shrink-0 opacity-0 transition-opacity group-hover:opacity-100" />
              </Link>
            ))}
          </div>
        )}
      </QueryStateRenderer>
    </DetailCard>
  )
}

function ActiveTodos() {
  const todosQuery = useTodos({ status: 'accepted', limit: 5 })

  return (
    <DetailCard>
      <DetailCardHeader
        title="Active todos"
        subtitle="Tasks you accepted, newest first"
        icon={CheckCircle2}
        action={
          <Button variant="ghost" size="xs" asChild>
            <Link to="/todos">
              View all
              <ArrowRight className="size-3" />
            </Link>
          </Button>
        }
        className="pb-2.5"
      />
      <QueryStateRenderer
        data={todosQuery.data}
        isLoading={todosQuery.isLoading}
        error={todosQuery.error}
        loadingComponent={<SectionSkeleton rows={2} />}
        emptyCheck={(data) => data.todos.length === 0}
        emptyComponent={
          <SectionEmpty>
            Nothing active. Accept a suggested todo from a note and it shows up here.
          </SectionEmpty>
        }
      >
        {(data) => (
          <div className="border-line divide-line divide-y border-t">
            {data.todos.map((todo) => (
              <Link
                key={todo.id}
                to="/todos"
                className="hover:bg-surface-muted/60 focus-visible:bg-surface-muted/60 group flex items-center justify-between gap-4 px-4 py-2.5 transition-colors focus-visible:outline-none"
              >
                <span className="flex min-w-0 items-center gap-2.5">
                  <span className="border-line-strong size-3.5 shrink-0 rounded-full border" />
                  <span className="text-ink truncate text-[13px] leading-5">{todo.title}</span>
                </span>
                <span className="text-ink-subtle flex shrink-0 items-center gap-2 text-[11px]">
                  {formatAge(todo.created_at)}
                  <ArrowRight className="size-3 opacity-0 transition-opacity group-hover:opacity-100" />
                </span>
              </Link>
            ))}
          </div>
        )}
      </QueryStateRenderer>
    </DetailCard>
  )
}

/**
 * One honest AI line from DashboardStats — no extra endpoint, no invented data.
 */
function InsightLine({ stats }: { stats: DashboardStats }) {
  if (stats.todos.suggested > 0) {
    return (
      <div className="px-1">
        <Link
          to="/todos"
          className="text-ink-muted hover:text-ink group inline-flex items-center gap-1.5 text-xs transition-colors"
        >
          <Sparkles className="text-ink-subtle size-3.5" aria-hidden />
          <span>{pluralize(stats.todos.suggested, 'new task')} found in your notes</span>
          <ArrowRight
            className="size-3 opacity-60 transition-opacity group-hover:opacity-100"
            aria-hidden
          />
        </Link>
      </div>
    )
  }

  return (
    <div className="px-1">
      <p className="text-ink-subtle inline-flex items-center gap-1.5 text-xs">
        <Sparkles className="size-3.5" aria-hidden />
        No new suggestions from your notes.
      </p>
    </div>
  )
}

function StatsSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-2 sm:gap-2.5 lg:grid-cols-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <div
          key={i}
          className="border-line bg-surface flex animate-pulse items-center gap-3 rounded-xl border p-3.5"
        >
          <div className="bg-surface-sunken size-8 shrink-0 rounded-lg" />
          <div className="space-y-1.5">
            <div className="bg-surface-sunken h-2.5 w-14 rounded-sm" />
            <div className="bg-surface-sunken h-4 w-8 rounded-sm" />
          </div>
        </div>
      ))}
    </div>
  )
}

function StatsGrid({ stats }: { stats: DashboardStats }) {
  return (
    <div className="grid auto-rows-fr grid-cols-2 gap-2 sm:gap-2.5 lg:grid-cols-4">
      <Link to="/notes" className="block min-w-0">
        <StatCard
          icon={FileText}
          accent="notes"
          label="Notes"
          value={stats.notes.total}
          meta="recorded"
        />
      </Link>

      <Link to="/todos" className="block min-w-0">
        <StatCard
          icon={CheckCircle2}
          accent="tasks"
          label="Active todos"
          value={stats.todos.accepted}
          meta={`${stats.todos.completed} done`}
          badge={
            stats.todos.suggested > 0 ? (
              <Badge variant="info" className="text-2xs px-1.5 py-0 leading-4 font-medium">
                {stats.todos.suggested} new
              </Badge>
            ) : undefined
          }
        />
      </Link>

      <Link to="/meals" className="block min-w-0">
        <StatCard
          icon={UtensilsCrossed}
          accent="meals"
          label="Meals"
          value={stats.meals.this_month}
          meta={`${stats.meals.today} today`}
        />
      </Link>

      <Link to="/vinyl" className="block min-w-0">
        <StatCard
          icon={Disc3}
          accent="vinyl"
          label="Records"
          value={stats.vinyl.total_records}
          meta={pluralize(stats.vinyl.total_artists, 'artist')}
        />
      </Link>
    </div>
  )
}
