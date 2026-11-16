import { PAYMENT_METHODS } from '../models/order.js'
import { arrayOf, email, number, object, oneOf, text } from './rules.js'

// Shoppers often type "98765 43210" or "560 001", so spaces and dashes between the
// digits are allowed here and stripped before the order is saved.
const PHONE_PATTERN = /^(?:[\s-]*\d){10}[\s-]*$/
const PINCODE_PATTERN = /^(?:\s*\d){6}\s*$/
const CARD_LAST4_PATTERN = /^\d{4}$/
// The same rule the checkout form uses, for example name@okbank.
const UPI_PATTERN = /^[\w.-]{3,}@[a-zA-Z]{3,}$/

const orderLine = {
  id: number({ label: 'Product id', min: 1, integer: true }),
  quantity: number({ label: 'Quantity', min: 1, max: 99, integer: true })
}

export const deliveryRules = {
  name: text({ label: 'Name', min: 2, max: 60 }),
  email: email(),
  phone: text({ label: 'Phone', max: 20, pattern: PHONE_PATTERN, patternMessage: 'Enter a 10 digit phone number' }),
  address: text({ label: 'Street address', min: 8, max: 160 }),
  city: text({ label: 'City', max: 60 }),
  state: text({ label: 'State', max: 60 }),
  pincode: text({ label: 'PIN code', max: 10, pattern: PINCODE_PATTERN, patternMessage: 'Enter a 6 digit PIN code' })
}

const paymentFields = {
  method: oneOf({ label: 'Payment method', values: PAYMENT_METHODS }),
  cardLast4: text({
    label: 'Card ending',
    max: 4,
    required: false,
    pattern: CARD_LAST4_PATTERN,
    patternMessage: 'Send only the last 4 digits of the card'
  }),
  upiId: text({ label: 'UPI ID', max: 60, required: false, pattern: UPI_PATTERN, patternMessage: 'Enter a UPI ID such as name@bank' })
}

function isFilled(value) {
  return typeof value === 'string' && value.trim() !== ''
}

/**
 * The payment object, where the card ending is needed only for card payments and the
 * UPI ID only for UPI. The plain object() rule cannot express "required when", so this
 * one runs it first and then adds the method specific check.
 */
function payment() {
  const base = object({ label: 'Payment', fields: paymentFields })
  return {
    ...base,
    check(value, path) {
      const result = base.check(value, path)
      if (typeof result === 'string' || result.length) return result
      if (value.method === 'card' && !isFilled(value.cardLast4)) {
        return [{ field: `${path}.cardLast4`, message: 'Card ending is required for card payments' }]
      }
      if (value.method === 'upi' && !isFilled(value.upiId)) {
        return [{ field: `${path}.upiId`, message: 'UPI ID is required for UPI payments' }]
      }
      return []
    }
  }
}

// Only ids and quantities are read from the cart. Prices always come from the database.
export const createOrderRules = {
  items: arrayOf({ label: 'Items', fields: orderLine, minItems: 1, maxItems: 50 }),
  delivery: object({ label: 'Delivery details', fields: deliveryRules }),
  payment: payment()
}

export const cancelOrderRules = {
  reason: text({ label: 'Reason', max: 200, required: false })
}

// processing is where every order starts, so it is never a status an admin can move to.
export const orderStatusRules = {
  status: oneOf({ label: 'Status', values: ['shipped', 'delivered', 'cancelled'] }),
  note: text({ label: 'Note', max: 200, required: false })
}
