import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { useBackendHealth } from '../hooks/useBackendHealth'
import { reportProblem } from '../lib/api'

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
      className="fixed bottom-4 left-1/2 z-50 w-[calc(100%-2rem)] max-w-xl -translate-x-1/2 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950 shadow-lg"
    >
      <p className="font-medium">Chisos can&apos;t reach the server right now.</p>
      <p className="mt-1 text-amber-900">
        Your saved data is safe. Try again, or let the admin know so they can check on it.
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button size="sm" variant="outline" onClick={() => refetch()} disabled={isFetching}>
          {isFetching ? 'Checking...' : 'Retry'}
        </Button>

        {status === 'sent' ? (
          <span className="text-green-800">Thanks — the admin has been notified.</span>
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
        <p className="mt-2 text-amber-900">
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
