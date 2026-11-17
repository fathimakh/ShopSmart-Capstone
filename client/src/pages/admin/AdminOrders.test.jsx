import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import AdminOrders from './AdminOrders'
import AdminOrderDetails from './AdminOrderDetails'
import { adminUser, renderAdminPage } from './adminTestUtils'
import { fakeApi } from '../../test/fakeApi'

vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ user: adminUser, refreshUser: () => Promise.resolve(adminUser) })
}))

const catalog = vi.hoisted(() => ({ restockProducts: vi.fn() }))
vi.mock('../../context/CatalogContext', () => ({ useCatalog: () => catalog }))

const placedAt = '2026-11-16T21:43:51.797Z'

function makeOrder(overrides = {}) {
  return {
    _id: '6afb7917f4dae1f392f2f647',
    number: 'SS100001',
    user: { _id: 'u1', name: 'Meera Nair', email: 'meera@example.com' },
    items: [
      { id: 1, title: 'Mascara', brand: 'Essence', thumbnail: 'https://cdn.example/1.webp', price: 9.99, originalPrice: 11.16, quantity: 2 }
    ],
    delivery: {
      name: 'Meera Nair',
      email: 'meera@example.com',
      phone: '9876543210',
      address: '12 MG Road, Indiranagar',
      city: 'Bengaluru',
      state: 'Karnataka',
      pincode: '560001'
    },
    payment: { method: 'upi', cardLast4: null, upiId: 'meera@okbank' },
    subtotal: 19.98,
    savings: 2.34,
    deliveryFee: 4.99,
    total: 24.97,
    status: 'processing',
    statusHistory: [{ status: 'processing', at: placedAt, note: 'Order placed' }],
    arrivesOn: '2026-11-20T21:43:51.797Z',
    createdAt: placedAt,
    updatedAt: placedAt,
    ...overrides
  }
}

describe('AdminOrders', () => {
  it('lists orders with the status filter from the address', async () => {
    const { callsTo } = fakeApi({
      'GET /orders': () => [
        200,
        {
          success: true,
          orders: [makeOrder({ status: 'shipped', user: null })],
          pagination: { page: 1, limit: 20, total: 1, pages: 1 }
        }
      ]
    })
    renderAdminPage(<AdminOrders />, { path: '/admin/orders?status=shipped' })

    const row = (await screen.findByRole('link', { name: 'SS100001' })).closest('tr')
    expect(callsTo('GET /orders')[0].url).toBe('/api/orders?status=shipped&page=1&limit=20')
    expect(within(row).getByText('Account deleted')).toBeInTheDocument()
    expect(within(row).getByText('UPI (meera@okbank)')).toBeInTheDocument()
    expect(within(row).getByText('Shipped')).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 2, name: '1 order shipped' })).toBeInTheDocument()
  })

  it('reads an unknown status in the address as every status', async () => {
    const { callsTo } = fakeApi({
      'GET /orders': () => [200, { success: true, orders: [], pagination: { page: 1, limit: 20, total: 0, pages: 0 } }]
    })
    renderAdminPage(<AdminOrders />, { path: '/admin/orders?status=lost' })

    expect(await screen.findByRole('heading', { name: 'No orders yet' })).toBeInTheDocument()
    expect(callsTo('GET /orders')[0].url).toBe('/api/orders?page=1&limit=20')
  })
})

describe('AdminOrderDetails', () => {
  const detailRoute = { path: '/admin/orders/SS100001', route: '/admin/orders/:ref' }

  it('shows the items, delivery, payment and history, and moves the order on', async () => {
    const shipped = makeOrder({
      status: 'shipped',
      updatedAt: '2026-11-17T10:00:00.000Z',
      statusHistory: [
        { status: 'processing', at: placedAt, note: 'Order placed' },
        { status: 'shipped', at: '2026-11-17T10:00:00.000Z', note: 'Handed to the courier' }
      ]
    })
    fakeApi({
      'GET /orders/SS100001': () => [200, { success: true, order: makeOrder() }],
      'PATCH /orders/SS100001/status': () => [200, { success: true, order: shipped }]
    })
    renderAdminPage(<AdminOrderDetails />, detailRoute)

    expect(await screen.findByRole('heading', { level: 1, name: 'Order SS100001' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Mascara' })).toHaveAttribute('href', '/admin/products/1/edit')
    expect(screen.getByText('UPI (meera@okbank)')).toBeInTheDocument()
    expect(screen.getByText('12 MG Road, Indiranagar')).toBeInTheDocument()
    expect(screen.getByText('Order placed')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Mark as shipped' }))

    expect(await screen.findByText('Order SS100001 marked as shipped')).toBeInTheDocument()
    const statusHeading = screen.getByRole('heading', { level: 2, name: 'Status: Shipped' })
    await waitFor(() => expect(statusHeading).toHaveFocus())
    expect(screen.getByText('Handed to the courier')).toBeInTheDocument()
  })

  it('puts a cancelled order back on the shop shelves', async () => {
    const cancelled = makeOrder({
      status: 'cancelled',
      updatedAt: '2026-11-17T10:00:00.000Z',
      statusHistory: [
        { status: 'processing', at: placedAt, note: 'Order placed' },
        { status: 'cancelled', at: '2026-11-17T10:00:00.000Z', note: 'Cancelled by the store' }
      ]
    })
    fakeApi({
      'GET /orders/SS100001': () => [200, { success: true, order: makeOrder() }],
      'PATCH /orders/SS100001/status': () => [200, { success: true, order: cancelled }]
    })
    renderAdminPage(<AdminOrderDetails />, detailRoute)
    await screen.findByRole('heading', { level: 2, name: 'Status: Processing' })

    fireEvent.click(screen.getByRole('radio', { name: /Cancelled/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Cancel order' }))
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Cancel order' }))

    expect(await screen.findByRole('heading', { level: 2, name: 'Status: Cancelled' })).toBeInTheDocument()
    expect(catalog.restockProducts).toHaveBeenCalledTimes(1)
    expect(catalog.restockProducts).toHaveBeenCalledWith(cancelled.items)
  })

  it('loads the latest order after a conflict', async () => {
    let reads = 0
    fakeApi({
      'GET /orders/SS100001': () => {
        reads += 1
        return [200, { success: true, order: reads === 1 ? makeOrder() : makeOrder({ status: 'cancelled' }) }]
      },
      'PATCH /orders/SS100001/status': () => [
        409,
        { success: false, message: 'The order changed while you were looking at it.', code: 'ORDER_CHANGED' }
      ]
    })
    renderAdminPage(<AdminOrderDetails />, detailRoute)
    await screen.findByRole('heading', { level: 2, name: 'Status: Processing' })

    fireEvent.click(screen.getByRole('button', { name: 'Mark as shipped' }))

    expect(await screen.findByRole('heading', { level: 2, name: 'Status: Cancelled' })).toBeInTheDocument()
    expect(reads).toBe(2)
  })

  it('explains an order that does not exist', async () => {
    fakeApi({
      'GET /orders/SS999999': () => [404, { success: false, message: 'We could not find that order.', code: 'ORDER_NOT_FOUND' }]
    })
    renderAdminPage(<AdminOrderDetails />, { path: '/admin/orders/SS999999', route: '/admin/orders/:ref' })

    expect(await screen.findByRole('heading', { level: 1, name: 'Order not found' })).toBeInTheDocument()
  })
})
