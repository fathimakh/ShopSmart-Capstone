/**
 * The one place the client talks to the ShopSmart API (docs/API.md).
 *
 * - The base URL comes from VITE_API_URL and falls back to '/api', which the Vite dev
 *   server proxies to Express.
 * - The signed in shopper's token is attached as "Authorization: Bearer <token>".
 * - Every failure becomes an ApiError carrying the server's status, code, message and
 *   per-field messages, so pages never have to read a raw response.
 * - A 401 that proves the stored session is dead is announced to onSessionEnd listeners.
 */

export const API_URL = (import.meta.env.VITE_API_URL || '/api').replace(/\/+$/, '')
export const TOKEN_KEY = 'shopsmart:token'

// A free hosted server can sleep and take a while to answer its first request.
export const DEFAULT_TIMEOUT = 20000
// Waking a sleeping free-tier server takes up to a minute, so the requests a visit starts
// with (the catalogue, the session check, signing in) wait that long before giving up.
export const WAKE_UP_TIMEOUT = 60000

/**
 * 401 codes meaning the token this browser holds no longer works. NO_TOKEN only counts
 * when a token was actually sent, which the check in request() guarantees.
 */
export const SESSION_END_CODES = new Set([
  'NO_TOKEN',
  'TOKEN_EXPIRED',
  'TOKEN_INVALID',
  'TOKEN_REVOKED',
  'USER_NOT_FOUND'
])

const NETWORK_MESSAGE =
  'We could not reach the ShopSmart server. Check your connection and try again.'
const TIMEOUT_MESSAGE =
  'The server is taking too long to answer. It may be waking up, so try again in a moment.'
const BAD_RESPONSE_MESSAGE = 'The server sent an answer we could not read. Please try again.'

export class ApiError extends Error {
  constructor({ message, status = 0, code = 'UNKNOWN_ERROR', errors = [], details = null }) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.errors = errors
    this.details = details
    // Keyed by the full path the server sent ('address.phone', 'items[0].quantity'),
    // because short names collide: a profile has both 'name' and 'address.name'.
    this.fieldErrors = errors.reduce((fields, { field, message: fieldMessage }) => {
      if (field && fieldMessage && !fields[field]) fields[field] = fieldMessage
      return fields
    }, {})
  }
}

function readStoredToken() {
  try {
    return window.localStorage.getItem(TOKEN_KEY)
  } catch (error) {
    return null
  }
}

// Read straight away so requests made before React has rendered still carry the token.
let currentToken = readStoredToken()
const sessionListeners = new Set()

export function getToken() {
  return currentToken
}

/** Stores the token for every later request and for the next visit. null forgets it. */
export function setToken(token) {
  currentToken = token || null
  try {
    if (currentToken) window.localStorage.setItem(TOKEN_KEY, currentToken)
    else window.localStorage.removeItem(TOKEN_KEY)
  } catch (error) {
    // Blocked storage only means the session will not survive a reload.
  }
}

/** Calls listener({ code, message, status }) when the server rejects the current token. */
export function onSessionEnd(listener) {
  sessionListeners.add(listener)
  return () => sessionListeners.delete(listener)
}

export function isAbortError(error) {
  return Boolean(error) && error.name === 'AbortError'
}

/** A message fit to show the shopper, whatever was thrown. */
export function getErrorMessage(error, fallback = 'Something went wrong. Please try again.') {
  if (!error) return fallback
  if (typeof error === 'string') return error
  return error.message || fallback
}

/**
 * Per-field messages keyed by the last part of each path ('delivery.phone' -> 'phone',
 * 'items[0].quantity' -> 'quantity'), for forms whose input names are unique. The first
 * message for a name wins.
 */
export function getFieldErrors(error) {
  if (!error || !Array.isArray(error.errors)) return {}
  return error.errors.reduce((fields, { field, message }) => {
    const name = String(field || '').split('.').pop().replace(/\[\d+\]$/, '')
    if (name && message && !fields[name]) fields[name] = message
    return fields
  }, {})
}

async function readBody(response) {
  const type = response.headers.get('content-type') || ''
  if (!type.includes('application/json')) {
    if (import.meta.env.DEV) {
      console.warn(
        `[ShopSmart] ${response.url} answered with "${type || 'no content type'}" instead of JSON. ` +
          'Is the API running and is VITE_API_URL (or the dev proxy) pointing at it?'
      )
    }
    return null
  }
  try {
    return await response.json()
  } catch (error) {
    if (isAbortError(error)) throw error
    return null
  }
}

/**
 * Sends a request and resolves with the parsed body ({ success: true, ... }).
 *
 * options: method, body (sent as JSON), signal (an AbortSignal the caller controls),
 * timeout (ms), auth (false leaves the token off), keepalive (lets a save finish while
 * the page unloads), headers.
 */
export async function request(path, options = {}) {
  const {
    method = 'GET',
    body,
    signal,
    timeout = DEFAULT_TIMEOUT,
    auth = true,
    keepalive = false,
    headers = {}
  } = options

  const sentToken = auth ? currentToken : null
  const controller = new AbortController()
  let timedOut = false
  const timer = setTimeout(() => {
    timedOut = true
    controller.abort()
  }, timeout)
  const forwardAbort = () => controller.abort()

  if (signal) {
    if (signal.aborted) controller.abort()
    else signal.addEventListener('abort', forwardAbort, { once: true })
  }

  let response
  let data
  try {
    response = await fetch(`${API_URL}${path}`, {
      method,
      headers: {
        Accept: 'application/json',
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(sentToken ? { Authorization: `Bearer ${sentToken}` } : {}),
        ...headers
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: controller.signal,
      keepalive
    })
    data = await readBody(response)
  } catch (error) {
    if (timedOut) throw new ApiError({ message: TIMEOUT_MESSAGE, code: 'TIMEOUT' })
    // The caller cancelled on purpose (a page unmounted), so hand back a plain abort.
    if (isAbortError(error)) throw error
    throw new ApiError({ message: NETWORK_MESSAGE, code: 'NETWORK_ERROR' })
  } finally {
    clearTimeout(timer)
    if (signal) signal.removeEventListener('abort', forwardAbort)
  }

  if (response.ok && data && data.success !== false) return data

  // No JSON at all usually means a proxy or host answered instead of the API, for example
  // the dev proxy with the server stopped, or a static host serving its index page.
  if (!data) {
    throw new ApiError({
      message: response.status >= 500 ? NETWORK_MESSAGE : BAD_RESPONSE_MESSAGE,
      status: response.status,
      code: 'BAD_RESPONSE'
    })
  }

  const error = new ApiError({
    message: data.message || `The server answered with status ${response.status}.`,
    status: response.status,
    code: data.code || 'UNKNOWN_ERROR',
    errors: Array.isArray(data.errors) ? data.errors : [],
    details: data.details || null
  })

  // Only a request that carried the token still in use can prove the session is over. A
  // late answer for an older token (after a password change or a sign out) is ignored.
  if (
    response.status === 401 &&
    sentToken &&
    sentToken === currentToken &&
    SESSION_END_CODES.has(error.code)
  ) {
    sessionListeners.forEach((listener) =>
      listener({ code: error.code, message: error.message, status: error.status })
    )
  }

  throw error
}

export const api = {
  get: (path, options) => request(path, { ...options, method: 'GET' }),
  post: (path, body, options) => request(path, { ...options, method: 'POST', body }),
  put: (path, body, options) => request(path, { ...options, method: 'PUT', body }),
  patch: (path, body, options) => request(path, { ...options, method: 'PATCH', body }),
  delete: (path, options) => request(path, { ...options, method: 'DELETE' })
}

export default api
