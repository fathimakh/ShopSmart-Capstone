import { nextSequence, syncSequence } from '../models/counter.js'
import Order, {
  CANCELLABLE_STATUSES,
  DELIVERY_DAYS,
  NEXT_STATUS,
  ORDER_NUMBER_PREFIX,
  ORDER_STATUSES,
  calculateTotals
} from '../models/order.js'
import Product from '../models/product.js'
import User from '../models/user.js'
import ApiError from '../utils/ApiError.js'
import { buildPagination, createQueryReader, escapeRegex } from '../utils/queryReader.js'

const DAY = 24 * 60 * 60 * 1000
// The first order is SS100001, so every number has the same length on a receipt.
const ORDER_NUMBER_OFFSET = 100000
const NUMBER_ATTEMPTS = 3
const USER_SUMMARY = 'name email'

// The store can cancel an order until it is delivered, that is while it still has a next step.
const STORE_CANCELLABLE_STATUSES = Object.keys(NEXT_STATUS)

const STATUS_NOTES = {
  shipped: 'Handed to the courier',
  delivered: 'Delivered',
  cancelled: 'Cancelled by the store'
}

function roundCurrency(value) {
  return Math.round(value * 100) / 100
}

// The same rule the storefront uses to show the struck-through price.
function originalPriceOf(product) {
  const discount = product.discountPercentage || 0
  return discount ? roundCurrency(product.price / (1 - discount / 100)) : product.price
}

function digitsOnly(value) {
  return value.replace(/\D/g, '')
}

// Two lines for the same product become one, the way the cart shows them.
function mergeLines(items) {
  const quantities = new Map()
  items.forEach(({ id, quantity }) => {
    const key = Number(id)
    quantities.set(key, (quantities.get(key) || 0) + Number(quantity))
  })
  return quantities
}

function outOfStock(items) {
  const [first] = items
  let message = 'Some items in your cart are not available in the quantity you asked for.'
  if (items.length === 1 && !first.title) message = 'One of the products in your cart is no longer sold.'
  else if (items.length === 1 && first.available > 0) message = `Only ${first.available} left of ${first.title}.`
  else if (items.length === 1) message = `${first.title} is out of stock.`

  return new ApiError(409, message, { code: 'OUT_OF_STOCK', details: { items } })
}

/**
 * Puts reserved units back on the shelf: a failed checkout or a cancelled order. The
 * schema's min: 0 does not apply to an update, so soldCount is kept from going below zero
 * here, for an order whose units were never counted (one restored from a backup, say).
 */
async function restock(items) {
  if (!items.length) return
  await Product.bulkWrite(
    items.map(({ id, quantity }) => ({
      updateOne: {
        filter: { id },
        update: [
          {
            $set: {
              stock: { $add: ['$stock', quantity] },
              soldCount: { $max: [0, { $subtract: ['$soldCount', quantity] }] }
            }
          }
        ]
      }
    }))
  )
}

/** The highest counter value already used by a stored order number. */
async function highestOrderSequence() {
  const [result] = await Order.aggregate([
    {
      $project: {
        sequence: {
          $convert: { input: { $substrCP: ['$number', ORDER_NUMBER_PREFIX.length, 20] }, to: 'long', onError: 0, onNull: 0 }
        }
      }
    },
    { $group: { _id: null, highest: { $max: '$sequence' } } }
  ])
  return Math.max(Number(result?.highest ?? 0) - ORDER_NUMBER_OFFSET, 0)
}

/**
 * Saves the order under the next number from the counter. If that number is already
 * taken (the counter was reset, or a backup was restored), the counter jumps past the
 * highest stored number and the save is tried again.
 */
async function insertWithNumber(fields, attemptsLeft = NUMBER_ATTEMPTS) {
  const number = `${ORDER_NUMBER_PREFIX}${ORDER_NUMBER_OFFSET + (await nextSequence('order'))}`
  try {
    return await Order.create({ ...fields, number })
  } catch (error) {
    if (error?.code !== 11000 || !error.keyPattern?.number || attemptsLeft <= 1) throw error
    await syncSequence('order', await highestOrderSequence())
    return insertWithNumber(fields, attemptsLeft - 1)
  }
}

function isOwner(order, user) {
  // populated() gives the stored id even when the account has been deleted since.
  const ownerId = order.populated('user') ?? order.user
  return Boolean(ownerId) && user._id.equals(ownerId)
}

/**
 * Loads the order named in the URL. Another shopper's order is reported as missing
 * rather than forbidden, so order numbers cannot be probed one after another.
 */
async function findOrderFor(req) {
  const order = await Order.findOne(req.orderFilter).populate('user', USER_SUMMARY)
  if (!order || (!isOwner(order, req.user) && req.user.role !== 'admin')) {
    throw ApiError.notFound('We could not find that order.', 'ORDER_NOT_FOUND')
  }
  return order
}

/**
 * Moves an order to a new status. The update only matches while the order still has
 * the status it was checked against, so two clicks on "Cancel" (or a shopper and an
 * admin at the same moment) can never both succeed and restock twice.
 */
async function applyStatusChange(order, status, note) {
  const updated = await Order.findOneAndUpdate(
    { _id: order._id, status: order.status },
    { $set: { status }, $push: { statusHistory: { status, note, at: new Date() } } },
    { returnDocument: 'after', runValidators: true }
  ).populate('user', USER_SUMMARY)

  if (!updated) {
    throw ApiError.conflict('This order was just updated somewhere else. Refresh and try again.', 'ORDER_CHANGED')
  }
  if (status === 'cancelled') await restock(order.items)
  return updated
}

/**
 * POST /api/orders - places an order for the signed in shopper. The server is the only
 * judge of price: titles, images and prices come from the catalogue and the totals are
 * worked out here. Stock is reserved one line at a time with an update that only
 * succeeds while enough units are left (MongoDB runs standalone here, so there are no
 * transactions), and every reserved line is put back if anything after it fails.
 */
export async function createOrder(req, res) {
  const { items, delivery, payment } = req.body
  const quantities = mergeLines(items)
  const ids = [...quantities.keys()]

  const products = await Product.find({ id: { $in: ids } })
  const productsById = new Map(products.map((product) => [product.id, product]))

  // Every problem line is reported at once, so the shopper can fix the cart in one go.
  const shortages = ids
    .filter((id) => !productsById.has(id) || productsById.get(id).stock < quantities.get(id))
    .map((id) => ({
      id,
      title: productsById.get(id)?.title ?? null,
      requested: quantities.get(id),
      available: productsById.get(id)?.stock ?? 0
    }))
  if (shortages.length) throw outOfStock(shortages)

  const lines = ids.map((id) => {
    const product = productsById.get(id)
    return {
      id,
      title: product.title,
      brand: product.brand,
      thumbnail: product.thumbnail,
      price: product.price,
      originalPrice: originalPriceOf(product),
      quantity: quantities.get(id)
    }
  })

  const shipTo = {
    name: delivery.name.trim(),
    email: delivery.email.trim().toLowerCase(),
    phone: digitsOnly(delivery.phone),
    address: delivery.address.trim(),
    city: delivery.city.trim(),
    state: delivery.state.trim(),
    pincode: digitsOnly(delivery.pincode)
  }

  const reserved = []
  let order
  try {
    for (const line of lines) {
      const { modifiedCount } = await Product.updateOne(
        { id: line.id, stock: { $gte: line.quantity } },
        { $inc: { stock: -line.quantity, soldCount: line.quantity } }
      )
      if (!modifiedCount) {
        // Someone bought the last units between the check above and this update.
        const current = await Product.findOne({ id: line.id }).select('stock')
        throw outOfStock([{ id: line.id, title: line.title, requested: line.quantity, available: current?.stock ?? 0 }])
      }
      reserved.push(line)
    }

    const placedAt = new Date()
    order = await insertWithNumber({
      user: req.user._id,
      items: lines,
      delivery: shipTo,
      payment: {
        method: payment.method,
        cardLast4: payment.method === 'card' ? payment.cardLast4.trim() : null,
        upiId: payment.method === 'upi' ? payment.upiId.trim() : null
      },
      ...calculateTotals(lines),
      status: 'processing',
      statusHistory: [{ status: 'processing', at: placedAt, note: 'Order placed' }],
      arrivesOn: new Date(placedAt.getTime() + DELIVERY_DAYS * DAY)
    })
  } catch (error) {
    await restock(reserved)
    throw error
  }

  // The order is already placed, so tidying the account must not turn it into an error.
  await User.updateOne(
    { _id: req.user._id },
    {
      $pull: { cart: { id: { $in: ids } } },
      // Remembered for the next checkout. The email stays on the account itself.
      $set: {
        address: {
          name: shipTo.name,
          phone: shipTo.phone,
          address: shipTo.address,
          city: shipTo.city,
          state: shipTo.state,
          pincode: shipTo.pincode
        }
      }
    }
  ).catch((error) => console.warn('[orders] could not update the saved cart and address:', error.message))

  await order.populate('user', USER_SUMMARY)
  res.status(201).json({ success: true, order })
}

/** GET /api/orders/mine - the signed in shopper's orders, newest first. */
export async function getMyOrders(req, res) {
  const orders = await Order.find({ user: req.user._id })
    .sort({ createdAt: -1, _id: -1 })
    .populate('user', USER_SUMMARY)
  res.json({ success: true, orders })
}

/** GET /api/orders/:ref - by order number or id, for its owner or an admin. */
export async function getOrder(req, res) {
  const order = await findOrderFor(req)
  res.json({ success: true, order })
}

/** PATCH /api/orders/:ref/cancel - the shopper may cancel until the order ships. */
export async function cancelOrder(req, res) {
  const order = await findOrderFor(req)
  if (!isOwner(order, req.user)) {
    throw ApiError.forbidden('Only the shopper who placed this order can cancel it here.')
  }
  if (!CANCELLABLE_STATUSES.includes(order.status)) {
    throw ApiError.conflict(
      `This order is already ${order.status} and can no longer be cancelled.`,
      'ORDER_NOT_CANCELLABLE'
    )
  }

  const reason = req.body?.reason?.trim()
  const updated = await applyStatusChange(
    order,
    'cancelled',
    reason ? `Cancelled by the shopper: ${reason}` : 'Cancelled by the shopper'
  )
  res.json({ success: true, order: updated })
}

/** GET /api/orders (admin) - every order, filtered by status and a search, newest first. */
export async function listOrders(req, res) {
  const read = createQueryReader(req.query)
  const status = read.oneOf('status', ORDER_STATUSES)
  const q = read.string('q', { maxLength: 100 })
  const { page, limit, skip } = read.pagination({ defaultLimit: 20, maxLimit: 100 })
  read.assertValid()

  const filter = {}
  if (status) filter.status = status
  if (q) {
    // Matches the order number, the delivery name or email, or the account's name or email.
    const pattern = new RegExp(escapeRegex(q), 'i')
    const accounts = await User.find({ $or: [{ name: pattern }, { email: pattern }] }).select('_id').limit(200)
    filter.$or = [
      { number: pattern },
      { 'delivery.name': pattern },
      { 'delivery.email': pattern },
      { user: { $in: accounts.map((account) => account._id) } }
    ]
  }

  const [orders, total] = await Promise.all([
    Order.find(filter).sort({ createdAt: -1, _id: -1 }).skip(skip).limit(limit).populate('user', USER_SUMMARY),
    Order.countDocuments(filter)
  ])
  res.json({ success: true, orders, pagination: buildPagination(page, limit, total) })
}

/**
 * PATCH /api/orders/:ref/status (admin) - processing to shipped to delivered, one step at
 * a time, or cancelled at any point before delivery, which puts the stock back.
 */
export async function updateOrderStatus(req, res) {
  const { status, note } = req.body
  const order = await findOrderFor(req)

  if (order.status === status) {
    throw ApiError.conflict(`This order is already ${status}.`, 'INVALID_STATUS_TRANSITION')
  }
  const allowed =
    NEXT_STATUS[order.status] === status ||
    (status === 'cancelled' && STORE_CANCELLABLE_STATUSES.includes(order.status))
  if (!allowed) {
    throw ApiError.conflict(`An order cannot move from ${order.status} to ${status}.`, 'INVALID_STATUS_TRANSITION')
  }

  const updated = await applyStatusChange(order, status, note?.trim() || STATUS_NOTES[status])
  res.json({ success: true, order: updated })
}
