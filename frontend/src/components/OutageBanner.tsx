import { useEffect, useState } from 'react'

import { Button } from '@/components/ui/button'
import { useBackendHealth } from '../hooks/useBackendHealth'
import { reportProblem } from '../lib/api'
import { WifiOff } from 'lucide-react'

const ADMIN_EMAIL = import.meta.env.VITE_ADMIN_EMAIL || 'me@andrewriefenstahl.com'

function mailtoLink() {
  const subject = 'Chisos outage'
  const body = [
    "The Chisos app can't reach its server.",
    '',
    `Page: ${window.location.href}`,
    `Time: ${new Date().toISOString()}`,
    '',
    'What were you doing when it broke?',
  ].join('\n')

  return `mailto:${ADMIN_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
}

export function OutageBanner() {
  const { isError, refetch, isFetching } = useBackendHealth()
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'failed'>('idle')
  const [isOnline, setIsOnline] = useState(() =>
    typeof navigator === 'undefined' ? true : navigator.onLine
  )

  useEffect(() => {
    const onOnline = () => setIsOnline(true)
    const onOffline = () => setIsOnline(false)
    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)
    return () => {
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
    }
  }, [])

  if (!isOnline) {
    return (
      <div
        role="status"
        className="border-line bg-surface text-ink shadow-pop fixed bottom-4 left-1/2 z-50 flex w-[calc(100%-2rem)] max-w-xl -translate-x-1/2 items-center gap-3 rounded-xl border p-4 text-sm"
      >
        <WifiOff className="text-warning size-4 shrink-0" aria-hidden />
        <p>
          <span className="font-medium">You're offline.</span> Saved work stays on this device; new
          captures need a connection.
        </p>
      </div>
    )
  }

  if (!isError) return null

  const emailHref = mailtoLink()

  const sendReport = async () => {
    setStatus('sending')
    try {
      await reportProblem({ page: window.location.href })
      setStatus('sent')
    } catch {
      setStatus('failed')
    }
  }

  return (
    <div
      role="alert"
      className="fixed bottom-4 left-1/2 z-50 w-[calc(100%-2rem)] max-w-xl -translate-x-1/2 border-warning/30 bg-warning-soft text-warning shadow-pop rounded-xl border p-4 text-sm"
    >
      <p className="font-medium">Chisos can&apos;t reach the server right now.</p>
      <p className="text-warning/90 mt-1">
        Your saved data is safe. Try again, or let the admin know so they can check on it.
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button size="sm" variant="outline" onClick={() => refetch()} disabled={isFetching}>
          {isFetching ? 'Checking...' : 'Retry'}
        </Button>

        {status === 'sent' ? (
          <span className="text-positive">Thanks — the admin has been notified.</span>
        ) : (
          <Button size="sm" onClick={sendReport} disabled={status === 'sending'}>
            {status === 'sending' ? 'Sending...' : 'Report this'}
          </Button>
        )}

        <a href={emailHref} className="underline underline-offset-2">
          Email instead
        </a>
      </div>

      {status === 'failed' && (
        <p className="mt-2 text-warning">
          Automatic reporting failed.{' '}
          <a href={emailHref} className="font-medium underline underline-offset-2">
            Email the admin
          </a>{' '}
          instead.
        </p>
      )}
    </div>
  )
}
