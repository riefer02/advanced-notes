import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'

import { cn } from '@/lib/utils'

const ACCENTS = {
  notes: 'bg-domain-notes/10 text-domain-notes',
  tasks: 'bg-domain-tasks/10 text-domain-tasks',
  meals: 'bg-domain-meals/10 text-domain-meals',
  vinyl: 'bg-domain-vinyl/10 text-domain-vinyl',
  brand: 'bg-brand/10 text-brand',
  neutral: 'bg-surface-muted text-ink-muted',
} as const

export interface StatCardProps {
  label: string
  value: ReactNode
  meta?: ReactNode
  icon: LucideIcon
  accent?: keyof typeof ACCENTS
  /** Rendered on the value line — e.g. a "12 new" badge. */
  badge?: ReactNode
  /** False for read-only tiles (admin) that should not imply a click target. */
  interactive?: boolean
  className?: string
}

/**
 * Dense metric tile. Used in grids of 2–4; the whole tile is usually a link,
 * so it owns the hover lift rather than the parent.
 */
export function StatCard({
  label,
  value,
  meta,
  icon: Icon,
  accent = 'neutral',
  badge,
  interactive = true,
  className,
}: StatCardProps) {
  return (
    <div
      className={cn(
        'group border-line bg-surface shadow-card flex h-full items-center gap-3 rounded-xl border p-3.5',
        interactive && 'card-interactive',
        className
      )}
    >
      <span
        aria-hidden
        className={cn('grid size-8 shrink-0 place-items-center rounded-lg', ACCENTS[accent])}
      >
        <Icon className="size-4" />
      </span>
      <div className="min-w-0">
        <p className="text-ink-subtle text-2xs font-medium tracking-[0.06em] uppercase">{label}</p>
        <div className="mt-0.5 flex items-baseline gap-1.5">
          <span className="text-ink text-xl leading-6 font-semibold tracking-[-0.02em] tabular-nums">
            {value}
          </span>
          {meta && (
            <>
              <span aria-hidden className="bg-line-strong size-0.5 shrink-0 rounded-full" />
              <span className="text-ink-subtle truncate text-[11px] leading-4">{meta}</span>
            </>
          )}
          {badge}
        </div>
      </div>
    </div>
  )
}
