import ApiError from './ApiError.js'

/**
 * Reads req.query defensively. Express 5 gives every value as a string, or a list of
 * strings when a key repeats, so each reader picks the first usable value. Problems are
 * collected and raised together by assertValid().
 */
export function createQueryReader(query = {}) {
  const errors = []

  function raw(key) {
    const value = query[key]
    const first = Array.isArray(value) ? value.find((item) => String(item).trim() !== '') : value
    if (first === undefined || first === null) return undefined
    const trimmed = String(first).trim()
    return trimmed === '' ? undefined : trimmed
  }

  return {
    errors,

    string(key, { maxLength = 100 } = {}) {
      const value = raw(key)
      if (value !== undefined && value.length > maxLength) {
        errors.push({ field: key, message: `${key} must be at most ${maxLength} characters` })
        return undefined
      }
      return value
    },

    // ?brand=a,b and ?brand=a&brand=b both become ['a', 'b'].
    list(key) {
      const values = [query[key]].flat().filter((item) => item !== undefined && item !== null)
      const items = values.flatMap((item) => String(item).split(','))
      return [...new Set(items.map((item) => item.trim()).filter(Boolean))]
    },

    number(key, { min = -Infinity, max = Infinity, integer = false } = {}) {
      const value = raw(key)
      if (value === undefined) return undefined
      const parsed = Number(value)
      if (!Number.isFinite(parsed) || (integer && !Number.isInteger(parsed))) {
        errors.push({ field: key, message: `${key} must be ${integer ? 'a whole number' : 'a number'}` })
        return undefined
      }
      if (parsed < min || parsed > max) {
        const range = max === Infinity ? `at least ${min}` : `between ${min} and ${max}`
        errors.push({ field: key, message: `${key} must be ${range}` })
        return undefined
      }
      return parsed
    },

    boolean(key) {
      const value = raw(key)?.toLowerCase()
      if (value === undefined) return undefined
      if (['true', '1', 'yes'].includes(value)) return true
      if (['false', '0', 'no'].includes(value)) return false
      errors.push({ field: key, message: `${key} must be true or false` })
      return undefined
    },

    oneOf(key, allowed, fallback) {
      const value = raw(key)
      if (value === undefined) return fallback
      if (!allowed.includes(value)) {
        errors.push({ field: key, message: `${key} must be one of: ${allowed.join(', ')}` })
        return fallback
      }
      return value
    },

    // limit=0 means "everything", which the storefront uses to load the whole catalogue.
    pagination({ defaultLimit = 24, maxLimit = 100, allowAll = false } = {}) {
      const page = this.number('page', { min: 1, integer: true }) ?? 1
      const requested = this.number('limit', { min: allowAll ? 0 : 1, integer: true }) ?? defaultLimit
      if (allowAll && requested === 0) return { page: 1, limit: 0, skip: 0 }
      const limit = Math.min(requested, maxLimit)
      return { page, limit, skip: (page - 1) * limit }
    },

    assertValid() {
      if (errors.length) throw ApiError.validation(errors, 'Invalid query parameters')
    }
  }
}

export function buildPagination(page, limit, total) {
  return {
    page,
    limit,
    total,
    pages: limit ? Math.ceil(total / limit) : 1
  }
}

// Escapes user text before it is placed inside a regular expression.
export function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
