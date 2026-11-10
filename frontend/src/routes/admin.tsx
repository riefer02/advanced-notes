import { createFileRoute } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  fetchOpsEvents,
  fetchOpsSummary,
  fetchProblemReports,
  retryOutbox,
  sendTestAlert,
  updateProblemReportStatus,
  type ProblemReport,
  type ReportStatus,
} from '../lib/api'

export const Route = createFileRoute('/admin')({
  component: AdminPage,
})

const SUMMARY_KEY = ['admin', 'ops-summary'] as const
const REPORTS_KEY = ['admin', 'reports'] as const
const EVENTS_KEY = ['admin', 'ops-events'] as const

function formatDate(value: string | null | undefined): string {
  if (!value) return '—'
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString()
}

function formatAge(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined) return '—'
  if (seconds < 60) return `${seconds}s ago`
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
  return `${Math.floor(seconds / 86400)}d ago`
}

function reportVariant(status: ReportStatus) {
  if (status === 'resolved') return 'success' as const
  if (status === 'triaged') return 'info' as const
  if (status === 'ignored') return 'neutral' as const
  return 'warning' as const
}

export default function AdminPage() {
  const queryClient = useQueryClient()

  const summaryQuery = useQuery({
    queryKey: SUMMARY_KEY,
    queryFn: fetchOpsSummary,
    retry: false,
    refetchInterval: 30_000,
  })
  const reportsQuery = useQuery({
    queryKey: REPORTS_KEY,
    queryFn: () => fetchProblemReports(),
    retry: false,
    refetchInterval: 60_000,
  })
  const eventsQuery = useQuery({
    queryKey: EVENTS_KEY,
    queryFn: () => fetchOpsEvents(25),
    retry: false,
    refetchInterval: 60_000,
  })

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: ReportStatus }) =>
      updateProblemReportStatus(id, status),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: REPORTS_KEY })
      void queryClient.invalidateQueries({ queryKey: SUMMARY_KEY })
    },
  })

  const testAlertMutation = useMutation({ mutationFn: sendTestAlert })
  const outboxRetryMutation = useMutation({
    mutationFn: () => retryOutbox(true),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: SUMMARY_KEY })
    },
  })

  const forbidden =
    summaryQuery.error instanceof Error &&
    summaryQuery.error.message.toLowerCase().includes('forbidden')

  if (forbidden) {
    return (
      <div className="mx-auto max-w-3xl p-6 lg:p-10">
        <Alert variant="warning">
          <AlertTitle>Admin access required</AlertTitle>
          <AlertDescription>
            Your account is not listed in <code>ADMIN_USER_IDS</code>. Ask the owner to add your
            Clerk user id.
          </AlertDescription>
        </Alert>
      </div>
    )
  }

  const summary = summaryQuery.data
  const outbox = summary?.outbox
  const outboxCounts = outbox?.counts
  const reports = reportsQuery.data?.reports ?? []
  const events = eventsQuery.data?.events ?? []

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6 lg:p-10">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Operations</h1>
          <p className="mt-1 text-sm text-gray-600">
            Live health for the administrator. Not linked in navigation.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              void summaryQuery.refetch()
              void reportsQuery.refetch()
              void eventsQuery.refetch()
            }}
            loading={summaryQuery.isFetching}
          >
            Refresh
          </Button>
          <Button
            size="sm"
            onClick={() => testAlertMutation.mutate()}
            loading={testAlertMutation.isPending}
          >
            Send test alert
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => outboxRetryMutation.mutate()}
            loading={outboxRetryMutation.isPending}
          >
            Retry email outbox
          </Button>
        </div>
      </div>

      {summaryQuery.isError && !forbidden && (
        <Alert variant="destructive">
          <AlertTitle>Could not load operations summary</AlertTitle>
          <AlertDescription>
            {summaryQuery.error instanceof Error ? summaryQuery.error.message : 'Unknown error'}
          </AlertDescription>
        </Alert>
      )}

      {testAlertMutation.isSuccess && (
        <Alert variant={testAlertMutation.data.queued ? 'success' : 'warning'}>
          <AlertTitle>
            {testAlertMutation.data.queued ? 'Test alert queued' : 'Test alert not queued'}
          </AlertTitle>
          <AlertDescription>
            {testAlertMutation.data.queued
              ? `Check the admin inbox (${testAlertMutation.data.recipients} recipient${
                  testAlertMutation.data.recipients === 1 ? '' : 's'
                }).`
              : 'Email is not configured. Set SES credentials and ADMIN_EMAILS.'}
          </AlertDescription>
        </Alert>
      )}

      {outboxRetryMutation.isSuccess && (
        <Alert variant="success">
          <AlertTitle>Outbox recovery requested</AlertTitle>
          <AlertDescription>
            {`Requeued ${outboxRetryMutation.data.requeued} failed email${
              outboxRetryMutation.data.requeued === 1 ? '' : 's'
            } and reclaimed ${outboxRetryMutation.data.reclaimed} stuck row${
              outboxRetryMutation.data.reclaimed === 1 ? '' : 's'
            }.`}
          </AlertDescription>
        </Alert>
      )}

      {summary && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Card>
            <CardHeader>
              <CardDescription>Environment</CardDescription>
              <CardTitle className="flex items-center gap-2">
                {summary.environment}
                <Badge variant={summary.database.ok ? 'success' : 'destructive'}>
                  {summary.database.ok ? 'DB healthy' : 'DB down'}
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-gray-600">
              Release: {summary.release || 'unknown'}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardDescription>Server errors</CardDescription>
              <CardTitle>{summary.errors.last_24h} in 24h</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-gray-600">
              {summary.errors.last_hour} in the last hour
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardDescription>Email worker</CardDescription>
              <CardTitle className="flex items-center gap-2">
                {formatAge(summary.worker.age_seconds)}
                <Badge
                  variant={
                    summary.worker.age_seconds !== null &&
                    summary.worker.age_seconds <= summary.worker.stale_after_seconds
                      ? 'success'
                      : 'warning'
                  }
                >
                  {summary.worker.age_seconds === null ? 'missing' : 'heartbeat'}
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-gray-600">
              Last seen: {formatDate(summary.worker.last_seen_at)}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardDescription>Email outbox</CardDescription>
              <CardTitle>
                {outboxCounts?.pending ?? 0} pending · {outboxCounts?.failed ?? 0} failed
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-gray-600">
              Oldest pending: {formatAge(outbox?.oldest_pending_age_seconds)}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardDescription>Problem reports</CardDescription>
              <CardTitle>{summary.problem_reports.open} open</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-gray-600">
              {summary.problem_reports.last_24h} in the last 24h
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardDescription>Admin email</CardDescription>
              <CardTitle>{summary.email.configured ? 'Configured' : 'Not configured'}</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-gray-600">
              {summary.email.recipients} recipient
              {summary.email.recipients === 1 ? '' : 's'}
            </CardContent>
          </Card>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Top errors (24h)</CardTitle>
          <CardDescription>Grouped by route, exception type, and 10-minute bucket.</CardDescription>
        </CardHeader>
        <CardContent>
          {summary && summary.errors.top_24h.length > 0 ? (
            <div className="divide-y">
              {summary.errors.top_24h.map((item) => (
                <div
                  key={item.fingerprint}
                  className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm"
                >
                  <div>
                    <span className="font-medium text-gray-900">{item.error_type || 'Error'}</span>{' '}
                    <span className="text-gray-500">on {item.route || 'unknown route'}</span>
                  </div>
                  <div className="text-gray-600">
                    {item.count}× · last {formatDate(item.last_seen_at)}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-600">No server errors recorded. Good.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Problem reports</CardTitle>
          <CardDescription>
            Reports are persisted before email, so they survive a broken mail path.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {reportsQuery.isLoading ? (
            <p className="text-sm text-gray-600">Loading reports…</p>
          ) : reports.length === 0 ? (
            <p className="text-sm text-gray-600">No reports.</p>
          ) : (
            <div className="space-y-3">
              {reports.map((report) => (
                <ReportRow
                  key={report.id}
                  report={report}
                  onStatus={(status) => statusMutation.mutate({ id: report.id, status })}
                  busy={statusMutation.isPending}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recent ops events</CardTitle>
          <CardDescription>Newest 25 errors and degraded-dependency events.</CardDescription>
        </CardHeader>
        <CardContent>
          {events.length === 0 ? (
            <p className="text-sm text-gray-600">No events recorded.</p>
          ) : (
            <div className="divide-y">
              {events.map((event) => (
                <div key={event.id} className="py-2 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-medium text-gray-900">
                      {event.status} {event.error_type || 'Error'}
                    </span>
                    <span className="text-gray-500">{formatDate(event.created_at)}</span>
                  </div>
                  <p className="text-gray-600">
                    {event.method} {event.route || event.path || '—'}
                  </p>
                  {event.message && (
                    <p className="mt-1 line-clamp-2 text-xs text-gray-500">{event.message}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function ReportRow({
  report,
  onStatus,
  busy,
}: {
  report: ProblemReport
  onStatus: (status: ReportStatus) => void
  busy: boolean
}) {
  return (
    <div className="rounded-lg border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Badge variant={reportVariant(report.status)}>{report.status}</Badge>
          <span className="text-sm font-medium text-gray-900">{formatDate(report.created_at)}</span>
        </div>
        <span className="text-xs text-gray-500">{report.page || 'unknown page'}</span>
      </div>
      <p className="mt-2 whitespace-pre-wrap text-sm text-gray-800">
        {report.message || '(no message)'}
      </p>
      <p className="mt-1 text-xs text-gray-500">
        User: {report.user_id || 'anonymous'} · Notified: {formatDate(report.notified_at)}
      </p>
      {report.status !== 'resolved' && report.status !== 'ignored' && (
        <div className="mt-2 flex gap-2">
          {report.status === 'new' && (
            <Button size="xs" variant="outline" disabled={busy} onClick={() => onStatus('triaged')}>
              Mark triaged
            </Button>
          )}
          <Button size="xs" variant="outline" disabled={busy} onClick={() => onStatus('resolved')}>
            Mark resolved
          </Button>
          <Button size="xs" variant="ghost" disabled={busy} onClick={() => onStatus('ignored')}>
            Ignore
          </Button>
        </div>
      )}
    </div>
  )
}
