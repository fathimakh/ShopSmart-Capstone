import { Router } from 'express'
import { changePassword, getMe, login, logout, register, updateMe } from '../controllers/authController.js'
import { protect } from '../middleware/auth.js'
import { authLimiter } from '../middleware/rateLimiter.js'
import { validateBody } from '../middleware/validate.js'
import {
  loginRules,
  logoutRules,
  passwordChangeRules,
  profileRules,
  registerRules
} from '../validators/authValidators.js'

// Mounted at /api/auth
const router = Router()

router.post('/register', authLimiter, validateBody(registerRules), register)
router.post('/login', authLimiter, validateBody(loginRules), login)

router
  .route('/me')
  .get(protect, getMe)
  .patch(protect, validateBody(profileRules, { partial: true }), updateMe)

router.patch('/password', protect, authLimiter, validateBody(passwordChangeRules), changePassword)

router.post('/logout', protect, validateBody(logoutRules), logout)

export default router
