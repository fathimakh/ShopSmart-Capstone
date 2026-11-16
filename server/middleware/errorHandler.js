import mongoose from 'mongoose'
import env from '../config/env.js'
import ApiError from '../utils/ApiError.js'

export function notFound(req, res, next) {
  next(ApiError.notFound(`Route not found: ${req.method} ${req.originalUrl}`, 'ROUTE_NOT_FOUND'))
}

function capitalize(value) {
  return value.charAt(0).toUpperCase() + value.slice(1)
}

/**
 * Maps errors thrown by Mongoose, MongoDB and the JSON body parser onto ApiError.
 * Anything it does not recognise is a bug, and returns null so it is logged as a 500.
 */
function toApiError(error) {
  if (error instanceof ApiError) return error

  if (error instanceof mongoose.Error.ValidationError) {
    return ApiError.validation(
      Object.values(error.errors).map((detail) => ({
        field: detail.path,
        message:
          detail.name === 'CastError' ? `${capitalize(detail.path)} has an invalid value` : detail.message
      }))
    )
  }

  if (error instanceof mongoose.Error.CastError) {
    return ApiError.badRequest(`Invalid value for ${error.path}`, 'INVALID_ID')
  }

  if (error?.code === 11000) {
    const field = Object.keys(error.keyValue || error.keyPattern || {})[0] || 'Value'
    return ApiError.conflict(`${capitalize(field)} already exists`, 'DUPLICATE_KEY')
  }

  if (error?.type === 'entity.parse.failed') {
    return ApiError.badRequest('The request body is not valid JSON', 'INVALID_JSON')
  }

  if (error?.type === 'entity.too.large') {
    return new ApiError(413, 'The request body is too large', { code: 'PAYLOAD_TOO_LARGE' })
  }

  return null
}

// Express recognises an error handler by its four arguments, so next has to stay.
// eslint-disable-next-line no-unused-vars
export function errorHandler(error, req, res, next) {
  const apiError = toApiError(error)
  const status = apiError ? apiError.statusCode : 500

  const body = {
    success: false,
    message: apiError ? apiError.message : 'Something went wrong on our side. Please try again.',
    code: apiError?.code || 'SERVER_ERROR'
  }
  if (apiError?.errors?.length) body.errors = apiError.errors
  if (apiError?.details) body.details = apiError.details

  if (status >= 500) {
    console.error(`[${req.method} ${req.originalUrl}]`, error)
    if (env.nodeEnv === 'development') body.stack = error?.stack
  }

  res.status(status).json(body)
}
