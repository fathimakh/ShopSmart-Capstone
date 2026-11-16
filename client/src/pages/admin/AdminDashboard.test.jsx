import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import AdminDashboard from './AdminDashboard'
import { adminUser, renderAdminPage } from './adminTestUtils'
import { fakeApi } from '../../test/fakeApi'

vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ user: adminUser, refreshUser: () => Promise.resolve(adminUser) })
}))

const order = {
  _id: '6afb7917f4dae1f392f2f647',
  number: 'SS100001',
  user: { _id: 'u1', name: 'Meera Nair', email: 'meera@example.com' },
  delivery: { name: 'Meera Nair' },
  total: 74.96,
  status: 'shipped',
  createdAt: '2026-11-16T21:43:51.804Z'
}

function summary() {
  return {
    success: true,
    totals: { users: 12, products: 194, orders: 9, revenue: 1234.5 },
    ordersByStatus: { processing: 3, shipped: 4, delivered: 1, cancelled: 1 },
    lowStock: [{ id: 117, title: 'Sold Out Lamp', stock: 0, thumbnail: 'https://cdn.example/l.webp' }],
    topProducts: [
      { product: { id: 1, title: 'Mascara', price: 9.99, stock: 90, thumbnail: 'https://cdn.example/m.webp' }, soldCount: 7 }
    ],
    recentOrders: [order],
    salesByDay: Array.from({ length: 14 }, (_, index) => ({
      date: `2026-11-${String(4 + index).padStart(2, '0')}`,
      orders: index === 13 ? 1 : 0,
      revenue: index === 13 ? 74.96 : 0
    }))
  }
}

describe('AdminDashboard', () => {
  it('shows the totals, the status counts and the lists that need attention', async () => {
    fakeApi({ 'GET /admin/summary': () => [200, summary()] })
    renderAdminPage(<AdminDashboard />)

    expect(screen.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeInTheDocument()
    expect(await screen.findByText('$1,234.50')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Orders\s*9\s*3 waiting to ship/ })).toHaveAttribute('href', '/admin/orders')

    const statuses = screen.getByRole('region', { name: 'Orders by status' })
    expect(within(statuses).getByRole('link', { name: 'Shipped 4 orders' })).toHaveAttribute(
      'href',
      '/admin/orders?status=shipped'
    )

    const lowStock = screen.getByRole('region', { name: 'Low stock' })
    expect(within(lowStock).getByText('Sold out')).toBeInTheDocument()
    expect(within(lowStock).getByRole('link', { name: 'Edit Sold Out Lamp' })).toHaveAttribute(
      'href',
      '/admin/products/117/edit'
    )

    const recent = screen.getByRole('region', { name: 'Latest orders' })
    expect(within(recent).getByRole('link', { name: 'SS100001' })).toHaveAttribute('href', '/admin/orders/SS100001')
    expect(within(recent).getByText('Shipped')).toBeInTheDocument()
  })

  it('offers a retry when the figures cannot be loaded', async () => {
    let attempts = 0
    fakeApi({
      'GET /admin/summary': () => {
        attempts += 1
        return attempts === 1
          ? [503, { success: false, message: 'The database is not available right now.', code: 'SERVER_ERROR' }]
          : [200, summary()]
      }
    })
    renderAdminPage(<AdminDashboard />)

    expect(await screen.findByRole('heading', { name: 'The dashboard could not be loaded' })).toBeInTheDocument()
    expect(screen.getByText('The database is not available right now.')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(screen.getByRole('heading', { level: 1 })).toHaveFocus()
    await waitFor(() => expect(screen.getByText('$1,234.50')).toBeInTheDocument())
  })
})
