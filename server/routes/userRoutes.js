import { Router } from 'express'
import { deleteUser, listUsers, updateUserRole } from '../controllers/userController.js'
import { authorize, protect } from '../middleware/auth.js'
import { validateBody, validateObjectIdParam } from '../middleware/validate.js'
import { roleRules } from '../validators/userValidators.js'

// Mounted at /api/users. Account management for admins; shoppers manage their own
// account through /api/auth/me.
const router = Router()

router.use(protect, authorize('admin'))
router.param('id', validateObjectIdParam('user'))

router.get('/', listUsers)
router
  .route('/:id')
  .patch(validateBody(roleRules), updateUserRole)
  .delete(deleteUser)

export default router
