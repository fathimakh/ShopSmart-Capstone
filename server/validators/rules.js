/**
 * A small declarative validator, so request bodies are checked without another package.
 *
 * A rule is { label, required, check(value, path) }. check returns null when the value is
 * fine, a message, or a list of nested { field, message } errors. validate() runs a map of
 * rules against an object and collects every problem at once, so a form can highlight all
 * of its fields in one round trip.
 */

export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/
export const PASSWORD_PATTERN = /^(?=.*[A-Za-z])(?=.*\d).{8,128}$/
export const URL_PATTERN = /^https?:\/\/\S+$/i
export const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/

function isBlank(value) {
  return value === null || (typeof value === 'string' && value.trim() === '')
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

export function validate(data, rules, { partial = false, prefix = '' } = {}) {
  const source = isPlainObject(data) ? data : {}
  const errors = []

  Object.entries(rules).forEach(([key, rule]) => {
    const field = prefix ? `${prefix}.${key}` : key
    const value = source[key]

    // A missing key is fine in a partial update; a blank value never satisfies "required".
    if (value === undefined) {
      if (rule.required && !partial) errors.push({ field, message: `${rule.label} is required` })
      return
    }
    if (isBlank(value)) {
      if (rule.required) errors.push({ field, message: `${rule.label} is required` })
      return
    }

    const result = rule.check(value, field)
    if (Array.isArray(result)) errors.push(...result)
    else if (result) errors.push({ field, message: result })
  })

  return errors
}

export function text({ label, min = 0, max = 255, required = true, pattern, patternMessage }) {
  return {
    label,
    required,
    check(value) {
      if (typeof value !== 'string') return `${label} must be text`
      const { length } = value.trim()
      if (length < min) return `${label} must be at least ${min} characters`
      if (length > max) return `${label} must be at most ${max} characters`
      if (pattern && !pattern.test(value.trim())) return patternMessage || `${label} is invalid`
      return null
    }
  }
}

export function email({ label = 'Email', required = true } = {}) {
  return text({ label, max: 254, required, pattern: EMAIL_PATTERN, patternMessage: 'Enter a valid email address' })
}

export function password({ label = 'Password', required = true } = {}) {
  return {
    label,
    required,
    check(value) {
      if (typeof value !== 'string') return `${label} must be text`
      if (value.length < 8) return `${label} must be at least 8 characters`
      if (value.length > 128) return `${label} must be at most 128 characters`
      if (!PASSWORD_PATTERN.test(value)) return `${label} needs at least one letter and one number`
      return null
    }
  }
}

// Form inputs send numbers as strings, so numeric strings are accepted as well.
export function toNumber(value) {
  return typeof value === 'string' && value.trim() !== '' ? Number(value) : value
}

export function number({ label, min = -Infinity, max = Infinity, integer = false, required = true }) {
  return {
    label,
    required,
    check(raw) {
      const value = toNumber(raw)
      if (typeof value !== 'number' || !Number.isFinite(value)) return `${label} must be a number`
      if (integer && !Number.isInteger(value)) return `${label} must be a whole number`
      if (value < min) return `${label} must be at least ${min}`
      if (value > max) return `${label} must be at most ${max}`
      return null
    }
  }
}

export function boolean({ label, required = false }) {
  return {
    label,
    required,
    check: (value) => (typeof value === 'boolean' ? null : `${label} must be true or false`)
  }
}

export function oneOf({ label, values, required = true }) {
  return {
    label,
    required,
    check: (value) => (values.includes(value) ? null : `${label} must be one of: ${values.join(', ')}`)
  }
}

export function stringList({ label, maxItems = 20, itemMax = 500, itemPattern, itemMessage, required = false }) {
  return {
    label,
    required,
    check(value) {
      if (!Array.isArray(value)) return `${label} must be a list`
      if (value.length > maxItems) return `${label} can have at most ${maxItems} entries`
      const invalid = value.findIndex(
        (item) =>
          typeof item !== 'string' ||
          !item.trim() ||
          item.length > itemMax ||
          (itemPattern && !itemPattern.test(item.trim()))
      )
      return invalid === -1 ? null : `${label} entry ${invalid + 1} ${itemMessage || 'is invalid'}`
    }
  }
}

export function idList({ label, maxItems = 100, required = false }) {
  return {
    label,
    required,
    check(value) {
      if (!Array.isArray(value)) return `${label} must be a list`
      if (value.length > maxItems) return `${label} can have at most ${maxItems} entries`
      const valid = value.every((item) => Number.isInteger(item) && item > 0)
      return valid ? null : `${label} must only contain product ids`
    }
  }
}

export function object({ label, fields, required = true, partial = false }) {
  return {
    label,
    required,
    check(value, path) {
      if (!isPlainObject(value)) return `${label} must be an object`
      return validate(value, fields, { partial, prefix: path })
    }
  }
}

export function arrayOf({ label, fields, minItems = 1, maxItems = 50, required = true }) {
  return {
    label,
    required,
    check(value, path) {
      if (!Array.isArray(value)) return `${label} must be a list`
      if (value.length < minItems) return `${label} needs at least ${minItems} entr${minItems === 1 ? 'y' : 'ies'}`
      if (value.length > maxItems) return `${label} can have at most ${maxItems} entries`
      return value.flatMap((item, index) => {
        if (!isPlainObject(item)) return [{ field: `${path}[${index}]`, message: `${label} entries must be objects` }]
        return validate(item, fields, { prefix: `${path}[${index}]` })
      })
    }
  }
}
