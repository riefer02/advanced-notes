/**
 * Privacy-friendly product analytics helper.
 *
 * Events are batched in memory and flushed on a short debounce. When the
 * browser is offline the batch is dropped instead of queued, so analytics can
 * never grow unbounded or replay stale activity later.
 *
 * `track` must never throw into the UI, and property values should be IDs,
 * enums, booleans, or counts. Never pass note/meal text or contact details.
 */
import { sendAnalyticsEvents, type AnalyticsEventPayload } from './api/analytics'

const FLUSH_DELAY_MS = 2_000
const MAX_BATCH_SIZE = 20
const MAX_PENDING_EVENTS = 100

let pending: AnalyticsEventPayload[] = []
let flushTimer: number | null = null
let isFlushing = false

function isOffline(): boolean {
  return typeof navigator !== 'undefined' && navigator.onLine === false
}

function clearFlushTimer(): void {
  if (flushTimer !== null && typeof window !== 'undefined') {
    window.clearTimeout(flushTimer)
  }
  flushTimer = null
}

function scheduleFlush(): void {
  if (typeof window === 'undefined') {
    void flushAnalytics()
    return
  }
  if (flushTimer !== null) return
  flushTimer = window.setTimeout(() => {
    flushTimer = null
    void flushAnalytics()
  }, FLUSH_DELAY_MS)
}

/** Queue a single event. Safe to call from any handler or effect. */
export function track(name: string, properties?: Record<string, unknown>): void {
  try {
    if (!name || isOffline()) return
    if (pending.length >= MAX_PENDING_EVENTS) return
    pending.push(properties ? { name, properties } : { name })
    if (pending.length >= MAX_BATCH_SIZE) {
      void flushAnalytics()
      return
    }
    scheduleFlush()
  } catch {
    // Analytics is best-effort and must never break the UI.
  }
}

/**
 * Send everything queued right now, up to the per-request cap.
 *
 * Failures and offline flushes simply drop the batch; there is no retry queue.
 */
export async function flushAnalytics(): Promise<void> {
  try {
    clearFlushTimer()
    if (isFlushing || pending.length === 0) return
    if (isOffline()) {
      pending = []
      return
    }

    const batch = pending.slice(0, MAX_BATCH_SIZE)
    pending = pending.slice(batch.length)
    isFlushing = true
    try {
      await sendAnalyticsEvents(batch)
    } catch {
      // Best-effort: dropping is preferable to retrying offline or spamming.
    } finally {
      isFlushing = false
      if (pending.length > 0) scheduleFlush()
    }
  } catch {
    // Never surface analytics failures to the caller.
  }
}

if (typeof window !== 'undefined') {
  // Best-effort flush when the tab is backgrounded or closed. A request that
  // does not complete is acceptable; analytics must not block navigation.
  window.addEventListener('pagehide', () => {
    void flushAnalytics()
  })
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') void flushAnalytics()
  })
}
