import ApiError from '../utils/ApiError.js'
import { validate } from '../validators/rules.js'

/**
 * Checks req.body against a rule map from validators/. With partial set (updates), only
 * the fields that were sent are checked, but at least one of them has to be there.
 */
export function validateBody(rules, { partial = false } = {}) {
  return (req, res, next) => {
    const errors = validate(req.body, rules, { partial })
    if (errors.length) throw ApiError.validation(errors)

    if (partial && !Object.keys(rules).some((key) => req.body?.[key] !== undefined)) {
      throw ApiError.badRequest(`Send at least one of: ${Object.keys(rules).join(', ')}`, 'NOTHING_TO_UPDATE')
    }
    next()
  }
}

/**
 * Products keep the numeric ids the catalogue started with, so /api/products/abc is
 * turned away before it reaches the database.
 */
export function validateProductIdParam(req, res, next, value) {
  const id = Number(value)
  if (!Number.isInteger(id) || id < 1) {
    next(ApiError.badRequest('Invalid product id', 'INVALID_ID'))
    return
  }
  req.productId = id
  next()
}

const OBJECT_ID_PATTERN = /^[a-f\d]{24}$/i

export function validateObjectIdParam(resource) {
  return (req, res, next, value) => {
    if (!OBJECT_ID_PATTERN.test(value)) {
      next(ApiError.badRequest(`Invalid ${resource} id`, 'INVALID_ID'))
      return
    }
    next()
  }
}
