/**
 * An expected failure with an HTTP status. Thrown anywhere inside a request and turned
 * into the standard error body by middleware/errorHandler.js:
 *   { success: false, message, code, errors? }
 */
export default class ApiError extends Error {
  constructor(statusCode, message, { code, errors } = {}) {
    super(message)
    this.name = 'ApiError'
    this.statusCode = statusCode
    this.code = code
    this.errors = errors
  }

  static badRequest(message, code = 'BAD_REQUEST') {
    return new ApiError(400, message, { code })
  }

  static validation(errors, message = 'Please check the highlighted fields') {
    return new ApiError(400, message, { code: 'VALIDATION_ERROR', errors })
  }

  static unauthorized(message, code = 'UNAUTHORIZED') {
    return new ApiError(401, message, { code })
  }

  static forbidden(message = 'You do not have permission to do that') {
    return new ApiError(403, message, { code: 'FORBIDDEN' })
  }

  static notFound(message = 'Not found', code = 'NOT_FOUND') {
    return new ApiError(404, message, { code })
  }

  static conflict(message, code = 'CONFLICT') {
    return new ApiError(409, message, { code })
  }

  static unavailable(message, code = 'SERVICE_UNAVAILABLE') {
    return new ApiError(503, message, { code })
  }
}
