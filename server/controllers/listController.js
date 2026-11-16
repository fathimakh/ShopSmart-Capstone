import Product from '../models/product.js'
import { CART_LINE_LIMIT, VIEWED_LIMIT } from '../models/user.js'

const WISHLIST_LIMIT = 100

// Drops ids of products that no longer exist, so a deleted product cannot linger in a list.
async function keepExisting(ids) {
  if (!ids.length) return new Set()
  const found = await Product.find({ id: { $in: ids } }).select('id').lean()
  return new Set(found.map((product) => product.id))
}

// Joins duplicate lines, the way pressing "add to cart" twice adds to the same line.
function combineLines(lines) {
  const combined = new Map()
  lines.forEach(({ id, quantity }) => {
    const key = Number(id)
    combined.set(key, Math.min((combined.get(key) || 0) + Number(quantity), 99))
  })
  return [...combined].map(([id, quantity]) => ({ id, quantity }))
}

async function cleanCart(lines) {
  const combined = combineLines(lines)
  const existing = await keepExisting(combined.map((line) => line.id))
  return combined.filter((line) => existing.has(line.id)).slice(0, CART_LINE_LIMIT)
}

async function cleanIds(ids, limit) {
  const unique = [...new Set(ids)]
  const existing = await keepExisting(unique)
  return unique.filter((id) => existing.has(id)).slice(0, limit)
}

function listsOf(user) {
  return {
    cart: user.cart.map(({ id, quantity }) => ({ id, quantity })),
    wishlist: [...user.wishlist],
    recentlyViewed: [...user.recentlyViewed]
  }
}

/** GET /api/lists - the signed in shopper's cart, wishlist and recently viewed products. */
export function getLists(req, res) {
  res.json({ success: true, ...listsOf(req.user) })
}

/** PUT /api/lists/cart - the client sends the whole cart after every change. */
export async function replaceCart(req, res) {
  req.user.cart = await cleanCart(req.body.items)
  await req.user.save()
  res.json({ success: true, cart: listsOf(req.user).cart })
}

/** PUT /api/lists/wishlist */
export async function replaceWishlist(req, res) {
  req.user.wishlist = await cleanIds(req.body.ids, WISHLIST_LIMIT)
  await req.user.save()
  res.json({ success: true, wishlist: listsOf(req.user).wishlist })
}

/** PUT /api/lists/viewed - newest first, as the client keeps it. */
export async function replaceViewed(req, res) {
  req.user.recentlyViewed = await cleanIds(req.body.ids, VIEWED_LIMIT)
  await req.user.save()
  res.json({ success: true, recentlyViewed: listsOf(req.user).recentlyViewed })
}

/**
 * POST /api/lists/merge - runs once after sign in. What the guest added on this device
 * joins what the account already had, so nothing collected before signing in is lost.
 */
export async function mergeLists(req, res) {
  // Every field is optional, and a request without a JSON body leaves req.body undefined.
  const { cart = [], wishlist = [], recentlyViewed = [] } = req.body ?? {}
  const current = listsOf(req.user)

  req.user.cart = await cleanCart([...current.cart, ...cart])
  req.user.wishlist = await cleanIds([...current.wishlist, ...wishlist], WISHLIST_LIMIT)
  // This device's browsing is the most recent, so it goes first.
  req.user.recentlyViewed = await cleanIds([...recentlyViewed, ...current.recentlyViewed], VIEWED_LIMIT)

  await req.user.save()
  res.json({ success: true, ...listsOf(req.user) })
}
