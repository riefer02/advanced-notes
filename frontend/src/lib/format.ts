/**
 * Shared display formatting. Keep dates and counts consistent across pages.
 */

export function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`
}

/**
 * Parse date-only values as local calendar dates. `new Date('2026-11-25')`
 * is UTC midnight, which renders as the previous day in western timezones.
 */
function toDate(value: string | Date): Date {
  if (value instanceof Date) return value
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split('-').map(Number)
    return new Date(year, month - 1, day)
  }
  return new Date(value)
}

/** "Nov 14, 5:34 PM" (adds the year only when it is not the current year). */
export function formatDateTime(value: string | Date, locale?: string): string {
  const date = toDate(value)
  if (Number.isNaN(date.getTime())) return ''

  const includeYear = date.getFullYear() !== new Date().getFullYear()
  return date.toLocaleString(locale, {
    month: 'short',
    day: 'numeric',
    ...(includeYear ? { year: 'numeric' } : {}),
    hour: 'numeric',
    minute: '2-digit',
  })
}

/** "Nov 14" (adds the year when it is not the current year). */
export function formatShortDate(value: string | Date, locale?: string): string {
  const date = toDate(value)
  if (Number.isNaN(date.getTime())) return ''

  const includeYear = date.getFullYear() !== new Date().getFullYear()
  return date.toLocaleDateString(locale, {
    month: 'short',
    day: 'numeric',
    ...(includeYear ? { year: 'numeric' } : {}),
  })
}

/**
 * "Dec 1" for UTC boundary timestamps such as a quota period end. Formatting
 * those in the viewer's timezone can move the date a day earlier.
 */
export function formatUtcDate(value: string | Date, locale?: string): string {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return ''

  const includeYear = date.getUTCFullYear() !== new Date().getUTCFullYear()
  return date.toLocaleDateString(locale, {
    month: 'short',
    day: 'numeric',
    ...(includeYear ? { year: 'numeric' } : {}),
    timeZone: 'UTC',
  })
}

/** "today", "1d ago", "3w ago", "2mo ago" for compact list metadata. */
export function formatAge(value: string | Date): string {
  const date = toDate(value)
  if (Number.isNaN(date.getTime())) return ''

  const diffMs = Date.now() - date.getTime()
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

  if (diffDays <= 0) return 'today'
  if (diffDays === 1) return '1d ago'
  if (diffDays < 7) return `${diffDays}d ago`
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`
  return `${Math.floor(diffDays / 30)}mo ago`
}
