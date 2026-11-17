import { describe, expect, it } from 'vitest'
import {
  buildOrderRequest,
  buyAgainLines,
  canCancel,
  checkoutErrors,
  orderItemCount,
  orderStatus,
  orderTimeline,
  paymentSummary,
  statusDate,
  stockProblems
} from './orders'
import { ApiError } from '../services/http'

const placedAt = '2026-11-16T21:43:51.797Z'
const shippedAt = '2026-11-17T09:00:00.000Z'

function makeOrder(overrides = {}) {
  return {
    number: 'SS100001',
    status: 'processing',
    statusHistory: [{ status: 'processing', at: placedAt, note: 'Order placed' }],
    items: [
      { id: 1, title: 'Essence Mascara Lash Princess', quantity: 2, price: 9.99 },
      { id: 6, title: 'Calvin Klein CK One', quantity: 1, price: 49.99 }
    ],
    payment: { method: 'card', cardLast4: '4242', upiId: null },
    ...overrides
  }
}

const delivery = {
  name: ' Demo Shopper ',
  email: 'demo@shopsmart.dev',
  phone: '98765 43210',
  address: '12 MG Road, Indiranagar',
  city: 'Bengaluru',
  state: 'Karnataka',
  pincode: '560001'
}

describe('order status', () => {
  it('labels every server status and gives cancelled its own tone', () => {
    expect(orderStatus(makeOrder())).toEqual({ label: 'Processing', tone: 'is-processing' })
    expect(orderStatus(makeOrder({ status: 'shipped' }))).toEqual({ label: 'On the way', tone: 'is-shipping' })
    expect(orderStatus(makeOrder({ status: 'delivered' }))).toEqual({ label: 'Delivered', tone: 'is-delivered' })
    expect(orderStatus(makeOrder({ status: 'cancelled' }))).toEqual({ label: 'Cancelled', tone: 'is-cancelled' })
  })

  it('offers cancelling only while the order is processing', () => {
    expect(canCancel(makeOrder())).toBe(true)
    expect(canCancel(makeOrder({ status: 'shipped' }))).toBe(false)
    expect(canCancel(makeOrder({ status: 'cancelled' }))).toBe(false)
  })

  it('counts units and reads dates from the history', () => {
    expect(orderItemCount(makeOrder())).toBe(3)
    expect(statusDate(makeOrder(), 'processing')).toBe(placedAt)
    expect(statusDate(makeOrder(), 'delivered')).toBeNull()
  })
})

describe('order timeline', () => {
  it('shows the way to delivery with the steps still to come', () => {
    const order = makeOrder({
      status: 'shipped',
      statusHistory: [
        { status: 'processing', at: placedAt, note: 'Order placed' },
        { status: 'shipped', at: shippedAt, note: 'Sent with BlueDart' }
      ]
    })

    expect(orderTimeline(order)).toEqual([
      { status: 'processing', label: 'Order placed', state: 'done', at: placedAt, note: 'Order placed' },
      { status: 'shipped', label: 'Handed to the courier', state: 'current', at: shippedAt, note: 'Sent with BlueDart' },
      { status: 'delivered', label: 'Delivered', state: 'upcoming', at: null, note: '' }
    ])
  })

  it('ends a cancelled order at the cancellation instead of delivery', () => {
    const cancelledAt = '2026-11-16T22:00:00.000Z'
    const order = makeOrder({
      status: 'cancelled',
      statusHistory: [
        { status: 'processing', at: placedAt, note: 'Order placed' },
        { status: 'cancelled', at: cancelledAt, note: 'Cancelled by the shopper: ordered twice' }
      ]
    })

    expect(orderTimeline(order).map(({ status, state }) => [status, state])).toEqual([
      ['processing', 'done'],
      ['cancelled', 'current']
    ])
    expect(orderTimeline(order)[1].note).toBe('Cancelled by the shopper: ordered twice')
  })
})

describe('payment summary', () => {
  it('reads the method from order.payment', () => {
    expect(paymentSummary(makeOrder())).toBe('Card ending 4242')
    expect(paymentSummary(makeOrder({ payment: { method: 'upi', cardLast4: null, upiId: 'asha@okbank' } }))).toBe(
      'UPI (asha@okbank)'
    )
    expect(paymentSummary(makeOrder({ payment: { method: 'cod', cardLast4: null, upiId: null } }))).toBe(
      'Cash on delivery'
    )
  })
})

describe('buy again', () => {
  it('leaves out products that sold out or left the catalogue, and caps at the stock', () => {
    const products = [
      { id: 1, stock: 1 },
      { id: 6, stock: 0 }
    ]
    const order = makeOrder({
      items: [...makeOrder().items, { id: 99, title: 'Retired Lamp', quantity: 1 }]
    })

    expect(buyAgainLines(order, products)).toEqual({
      available: [{ id: 1, quantity: 1 }],
      unavailable: ['Calvin Klein CK One', 'Retired Lamp']
    })
  })

  it('offers every line when the catalogue is not loaded', () => {
    expect(buyAgainLines(makeOrder(), null).available).toEqual([
      { id: 1, quantity: 2 },
      { id: 6, quantity: 1 }
    ])
  })
})

describe('order request', () => {
  const cartItems = [
    { id: 1, quantity: 2, price: 9.99, title: 'Essence Mascara Lash Princess' },
    { id: 6, quantity: 1, price: 49.99, title: 'Calvin Klein CK One' }
  ]

  it('sends ids and quantities, and only the last four digits of a card', () => {
    const body = buildOrderRequest(cartItems, delivery, {
      method: 'card',
      cardName: 'Demo Shopper',
      cardNumber: '4111 1111 1111 4242',
      expiry: '12/29',
      cvv: '123',
      upiId: ''
    })

    expect(body).toEqual({
      items: [
        { id: 1, quantity: 2 },
        { id: 6, quantity: 1 }
      ],
      delivery: { ...delivery, name: 'Demo Shopper', phone: '9876543210' },
      payment: { method: 'card', cardLast4: '4242' }
    })
    const sent = JSON.stringify(body)
    expect(sent).not.toContain('4111')
    expect(sent).not.toContain('123')
    expect(sent).not.toContain('12/29')
  })

  it('sends only the digits of a phone number and PIN code the form accepted', () => {
    const typed = { ...delivery, phone: '(987) 654-3210', pincode: '682-001' }
    const body = buildOrderRequest(cartItems, typed, { method: 'cod' })
    expect(body.delivery.phone).toBe('9876543210')
    expect(body.delivery.pincode).toBe('682001')
  })

  it('sends the UPI ID for UPI and nothing else for cash on delivery', () => {
    expect(buildOrderRequest(cartItems, delivery, { method: 'upi', upiId: ' asha@okbank ' }).payment).toEqual({
      method: 'upi',
      upiId: 'asha@okbank'
    })
    expect(buildOrderRequest(cartItems, delivery, { method: 'cod', cardNumber: '4242' }).payment).toEqual({
      method: 'cod'
    })
  })
})

describe('checkout errors from the server', () => {
  it('maps delivery and payment fields onto the form inputs and picks the first step', () => {
    const error = new ApiError({
      status: 400,
      code: 'VALIDATION_ERROR',
      message: 'Please check the highlighted fields',
      errors: [
        { field: 'payment.cardLast4', message: 'Send only the last 4 digits of the card' },
        { field: 'delivery.phone', message: 'Enter a 10 digit phone number' },
        { field: 'delivery.pincode', message: 'Enter a 6 digit PIN code' }
      ]
    })

    expect(checkoutErrors(error)).toEqual({
      fields: {
        cardNumber: 'Send only the last 4 digits of the card',
        phone: 'Enter a 10 digit phone number',
        pincode: 'Enter a 6 digit PIN code'
      },
      step: 'payment',
      cartMessage: ''
    })
  })

  it('reports a refused cart line as a cart problem', () => {
    const error = new ApiError({
      status: 400,
      code: 'VALIDATION_ERROR',
      message: 'Please check the highlighted fields',
      errors: [{ field: 'items[0].quantity', message: 'Quantity must be at most 99' }]
    })

    expect(checkoutErrors(error)).toEqual({
      fields: {},
      step: null,
      cartMessage: 'A line in your cart was refused: Quantity must be at most 99'
    })
  })

  it('reads every out of stock line with what is still available', () => {
    const error = new ApiError({
      status: 409,
      code: 'OUT_OF_STOCK',
      message: 'Some items in your cart are not available in the quantity you asked for.',
      details: {
        items: [
          { id: 1, title: 'Essence Mascara Lash Princess', requested: 99, available: 97 },
          { id: 6, title: 'Calvin Klein CK One', requested: 1, available: 0 },
          { id: 42, title: null, requested: 1, available: 0 }
        ]
      }
    })

    expect(stockProblems(error)).toEqual({
      1: { available: 97, message: 'Only 97 left, you asked for 99.' },
      6: { available: 0, message: 'This product has sold out.' },
      42: { available: 0, message: 'This product is no longer sold.' }
    })
    expect(stockProblems(new ApiError({ message: 'Offline' }))).toEqual({})
  })
})
