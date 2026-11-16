import jwt from 'jsonwebtoken'
import env from '../config/env.js'
import User from '../models/user.js'
import ApiError from '../utils/ApiError.js'

const OBJECT_ID_PATTERN = /^[a-f\d]{24}$/i

// Reads "Authorization: Bearer <token>" and gives null when it is missing or malformed.
function readToken(req) {
  const [scheme, token] = (req.headers.authorization || '').trim().split(/\s+/)
  return /^Bearer$/i.test(scheme || '') && token ? token : null
}

/**
 * Checks the token and loads its user. Each failure has its own code, so the client can
 * tell an expired session (sign in again) from a broken one.
 */
async function resolveUser(token) {
  let payload
  try {
    payload = jwt.verify(token, env.jwtSecret)
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      throw ApiError.unauthorized('Your session has expired. Please sign in again.', 'TOKEN_EXPIRED')
    }
    throw ApiError.unauthorized('Your session is not valid. Please sign in again.', 'TOKEN_INVALID')
  }

  if (!OBJECT_ID_PATTERN.test(payload.id || '') || typeof payload.tv !== 'number') {
    throw ApiError.unauthorized('Your session is not valid. Please sign in again.', 'TOKEN_INVALID')
  }

  const user = await User.findById(payload.id).select('+tokenVersion')
  if (!user) {
    throw ApiError.unauthorized('The account for this session no longer exists.', 'USER_NOT_FOUND')
  }
  if (payload.tv !== user.tokenVersion) {
    // The token version goes up on a password change and on "sign out everywhere".
    throw ApiError.unauthorized('This session was signed out. Please sign in again.', 'TOKEN_REVOKED')
  }
  return user
}

/** Requires a signed in user and puts it on req.user. */
export async function protect(req, res, next) {
  const token = readToken(req)
  if (!token) throw ApiError.unauthorized('Please sign in to continue.', 'NO_TOKEN')
  req.user = await resolveUser(token)
  next()
}

/** Adds req.user when a valid token is sent; guests and stale tokens carry on as guests. */
export async function optionalAuth(req, res, next) {
  const token = readToken(req)
  if (token) {
    try {
      req.user = await resolveUser(token)
    } catch {
      req.user = undefined
    }
  }
  next()
}

/** Role check, used after protect: authorize('admin'). */
export function authorize(...roles) {
  return (req, res, next) => {
    if (!req.user) throw ApiError.unauthorized('Please sign in to continue.', 'NO_TOKEN')
    if (!roles.includes(req.user.role)) throw ApiError.forbidden('Only store admins can do that.')
    next()
  }
}
