import mongoose from 'mongoose'

export const ORDER_STATUSES = ['processing', 'shipped', 'delivered', 'cancelled']
export const PAYMENT_METHODS = ['card', 'upi', 'cod']

// Orders only move forward; cancelling is allowed until the parcel leaves the warehouse.
export const NEXT_STATUS = { processing: 'shipped', shipped: 'delivered' }
export const CANCELLABLE_STATUSES = ['processing']

// The same rule the cart page shows: free delivery from $150, otherwise $4.99.
export const FREE_DELIVERY_THRESHOLD = 150
export const DELIVERY_FEE = 4.99
export const DELIVERY_DAYS = 4

// Order numbers look like SS100001: the shop prefix and a number from the order counter.
export const ORDER_NUMBER_PREFIX = 'SS'
export const ORDER_NUMBER_PATTERN = /^SS\d{6,12}$/i
// The first order is SS100001, so every number has the same length on a receipt.
const ORDER_NUMBER_OFFSET = 100000

// The note each step adds to an order's history, unless the admin writes one.
export const STATUS_NOTES = {
  processing: 'Order placed',
  shipped: 'Handed to the courier',
  delivered: 'Delivered',
  cancelled: 'Cancelled by the store'
}

export function shopperCancelNote(reason) {
  return reason ? `Cancelled by the shopper: ${reason}` : 'Cancelled by the shopper'
}

export function formatOrderNumber(sequence) {
  return `${ORDER_NUMBER_PREFIX}${ORDER_NUMBER_OFFSET + sequence}`
}

function roundCurrency(value) {
  return Math.round(value * 100) / 100
}

// The same rule the storefront uses to show the struck-through price.
export function originalPriceOf(product) {
  const discount = product.discountPercentage || 0
  return discount ? roundCurrency(product.price / (1 - discount / 100)) : product.price
}

/** Totals for [{ price, originalPrice, quantity }], worked out on the server only. */
export function calculateTotals(items) {
  const subtotal = roundCurrency(items.reduce((total, item) => total + item.price * item.quantity, 0))
  const savings = roundCurrency(
    items.reduce((total, item) => total + (item.originalPrice - item.price) * item.quantity, 0)
  )
  const deliveryFee = subtotal >= FREE_DELIVERY_THRESHOLD ? 0 : DELIVERY_FEE
  return { subtotal, savings, deliveryFee, total: roundCurrency(subtotal + deliveryFee) }
}

const orderItemSchema = new mongoose.Schema(
  {
    // Title, image and price are copied at checkout, so a later catalogue edit never
    // changes what the shopper actually paid for.
    id: { type: Number, required: true },
    title: { type: String, required: true },
    brand: { type: String, default: '' },
    thumbnail: { type: String, default: '' },
    price: { type: Number, required: true, min: 0 },
    originalPrice: { type: Number, required: true, min: 0 },
    quantity: { type: Number, required: true, min: 1 }
  },
  { _id: false }
)

const deliverySchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, trim: true, lowercase: true },
    phone: { type: String, required: true, trim: true },
    address: { type: String, required: true, trim: true },
    city: { type: String, required: true, trim: true },
    state: { type: String, required: true, trim: true },
    pincode: { type: String, required: true, trim: true }
  },
  { _id: false }
)

// No card number or CVV ever reaches the server; only what the receipt needs to show.
const paymentSchema = new mongoose.Schema(
  {
    method: { type: String, enum: PAYMENT_METHODS, required: true },
    cardLast4: { type: String, default: null },
    upiId: { type: String, default: null }
  },
  { _id: false }
)

const statusEventSchema = new mongoose.Schema(
  {
    status: { type: String, enum: ORDER_STATUSES, required: true },
    at: { type: Date, default: Date.now },
    note: { type: String, trim: true, default: '' }
  },
  { _id: false }
)

const orderSchema = new mongoose.Schema(
  {
    number: { type: String, required: true, unique: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    items: {
      type: [orderItemSchema],
      validate: { validator: (items) => items.length > 0, message: 'An order needs at least one item' }
    },
    delivery: { type: deliverySchema, required: true },
    payment: { type: paymentSchema, required: true },
    subtotal: { type: Number, required: true, min: 0 },
    savings: { type: Number, required: true, min: 0 },
    deliveryFee: { type: Number, required: true, min: 0 },
    total: { type: Number, required: true, min: 0 },
    status: { type: String, enum: ORDER_STATUSES, default: 'processing', index: true },
    statusHistory: { type: [statusEventSchema], default: [] },
    arrivesOn: { type: Date, required: true }
  },
  {
    timestamps: true,
    toJSON: {
      transform(doc, ret) {
        delete ret.__v
        return ret
      }
    }
  }
)

orderSchema.index({ createdAt: -1 })

const Order = mongoose.model('Order', orderSchema)

/** The highest counter value already used by a stored order number. */
export async function highestOrderSequence() {
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

export default Order
