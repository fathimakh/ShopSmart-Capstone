import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import Orders from './Orders'
import OrderDetails from './OrderDetails'
import { setToken } from '../services/http'
import { fakeApi, fakeToken } from '../test/fakeApi'
import { apiProduct, renderShopPage, shopper } from '../test/renderShopPage'

const token = fakeToken(Math.floor(Date.now() / 1000) + 3600)
const placedAt = '2026-11-16T21:43:51.797Z'

function makeOrder(overrides = {}) {
  return {
    _id: '6afb7917f4dae1f392f2f647',
    number: 'SS100001',
    items: [
      { id: 1, title: 'Product 1', brand: 'Brand', thumbnail: 'https://cdn.example/1.webp', price: 9.99, originalPrice: 11.16, quantity: 2 },
      { id: 2, title: 'Product 2', brand: 'Brand', thumbnail: 'https://cdn.example/2.webp', price: 49.99, originalPrice: 50.95, quantity: 1 }
    ],
    delivery: { ...shopper.address, email: shopper.email },
    payment: { method: 'card', cardLast4: '4242', upiId: null },
    subtotal: 69.97,
    savings: 3.3,
    deliveryFee: 4.99,
    total: 74.96,
    status: 'processing',
    statusHistory: [{ status: 'processing', at: placedAt, note: 'Order placed' }],
    arrivesOn: '2026-11-20T21:43:51.797Z',
    createdAt: placedAt,
    updatedAt: placedAt,
    ...overrides
  }
}

function accountRoutes(extra) {
  return {
    'GET /auth/me': () => [200, { success: true, user: shopper }],
    'GET /products': () => [200, { success: true, products: [apiProduct(1), apiProduct(2)] }],
    'GET /lists': () => [200, { success: true, cart: [], wishlist: [], recentlyViewed: [] }],
    'PUT /lists/cart': ({ body }) => [200, { success: true, cart: body.items }],
    ...extra
  }
}

describe('Orders page', () => {
  beforeEach(() => {
    setToken(token)
    window.localStorage.setItem('shopsmart:lists-owner', JSON.stringify(shopper._id))
  })

  it('lists the account orders from the API with their status', async () => {
    const api = fakeApi(
      accountRoutes({
        'GET /orders/mine': () => [
          200,
          { success: true, orders: [makeOrder({ number: 'SS100002', status: 'cancelled' }), makeOrder()] }
        ]
      })
    )
    renderShopPage(<Orders />, { path: '/orders' })

    expect(await screen.findByText('2 orders on your account')).toBeInTheDocument()
    const cancelled = screen.getByRole('heading', { name: 'Order SS100002' }).closest('li')
    expect(within(cancelled).getByText('Cancelled')).toHaveClass('order-status', 'is-cancelled')
    expect(within(cancelled).getByText('3 items - $74.96')).toBeInTheDocument()
    expect(api.callsTo('GET /orders/mine')[0].headers.Authorization).toBe(`Bearer ${token}`)
  })

  it('offers a retry when the orders cannot be loaded, and an empty state', async () => {
    let fail = true
    fakeApi(
      accountRoutes({
        'GET /orders/mine': () =>
          fail
            ? [500, { success: false, message: 'Something went wrong on our side.', code: 'SERVER_ERROR' }]
            : [200, { success: true, orders: [] }]
      })
    )
    renderShopPage(<Orders />, { path: '/orders' })

    expect(await screen.findByText('We could not load your orders')).toBeInTheDocument()
    expect(screen.getByText('Something went wrong on our side.')).toBeInTheDocument()

    fail = false
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByRole('heading', { name: 'No orders yet' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1, name: 'Your orders' })).toHaveFocus()
  })

  it('puts an order back in the cart with buy again', async () => {
    const api = fakeApi(accountRoutes({ 'GET /orders/mine': () => [200, { success: true, orders: [makeOrder()] }] }))
    renderShopPage(<Orders />, { path: '/orders' })

    fireEvent.click(await screen.findByRole('button', { name: 'Buy again' }))
    expect(await screen.findAllByText('Added 3 items to your cart.')).not.toHaveLength(0)
    await waitFor(() => expect(api.callsTo('PUT /lists/cart')).toHaveLength(1))
    expect(api.callsTo('PUT /lists/cart')[0].body.items).toEqual([
      { id: 1, quantity: 2 },
      { id: 2, quantity: 1 }
    ])
  })
})

describe('OrderDetails page', () => {
  beforeEach(() => setToken(token))

  it('loads an order straight from its URL with a styled status and timeline', async () => {
    fakeApi(accountRoutes({ 'GET /orders/SS100001': () => [200, { success: true, order: makeOrder() }] }))
    renderShopPage(<OrderDetails />, { path: '/orders/:number', url: '/orders/SS100001' })

    expect(await screen.findByText('Card ending 4242')).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1, name: 'Order SS100001' })).toBeInTheDocument()
    // The pill is styled by its own stylesheet, not by the orders list page.
    expect(screen.getByText('Processing')).toHaveClass('order-status', 'is-processing')
    const current = screen.getByRole('listitem', { current: 'step' })
    expect(current).toHaveTextContent('Order placed')
    expect(screen.getByRole('button', { name: 'Cancel order' })).toBeInTheDocument()
  })

  it('cancels a processing order after asking first', async () => {
    const api = fakeApi(
      accountRoutes({
        'GET /orders/SS100001': () => [200, { success: true, order: makeOrder() }],
        'PATCH /orders/SS100001/cancel': ({ body }) => [
          200,
          {
            success: true,
            order: makeOrder({
              status: 'cancelled',
              statusHistory: [
                { status: 'processing', at: placedAt, note: 'Order placed' },
                { status: 'cancelled', at: placedAt, note: `Cancelled by the shopper: ${body.reason}` }
              ]
            })
          }
        ]
      })
    )
    renderShopPage(<OrderDetails />, { path: '/orders/:number', url: '/orders/SS100001' })

    fireEvent.click(await screen.findByRole('button', { name: 'Cancel order' }))
    expect(screen.getByRole('heading', { name: 'Cancel order SS100001?' })).toHaveFocus()

    // Changing your mind sends nothing.
    fireEvent.keyDown(document.activeElement, { key: 'Escape' })
    expect(screen.queryByRole('heading', { name: 'Cancel order SS100001?' })).not.toBeInTheDocument()
    expect(api.callsTo('PATCH /orders/SS100001/cancel')).toHaveLength(0)

    fireEvent.click(screen.getByRole('button', { name: 'Cancel order' }))
    fireEvent.change(screen.getByLabelText('Reason (optional)'), { target: { value: 'Ordered twice' } })
    fireEvent.click(screen.getByRole('button', { name: 'Yes, cancel the order' }))

    expect(await screen.findByText(/Your order is cancelled/)).toHaveFocus()
    expect(api.callsTo('PATCH /orders/SS100001/cancel')[0].body).toEqual({ reason: 'Ordered twice' })
    expect(screen.getAllByText('Cancelled')[0]).toHaveClass('order-status', 'is-cancelled')
    expect(screen.getByText(/Cancelled by the shopper: Ordered twice/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Cancel order' })).not.toBeInTheDocument()
  })

  it('shows the order as it is now when it shipped before the cancel arrived', async () => {
    let order = makeOrder()
    const api = fakeApi(
      accountRoutes({
        'GET /orders/SS100001': () => [200, { success: true, order }],
        'PATCH /orders/SS100001/cancel': () => {
          order = makeOrder({
            status: 'shipped',
            statusHistory: [...order.statusHistory, { status: 'shipped', at: placedAt, note: 'Handed to the courier' }]
          })
          return [
            409,
            {
              success: false,
              message: 'This order is already shipped and can no longer be cancelled.',
              code: 'ORDER_NOT_CANCELLABLE'
            }
          ]
        }
      })
    )
    renderShopPage(<OrderDetails />, { path: '/orders/:number', url: '/orders/SS100001' })

    fireEvent.click(await screen.findByRole('button', { name: 'Cancel order' }))
    fireEvent.click(screen.getByRole('button', { name: 'Yes, cancel the order' }))

    expect(await screen.findByText('This order is already shipped and can no longer be cancelled.')).toBeInTheDocument()
    expect(await screen.findAllByText('On the way')).not.toHaveLength(0)
    expect(api.callsTo('GET /orders/SS100001').length).toBeGreaterThanOrEqual(2)
    expect(screen.queryByRole('button', { name: 'Cancel order' })).not.toBeInTheDocument()
  })

  it('says when the order is not on the account', async () => {
    fakeApi(
      accountRoutes({
        'GET /orders/SS999999': () => [
          404,
          { success: false, message: 'We could not find that order.', code: 'ORDER_NOT_FOUND' }
        ]
      })
    )
    renderShopPage(<OrderDetails />, { path: '/orders/:number', url: '/orders/SS999999' })

    expect(await screen.findByRole('heading', { name: 'We could not find this order' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1, name: 'Order SS999999' })).toBeInTheDocument()
  })
})
