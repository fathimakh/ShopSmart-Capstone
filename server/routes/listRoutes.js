import { Router } from 'express'
import {
  getLists,
  mergeLists,
  replaceCart,
  replaceViewed,
  replaceWishlist
} from '../controllers/listController.js'
import { protect } from '../middleware/auth.js'
import { validateBody } from '../middleware/validate.js'
import { cartRules, idListRules, mergeRules } from '../validators/listValidators.js'

// Mounted at /api/lists. Guests keep their lists in the browser; these are for accounts.
const router = Router()

router.use(protect)

router.get('/', getLists)
router.put('/cart', validateBody(cartRules), replaceCart)
router.put('/wishlist', validateBody(idListRules), replaceWishlist)
router.put('/viewed', validateBody(idListRules), replaceViewed)
router.post('/merge', validateBody(mergeRules), mergeLists)

export default router
