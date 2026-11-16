// Limits shared with the API (server/models/user.js and validators/listValidators.js).
// A list over these limits makes the server reject the whole save, so the client keeps
// to them before anything is sent.
export const MAX_QUANTITY = 99
export const CART_LINE_LIMIT = 50
export const WISHLIST_LIMIT = 100
export const VIEWED_LIMIT = 12
export const COMPARE_LIMIT = 4

function isProductId(value) {
  return Number.isInteger(value) && value > 0
}

export function clampQuantity(quantity) {
  const whole = Math.floor(Number(quantity))
  if (!Number.isFinite(whole) || whole < 1) return 1
  return Math.min(whole, MAX_QUANTITY)
}

/**
 * Cleans a cart read from storage or the server: drops broken lines, joins repeated
 * products the way the server does and keeps quantities and line count in range.
 */
export function sanitizeCart(lines) {
  if (!Array.isArray(lines)) return []
  const combined = new Map()

  lines.forEach((line) => {
    if (!line || !isProductId(line.id)) return
    const quantity = Math.floor(Number(line.quantity))
    if (!Number.isFinite(quantity) || quantity < 1) return
    combined.set(line.id, clampQuantity((combined.get(line.id) || 0) + quantity))
  })

  return [...combined]
    .slice(0, CART_LINE_LIMIT)
    .map(([id, quantity]) => ({ id, quantity }))
}

/** Unique, valid product ids in their original order, at most `limit` of them. */
export function sanitizeIds(ids, limit) {
  if (!Array.isArray(ids)) return []
  return [...new Set(ids.filter(isProductId))].slice(0, limit)
}

/** Order-sensitive comparison, used to tell whether a list changed while it was saving. */
export function sameList(a, b) {
  return JSON.stringify(a) === JSON.stringify(b)
}
