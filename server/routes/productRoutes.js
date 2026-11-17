import { Router } from 'express'
import {
  createProduct,
  deleteProduct,
  getPriceHistory,
  getProduct,
  listCategories,
  listProducts,
  updateProduct
} from '../controllers/productController.js'
import { generateReviewSummary, serveCachedReviewSummary } from '../controllers/aiController.js'
import { deleteReview, listReviews, saveReview } from '../controllers/reviewController.js'
import { authorize, optionalAuth, protect } from '../middleware/auth.js'
import { summaryLimiter } from '../middleware/rateLimiter.js'
import { validateBody, validateObjectIdParam, validateProductIdParam } from '../middleware/validate.js'
import { productRules } from '../validators/productValidators.js'
import { reviewRules } from '../validators/reviewValidators.js'

// Mounted at /api/products
const router = Router()

router.param('id', validateProductIdParam)
router.param('reviewId', validateObjectIdParam('review'))

router
  .route('/')
  .get(listProducts)
  .post(protect, authorize('admin'), validateBody(productRules), createProduct)

router.get('/categories', listCategories)

router
  .route('/:id')
  .get(getProduct)
  .put(protect, authorize('admin'), validateBody(productRules, { partial: true }), updateProduct)
  .delete(protect, authorize('admin'), deleteProduct)

router.get('/:id/price-history', getPriceHistory)

// A cached summary is answered before the rate limiter; only a fresh one counts.
router.get('/:id/review-summary', serveCachedReviewSummary, summaryLimiter, generateReviewSummary)

// Anyone can read reviews; a signed in shopper also gets their own review back.
router
  .route('/:id/reviews')
  .get(optionalAuth, listReviews)
  .post(protect, validateBody(reviewRules), saveReview)

router.delete('/:id/reviews/:reviewId', protect, deleteReview)

export default router
