import { api } from './http'

// The orders API (docs/API.md, Orders). Every call needs a signed in shopper; the token
// is attached by the http wrapper. Order references in URLs are the order number.

/** Places an order and resolves with the order the server priced and saved. */
export async function placeOrder(body, options) {
  const data = await api.post('/orders', body, options)
  return data.order
}

/** Every order the signed in shopper placed, newest first. */
export async function fetchMyOrders(options) {
  const data = await api.get('/orders/mine', options)
  return data.orders
}

export async function fetchOrder(number, options) {
  const data = await api.get(`/orders/${encodeURIComponent(number)}`, options)
  return data.order
}

/** Cancels an order that is still processing. The reason is optional. */
export async function cancelOrder(number, reason, options) {
  const body = reason ? { reason } : {}
  const data = await api.patch(`/orders/${encodeURIComponent(number)}/cancel`, body, options)
  return data.order
}
