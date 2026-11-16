import { describe, expect, it } from 'vitest'
import { appendReviews, breakdownRows, isOwnReview, validateReview, withSavedReview } from './reviews'

describe('review helpers', () => {
  it('checks the rating and comment the way the server does', () => {
    expect(validateReview({ rating: 0, comment: '' })).toEqual({
      rating: 'Choose a rating from 1 to 5 stars',
      comment: 'Write at least 3 characters about the product'
    })
    expect(validateReview({ rating: 4.5, comment: 'Nice' }).rating).toBeDefined()
    expect(validateReview({ rating: 5, comment: '  ok  ' }).comment).toBeDefined()
    expect(validateReview({ rating: 5, comment: 'x'.repeat(1001) }).comment).toBe('Keep the review under 1000 characters')
    expect(validateReview({ rating: 3, comment: 'Does the job' })).toEqual({})
  })

  it('turns the star breakdown into bars from five stars down', () => {
    const rows = breakdownRows({ breakdown: { 1: 0, 2: 1, 3: 0, 4: 1, 5: 2 } })
    expect(rows.map((row) => row.star)).toEqual([5, 4, 3, 2, 1])
    expect(rows[0]).toEqual({ star: 5, count: 2, percent: 50 })
    expect(rows[3]).toEqual({ star: 2, count: 1, percent: 25 })
    expect(breakdownRows(null).every((row) => row.percent === 0)).toBe(true)
  })

  it('adds a page of reviews without repeating one already shown', () => {
    const shown = [{ _id: 'a' }, { _id: 'b' }]
    expect(appendReviews(shown, [{ _id: 'b' }, { _id: 'c' }]).map((review) => review._id)).toEqual(['a', 'b', 'c'])
  })

  it('replaces an edited review in place and puts a new one first', () => {
    const shown = [{ _id: 'a', comment: 'old' }, { _id: 'b' }]
    expect(withSavedReview(shown, { _id: 'a', comment: 'new' })).toEqual([{ _id: 'a', comment: 'new' }, { _id: 'b' }])
    expect(withSavedReview(shown, { _id: 'c' }).map((review) => review._id)).toEqual(['c', 'a', 'b'])
  })

  it('knows the signed in shopper review from imported ones', () => {
    const user = { _id: 'u1' }
    expect(isOwnReview({ user: 'u1' }, user)).toBe(true)
    expect(isOwnReview({ user: null }, user)).toBe(false)
    expect(isOwnReview({ user: 'u1' }, null)).toBe(false)
  })
})
