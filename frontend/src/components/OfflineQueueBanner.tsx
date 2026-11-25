import { useEffect, useRef, useState } from 'react'
import { useAuth } from '@clerk/clerk-react'
import { CheckCircle2, CloudOff, Loader2, RefreshCw, X } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { useBackendHealth } from '../hooks/useBackendHealth'
import { useOfflineQueue } from '../hooks/useOfflineQueue'

/**
 * Quiet status strip for the per-user offline capture queue.
 *
 * It sits above the outage banner when the backend is unreachable so the two
 * fixed elements do not cover each other. Dismissal is offered only when no
 * captures are waiting, so the control can never hide pending work.
 */
export function OfflineQueueBanner() {
  const { userId } = useAuth()
  const { isError: backendUnreachable } = useBackendHealth()
  const { pendingCount, isSyncing, lastError, lastSyncAt, persistence, isOnline, retry } =
    useOfflineQueue(userId)

  const [dismissed, setDismissed] = useState(false)
  const [showSuccess, setShowSuccess] = useState(false)
  const lastSyncRef = useRef(lastSyncAt)

  // Re-show the banner whenever new work arrives or connectivity changes, even
  // if the user dismissed a previous idle state.
  useEffect(() => {
    if (!isOnline || pendingCount > 0) setDismissed(false)
  }, [isOnline, pendingCount])

  useEffect(() => {
    if (!lastSyncAt || lastSyncAt === lastSyncRef.current) return
    lastSyncRef.current = lastSyncAt
    setShowSuccess(true)
    const timeout = window.setTimeout(() => setShowSuccess(false), 4000)
    return () => window.clearTimeout(timeout)
  }, [lastSyncAt])

  if (!userId) return null

  const hasPending = pendingCount > 0
  const successVisible = showSuccess && !hasPending && isOnline
  const visible = hasPending || successVisible

  if (!visible || (dismissed && !hasPending)) return null

  const captureLabel = pendingCount === 1 ? 'capture' : 'captures'
  const outage = !isOnline || backendUnreachable
  const canDismiss = pendingCount === 0
  const memoryWarning = persistence === 'memory'

  let icon = <CloudOff className="text-warning mt-0.5 size-4 shrink-0" aria-hidden />
  let title = "You're offline"
  let body =
    pendingCount > 0
      ? `${pendingCount} ${captureLabel} saved on this device. They'll sync when you reconnect.`
      : 'New notes and recordings are saved on this device until you reconnect.'

  if (isOnline && isSyncing) {
    icon = <Loader2 className="text-brand mt-0.5 size-4 shrink-0 animate-spin" aria-hidden />
    title = `Syncing ${pendingCount} ${captureLabel}…`
    body = 'Keep this tab open while your captures upload.'
  } else if (isOnline && hasPending && lastError) {
    icon = <CloudOff className="text-warning mt-0.5 size-4 shrink-0" aria-hidden />
    title = `Couldn't sync ${pendingCount} ${captureLabel}`
    body = `${lastError} The capture is still saved on this device.`
  } else if (isOnline && hasPending) {
    icon = <CloudOff className="text-warning mt-0.5 size-4 shrink-0" aria-hidden />
    title = `${pendingCount} ${captureLabel} waiting to sync`
    body = 'Saved on this device until the connection is back.'
  } else if (successVisible) {
    icon = <CheckCircle2 className="text-positive mt-0.5 size-4 shrink-0" aria-hidden />
    title = 'All captures synced'
    body = 'Your notes are up to date.'
  }

  if (memoryWarning && hasPending) {
    body += " This browser can't persist them across reloads, so keep this tab open."
  }

  return (
    <div
      role="status"
      aria-live="polite"
      aria-atomic="true"
      className={`border-line bg-surface text-ink shadow-pop fixed left-1/2 z-40 flex w-[calc(100%-2rem)] max-w-xl -translate-x-1/2 items-start gap-3 rounded-xl border p-3 text-sm ${
        outage ? 'bottom-48' : 'bottom-4'
      }`}
    >
      {icon}
      <div className="min-w-0 flex-1">
        <p className="font-medium">{title}</p>
        <p className="text-ink-muted mt-0.5 text-xs leading-5">{body}</p>
        {isOnline && hasPending && !isSyncing && (
          <div className="mt-2">
            <Button size="sm" variant="outline" onClick={() => void retry()}>
              <RefreshCw className="size-3.5" aria-hidden />
              {lastError ? 'Retry sync' : 'Sync now'}
            </Button>
          </div>
        )}
      </div>
      {canDismiss && (
        <button
          type="button"
          onClick={() => setDismissed(true)}
          aria-label="Dismiss offline capture status"
          className="text-ink-subtle hover:text-ink focus-visible:ring-ring shrink-0 rounded p-1 transition-colors focus-visible:ring-2 focus-visible:outline-none"
        >
          <X className="size-4" aria-hidden />
        </button>
      )}
    </div>
  )
}
