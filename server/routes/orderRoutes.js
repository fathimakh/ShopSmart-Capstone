import { Router } from 'express'
import {
  cancelOrder,
  createOrder,
  getMyOrders,
  getOrder,
  listOrders,
  updateOrderStatus
} from '../controllers/orderController.js'
import { authorize, protect } from '../middleware/auth.js'
import { validateBody, validateOrderRefParam } from '../middleware/validate.js'
import { cancelOrderRules, createOrderRules, orderStatusRules } from '../validators/orderValidators.js'

// Mounted at /api/orders. Every order belongs to an account, so all of it needs a token.
const router = Router()

router.use(protect)
router.param('ref', validateOrderRefParam)

router
  .route('/')
  .post(validateBody(createOrderRules), createOrder)
  .get(authorize('admin'), listOrders)

// Declared before /:ref so "mine" is never read as an order number.
router.get('/mine', getMyOrders)

router.get('/:ref', getOrder)
router.patch('/:ref/cancel', validateBody(cancelOrderRules), cancelOrder)
router.patch('/:ref/status', authorize('admin'), validateBody(orderStatusRules), updateOrderStatus)

export default router
