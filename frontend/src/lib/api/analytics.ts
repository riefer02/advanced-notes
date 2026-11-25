/**
 * Self-hosted product analytics API.
 *
 * Events are aggregated server-side; nothing is sent to a third party.
 */
import { apiRequest } from './core'

export interface AnalyticsEventPayload {
  name: string
  /** IDs, enums, booleans, or counts only. Never free text or PII. */
  properties?: Record<string, unknown>
}

export async function sendAnalyticsEvents(events: AnalyticsEventPayload[]): Promise<void> {
  await apiRequest<{ accepted: number }>('POST', '/api/analytics/events', {
    body: { events },
    timeoutMs: 10_000,
  })
}
