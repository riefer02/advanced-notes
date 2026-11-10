/**
 * Administrator operations API.
 *
 * Every endpoint is authorized server-side by ADMIN_USER_IDS. The UI is
 * deliberately not advertised in navigation.
 */
import { apiRequest } from './core'

export interface TopError {
  fingerprint: string
  count: number
  last_seen_at: string | null
  error_type: string | null
  route: string | null
}

export interface OpsSummary {
  generated_at: string
  environment: string
  release: string | null
  database: { ok: boolean }
  errors: {
    last_hour: number
    last_24h: number
    top_24h: TopError[]
  }
  outbox: {
    counts?: { pending: number; sending: number; sent: number; failed: number }
    oldest_pending_at?: string | null
    oldest_pending_age_seconds?: number | null
  }
  worker: {
    last_seen_at: string | null
    age_seconds: number | null
    stale_after_seconds: number
  }
  problem_reports: { last_24h: number; open: number }
  email: { configured: boolean; recipients: number }
}

export type ReportStatus = 'new' | 'triaged' | 'resolved' | 'ignored'

export interface ProblemReport {
  id: string
  user_id: string | null
  message: string | null
  page: string | null
  contact_email: string | null
  ip: string | null
  user_agent: string | null
  status: ReportStatus
  notified_at: string | null
  created_at: string | null
}

export interface ProblemReportsResponse {
  reports: ProblemReport[]
  total: number
  limit: number
  offset: number
  status: ReportStatus | null
}

export interface OpsEvent {
  id: string
  created_at: string | null
  environment: string | null
  release: string | null
  request_id: string | null
  method: string | null
  route: string | null
  path: string | null
  status: number
  error_type: string | null
  message: string | null
  user_id: string | null
  fingerprint: string
}

export interface TestAlertResponse {
  queued: boolean
  email_configured: boolean
  recipients: number
}

export function fetchOpsSummary(): Promise<OpsSummary> {
  return apiRequest<OpsSummary>('GET', '/api/admin/ops/summary')
}

export function fetchProblemReports(status?: ReportStatus): Promise<ProblemReportsResponse> {
  return apiRequest<ProblemReportsResponse>('GET', '/api/admin/reports', {
    params: { status },
  })
}

export function updateProblemReportStatus(
  reportId: string,
  status: ReportStatus
): Promise<{ success: boolean }> {
  return apiRequest<{ success: boolean }>('POST', `/api/admin/reports/${reportId}/status`, {
    body: { status },
  })
}

export function fetchOpsEvents(limit = 50, offset = 0): Promise<{ events: OpsEvent[] }> {
  return apiRequest<{ events: OpsEvent[] }>('GET', '/api/admin/ops/events', {
    params: { limit, offset },
  })
}

export function sendTestAlert(): Promise<TestAlertResponse> {
  return apiRequest<TestAlertResponse>('POST', '/api/admin/test-alert')
}

export interface RetryOutboxResponse {
  requeued: number
  reclaimed: number
}

export function retryOutbox(includeStuck = true): Promise<RetryOutboxResponse> {
  return apiRequest<RetryOutboxResponse>('POST', '/api/admin/outbox/retry', {
    body: { include_stuck: includeStuck },
  })
}
