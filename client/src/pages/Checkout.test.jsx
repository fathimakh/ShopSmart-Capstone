import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import Checkout from './Checkout'
import { setToken } from '../services/http'
import { fakeApi, fakeToken } from '../test/fakeApi'
import { apiProduct, renderShopPage, shopper } from '../test/renderShopPage'

const token = fakeToken(Math.floor(Date.now() / 1000) + 3600)

function placedOrder(body) {
  return {
    _id: '6afb7917f4dae1f392f2f650',
    number: 'SS100009',
    items: body.items.map((line) => ({
      id: line.id,
      title: `Product ${line.id}`,
      brand: 'Brand',
      thumbnail: 'https://cdn.example/thumb.webp',
      price: 10,
      originalPrice: 10,
      quantity: line.quantity
    })),
    delivery: body.delivery,
    payment: { method: body.payment.method, cardLast4: body.payment.cardLast4 || null, upiId: null },
    subtotal: 30,
    savings: 0,
    deliveryFee: 4.99,
    total: 34.99,
    status: 'processing',
    statusHistory: [{ status: 'processing', at: '2026-11-17T10:00:00.000Z', note: 'Order placed' }],
    arrivesOn: '2026-11-21T10:00:00.000Z',
    createdAt: '2026-11-17T10:00:00.000Z',
    updatedAt: '2026-11-17T10:00:00.000Z'
  }
}

function checkoutRoutes(extra) {
  return {
    'GET /auth/me': () => [200, { success: true, user: shopper }],
    'GET /products': () => [200, { success: true, products: [apiProduct(1), apiProduct(2), apiProduct(3)] }],
    'GET /lists': () => [
      200,
      {
        success: true,
        cart: [
          { id: 1, quantity: 2 },
          { id: 2, quantity: 1 }
        ],
        wishlist: [],
        recentlyViewed: []
      }
    ],
    'PUT /lists/cart': ({ body }) => [200, { success: true, cart: body.items }],
    ...extra
  }
}

/** Walks from the prefilled delivery step to the review step with a made up card. */
async function reachReview() {
  fireEvent.click(await screen.findByRole('button', { name: 'Continue to payment' }))
  fireEvent.change(screen.getByLabelText('Name on card'), { target: { value: 'Demo Shopper' } })
  fireEvent.change(screen.getByLabelText('Card number'), { target: { value: '4111 1111 1111 4242' } })
  fireEvent.change(screen.getByLabelText('Expiry'), { target: { value: '1229' } })
  fireEvent.change(screen.getByLabelText('CVV'), { target: { value: '123' } })
  fireEvent.click(screen.getByRole('button', { name: 'Review order' }))
  return screen.findByRole('button', { name: /^Place order/ })
}

describe('Checkout', () => {
  beforeEach(() => {
    setToken(token)
    window.localStorage.setItem('shopsmart:lists-owner', JSON.stringify(shopper._id))
  })

  it('fills the delivery in from the account and sends only ids, quantities and the last four digits', async () => {
    const api = fakeApi(
      checkoutRoutes({
        'POST /orders': ({ body }) => [201, { success: true, order: placedOrder(body) }]
      })
    )
    renderShopPage(<Checkout />, { path: '/checkout' })

    expect(await screen.findByLabelText('Street address')).toHaveValue('12 MG Road, Indiranagar')
    expect(screen.getByLabelText('Email')).toHaveValue('demo@shopsmart.dev')
    expect(screen.getByText(/Filled in from your account/)).toBeInTheDocument()

    const place = await reachReview()
    const accountReads = api.callsTo('GET /auth/me').length
    fireEvent.click(place)

    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/orders/SS100009'))
    const [sent] = api.callsTo('POST /orders')
    expect(sent.body).toEqual({
      items: [
        { id: 1, quantity: 2 },
        { id: 2, quantity: 1 }
      ],
      delivery: {
        name: 'Demo Shopper',
        email: 'demo@shopsmart.dev',
        phone: '9876543210',
        address: '12 MG Road, Indiranagar',
        city: 'Bengaluru',
        state: 'Karnataka',
        pincode: '560001'
      },
      payment: { method: 'card', cardLast4: '4242' }
    })
    // The card number and CVV never leave the page in any form.
    expect(JSON.stringify(sent.body)).not.toContain('4111')
    expect(JSON.stringify(sent.body)).not.toContain('123')

    const state = JSON.parse(screen.getByTestId('location').dataset.state)
    expect(state.justPlaced).toBe(true)
    expect(state.order.number).toBe('SS100009')
    // The server saved the address, so the account is read again for the next checkout.
    await waitFor(() => expect(api.callsTo('GET /auth/me')).toHaveLength(accountReads + 1))
    // The ordered lines leave the local cart without another save: the server did that.
    expect(JSON.parse(window.localStorage.getItem('shopsmart:cart'))).toEqual([])
    expect(api.callsTo('PUT /lists/cart')).toHaveLength(0)
  })

  it('stops on the delivery step and focuses the first field the shopper must fix', async () => {
    const api = fakeApi(checkoutRoutes())
    renderShopPage(<Checkout />, { path: '/checkout' })

    const phone = await screen.findByLabelText('Phone')
    fireEvent.change(phone, { target: { value: '12345' } })
    fireEvent.click(screen.getByRole('button', { name: 'Continue to payment' }))

    expect(await screen.findByText('Enter a 10 digit phone number')).toBeInTheDocument()
    await waitFor(() => expect(phone).toHaveFocus())
    expect(phone).toHaveAttribute('aria-invalid', 'true')
    expect(api.callsTo('POST /orders')).toHaveLength(0)
  })

  it('puts the server field errors back on the step that holds them', async () => {
    fakeApi(
      checkoutRoutes({
        'POST /orders': () => [
          400,
          {
            success: false,
            message: 'Please check the highlighted fields',
            code: 'VALIDATION_ERROR',
            errors: [{ field: 'delivery.pincode', message: 'Enter a 6 digit PIN code' }]
          }
        ]
      })
    )
    renderShopPage(<Checkout />, { path: '/checkout' })

    fireEvent.click(await reachReview())

    const pincode = await screen.findByLabelText('PIN code')
    expect(screen.getByText('Enter a 6 digit PIN code')).toBeInTheDocument()
    await waitFor(() => expect(pincode).toHaveFocus())
    expect(screen.getByRole('listitem', { current: 'step' })).toHaveTextContent('Delivery')
  })

  it('marks the lines that are out of stock and lets the shopper fix them', async () => {
    let attempts = 0
    const api = fakeApi(
      checkoutRoutes({
        'POST /orders': ({ body }) => {
          attempts += 1
          if (attempts > 1) return [201, { success: true, order: placedOrder(body) }]
          return [
            409,
            {
              success: false,
              message: 'Only 1 left of Product 1.',
              code: 'OUT_OF_STOCK',
              details: { items: [{ id: 1, title: 'Product 1', requested: 2, available: 1 }] }
            }
          ]
        }
      })
    )
    renderShopPage(<Checkout />, { path: '/checkout' })

    const place = await reachReview()
    fireEvent.click(place)

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Only 1 left of Product 1.')
    await waitFor(() => expect(alert).toHaveFocus())
    const line = screen.getByText('Only 1 left, you asked for 2.').closest('li')
    expect(line).toHaveClass('is-unavailable')
    expect(screen.getByRole('button', { name: /^Place order/ })).toBeDisabled()

    fireEvent.click(within(line).getByRole('button', { name: 'Change to 1 for Product 1' }))
    expect(await screen.findByText(/Your cart now fits the stock/)).toBeInTheDocument()

    const retry = screen.getByRole('button', { name: /^Place order/ })
    expect(retry).toBeEnabled()
    fireEvent.click(retry)
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/orders/SS100009'))
    expect(api.callsTo('POST /orders')[1].body.items).toEqual([
      { id: 1, quantity: 1 },
      { id: 2, quantity: 1 }
    ])
  })

  it('offers a retry when the order could not be sent', async () => {
    let fail = true
    fakeApi(
      checkoutRoutes({
        'POST /orders': ({ body }) =>
          fail
            ? [500, { success: false, message: 'Something went wrong on our side.', code: 'SERVER_ERROR' }]
            : [201, { success: true, order: placedOrder(body) }]
      })
    )
    renderShopPage(<Checkout />, { path: '/checkout' })

    fireEvent.click(await reachReview())
    expect(await screen.findByText('Something went wrong on our side.')).toBeInTheDocument()

    fail = false
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/orders/SS100009'))
  })
})
