import * as React from 'react'

import { cn } from '@/lib/utils'

/**
 * The one page title in the app.
 *
 * Eyebrow is for context ("Notes", "Collection"); actions sit on the same
 * baseline as the title so the header never eats two rows on desktop.
 */
export function PageHeader({
  title,
  description,
  eyebrow,
  actions,
  className,
}: {
  title: React.ReactNode
  description?: React.ReactNode
  eyebrow?: React.ReactNode
  actions?: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn('flex flex-wrap items-end justify-between gap-x-4 gap-y-3', className)}>
      <div className="min-w-0">
        {eyebrow && <div className="section-label mb-1.5">{eyebrow}</div>}
        <h1 className="text-ink text-[22px] leading-7 font-semibold tracking-[-0.022em]">
          {title}
        </h1>
        {description && (
          <p className="text-ink-muted mt-1 max-w-2xl text-[13px] leading-5">{description}</p>
        )}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}
