import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { ArrowRight, ListChecks, X } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { DetailCard, DetailCardHeader } from '@/components/ui/detail'
import { useAppShell } from './layout/AppShell'

const DISMISS_KEY = 'chisos:first-run-dismissed'

function readDismissed() {
  if (typeof window === 'undefined') return false
  try {
    return window.localStorage.getItem(DISMISS_KEY) === '1'
  } catch {
    return false
  }
}

function writeDismissed() {
  try {
    window.localStorage.setItem(DISMISS_KEY, '1')
  } catch {
    // Private browsing can block storage; dismissal still holds for this visit.
  }
}

const ROW_CLASS =
  'group hover:bg-surface-muted/60 focus-visible:bg-surface-muted/60 flex w-full items-center justify-between gap-4 px-4 py-2.5 text-left transition-colors focus-visible:outline-none'

function RowContent({ label, why }: { label: string; why: string }) {
  return (
    <>
      <span className="min-w-0">
        <span className="text-ink block text-[13px] leading-5 font-medium">{label}</span>
        <span className="text-ink-subtle block text-xs leading-4">{why}</span>
      </span>
      <ArrowRight className="text-ink-subtle size-3.5 shrink-0 opacity-60" aria-hidden />
    </>
  )
}

/**
 * First-run guidance that replaces an empty Today view.
 *
 * Shown only by the dashboard when the account has no notes, meals, or records.
 * Dismissal is stored under a single browser key (there is no user id here).
 */
export function FirstRunChecklist() {
  const { openAsk } = useAppShell()
  const [dismissed, setDismissed] = useState(readDismissed)

  if (dismissed) return null

  const handleDismiss = () => {
    writeDismissed()
    setDismissed(true)
  }

  return (
    <DetailCard>
      <DetailCardHeader
        title="Start with one capture"
        subtitle="Five small steps. Each one shows up on this page."
        icon={ListChecks}
        action={
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Dismiss getting started"
            onClick={handleDismiss}
          >
            <X className="size-4" />
          </Button>
        }
      />

      <ul className="border-line divide-line divide-y border-t">
        <li>
          <Link to="/notes" className={ROW_CLASS}>
            <RowContent
              label="Record your first note"
              why="Speak for 30 seconds; Chisos transcribes, titles, and tags it."
            />
          </Link>
        </li>
        <li>
          <Link to="/notes" search={{ compose: true }} className={ROW_CLASS}>
            <RowContent
              label="Write one instead"
              why="Type it in under a minute — no microphone needed."
            />
          </Link>
        </li>
        <li>
          <button type="button" onClick={openAsk} className={ROW_CLASS}>
            <RowContent
              label="Try Ask"
              why="Ask a question in plain English and see which notes it used."
            />
          </button>
        </li>
        <li>
          <Link to="/meals" className={ROW_CLASS}>
            <RowContent
              label="Log a meal"
              why="Say what you ate and it lands on today's calendar."
            />
          </Link>
        </li>
        <li>
          <Link to="/vinyl" className={ROW_CLASS}>
            <RowContent
              label="Add a record"
              why="Snap the cover and AI fills in artist, album, and tracklist."
            />
          </Link>
        </li>
      </ul>

      <p className="border-line text-ink-subtle border-t px-4 py-2.5 text-xs leading-5">
        <span className="text-ink-muted font-medium">How Chisos works:</span> Capture → AI files it
        → Find it.
      </p>
    </DetailCard>
  )
}
