import { api } from './http'

/**
 * The admin endpoints (docs/API.md sections 5.3, 5.8, 5.9 and 5.10). Every call resolves
 * with the server's { success: true, ... } body and rejects with an ApiError, so the
 * admin pages can show the server's own message and per-field errors.
 */

/**
 * Builds "?a=1&b=x" from an object, leaving out empty values. A blank filter must not be
 * sent at all, because the API rejects values such as "status=" as invalid.
 */
export function buildQuery(params = {}) {
  const search = new URLSearchParams()
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return
    search.set(key, String(value))
  })
  const query = search.toString()
  return query ? `?${query}` : ''
}

export function createProduct(body) {
  return api.post('/products', body)
}

export function updateProduct(id, changes) {
  return api.put(`/products/${id}`, changes)
}

export function deleteProduct(id) {
  return api.delete(`/products/${id}`)
}

export function updateOrderStatus(ref, { status, note }) {
  return api.patch(`/orders/${encodeURIComponent(ref)}/status`, note ? { status, note } : { status })
}

export function updateUserRole(id, role) {
  return api.patch(`/users/${id}`, { role })
}

export function deleteUser(id) {
  return api.delete(`/users/${id}`)
}
