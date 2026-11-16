import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { FiShield, FiTrash2, FiUser } from 'react-icons/fi'
import { useAuth } from '../../context/AuthContext'
import AdminLoadError from '../../components/admin/AdminLoadError/AdminLoadError'
import AdminPageHeader from '../../components/admin/AdminPageHeader/AdminPageHeader'
import AdminPagination from '../../components/admin/AdminPagination/AdminPagination'
import AdminSearch from '../../components/admin/AdminSearch/AdminSearch'
import ConfirmDialog from '../../components/admin/ConfirmDialog/ConfirmDialog'
import useAdminFilters from '../../hooks/useAdminFilters'
import useAdminMutation from '../../hooks/useAdminMutation'
import useAdminResource from '../../hooks/useAdminResource'
import useAdminToast from '../../hooks/useAdminToast'
import usePageTitle from '../../hooks/usePageTitle'
import { deleteUser, updateUserRole } from '../../services/adminApi'
import { formatDate, pluralize } from '../../utils/format'
import './AdminUsers.css'

const PAGE_SIZE = 20
const SKELETON_ROWS = 6

// Kept at module level: useAdminFilters compares it by identity.
const DEFAULT_FILTERS = { q: '', role: '' }
const ROLE_LABELS = { customer: 'Customer', admin: 'Admin' }

// Answers that mean the account on screen no longer exists.
const GONE_CODES = ['ACCOUNT_NOT_FOUND']

/**
 * Every account, newest first (GET /api/users), with a way to make a shopper an admin or
 * back again, and to delete an account. An admin's own row offers neither, because the
 * API refuses both (SELF_ROLE_CHANGE and SELF_DELETE); if it ever answers that way, say
 * from a second tab, its message is shown in the dialog.
 */
function AdminUsers() {
  usePageTitle('Accounts')
  const { user: me } = useAuth()
  const heading = useRef(null)
  const listHeading = useRef(null)
  const focusListAfterClose = useRef(false)
  const notify = useAdminToast()
  const [filters, setFilters, resetFilters] = useAdminFilters(DEFAULT_FILTERS)
  // { type: 'role' | 'delete', account }
  const [pending, setPending] = useState(null)
  const { run, isPending, error: actionError, resetError } = useAdminMutation()

  const roleFilter = ROLE_LABELS[filters.role] ? filters.role : ''
  const { data, status, error, isRefreshing, reload, setData } = useAdminResource('/users', {
    params: { q: filters.q, role: roleFilter, page: filters.page, limit: PAGE_SIZE }
  })

  const accounts = data ? data.users : []
  const pagination = data ? data.pagination : null
  const isFiltered = Boolean(filters.q || roleFilter)

  useEffect(() => {
    if (!pending && focusListAfterClose.current) {
      focusListAfterClose.current = false
      listHeading.current?.focus()
    }
  }, [pending])

  const retry = () => {
    heading.current?.focus()
    reload()
  }

  const close = () => {
    setPending(null)
    resetError()
  }

  const removeRow = (account) => {
    setData((current) =>
      current
        ? {
            ...current,
            users: current.users.filter((item) => item._id !== account._id),
            pagination: { ...current.pagination, total: Math.max(0, current.pagination.total - 1) }
          }
        : current
    )
  }

  const afterRemoval = () => {
    // The last row of a later page leaves that page empty, so step back one.
    if (accounts.length === 1 && filters.page > 1) setFilters({ page: filters.page - 1 })
    else reload()
  }

  const handleGone = (account) => {
    resetError()
    notify(`${account.email} had already been deleted`, { tone: 'error' })
    focusListAfterClose.current = true
    removeRow(account)
    setPending(null)
    afterRemoval()
  }

  const changeRole = async () => {
    const { account } = pending
    const role = account.role === 'admin' ? 'customer' : 'admin'
    const result = await run(`role:${account._id}`, () => updateUserRole(account._id, role), {
      successMessage: `${account.name} is now ${role === 'admin' ? 'an admin' : 'a customer'}`
    })

    if (!result.ok) {
      if (result.error && GONE_CODES.includes(result.error.code)) handleGone(account)
      return
    }

    const saved = result.data.user
    setPending(null)
    if (roleFilter && saved.role !== roleFilter) {
      // The account no longer belongs in this filtered list.
      focusListAfterClose.current = true
      removeRow(account)
      afterRemoval()
      return
    }
    setData((current) =>
      current
        ? {
            ...current,
            users: current.users.map((item) => (item._id === saved._id ? { ...item, ...saved } : item))
          }
        : current
    )
  }

  const remove = async () => {
    const { account } = pending
    const result = await run(`delete:${account._id}`, () => deleteUser(account._id), {
      successMessage: (body) => body.message || `${account.email} was deleted`
    })

    if (!result.ok) {
      if (result.error && GONE_CODES.includes(result.error.code)) handleGone(account)
      return
    }
    focusListAfterClose.current = true
    removeRow(account)
    setPending(null)
    afterRemoval()
  }

  let countText = 'Loading accounts'
  if (pagination) {
    if (roleFilter === 'admin') countText = pluralize(pagination.total, 'admin')
    else if (roleFilter === 'customer') countText = pluralize(pagination.total, 'customer')
    else countText = pluralize(pagination.total, 'account')
    if (filters.q) countText += ' match'
  } else if (status === 'error') {
    countText = 'Accounts could not be loaded'
  }

  const target = pending ? pending.account : null
  const makingAdmin = target && target.role !== 'admin'

  return (
    <div className="admin-list admin-users">
      <AdminPageHeader
        headingRef={heading}
        title="Accounts"
        description="Everyone with a ShopSmart account, newest first. Make a trusted shopper an admin, or delete an account."
      />

      <div className="admin-filters card" role="group" aria-label="Filter accounts">
        <AdminSearch
          id="admin-users-search"
          label="Search accounts"
          placeholder="Name or email"
          value={filters.q}
          onSearch={(q) => setFilters({ q }, { replace: true })}
        />
        <div className="admin-filter">
          <label htmlFor="admin-users-role">Role</label>
          <select
            id="admin-users-role"
            value={roleFilter}
            onChange={(event) => setFilters({ role: event.target.value })}
          >
            <option value="">All roles</option>
            <option value="customer">Customers</option>
            <option value="admin">Admins</option>
          </select>
        </div>
        {isFiltered ? (
          <button type="button" className="btn btn-ghost admin-filters-reset" onClick={resetFilters}>
            Clear filters
          </button>
        ) : null}
      </div>

      {status === 'error' && data ? (
        <AdminLoadError compact title="The list could not be refreshed" error={error} onRetry={reload} />
      ) : null}

      {!data && status === 'error' ? (
        <AdminLoadError title="Accounts could not be loaded" error={error} onRetry={retry} />
      ) : null}

      {data || status === 'loading' ? (
        <section className="admin-panel card" aria-labelledby="admin-users-count">
          <div className="admin-panel-head">
            <h2 id="admin-users-count" ref={listHeading} tabIndex={-1} className="admin-list-count">
              {countText}
            </h2>
            {isRefreshing ? (
              <span className="admin-muted" role="status">
                Updating
              </span>
            ) : null}
          </div>

          {!data ? (
            <div aria-hidden="true">
              {Array.from({ length: SKELETON_ROWS }, (_, index) => (
                <div key={index} className="skeleton admin-skeleton-row" />
              ))}
            </div>
          ) : null}

          {data && !accounts.length && !isRefreshing ? (
            <div className="admin-empty">
              {pagination && pagination.total > 0 ? (
                <>
                  <h3>This page is past the end of the list</h3>
                  <p>There are fewer accounts than there were.</p>
                  <button type="button" className="btn btn-outline" onClick={() => setFilters({ page: 1 })}>
                    Go to the first page
                  </button>
                </>
              ) : (
                <>
                  <h3>No accounts match</h3>
                  <p>Try part of the name or the email address, or another role.</p>
                  <button type="button" className="btn btn-outline" onClick={resetFilters}>
                    Clear filters
                  </button>
                </>
              )}
            </div>
          ) : null}

          {accounts.length ? (
            <div className="admin-table-wrap" aria-busy={isRefreshing}>
              <table className="admin-table">
                <caption className="visually-hidden">Accounts, newest first</caption>
                <thead>
                  <tr>
                    <th scope="col">Account</th>
                    <th scope="col">Role</th>
                    <th scope="col" className="is-number">
                      Orders
                    </th>
                    <th scope="col">Joined</th>
                    <th scope="col" className="is-actions">
                      <span className="visually-hidden">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {accounts.map((account) => {
                    const isMe = me && account._id === me._id
                    return (
                      <tr key={account._id}>
                        <td className="is-primary">
                          <span className="admin-cell-main">
                            <span className="admin-avatar" aria-hidden="true">
                              {account.name.trim().charAt(0).toUpperCase() || '?'}
                            </span>
                            <span className="admin-cell-text">
                              <span className="admin-cell-title">
                                {account.name}
                                {isMe ? <span className="admin-you">You</span> : null}
                              </span>
                              <span className="admin-cell-sub">{account.email}</span>
                            </span>
                          </span>
                        </td>
                        <td data-label="Role">
                          <span className={account.role === 'admin' ? 'admin-role is-admin' : 'admin-role'}>
                            {account.role === 'admin' ? <FiShield aria-hidden="true" /> : <FiUser aria-hidden="true" />}
                            {ROLE_LABELS[account.role] || account.role}
                          </span>
                        </td>
                        <td data-label="Orders" className="is-number">
                          {account.orderCount ? (
                            <Link
                              className="admin-text-link"
                              to={`/admin/orders?q=${encodeURIComponent(account.email)}`}
                            >
                              {account.orderCount}
                              <span className="visually-hidden">
                                {' '}
                                {account.orderCount === 1 ? 'order' : 'orders'} by {account.name}
                              </span>
                            </Link>
                          ) : (
                            0
                          )}
                        </td>
                        <td data-label="Joined">{formatDate(account.createdAt)}</td>
                        <td className="is-actions">
                          {isMe ? (
                            <span className="admin-muted">Your own account</span>
                          ) : (
                            <span className="admin-row-actions">
                              <button
                                type="button"
                                className="btn btn-outline"
                                onClick={() => {
                                  resetError()
                                  setPending({ type: 'role', account })
                                }}
                              >
                                {account.role === 'admin' ? 'Make customer' : 'Make admin'}
                                <span className="visually-hidden"> {account.name}</span>
                              </button>
                              <button
                                type="button"
                                className="btn btn-ghost admin-danger-button"
                                onClick={() => {
                                  resetError()
                                  setPending({ type: 'delete', account })
                                }}
                              >
                                <FiTrash2 aria-hidden="true" />
                                <span className="visually-hidden">Delete the account of {account.name}</span>
                              </button>
                            </span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          ) : null}

          <AdminPagination
            pagination={pagination}
            noun="accounts"
            disabled={status === 'loading'}
            onPageChange={(page) => setFilters({ page })}
          />
        </section>
      ) : null}

      <ConfirmDialog
        open={Boolean(pending && pending.type === 'role')}
        tone="primary"
        title={target ? `Make ${target.name} ${makingAdmin ? 'an admin' : 'a customer'}?` : ''}
        confirmLabel={makingAdmin ? 'Make admin' : 'Make customer'}
        busyLabel="Saving"
        cancelLabel="Leave it"
        busy={isPending}
        error={actionError}
        onConfirm={changeRole}
        onCancel={close}
      >
        {target ? (
          makingAdmin ? (
            <p>
              <strong>{target.email}</strong> will be able to manage products, orders and accounts,
              from their very next request. They stay signed in.
            </p>
          ) : (
            <p>
              <strong>{target.email}</strong> loses access to the store admin straight away and keeps
              their shopping account, orders and lists.
            </p>
          )
        ) : null}
      </ConfirmDialog>

      <ConfirmDialog
        open={Boolean(pending && pending.type === 'delete')}
        title={target ? `Delete the account of ${target.name}?` : ''}
        confirmLabel="Delete account"
        busyLabel="Deleting"
        cancelLabel="Keep it"
        busy={isPending}
        error={actionError}
        onConfirm={remove}
        onCancel={close}
      >
        {target ? (
          <>
            <p>
              <strong>{target.email}</strong> can no longer sign in, and is signed out on every
              device.
            </p>
            <p>
              {target.orderCount
                ? `Their ${pluralize(target.orderCount, 'order')} stay in the order list, without an account. `
                : ''}
              Their reviews stay in the shop. This cannot be undone.
            </p>
          </>
        ) : null}
      </ConfirmDialog>
    </div>
  )
}

export default AdminUsers
