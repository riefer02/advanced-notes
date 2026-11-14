import { createFileRoute } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Activity, Bug, Inbox, Mail, RefreshCw, RotateCw, Send, Server } from 'lucide-react'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { DetailCard, DetailCardHeader, Disclosure } from '@/components/ui/detail'
import { PageHeader } from '@/components/ui/page-header'
import { StatCard } from '@/components/ui/stat-card'
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
      <div className="mx-auto max-w-3xl px-5 py-6 sm:px-8">
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
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-5xl space-y-4 px-5 py-6 sm:px-8">
        <PageHeader
          title="Operations"
          description="Live health for the administrator. Not linked in navigation."
          actions={
            <>
              <Button
                size="sm"
                onClick={() => {
                  void summaryQuery.refetch()
                  void reportsQuery.refetch()
                  void eventsQuery.refetch()
                }}
                loading={summaryQuery.isFetching}
              >
                <RefreshCw />
                Refresh
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => testAlertMutation.mutate()}
                loading={testAlertMutation.isPending}
              >
                <Send />
                Test alert
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => outboxRetryMutation.mutate()}
                loading={outboxRetryMutation.isPending}
                disabled={summary?.database.ok === false}
              >
                <RotateCw />
                Retry outbox
              </Button>
            </>
          }
        />

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

        {(statusMutation.isError || testAlertMutation.isError || outboxRetryMutation.isError) && (
          <Alert variant="destructive">
            <AlertTitle>Admin action failed</AlertTitle>
            <AlertDescription>
              {(statusMutation.error || testAlertMutation.error || outboxRetryMutation.error)
                ?.message || 'Please retry.'}
            </AlertDescription>
          </Alert>
        )}

        {summary && (
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
            <StatCard
              interactive={false}
              icon={Server}
              accent="brand"
              label="Environment"
              value={summary.environment}
              meta={summary.release || 'unknown release'}
              badge={
                <Badge variant={summary.database.ok ? 'success' : 'destructive'}>
                  {summary.database.ok ? 'DB healthy' : 'DB down'}
                </Badge>
              }
            />
            <StatCard
              interactive={false}
              icon={Bug}
              accent="notes"
              label="Server errors"
              value={summary.errors.last_24h}
              meta={`${summary.errors.last_hour} last hour`}
            />
            <StatCard
              interactive={false}
              icon={Activity}
              accent="tasks"
              label="Email worker"
              value={formatAge(summary.worker.age_seconds)}
              meta={`seen ${formatDate(summary.worker.last_seen_at)}`}
              badge={
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
              }
            />
            <StatCard
              interactive={false}
              icon={Mail}
              accent="meals"
              label="Email outbox"
              value={outboxCounts?.pending ?? 0}
              meta={`${outboxCounts?.failed ?? 0} failed · oldest ${formatAge(
                outbox?.oldest_pending_age_seconds
              )}`}
            />
            <StatCard
              interactive={false}
              icon={Inbox}
              accent="vinyl"
              label="Problem reports"
              value={summary.problem_reports.open}
              meta={`${summary.problem_reports.last_24h} in last 24h`}
            />
            <StatCard
              interactive={false}
              icon={Send}
              accent="neutral"
              label="Admin email"
              value={summary.email.configured ? 'Configured' : 'Off'}
              meta={`${summary.email.recipients} recipient${
                summary.email.recipients === 1 ? '' : 's'
              }`}
            />
          </div>
        )}

        <DetailCard>
          <DetailCardHeader
            icon={Bug}
            title="Top errors · 24h"
            subtitle="Grouped by route, exception type, and 10-minute bucket."
          />
          <div className="border-line border-t">
            {summary && (summary.errors.top_24h?.length ?? 0) > 0 ? (
              <div className="divide-line divide-y">
                {summary.errors.top_24h.map((item) => (
                  <div
                    key={item.fingerprint}
                    className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-[13px]"
                  >
                    <div className="min-w-0">
                      <span className="text-ink font-medium">{item.error_type || 'Error'}</span>{' '}
                      <span className="text-ink-subtle">on {item.route || 'unknown route'}</span>
                    </div>
                    <div className="text-ink-subtle text-[11px]">
                      {item.count}× · last {formatDate(item.last_seen_at)}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-ink-subtle px-4 py-4 text-[13px]">
                {summary && !summary.database.ok
                  ? 'Database is unreachable; error data may be incomplete.'
                  : 'No server errors recorded. Good.'}
              </p>
            )}
          </div>
        </DetailCard>

        <DetailCard>
          <DetailCardHeader
            icon={Inbox}
            title="Problem reports"
            subtitle="Persisted before email, so they survive a broken mail path."
          />
          <div className="border-line space-y-2 border-t p-3">
            {reportsQuery.isLoading ? (
              <p className="text-ink-subtle px-1 py-2 text-[13px]">Loading reports…</p>
            ) : reportsQuery.isError ? (
              <p className="text-destructive px-1 py-2 text-[13px]">Could not load reports.</p>
            ) : reports.length === 0 ? (
              <p className="text-ink-subtle px-1 py-2 text-[13px]">No reports.</p>
            ) : (
              reports.map((report) => (
                <ReportRow
                  key={report.id}
                  report={report}
                  onStatus={(status) => statusMutation.mutate({ id: report.id, status })}
                  busy={statusMutation.isPending}
                />
              ))
            )}
          </div>
        </DetailCard>

        <DetailCard>
          <DetailCardHeader
            icon={Activity}
            title="Recent ops events"
            subtitle="Newest 25 errors and degraded-dependency events."
          />
          <div className="border-line border-t px-4 pb-3">
            <Disclosure
              summary="Show events"
              hint={`${events.length} events`}
              className="border-0 pt-3"
            >
              {eventsQuery.isError ? (
                <p className="text-destructive text-[13px]">Could not load ops events.</p>
              ) : events.length === 0 ? (
                <p className="text-ink-subtle text-[13px]">No events recorded.</p>
              ) : (
                <div className="divide-line divide-y">
                  {events.map((event) => (
                    <div key={event.id} className="py-2.5 text-[13px]">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-ink font-medium">
                          {event.status} {event.error_type || 'Error'}
                        </span>
                        <span className="text-ink-subtle text-[11px]">
                          {formatDate(event.created_at)}
                        </span>
                      </div>
                      <p className="text-ink-muted">
                        {event.method} {event.route || event.path || '—'}
                      </p>
                      {event.message && (
                        <p className="text-ink-subtle mt-1 line-clamp-2 text-[11px]">
                          {event.message}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </Disclosure>
          </div>
        </DetailCard>
      </div>
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
    <div className="border-line bg-surface-muted/40 rounded-lg border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Badge variant={reportVariant(report.status)}>{report.status}</Badge>
          <span className="text-ink text-[13px] font-medium">{formatDate(report.created_at)}</span>
        </div>
        <span className="text-ink-subtle text-[11px]">{report.page || 'unknown page'}</span>
      </div>
      <p className="text-ink mt-2 text-[13px] whitespace-pre-wrap">
        {report.message || '(no message)'}
      </p>
      <p className="text-ink-subtle mt-1 text-[11px]">
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
