import { useRef } from 'react'
import { Link } from 'react-router-dom'
import { FiChevronRight } from 'react-icons/fi'
import AdminLoadError from '../../components/admin/AdminLoadError/AdminLoadError'
import AdminPageHeader from '../../components/admin/AdminPageHeader/AdminPageHeader'
import AdminPagination from '../../components/admin/AdminPagination/AdminPagination'
import AdminSearch from '../../components/admin/AdminSearch/AdminSearch'
import OrderStatusBadge from '../../components/admin/OrderStatusBadge/OrderStatusBadge'
import useAdminFilters from '../../hooks/useAdminFilters'
import useAdminResource from '../../hooks/useAdminResource'
import usePageTitle from '../../hooks/usePageTitle'
import {
  ORDER_STATUSES,
  ORDER_STATUS_LABELS,
  describePayment,
  orderItemCount
} from '../../services/adminRules'
import { formatDate, formatPrice, pluralize } from '../../utils/format'
import './AdminOrders.css'

const PAGE_SIZE = 20
const SKELETON_ROWS = 6

// Kept at module level: useAdminFilters compares it by identity.
const DEFAULT_FILTERS = { q: '', status: '' }

/**
 * Every order in the store, newest first, from GET /api/orders. The status filter and the
 * search live in the address, so the dashboard can link straight to, say, the orders
 * still waiting to ship.
 */
function AdminOrders() {
  usePageTitle('Orders')
  const heading = useRef(null)
  const [filters, setFilters, resetFilters] = useAdminFilters(DEFAULT_FILTERS)
  // An unknown status in the address would only earn a 400, so it is read as "all".
  const statusFilter = ORDER_STATUSES.includes(filters.status) ? filters.status : ''

  const { data, status, error, isRefreshing, reload } = useAdminResource('/orders', {
    params: { q: filters.q, status: statusFilter, page: filters.page, limit: PAGE_SIZE }
  })

  const orders = data ? data.orders : []
  const pagination = data ? data.pagination : null
  const isFiltered = Boolean(filters.q || statusFilter)

  const retry = () => {
    heading.current?.focus()
    reload()
  }

  let countText = 'Loading orders'
  if (pagination) {
    if (statusFilter) {
      countText = `${pluralize(pagination.total, 'order')} ${ORDER_STATUS_LABELS[statusFilter].toLowerCase()}`
    } else {
      countText = isFiltered
        ? `${pluralize(pagination.total, 'order')} match`
        : `${pluralize(pagination.total, 'order')} in total`
    }
  } else if (status === 'error') {
    countText = 'Orders could not be loaded'
  }

  return (
    <div className="admin-list admin-orders">
      <AdminPageHeader
        headingRef={heading}
        title="Orders"
        description="Every order placed in the shop, newest first. Open an order to ship it, mark it delivered or cancel it."
      />

      <div className="admin-filters card" role="group" aria-label="Filter orders">
        <AdminSearch
          id="admin-orders-search"
          label="Search orders"
          placeholder="Order number, name or email"
          value={filters.q}
          onSearch={(q) => setFilters({ q }, { replace: true })}
        />
        <div className="admin-filter">
          <label htmlFor="admin-orders-status">Status</label>
          <select
            id="admin-orders-status"
            value={statusFilter}
            onChange={(event) => setFilters({ status: event.target.value })}
          >
            <option value="">All statuses</option>
            {ORDER_STATUSES.map((value) => (
              <option key={value} value={value}>
                {ORDER_STATUS_LABELS[value]}
              </option>
            ))}
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
        <AdminLoadError title="Orders could not be loaded" error={error} onRetry={retry} />
      ) : null}

      {data || status === 'loading' ? (
        <section className="admin-panel card" aria-labelledby="admin-orders-count">
          <div className="admin-panel-head">
            <h2 id="admin-orders-count" className="admin-list-count">
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

          {data && !orders.length && !isRefreshing ? (
            <div className="admin-empty">
              {pagination && pagination.total > 0 ? (
                <>
                  <h3>This page is past the end of the list</h3>
                  <p>There are fewer orders than there were.</p>
                  <button type="button" className="btn btn-outline" onClick={() => setFilters({ page: 1 })}>
                    Go to the first page
                  </button>
                </>
              ) : isFiltered ? (
                <>
                  <h3>No orders match</h3>
                  <p>Try part of the order number, or the shopper's name or email.</p>
                  <button type="button" className="btn btn-outline" onClick={resetFilters}>
                    Clear filters
                  </button>
                </>
              ) : (
                <>
                  <h3>No orders yet</h3>
                  <p>Orders appear here as soon as shoppers place them.</p>
                </>
              )}
            </div>
          ) : null}

          {orders.length ? (
            <div className="admin-table-wrap" aria-busy={isRefreshing}>
              <table className="admin-table">
                <caption className="visually-hidden">Orders, newest first</caption>
                <thead>
                  <tr>
                    <th scope="col">Order</th>
                    <th scope="col">Customer</th>
                    <th scope="col" className="is-number">
                      Items
                    </th>
                    <th scope="col" className="is-number">
                      Total
                    </th>
                    <th scope="col">Payment</th>
                    <th scope="col">Status</th>
                    <th scope="col" className="is-actions">
                      <span className="visually-hidden">Open</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map((order) => (
                    <tr key={order._id}>
                      <td className="is-primary">
                        <span className="admin-cell-text">
                          <Link className="admin-cell-title admin-text-link" to={`/admin/orders/${order.number}`}>
                            {order.number}
                          </Link>
                          <span className="admin-cell-sub">{formatDate(order.createdAt)}</span>
                        </span>
                      </td>
                      <td data-label="Customer">
                        <span className="admin-cell-text admin-order-customer">
                          <span>{order.user ? order.user.name : order.delivery.name}</span>
                          <span className="admin-cell-sub">
                            {order.user ? order.user.email : 'Account deleted'}
                          </span>
                        </span>
                      </td>
                      <td data-label="Items" className="is-number">
                        {orderItemCount(order)}
                      </td>
                      <td data-label="Total" className="is-number">
                        {formatPrice(order.total)}
                      </td>
                      <td data-label="Payment">{describePayment(order.payment)}</td>
                      <td data-label="Status">
                        <OrderStatusBadge status={order.status} />
                      </td>
                      <td className="is-actions">
                        <Link className="btn btn-outline admin-order-open" to={`/admin/orders/${order.number}`}>
                          Open<span className="visually-hidden"> order {order.number}</span>
                          <FiChevronRight aria-hidden="true" />
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}

          <AdminPagination
            pagination={pagination}
            noun="orders"
            disabled={status === 'loading'}
            onPageChange={(page) => setFilters({ page })}
          />
        </section>
      ) : null}
    </div>
  )
}

export default AdminOrders
