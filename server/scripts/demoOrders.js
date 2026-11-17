/**
 * The demo shopper's order history, so a fresh deploy already has a sales chart,
 * bestsellers and recent orders on the admin dashboard, orders to manage, and a filled
 * "My orders" page for demo@shopsmart.dev.
 *
 * Sixteen orders placed over the last thirteen days, dated back from the moment the seed
 * runs, so the dashboard's fourteen day chart always shows them. Each one is priced from
 * the catalogue with the same rules as checkout (models/order.js), and its history takes
 * only the steps the API allows, at the times a real order would take them.
 *
 * Stock and sold counts are not touched here. The seed loads the catalogue after these
 * orders are in place and applies every kept order to it (applyKeptOrders in seed.js),
 * so the demo orders reserve and count units exactly as real ones kept by a reseed do.
 */
import mongoose from 'mongoose'
import { nextSequence, syncSequence } from '../models/counter.js'
import Order, {
  DELIVERY_DAYS,
  STATUS_NOTES,
  calculateTotals,
  formatOrderNumber,
  highestOrderSequence,
  originalPriceOf,
  shopperCancelNote
} from '../models/order.js'
import User from '../models/user.js'

const HOUR = 60 * 60 * 1000
const DAY = 24 * HOUR

// Fixed ids (the hex of "demo" and the order's place in the list below) let the next seed
// find these orders again and refresh them instead of adding copies.
const DEMO_ID_PREFIX = '64656d6f'

const HOME = {
  name: 'Demo Shopper',
  email: 'demo@shopsmart.dev',
  phone: '9876543210',
  address: '24 MG Road, Ravipuram',
  city: 'Kochi',
  state: 'Kerala',
  pincode: '682016'
}

// A gift sent to someone else, as shoppers sometimes do.
const GIFT = {
  name: 'Ayesha Rahman',
  email: 'demo@shopsmart.dev',
  phone: '9012345678',
  address: '18 Shoranur Road, Poonkunnam',
  city: 'Thrissur',
  state: 'Kerala',
  pincode: '680002'
}

const UPI = { method: 'upi', upiId: 'demoshopper@okaxis' }
const CARD = { method: 'card', cardLast4: '4242' }
const COD = { method: 'cod' }

/**
 * Oldest first, so the order numbers rise with the dates. placed is how long before the
 * seed run the order was placed; each step is [status, hours after placing, note], and a
 * step without a note gets the one the API writes. items are [catalogue id, quantity].
 */
export const DEMO_ORDER_PLAN = [
  {
    placed: { days: 13 },
    items: [[52, 1], [48, 1], [73, 1]],
    payment: UPI,
    steps: [['shipped', 21], ['delivered', 74]]
  },
  {
    placed: { days: 12, hours: 5 },
    items: [[100, 1], [108, 1]],
    payment: CARD,
    steps: [['shipped', 18], ['delivered', 66]]
  },
  {
    placed: { days: 11, hours: 2 },
    items: [[34, 2], [27, 1], [30, 3], [29, 2]],
    payment: COD,
    steps: [['shipped', 23], ['delivered', 70]]
  },
  {
    placed: { days: 10, hours: 3 },
    items: [[90, 1]],
    payment: UPI,
    steps: [['cancelled', 2, shopperCancelNote('Ordered the wrong size')]]
  },
  {
    placed: { days: 9, hours: 20 },
    items: [[90, 1], [147, 1]],
    payment: CARD,
    steps: [['shipped', 20], ['delivered', 79]]
  },
  {
    placed: { days: 8, hours: 4 },
    items: [[8, 1], [4, 2]],
    payment: UPI,
    delivery: GIFT,
    steps: [['shipped', 26, 'Sent with Delhivery'], ['delivered', 90]]
  },
  {
    placed: { days: 7, hours: 1 },
    items: [[161, 1]],
    payment: CARD,
    steps: [['shipped', 19], ['delivered', 68]]
  },
  {
    placed: { days: 6, hours: 6 },
    items: [[34, 2], [36, 1], [33, 2]],
    payment: COD,
    steps: [['shipped', 22], ['delivered', 71]]
  },
  {
    placed: { days: 5, hours: 3 },
    items: [[43, 1]],
    payment: UPI,
    steps: [['cancelled', 7]]
  },
  {
    placed: { days: 4, hours: 2 },
    items: [[61, 1], [65, 2]],
    payment: UPI,
    steps: [['shipped', 20], ['delivered', 93]]
  },
  {
    placed: { days: 3, hours: 5 },
    // $149.98, two cents short of free delivery.
    items: [[100, 1], [104, 1]],
    payment: CARD,
    steps: [['shipped', 22, 'Sent with Blue Dart']]
  },
  {
    placed: { days: 2, hours: 8 },
    items: [[83, 2], [154, 1]],
    payment: COD,
    steps: [['shipped', 21]]
  },
  {
    placed: { days: 1, hours: 20 },
    items: [[30, 4], [34, 1], [32, 2], [40, 2]],
    payment: UPI,
    steps: [['shipped', 18]]
  },
  {
    placed: { days: 1, hours: 2 },
    items: [[186, 1]],
    payment: CARD,
    steps: [['cancelled', 1, shopperCancelNote()]]
  },
  {
    placed: { hours: 14 },
    items: [[173, 1], [183, 1]],
    payment: UPI,
    steps: []
  },
  {
    placed: { hours: 3 },
    items: [[34, 2], [41, 3], [38, 1]],
    payment: COD,
    steps: []
  }
]

export function demoOrderId(index) {
  return new mongoose.Types.ObjectId(`${DEMO_ID_PREFIX}${String(index + 1).padStart(16, '0')}`)
}

export const DEMO_ORDER_IDS = DEMO_ORDER_PLAN.map((plan, index) => demoOrderId(index))

// The line checkout would save for this catalogue entry, which the seed loads as it is.
function orderLine(entry, quantity) {
  const discountPercentage = entry.discountPercentage || 0
  return {
    id: entry.id,
    title: entry.title,
    brand: entry.brand || 'Generic',
    thumbnail: entry.thumbnail,
    price: entry.price,
    originalPrice: originalPriceOf({ price: entry.price, discountPercentage }),
    quantity
  }
}

// Checkout saves only the last 4 card digits or the UPI ID, and null for the other.
function paymentRecord({ method, cardLast4 = null, upiId = null }) {
  return {
    method,
    cardLast4: method === 'card' ? cardLast4 : null,
    upiId: method === 'upi' ? upiId : null
  }
}

/** The order document for one entry of DEMO_ORDER_PLAN. */
export function buildDemoOrder(plan, { _id, number, user, catalogueById, now }) {
  const items = plan.items.map(([id, quantity]) => {
    const entry = catalogueById.get(id)
    if (!entry) throw new Error(`Demo order ${number} lists product ${id}, which is not in the catalogue`)
    return orderLine(entry, quantity)
  })

  const { days = 0, hours = 0 } = plan.placed
  const placedAt = new Date(now - days * DAY - hours * HOUR)
  const statusHistory = [
    { status: 'processing', at: placedAt, note: STATUS_NOTES.processing },
    ...plan.steps.map(([status, after, note]) => ({
      status,
      at: new Date(placedAt.getTime() + after * HOUR),
      note: note ?? STATUS_NOTES[status]
    }))
  ]
  const latest = statusHistory.at(-1)

  return {
    _id,
    number,
    user,
    items,
    delivery: { ...(plan.delivery ?? HOME) },
    payment: paymentRecord(plan.payment),
    ...calculateTotals(items),
    status: latest.status,
    statusHistory,
    arrivesOn: new Date(placedAt.getTime() + DELIVERY_DAYS * DAY),
    createdAt: placedAt,
    updatedAt: latest.at
  }
}

/**
 * Writes the demo orders for the shopper, dated back from now. Orders a previous seed
 * wrote keep their numbers and are reset to the plan; new ones take the next numbers
 * from the order counter, after any number already in use. Every other order is left
 * alone.
 */
export async function seedDemoOrders(catalogue, shopper, now = Date.now()) {
  const catalogueById = new Map(catalogue.map((entry) => [entry.id, entry]))
  const previous = await Order.find({ _id: { $in: DEMO_ORDER_IDS } }).select('number')
  const numbers = new Map(previous.map((order) => [String(order._id), order.number]))
  if (previous.length < DEMO_ORDER_IDS.length) {
    await syncSequence('order', await highestOrderSequence())
  }

  const orders = []
  for (const [index, plan] of DEMO_ORDER_PLAN.entries()) {
    const _id = DEMO_ORDER_IDS[index]
    const number = numbers.get(String(_id)) ?? formatOrderNumber(await nextSequence('order'))
    orders.push(buildDemoOrder(plan, { _id, number, user: shopper._id, catalogueById, now }))
  }

  await Order.deleteMany({ _id: { $in: DEMO_ORDER_IDS } })
  // timestamps: false keeps the dates above instead of stamping every order with now.
  await Order.insertMany(orders, { timestamps: false })

  // Checkout keeps the last delivery address on the account for the next checkout. An
  // address the account already has is left as it is.
  const { email, ...address } = orders.at(-1).delivery
  await User.updateOne({ _id: shopper._id, 'address.address': { $in: ['', null] } }, { $set: { address } })

  return orders
}
