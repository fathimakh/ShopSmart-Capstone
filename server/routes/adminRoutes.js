import { Router } from 'express'
import { getSummary } from '../controllers/adminController.js'
import { authorize, protect } from '../middleware/auth.js'

// Mounted at /api/admin. Admin editing of products, orders and accounts lives with
// those resources; this router holds what only the dashboard needs.
const router = Router()

router.use(protect, authorize('admin'))

router.get('/summary', getSummary)

export default router
