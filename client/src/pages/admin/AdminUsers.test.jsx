import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import AdminUsers from './AdminUsers'
import { adminUser, renderAdminPage } from './adminTestUtils'
import { fakeApi } from '../../test/fakeApi'

vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ user: adminUser, refreshUser: () => Promise.resolve(adminUser) })
}))

const meera = {
  _id: '6afb790454cff2253a63b0a1',
  name: 'Meera Nair',
  email: 'meera@example.com',
  role: 'customer',
  createdAt: '2026-11-16T21:43:32.242Z',
  orderCount: 2
}

function userRoutes(users, extra = {}) {
  let list = users
  return {
    'GET /users': () => [
      200,
      { success: true, users: list, pagination: { page: 1, limit: 20, total: list.length, pages: 1 } }
    ],
    [`DELETE /users/${meera._id}`]: () => {
      list = list.filter((user) => user._id !== meera._id)
      return [200, { success: true, message: `Account ${meera.email} deleted` }]
    },
    ...extra
  }
}

function meeraRow() {
  return within(screen.getByRole('table')).getByText('meera@example.com').closest('tr')
}

describe('AdminUsers', () => {
  it('lists accounts with their orders, and offers no actions on the admin\'s own row', async () => {
    fakeApi(userRoutes([meera, { ...adminUser, createdAt: meera.createdAt, orderCount: 0 }]))
    renderAdminPage(<AdminUsers />, { path: '/admin/users' })

    await screen.findByText('meera@example.com')
    expect(within(meeraRow()).getByRole('link', { name: '2 orders by Meera Nair' })).toHaveAttribute(
      'href',
      '/admin/orders?q=meera%40example.com'
    )

    const ownRow = screen.getByText('admin@shopsmart.dev').closest('tr')
    expect(within(ownRow).getByText('You')).toBeInTheDocument()
    expect(within(ownRow).queryByRole('button')).not.toBeInTheDocument()
  })

  it('makes a shopper an admin after asking', async () => {
    const { callsTo } = fakeApi(
      userRoutes([meera], {
        [`PATCH /users/${meera._id}`]: ({ body }) => [200, { success: true, user: { ...meera, role: body.role, orderCount: undefined } }]
      })
    )
    renderAdminPage(<AdminUsers />, { path: '/admin/users' })
    await screen.findByText('meera@example.com')

    fireEvent.click(screen.getByRole('button', { name: 'Make admin Meera Nair' }))
    const dialog = screen.getByRole('dialog', { name: 'Make Meera Nair an admin?' })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Make admin' }))

    expect(await screen.findByText('Meera Nair is now an admin')).toBeInTheDocument()
    expect(callsTo(`PATCH /users/${meera._id}`)[0].body).toEqual({ role: 'admin' })
    expect(within(meeraRow()).getByText('Admin')).toBeInTheDocument()
    expect(within(meeraRow()).getByRole('link', { name: /2 orders/ })).toBeInTheDocument()
    expect(within(meeraRow()).getByRole('button', { name: 'Make customer Meera Nair' })).toBeInTheDocument()
  })

  it('shows the SELF_ROLE_CHANGE message in the dialog', async () => {
    fakeApi(
      userRoutes([meera], {
        [`PATCH /users/${meera._id}`]: () => [
          409,
          { success: false, message: 'You cannot change your own role.', code: 'SELF_ROLE_CHANGE' }
        ]
      })
    )
    renderAdminPage(<AdminUsers />, { path: '/admin/users' })
    await screen.findByText('meera@example.com')

    fireEvent.click(screen.getByRole('button', { name: 'Make admin Meera Nair' }))
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Make admin' }))

    expect(await within(screen.getByRole('dialog')).findByRole('alert')).toHaveTextContent(
      'You cannot change your own role.'
    )
    expect(within(meeraRow()).getByText('Customer')).toBeInTheDocument()
  })

  it('shows the SELF_DELETE message in the dialog and keeps the row', async () => {
    fakeApi(
      userRoutes([meera], {
        [`DELETE /users/${meera._id}`]: () => [
          409,
          { success: false, message: 'You cannot delete your own account.', code: 'SELF_DELETE' }
        ]
      })
    )
    renderAdminPage(<AdminUsers />, { path: '/admin/users' })
    await screen.findByText('meera@example.com')

    fireEvent.click(screen.getByRole('button', { name: 'Delete the account of Meera Nair' }))
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete account' }))

    expect(await within(screen.getByRole('dialog')).findByRole('alert')).toHaveTextContent(
      'You cannot delete your own account.'
    )
    expect(meeraRow()).toBeInTheDocument()
  })

  it('deletes an account after asking and moves focus to the list', async () => {
    const { callsTo } = fakeApi(userRoutes([meera]))
    renderAdminPage(<AdminUsers />, { path: '/admin/users' })
    await screen.findByText('meera@example.com')

    fireEvent.click(screen.getByRole('button', { name: 'Delete the account of Meera Nair' }))
    const dialog = screen.getByRole('dialog', { name: 'Delete the account of Meera Nair?' })
    expect(dialog).toHaveTextContent('Their 2 orders stay in the order list, without an account.')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete account' }))

    expect(await screen.findByText('Account meera@example.com deleted')).toBeInTheDocument()
    expect(callsTo(`DELETE /users/${meera._id}`)).toHaveLength(1)
    await waitFor(() => expect(screen.getByRole('heading', { level: 2, name: '0 accounts' })).toHaveFocus())
  })

  it('searches by name or email once typing pauses', async () => {
    const { callsTo } = fakeApi(userRoutes([meera]))
    renderAdminPage(<AdminUsers />, { path: '/admin/users?role=customer' })
    await screen.findByText('meera@example.com')

    fireEvent.change(screen.getByLabelText('Search accounts'), { target: { value: ' meera ' } })
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/admin/users?role=customer&q=meera'))
    await waitFor(() => expect(callsTo('GET /users').at(-1).url).toBe('/api/users?q=meera&role=customer&page=1&limit=20'))
  })
})
