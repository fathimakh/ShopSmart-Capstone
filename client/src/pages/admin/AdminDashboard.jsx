import { useMemo, useRef } from 'react'
import { Link } from 'react-router-dom'
import {
  FiAlertTriangle,
  FiAward,
  FiBox,
  FiClock,
  FiDollarSign,
  FiPackage,
  FiPlus,
  FiRefreshCw,
  FiTrendingUp,
  FiUsers
} from 'react-icons/fi'
import AdminLoadError from '../../components/admin/AdminLoadError/AdminLoadError'
import AdminPageHeader from '../../components/admin/AdminPageHeader/AdminPageHeader'
import OrderStatusBadge from '../../components/admin/OrderStatusBadge/OrderStatusBadge'
import SalesChart from '../../components/admin/SalesChart/SalesChart'
import StatCard from '../../components/admin/StatCard/StatCard'
import useAdminResource from '../../hooks/useAdminResource'
import usePageTitle from '../../hooks/usePageTitle'
import { ORDER_STATUSES, ORDER_STATUS_LABELS } from '../../services/adminRules'
import { formatDate, formatPrice, pluralize } from '../../utils/format'
import './AdminDashboard.css'

const timeFormatter = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit' })

function DashboardSkeleton() {
  return (
    <div className="admin-dashboard-skeleton" aria-hidden="true">
      <div className="admin-stat-grid">
        {Array.from({ length: 4 }, (_, index) => (
          <div key={index} className="skeleton admin-dashboard-skeleton-card" />
        ))}
      </div>
      <div className="skeleton admin-dashboard-skeleton-panel" />
    </div>
  )
}

function StatusBreakdown({ counts }) {
  const largest = Math.max(1, ...ORDER_STATUSES.map((status) => counts[status] || 0))

  return (
    <ul className="admin-status-list">
      {ORDER_STATUSES.map((status) => {
        const count = counts[status] || 0
        return (
          <li key={status}>
            <Link className="admin-status-row" to={`/admin/orders?status=${status}`}>
              <span className="admin-status-name">{ORDER_STATUS_LABELS[status]}</span>
              <span className="admin-status-count">
                {count}
                <span className="visually-hidden"> {count === 1 ? 'order' : 'orders'}</span>
              </span>
              <span className="admin-status-track" aria-hidden="true">
                <span
                  className={`admin-status-bar is-${status}`}
                  style={{ width: `${(count / largest) * 100}%` }}
                />
              </span>
            </Link>
          </li>
        )
      })}
    </ul>
  )
}

/**
 * The admin home page, read from GET /api/admin/summary: headline totals, the last two
 * weeks of sales, and the lists that usually need attention first (orders waiting to
 * ship and products running out).
 */
function AdminDashboard() {
  usePageTitle('Admin dashboard')
  const heading = useRef(null)
  const { data, status, error, isRefreshing, reload } = useAdminResource('/admin/summary')

  const retry = () => {
    heading.current?.focus()
    reload()
  }

  // The time the figures arrived, not the time of the latest render.
  const loadedAt = useMemo(() => (data ? new Date() : null), [data])
  const waiting = data ? data.ordersByStatus.processing || 0 : 0
  let updated = 'Loading the latest figures'
  if (isRefreshing) updated = 'Refreshing the figures'
  else if (loadedAt) updated = `Figures as of ${timeFormatter.format(loadedAt)}`
  else if (status === 'error') updated = 'The figures could not be loaded'

  return (
    <div className="admin-dashboard">
      <AdminPageHeader
        headingRef={heading}
        title="Dashboard"
        description={
          <>
            Sales, orders and stock across ShopSmart.{' '}
            <span className="admin-dashboard-updated" role="status">
              {updated}.
            </span>
          </>
        }
        actions={
          <>
            <button type="button" className="btn btn-outline" onClick={reload}>
              <FiRefreshCw aria-hidden="true" className={isRefreshing ? 'admin-spin' : undefined} />
              Refresh
            </button>
            <Link className="btn btn-primary" to="/admin/products/new">
              <FiPlus aria-hidden="true" />
              Add product
            </Link>
          </>
        }
      />

      {status === 'error' && data ? (
        <AdminLoadError compact title="The figures could not be refreshed" error={error} onRetry={reload} />
      ) : null}

      {!data && status === 'error' ? (
        <AdminLoadError title="The dashboard could not be loaded" error={error} onRetry={retry} />
      ) : null}

      {!data && status === 'loading' ? <DashboardSkeleton /> : null}

      {data ? (
        <>
          <section aria-labelledby="admin-totals-title">
            <h2 id="admin-totals-title" className="visually-hidden">
              Totals
            </h2>
            <div className="admin-stat-grid">
              <StatCard
                icon={FiDollarSign}
                tone="success"
                label="Revenue"
                value={formatPrice(data.totals.revenue)}
                hint="Delivery included, cancelled orders left out"
              />
              <StatCard
                icon={FiPackage}
                label="Orders"
                value={data.totals.orders}
                hint={waiting ? `${waiting} waiting to ship` : 'None waiting to ship'}
                to="/admin/orders"
              />
              <StatCard
                icon={FiBox}
                tone="accent"
                label="Products"
                value={data.totals.products}
                hint={
                  data.lowStock.length
                    ? 'Some are running low on stock'
                    : 'Every product has 10 or more units'
                }
                to="/admin/products"
              />
              <StatCard
                icon={FiUsers}
                label="Accounts"
                value={data.totals.users}
                hint="Shoppers and admins"
                to="/admin/users"
              />
            </div>
          </section>

          <div className="admin-dashboard-grid">
            <section className="admin-panel card admin-dashboard-wide" aria-labelledby="admin-sales-title">
              <div className="admin-panel-head">
                <h2 id="admin-sales-title">
                  <FiTrendingUp aria-hidden="true" />
                  Sales in the last 14 days
                </h2>
              </div>
              <SalesChart days={data.salesByDay} />
            </section>

            <section className="admin-panel card" aria-labelledby="admin-status-title">
              <div className="admin-panel-head">
                <h2 id="admin-status-title">
                  <FiPackage aria-hidden="true" />
                  Orders by status
                </h2>
                <Link className="admin-panel-link" to="/admin/orders">
                  All orders
                </Link>
              </div>
              <StatusBreakdown counts={data.ordersByStatus} />
            </section>

            <section className="admin-panel card" aria-labelledby="admin-stock-title">
              <div className="admin-panel-head">
                <h2 id="admin-stock-title">
                  <FiAlertTriangle aria-hidden="true" />
                  Low stock
                </h2>
                {data.lowStock.length ? (
                  <Link className="admin-panel-link" to="/admin/products?stock=low">
                    Every low stock product
                  </Link>
                ) : null}
              </div>
              {data.lowStock.length ? (
                <ul className="admin-dashboard-list">
                  {data.lowStock.map((product) => (
                    <li key={product.id}>
                      <img
                        className="admin-thumb"
                        src={product.thumbnail}
                        alt=""
                        width="44"
                        height="44"
                        loading="lazy"
                      />
                      <span className="admin-cell-text">
                        <span className="admin-cell-title">{product.title}</span>
                        <span
                          className={
                            product.stock === 0
                              ? 'admin-stock-label is-out'
                              : 'admin-stock-label is-low'
                          }
                        >
                          {product.stock === 0 ? 'Sold out' : `${pluralize(product.stock, 'unit')} left`}
                        </span>
                      </span>
                      <Link className="btn btn-outline admin-dashboard-action" to={`/admin/products/${product.id}/edit`}>
                        Edit
                        <span className="visually-hidden"> {product.title}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="admin-muted">Every product has 10 or more units in stock.</p>
              )}
            </section>

            <section className="admin-panel card" aria-labelledby="admin-top-title">
              <div className="admin-panel-head">
                <h2 id="admin-top-title">
                  <FiAward aria-hidden="true" />
                  Bestsellers
                </h2>
              </div>
              {data.topProducts.length ? (
                <ol className="admin-dashboard-list is-ranked">
                  {data.topProducts.map(({ product, soldCount }) => (
                    <li key={product.id}>
                      <img
                        className="admin-thumb"
                        src={product.thumbnail}
                        alt=""
                        width="44"
                        height="44"
                        loading="lazy"
                      />
                      <span className="admin-cell-text">
                        <Link className="admin-cell-title admin-text-link" to={`/admin/products/${product.id}/edit`}>
                          {product.title}
                        </Link>
                        <span className="admin-cell-sub">
                          {formatPrice(product.price)} - {pluralize(product.stock, 'unit')} in stock
                        </span>
                      </span>
                      <span className="admin-dashboard-figure">{pluralize(soldCount, 'sold', 'sold')}</span>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="admin-muted">Nothing has sold yet. Bestsellers appear here after the first order.</p>
              )}
            </section>

            <section className="admin-panel card" aria-labelledby="admin-recent-title">
              <div className="admin-panel-head">
                <h2 id="admin-recent-title">
                  <FiClock aria-hidden="true" />
                  Latest orders
                </h2>
                <Link className="admin-panel-link" to="/admin/orders">
                  All orders
                </Link>
              </div>
              {data.recentOrders.length ? (
                <ul className="admin-dashboard-list">
                  {data.recentOrders.map((order) => (
                    <li key={order._id}>
                      <span className="admin-cell-text">
                        <Link className="admin-cell-title admin-text-link" to={`/admin/orders/${order.number}`}>
                          {order.number}
                        </Link>
                        <span className="admin-cell-sub">
                          {order.user ? order.user.name : `${order.delivery.name} (account deleted)`} -{' '}
                          {formatDate(order.createdAt)}
                        </span>
                      </span>
                      <span className="admin-dashboard-order-end">
                        <span className="admin-dashboard-figure">{formatPrice(order.total)}</span>
                        <OrderStatusBadge status={order.status} />
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="admin-muted">No orders yet. New orders appear here as soon as they are placed.</p>
              )}
            </section>
          </div>
        </>
      ) : null}
    </div>
  )
}

export default AdminDashboard
