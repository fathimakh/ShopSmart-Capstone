import env from '../config/env.js'
import ApiError from './ApiError.js'

/** The seeded demo accounts (DEMO_ACCOUNT_EMAILS) are shared by every visitor. */
export function isDemoAccount(user) {
  return env.demoAccountEmails.includes(String(user.email).toLowerCase())
}

/**
 * Refuses a change that would lock out, sign out or remove a shared demo account for
 * everyone else trying the live demo. The client shows the message as it is.
 */
export function assertNotDemoAccount(user, message) {
  if (isDemoAccount(user)) throw new ApiError(403, message, { code: 'DEMO_ACCOUNT_LOCKED' })
}
