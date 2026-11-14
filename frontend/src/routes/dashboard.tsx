import { createFileRoute, Link } from '@tanstack/react-router'
import { useUser } from '@clerk/clerk-react'
import {
  ArrowRight,
  CheckCircle2,
  Disc3,
  FileText,
  MessageSquare,
  Mic,
  PenLine,
  UtensilsCrossed,
} from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { DetailCard, DetailCardHeader } from '@/components/ui/detail'
import { PageHeader } from '@/components/ui/page-header'
import { StatCard } from '@/components/ui/stat-card'
import { QueryStateRenderer } from '../components/QueryStateRenderer'
import { useDashboardStats } from '../hooks/useDashboard'
import { useTodos } from '../hooks/useTodos'
import { useAppShell } from '../components/layout/AppShell'
import type { DashboardStats } from '../lib/api'

export const Route = createFileRoute('/dashboard')({
  component: DashboardPage,
})

function getGreeting() {
  const hour = new Date().getHours()
  if (hour < 12) return 'Good morning'
  if (hour < 18) return 'Good afternoon'
  return 'Good evening'
}

function DashboardPage() {
  const { user } = useUser()
  const statsQuery = useDashboardStats()
  const todosQuery = useTodos({ status: 'accepted', limit: 5 })
  const { openAsk } = useAppShell()

  const firstName = user?.firstName || 'there'
  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  })

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

        <QueryStateRenderer
          data={statsQuery.data}
          isLoading={statsQuery.isLoading}
          error={statsQuery.error}
        >
          {(stats: DashboardStats) => <StatsGrid stats={stats} />}
        </QueryStateRenderer>

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
            emptyCheck={(data) => data.todos.length === 0}
            emptyComponent={
              <p className="text-ink-subtle border-line border-t px-4 py-5 text-[13px]">
                Nothing active. Accept a suggested todo from a note and it shows up here.
              </p>
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
      </div>
    </div>
  )
}

function StatsGrid({ stats }: { stats: DashboardStats }) {
  return (
    <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
      <Link to="/notes" className="block">
        <StatCard
          icon={FileText}
          accent="notes"
          label="Notes"
          value={stats.notes.total}
          meta="recorded"
        />
      </Link>

      <Link to="/todos" className="block">
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

      <Link to="/meals" className="block">
        <StatCard
          icon={UtensilsCrossed}
          accent="meals"
          label="Meals"
          value={stats.meals.this_month}
          meta={`${stats.meals.today} today`}
        />
      </Link>

      <Link to="/vinyl" className="block">
        <StatCard
          icon={Disc3}
          accent="vinyl"
          label="Records"
          value={stats.vinyl.total_records}
          meta={`${stats.vinyl.total_artists} artists`}
        />
      </Link>
    </div>
  )
}

function formatAge(dateStr: string): string {
  const now = Date.now()
  const created = new Date(dateStr).getTime()
  const diffMs = now - created
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

  if (diffDays === 0) return 'today'
  if (diffDays === 1) return '1d ago'
  if (diffDays < 7) return `${diffDays}d ago`
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`
  return `${Math.floor(diffDays / 30)}mo ago`
}
