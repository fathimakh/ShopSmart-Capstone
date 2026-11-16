// Helpers for orders as the API returns them (docs/API.md, Order). Pure functions, so the
// pages stay small and the rules can be tested without rendering anything.

/** The label and tone of every status an order can have. */
export const statusDetails = {
  processing: { label: 'Processing', tone: 'is-processing' },
  shipped: { label: 'On the way', tone: 'is-shipping' },
  delivered: { label: 'Delivered', tone: 'is-delivered' },
  cancelled: { label: 'Cancelled', tone: 'is-cancelled' }
}

// The path every order follows unless it is cancelled on the way.
const FULFILMENT_STEPS = ['processing', 'shipped', 'delivered']

const stepLabels = {
  processing: 'Order placed',
  shipped: 'Handed to the courier',
  delivered: 'Delivered',
  cancelled: 'Cancelled'
}

export function orderStatus(order) {
  return statusDetails[order.status] || { label: order.status, tone: 'is-processing' }
}

/** Only an order that has not left the warehouse can be cancelled by the shopper. */
export function canCancel(order) {
  return order.status === 'processing'
}

export function orderItemCount(order) {
  return order.items.reduce((total, item) => total + item.quantity, 0)
}

/** When the order reached a status, read from its history. null if it never did. */
export function statusDate(order, status) {
  const entry = (order.statusHistory || []).find((change) => change.status === status)
  return entry ? entry.at : null
}

/**
 * The steps to draw on the order page. A live order shows the whole way to delivery,
 * with the steps still to come marked as upcoming. A cancelled order shows what really
 * happened, ending with the cancellation. Each step is
 * { status, label, state: 'done' | 'current' | 'upcoming', at, note }.
 */
export function orderTimeline(order) {
  const history = order.statusHistory || []

  if (order.status === 'cancelled') {
    return history.map((change, index) => ({
      status: change.status,
      label: stepLabels[change.status] || change.status,
      state: index === history.length - 1 ? 'current' : 'done',
      at: change.at,
      note: change.note || ''
    }))
  }

  const reached = FULFILMENT_STEPS.indexOf(order.status)
  return FULFILMENT_STEPS.map((status, index) => {
    const change = history.find((entry) => entry.status === status)
    let state = 'upcoming'
    if (index < reached) state = 'done'
    if (index === reached) state = 'current'
    return {
      status,
      label: stepLabels[status],
      state,
      at: change ? change.at : null,
      note: change ? change.note || '' : ''
    }
  })
}

export const paymentLabels = {
  card: 'Card',
  upi: 'UPI',
  cod: 'Cash on delivery'
}

export function paymentSummary(order) {
  const payment = order.payment || {}
  const label = paymentLabels[payment.method] || payment.method || 'Not recorded'
  if (payment.method === 'card' && payment.cardLast4) return `${label} ending ${payment.cardLast4}`
  if (payment.method === 'upi' && payment.upiId) return `${label} (${payment.upiId})`
  return label
}

/**
 * Splits an order's lines into the ones that can go back in the cart and the ones that
 * cannot, because the product has left the catalogue or sold out since. Without a
 * catalogue to check against every line is offered, and checkout checks the stock.
 */
export function buyAgainLines(order, products) {
  const available = []
  const unavailable = []

  order.items.forEach((item) => {
    if (!products || !products.length) {
      available.push({ id: item.id, quantity: item.quantity })
      return
    }
    const product = products.find((entry) => entry.id === item.id)
    if (!product || product.stock < 1) {
      unavailable.push(item.title)
      return
    }
    available.push({ id: item.id, quantity: Math.min(item.quantity, product.stock) })
  })

  return { available, unavailable }
}

function digits(value) {
  return String(value || '').replace(/\D/g, '')
}

/**
 * The body for POST /api/orders. Only ids and quantities leave the cart (the server
 * prices everything itself), and only the last four digits of a card are sent: the full
 * number and the CVV never leave this page.
 */
export function buildOrderRequest(cartItems, delivery, payment) {
  const body = {
    items: cartItems.map((item) => ({ id: item.id, quantity: item.quantity })),
    delivery: {
      name: delivery.name.trim(),
      email: delivery.email.trim(),
      phone: delivery.phone.trim(),
      address: delivery.address.trim(),
      city: delivery.city.trim(),
      state: delivery.state.trim(),
      pincode: delivery.pincode.trim()
    },
    payment: { method: payment.method }
  }

  if (payment.method === 'card') body.payment.cardLast4 = digits(payment.cardNumber).slice(-4)
  if (payment.method === 'upi') body.payment.upiId = payment.upiId.trim()
  return body
}

// Where each server field lives in the checkout form.
const paymentInputs = {
  'payment.method': 'method',
  'payment.cardLast4': 'cardNumber',
  'payment.upiId': 'upiId'
}

/**
 * Turns a failed POST /api/orders into what the checkout form shows: field messages
 * keyed by input name, the step that holds the first of them, and a message about the
 * cart when a line itself was refused.
 */
export function checkoutErrors(error) {
  const fields = {}
  let step = null
  let cartMessage = ''
  const problems = error.errors || []

  problems.forEach(({ field = '', message }) => {
    if (field.startsWith('delivery.')) {
      const input = field.slice('delivery.'.length)
      if (!fields[input]) fields[input] = message
      step = step || 'delivery'
    } else if (paymentInputs[field]) {
      const input = paymentInputs[field]
      if (!fields[input]) fields[input] = message
      step = step || 'payment'
    } else if (field.startsWith('items')) {
      cartMessage = cartMessage || `A line in your cart was refused: ${message}`
    }
  })

  return { fields, step, cartMessage }
}

/**
 * Reads a 409 OUT_OF_STOCK answer into one note per cart line, keyed by product id,
 * with the quantity that can still be bought (0 when none).
 */
export function stockProblems(error) {
  const items = (error && error.details && error.details.items) || []
  return items.reduce((problems, item) => {
    let message = `Only ${item.available} left, you asked for ${item.requested}.`
    if (item.title === null) message = 'This product is no longer sold.'
    else if (item.available < 1) message = 'This product has sold out.'
    problems[item.id] = { available: Math.max(item.available, 0), message }
    return problems
  }, {})
}
