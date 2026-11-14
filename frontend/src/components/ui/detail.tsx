import * as React from 'react'
import { ChevronDown, type LucideIcon } from 'lucide-react'

import { cn } from '@/lib/utils'

/* ==========================================================================
   Detail surfaces
   --------------------------------------------------------------------------
   A detail view is a stack of quiet cards: hairline border, no heavy shadow,
   16px padding, one clear title, and metadata compressed into a single line.
   ========================================================================== */

export function DetailCard({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      className={cn('border-line bg-surface shadow-card rounded-xl border', className)}
      {...props}
    />
  )
}

export function DetailCardHeader({
  title,
  subtitle,
  icon: Icon,
  action,
  className,
}: {
  title: React.ReactNode
  subtitle?: React.ReactNode
  icon?: LucideIcon
  action?: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn('flex items-start gap-3 px-4 py-3', className)}>
      {Icon && (
        <span className="bg-surface-muted text-ink-muted grid size-7 shrink-0 place-items-center rounded-md">
          <Icon className="size-3.5" />
        </span>
      )}
      <div className="min-w-0 flex-1">
        <h3 className="text-ink text-[13px] leading-5 font-semibold tracking-[-0.01em]">{title}</h3>
        {subtitle && <p className="text-ink-subtle mt-0.5 text-xs leading-4">{subtitle}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  )
}

export function DetailSection({
  label,
  action,
  children,
  className,
}: {
  label: React.ReactNode
  action?: React.ReactNode
  children: React.ReactNode
  className?: string
}) {
  return (
    <section className={cn('space-y-2', className)}>
      <div className="flex items-center justify-between gap-3">
        <span className="section-label">{label}</span>
        {action && <div className="shrink-0">{action}</div>}
      </div>
      {children}
    </section>
  )
}

/* ==========================================================================
   Metadata
   ========================================================================== */

/**
 * One line of secondary facts with quiet dot separators.
 *
 * <MetaBar>
 *   <MetaItem icon={Calendar}>Mar 4, 3:12 PM</MetaItem>
 *   <MetaItem>412 words</MetaItem>
 *   <MetaItem>work/notes</MetaItem>
 * </MetaBar>
 */
export function MetaBar({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        'meta-bar text-ink-subtle flex flex-wrap items-center gap-x-2 gap-y-1 text-xs leading-5',
        className
      )}
    >
      {children}
    </div>
  )
}

export function MetaItem({
  icon: Icon,
  children,
  className,
}: {
  icon?: LucideIcon
  children: React.ReactNode
  className?: string
}) {
  return (
    <span className={cn('inline-flex min-w-0 items-center gap-1.5', className)}>
      {Icon && <Icon className="text-ink-subtle size-3.5 shrink-0" aria-hidden />}
      <span className="truncate">{children}</span>
    </span>
  )
}

/** Two-column spec sheet — the fast way to scan a record, meal, or note. */
export function DataGrid({ className, ...props }: React.ComponentProps<'dl'>) {
  return (
    <dl className={cn('grid grid-cols-2 gap-x-5 gap-y-3 sm:grid-cols-3', className)} {...props} />
  )
}

export function DataPoint({
  label,
  value,
  mono,
  className,
}: {
  label: React.ReactNode
  value: React.ReactNode
  mono?: boolean
  className?: string
}) {
  return (
    <div className={cn('min-w-0', className)}>
      <dt className="text-2xs text-ink-subtle font-medium tracking-[0.06em] uppercase">{label}</dt>
      <dd
        className={cn(
          'text-ink mt-0.5 text-[13px] leading-5 font-medium break-words',
          mono && 'font-mono text-xs font-normal'
        )}
      >
        {value}
      </dd>
    </div>
  )
}

/* ==========================================================================
   Callouts
   ========================================================================== */

const CALLOUT_TONES = {
  neutral: 'border-line bg-surface-muted',
  brand: 'border-brand/20 bg-brand-soft/50',
  warning: 'border-warning/25 bg-warning-soft',
  danger: 'border-destructive/25 bg-danger-soft',
} as const

export function Callout({
  tone = 'neutral',
  label,
  children,
  className,
}: {
  tone?: keyof typeof CALLOUT_TONES
  label?: React.ReactNode
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn('rounded-lg border px-3.5 py-3', CALLOUT_TONES[tone], className)}>
      {label && <div className="section-label mb-1">{label}</div>}
      {children}
    </div>
  )
}

/**
 * Details on demand: a quiet row that expands secondary information in place.
 * Used for revision history, meal metadata, and admin diagnostics so the
 * primary content stays readable.
 */
export function Disclosure({
  summary,
  hint,
  children,
  defaultOpen = false,
  open: controlledOpen,
  onOpenChange,
  className,
}: {
  summary: React.ReactNode
  hint?: React.ReactNode
  children: React.ReactNode
  defaultOpen?: boolean
  open?: boolean
  onOpenChange?: (open: boolean) => void
  className?: string
}) {
  const [uncontrolledOpen, setUncontrolledOpen] = React.useState(defaultOpen)
  const open = controlledOpen ?? uncontrolledOpen
  const id = React.useId()

  const toggle = () => {
    const next = !open
    onOpenChange?.(next)
    if (controlledOpen === undefined) setUncontrolledOpen(next)
  }

  return (
    <div className={cn('border-line border-t pt-3', className)}>
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        aria-controls={id}
        className="text-ink-muted hover:text-ink focus-visible:ring-ring flex min-h-6 w-full items-center justify-between gap-3 rounded text-left text-xs font-medium transition-colors focus-visible:ring-2 focus-visible:outline-none"
      >
        <span className="flex items-center gap-1.5">
          <ChevronDown className={cn('size-3.5 transition-transform', !open && '-rotate-90')} />
          {summary}
        </span>
        {hint && <span className="text-ink-subtle text-[11px] font-normal">{hint}</span>}
      </button>
      <div id={id} hidden={!open} className="pt-2.5">
        {children}
      </div>
    </div>
  )
}
