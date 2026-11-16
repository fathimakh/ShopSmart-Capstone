import { Router } from 'express'
import { getAiStatus, searchWithAi } from '../controllers/aiController.js'
import { aiLimiter } from '../middleware/rateLimiter.js'
import { validateBody } from '../middleware/validate.js'
import { searchRules } from '../validators/aiValidators.js'

// Mounted at /api/ai. The review summary lives with the products, at
// /api/products/:id/review-summary.
const router = Router()

router.get('/status', getAiStatus)
router.post('/search', aiLimiter, validateBody(searchRules), searchWithAi)

export default router
