/**
 * Guards against NoSQL injection by removing keys that start with "$" or contain a dot,
 * so a body such as { "email": { "$gt": "" } } becomes { "email": {} } and then fails
 * validation instead of matching every user.
 *
 * Query strings are left alone: Express 5 parses them with the simple parser, which
 * never builds nested objects, and utils/queryReader.js reads them as plain strings.
 */
import ApiError from '../utils/ApiError.js'

// Far deeper than any body the API accepts. Without a limit, a few hundred thousand nested
// brackets, well under the 1 MB body cap, overflow the stack below and answer 500.
const MAX_DEPTH = 32

function isUnsafeKey(key) {
  return key.startsWith('$') || key.includes('.')
}

export function stripUnsafeKeys(value, depth = 0) {
  if (value && typeof value === 'object' && depth >= MAX_DEPTH) {
    throw ApiError.badRequest('The request body is nested too deeply', 'INVALID_JSON')
  }
  if (Array.isArray(value)) {
    value.forEach((item) => stripUnsafeKeys(item, depth + 1))
  } else if (value && typeof value === 'object') {
    Object.keys(value).forEach((key) => {
      if (isUnsafeKey(key)) delete value[key]
      else stripUnsafeKeys(value[key], depth + 1)
    })
  }
  return value
}

export default function sanitizeBody(req, res, next) {
  if (req.body && typeof req.body === 'object') stripUnsafeKeys(req.body)
  next()
}
