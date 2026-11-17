import { rateLimit } from 'express-rate-limit'
import env from '../config/env.js'

const WINDOW_MS = 15 * 60 * 1000

function createLimiter(limit, message) {
  return rateLimit({
    windowMs: WINDOW_MS,
    limit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    // Answers in the same shape as every other error so the client shows the message.
    handler: (req, res, next, options) => {
      res.status(options.statusCode).json({ success: false, message, code: 'RATE_LIMITED' })
    }
  })
}

// Slows down password guessing on the sign in and sign up routes.
export const authLimiter = createLimiter(
  env.authRateLimitMax,
  'Too many sign in attempts. Please wait 15 minutes and try again.'
)

// Every AI request costs a Gemini call (two when a busy model is retried), so one visitor
// cannot use up the daily quota.
export const aiLimiter = createLimiter(
  env.aiRateLimitMax,
  'The assistant is taking a short break. Please try again in a few minutes.'
)

// Fresh review summaries are counted on their own, so browsing product pages never uses
// up the shopper's allowance for the AI search box.
export const summaryLimiter = createLimiter(
  env.aiRateLimitMax,
  'Review summaries are taking a short break. Please try again in a few minutes.'
)
