import { api } from './http'
import { AI_TIMEOUT } from './ai'

// The reviews API (docs/API.md, Reviews). Reading is open to everyone; a signed in
// shopper's token is sent when there is one, so the answer includes their own review.

const reviewsPath = (productId) => `/products/${encodeURIComponent(productId)}/reviews`

/** One page of reviews, newest first, with the star breakdown and the caller's review. */
export async function fetchReviews(productId, { page = 1, limit = 5, signal } = {}) {
  const data = await api.get(`${reviewsPath(productId)}?page=${page}&limit=${limit}`, { signal })
  return {
    reviews: data.reviews,
    pagination: data.pagination,
    stats: data.stats,
    myReview: data.myReview || null
  }
}

/** Writes the shopper's review, or edits it: there is one review per account and product. */
export async function saveReview(productId, { rating, comment }) {
  const data = await api.post(reviewsPath(productId), { rating, comment })
  return { review: data.review, stats: data.stats }
}

export async function deleteReview(productId, reviewId) {
  const data = await api.delete(`${reviewsPath(productId)}/${encodeURIComponent(reviewId)}`)
  return { stats: data.stats }
}

/** The AI summary of the reviews, or null when the product has none to summarise. */
export async function fetchReviewSummary(productId, { signal } = {}) {
  // A summary that is not cached yet is written by Gemini, so it gets the AI time limit.
  const data = await api.get(`/products/${encodeURIComponent(productId)}/review-summary`, { signal, timeout: AI_TIMEOUT })
  return data.summary || null
}
