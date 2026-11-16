import { describe, expect, it } from 'vitest'
import {
  formatDate,
  formatDateTime,
  formatPrice,
  formatShortDate,
  pluralize,
  titleCase
} from './format'

describe('format', () => {
  it('formats prices in US dollars', () => {
    expect(formatPrice(74.96)).toBe('$74.96')
    expect(formatPrice(1200)).toBe('$1,200.00')
  })

  it('formats dates the British way and ignores bad input', () => {
    expect(formatDate('2026-11-05T10:00:00.000Z')).toBe('5 Nov 2026')
    expect(formatDate('not a date')).toBe('')
  })

  it('adds the time of day, or keeps only day and month, when asked', () => {
    // Noon UTC is the same calendar day in every time zone the shop is used in.
    expect(formatDateTime('2026-11-05T12:00:00.000Z')).toMatch(/^5 Nov 2026, \d{2}:\d{2}$/)
    expect(formatShortDate('2026-11-05T12:00:00.000Z')).toBe('5 Nov')
    expect(formatDateTime('nope')).toBe('')
    expect(formatShortDate(null)).toBe('')
  })

  it('turns slugs into labels', () => {
    expect(titleCase('home-decoration')).toBe('Home Decoration')
  })

  it('pluralises counts', () => {
    expect(pluralize(1, 'review')).toBe('1 review')
    expect(pluralize(3, 'review')).toBe('3 reviews')
    expect(pluralize(2, 'category', 'categories')).toBe('2 categories')
  })
})
