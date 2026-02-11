import { createFileRoute, Link } from '@tanstack/react-router'
import { useAuth, useUser } from '@clerk/clerk-react'
import {
  FileText,
  CheckCircle2,
  UtensilsCrossed,
  Disc3,
  Mic,
  MessageSquare,
  ArrowRight,
} from 'lucide-react'

import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
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
  const { isLoaded, isSignedIn } = useAuth()
  const { user } = useUser()
  const statsQuery = useDashboardStats()
  const todosQuery = useTodos({ status: 'accepted', limit: 5 })
  const { openAsk } = useAppShell()

  if (!isLoaded) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-gray-600">Loading...</div>
      </div>
    )
  }

  if (!isSignedIn) {
    window.location.href = '/sign-in'
    return null
  }

  const firstName = user?.firstName || 'there'
  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  })

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-8">
        {/* Greeting */}
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            {getGreeting()}, {firstName}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">{today}</p>
        </div>

        {/* Stats Grid */}
        <QueryStateRenderer
          data={statsQuery.data}
          isLoading={statsQuery.isLoading}
          error={statsQuery.error}
        >
          {(stats: DashboardStats) => <StatsGrid stats={stats} />}
        </QueryStateRenderer>

        {/* Quick Actions */}
        <div>
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">
            Quick Actions
          </h2>
          <div className="flex flex-wrap gap-2">
            <Link to="/notes">
              <Button variant="outline" size="sm">
                <Mic className="h-4 w-4 mr-1.5" />
                Record a Note
              </Button>
            </Link>
            <Link to="/meals">
              <Button variant="outline" size="sm">
                <UtensilsCrossed className="h-4 w-4 mr-1.5" />
                Log a Meal
              </Button>
            </Link>
            <Button variant="outline" size="sm" onClick={openAsk}>
              <MessageSquare className="h-4 w-4 mr-1.5" />
              Ask Notes
            </Button>
            <Link to="/summaries">
              <Button variant="outline" size="sm">
                <FileText className="h-4 w-4 mr-1.5" />
                Create Summary
              </Button>
            </Link>
          </div>
        </div>

        {/* Active Todos */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">
              Active Todos
            </h2>
            <Link
              to="/todos"
              className="text-sm text-blue-600 hover:text-blue-800 flex items-center gap-1"
            >
              View all <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
          <QueryStateRenderer
            data={todosQuery.data}
            isLoading={todosQuery.isLoading}
            error={todosQuery.error}
            emptyCheck={(data) => data.todos.length === 0}
            emptyComponent={
              <p className="text-sm text-muted-foreground py-4">
                No active todos. Tasks you accept will appear here.
              </p>
            }
          >
            {(data) => (
              <div className="space-y-2">
                {data.todos.map((todo) => (
                  <Link
                    key={todo.id}
                    to="/todos"
                    className="block rounded-lg border bg-white p-3 hover:border-blue-300 hover:shadow-sm transition"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-gray-900">{todo.title}</span>
                      <span className="text-xs text-muted-foreground">
                        {formatAge(todo.created_at)}
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </QueryStateRenderer>
        </div>
      </div>
    </div>
  )
}

function StatsGrid({ stats }: { stats: DashboardStats }) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      <Link to="/notes">
        <Card className="hover:border-blue-300 hover:shadow-md transition-all cursor-pointer h-full">
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-blue-50 p-2">
                <FileText className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900">{stats.notes.total}</p>
                <p className="text-xs text-muted-foreground">Notes recorded</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </Link>

      <Link to="/todos">
        <Card className="hover:border-green-300 hover:shadow-md transition-all cursor-pointer h-full">
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-green-50 p-2">
                <CheckCircle2 className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <p className="text-2xl font-bold text-gray-900">{stats.todos.accepted}</p>
                  {stats.todos.suggested > 0 && (
                    <Badge variant="info" className="text-[10px]">
                      {stats.todos.suggested} new
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  Active &middot; {stats.todos.completed} done
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </Link>

      <Link to="/meals">
        <Card className="hover:border-orange-300 hover:shadow-md transition-all cursor-pointer h-full">
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-orange-50 p-2">
                <UtensilsCrossed className="h-5 w-5 text-orange-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900">{stats.meals.this_month}</p>
                <p className="text-xs text-muted-foreground">
                  This month &middot; {stats.meals.today} today
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </Link>

      <Link to="/vinyl">
        <Card className="hover:border-purple-300 hover:shadow-md transition-all cursor-pointer h-full">
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-purple-50 p-2">
                <Disc3 className="h-5 w-5 text-purple-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900">{stats.vinyl.total_records}</p>
                <p className="text-xs text-muted-foreground">
                  Records &middot; {stats.vinyl.total_artists} artists
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
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
