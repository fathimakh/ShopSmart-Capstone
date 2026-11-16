import jwt from 'jsonwebtoken'
import env from '../config/env.js'

/**
 * Signs a token for a user. tv (token version) lets the server cancel every token issued
 * before a password change, which a plain JWT could not do on its own.
 */
export default function generateToken(user) {
  return jwt.sign({ id: user._id.toString(), role: user.role, tv: user.tokenVersion ?? 0 }, env.jwtSecret, {
    expiresIn: env.jwtExpiresIn
  })
}
