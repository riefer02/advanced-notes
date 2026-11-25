import { describe, expect, it } from 'vitest'

import { formatShortDate, formatUtcDate, pluralize } from './format'

describe('format helpers', () => {
  it('pluralizes singular and plural counts', () => {
    expect(pluralize(1, 'artist')).toBe('1 artist')
    expect(pluralize(2, 'artist')).toBe('2 artists')
  })

  it('treats date-only values as local calendar dates', () => {
    expect(formatShortDate('2026-11-25')).toBe('Nov 25')
  })

  it('formats UTC quota boundaries without a timezone shift', () => {
    expect(formatUtcDate('2026-12-01T00:00:00+00:00')).toBe('Dec 1')
  })

  it('returns an empty string for invalid dates', () => {
    expect(formatShortDate('not-a-date')).toBe('')
    expect(formatUtcDate('not-a-date')).toBe('')
  })
})
