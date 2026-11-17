import env from '../config/env.js'
import Product from '../models/product.js'
import Review from '../models/review.js'
import { parseShoppingQuery } from '../services/aiSearch.js'
import { isGeminiConfigured } from '../services/gemini.js'
import { SUMMARY_REVIEW_LIMIT, reviewFingerprint, summarizeReviews } from '../services/reviewSummary.js'
import ApiError from '../utils/ApiError.js'
import { findProductOr404 } from './productController.js'

// Fresh review summaries spend the same Gemini quota as AI search. Shoppers who open the
// same product at once share one summary, and a daily budget (AI_SUMMARY_DAILY_MAX) keeps
// product browsing, or a script walking every product, from using up what search needs.
const summariesInProgress = new Map()
const summaryBudget = { day: '', used: 0 }

function takeFromSummaryBudget() {
  const today = new Date().toISOString().slice(0, 10)
  if (summaryBudget.day !== today) {
    summaryBudget.day = today
    summaryBudget.used = 0
  }
  if (summaryBudget.used >= env.aiSummaryDailyMax) return false
  summaryBudget.used += 1
  return true
}

function publicSummary(summary) {
  const { verdict, pros, cons, basedOn, generatedAt } = summary
  return { verdict, pros: [...pros], cons: [...cons], basedOn, generatedAt }
}

/** GET /api/ai/status - lets the client decide whether to offer the AI features at all. */
export function getAiStatus(req, res) {
  res.json({ success: true, enabled: isGeminiConfigured(), model: env.geminiModel })
}

/**
 * POST /api/ai/search - reads a shopper's message into catalogue filters. The real
 * category and brand lists are sent with every request, so the answer always fits the
 * catalogue as it is now, including products an admin added today.
 */
export async function searchWithAi(req, res) {
  const { query, previous } = req.body
  const [categories, brands] = await Promise.all([Product.distinct('category'), Product.distinct('brand')])

  // An admin edit can leave a blank brand, which must not become an option for the model.
  const result = await parseShoppingQuery(query, {
    categories: categories.filter(Boolean).sort(),
    brands: brands.filter(Boolean).sort((first, second) => first.localeCompare(second)),
    previous: previous ?? null
  })
  res.json({ success: true, result, source: 'gemini' })
}

/**
 * GET /api/products/:id/review-summary, first step. When the reviews have not changed
 * since the cached summary was written, it answers straight away, so product pages can
 * ask for the summary freely without spending the AI rate limit. A product without
 * reviews has nothing to summarise.
 */
export async function serveCachedReviewSummary(req, res, next) {
  const product = await findProductOr404(req.productId, '+reviewSummary')
  const reviews = await Review.find({ product: req.productId }).select('_id createdAt updatedAt').lean()

  if (!reviews.length) {
    res.json({ success: true, summary: null, cached: false })
    return
  }

  const fingerprint = reviewFingerprint(reviews)
  if (product.reviewSummary?.fingerprint === fingerprint) {
    res.json({ success: true, summary: publicSummary(product.reviewSummary), cached: true })
    return
  }

  res.locals.reviewSummaryJob = { product, fingerprint }
  next()
}

async function writeReviewSummary(product, fingerprint) {
  const reviews = await Review.find({ product: product.id }).sort({ createdAt: -1, _id: -1 }).limit(SUMMARY_REVIEW_LIMIT)

  const summary = {
    ...(await summarizeReviews(product, reviews)),
    basedOn: reviews.length,
    generatedAt: new Date(),
    fingerprint
  }
  await Product.updateOne({ id: product.id }, { $set: { reviewSummary: summary } })
  return summary
}

/** Second step, behind the rate limiter: asks Gemini and caches what it wrote. */
export async function generateReviewSummary(req, res) {
  const { product, fingerprint } = res.locals.reviewSummaryJob
  const key = `${product.id}:${fingerprint}`

  let job = summariesInProgress.get(key)
  if (!job) {
    if (!takeFromSummaryBudget()) {
      throw ApiError.unavailable('Review summaries are paused until tomorrow.', 'AI_UNAVAILABLE')
    }
    job = writeReviewSummary(product, fingerprint).finally(() => summariesInProgress.delete(key))
    summariesInProgress.set(key, job)
  }

  const summary = await job
  res.json({ success: true, summary: publicSummary(summary), cached: false })
}
