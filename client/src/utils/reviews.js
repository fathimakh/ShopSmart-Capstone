// Helpers for the reviews on a product page (docs/API.md, Reviews). Pure, so the rules
// can be tested without rendering anything.

export const COMMENT_MIN = 3
export const COMMENT_MAX = 1000

export const ratingWords = {
  1: 'Poor',
  2: 'Fair',
  3: 'Good',
  4: 'Very good',
  5: 'Excellent'
}

/** The same rules as server/validators/reviewValidators.js, checked before sending. */
export function validateReview({ rating, comment }) {
  const errors = {}
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) errors.rating = 'Choose a rating from 1 to 5 stars'
  const length = comment.trim().length
  if (length < COMMENT_MIN) errors.comment = `Write at least ${COMMENT_MIN} characters about the product`
  else if (length > COMMENT_MAX) errors.comment = `Keep the review under ${COMMENT_MAX} characters`
  return errors
}

/**
 * The star breakdown as bars from 5 stars down to 1, each with its share of all reviews
 * as a whole percentage (0 when there are none, rather than dividing by zero).
 */
export function breakdownRows(stats) {
  const breakdown = (stats && stats.breakdown) || {}
  const total = [1, 2, 3, 4, 5].reduce((sum, star) => sum + (breakdown[star] || 0), 0)
  return [5, 4, 3, 2, 1].map((star) => {
    const count = breakdown[star] || 0
    return { star, count, percent: total ? Math.round((count / total) * 100) : 0 }
  })
}

/** Adds a page of reviews to the ones already shown, leaving out any already there. */
export function appendReviews(shown, page) {
  const seen = new Set(shown.map((review) => review._id))
  return [...shown, ...page.filter((review) => !seen.has(review._id))]
}

/**
 * The list after the shopper saved their review: an edit replaces it where it is (editing
 * keeps the date it was written), a new review goes to the top as the newest.
 */
export function withSavedReview(shown, review) {
  if (shown.some((entry) => entry._id === review._id)) {
    return shown.map((entry) => (entry._id === review._id ? review : entry))
  }
  return [review, ...shown]
}

export function isOwnReview(review, user) {
  return Boolean(user && review && review.user && review.user === user._id)
}
