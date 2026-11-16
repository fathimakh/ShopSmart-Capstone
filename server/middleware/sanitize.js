/**
 * Guards against NoSQL injection by removing keys that start with "$" or contain a dot,
 * so a body such as { "email": { "$gt": "" } } becomes { "email": {} } and then fails
 * validation instead of matching every user.
 *
 * Query strings are left alone: Express 5 parses them with the simple parser, which
 * never builds nested objects, and utils/queryReader.js reads them as plain strings.
 */
function isUnsafeKey(key) {
  return key.startsWith('$') || key.includes('.')
}

export function stripUnsafeKeys(value) {
  if (Array.isArray(value)) {
    value.forEach(stripUnsafeKeys)
  } else if (value && typeof value === 'object') {
    Object.keys(value).forEach((key) => {
      if (isUnsafeKey(key)) delete value[key]
      else stripUnsafeKeys(value[key])
    })
  }
  return value
}

export default function sanitizeBody(req, res, next) {
  if (req.body && typeof req.body === 'object') stripUnsafeKeys(req.body)
  next()
}
