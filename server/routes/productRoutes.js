import { Router } from 'express'
import {
  createProduct,
  deleteProduct,
  getProduct,
  listCategories,
  listProducts,
  updateProduct
} from '../controllers/productController.js'
import { authorize, protect } from '../middleware/auth.js'
import { validateBody, validateProductIdParam } from '../middleware/validate.js'
import { productRules } from '../validators/productValidators.js'

// Mounted at /api/products
const router = Router()

router.param('id', validateProductIdParam)

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

export default router
