import { useEffect, useRef } from 'react'
import { Link, useParams } from 'react-router-dom'
import { FiArrowLeft, FiClock, FiCreditCard, FiMapPin, FiShoppingBag, FiUser } from 'react-icons/fi'
import AdminLoadError from '../../components/admin/AdminLoadError/AdminLoadError'
import AdminPageHeader from '../../components/admin/AdminPageHeader/AdminPageHeader'
import OrderStatusBadge from '../../components/admin/OrderStatusBadge/OrderStatusBadge'
import OrderStatusForm from '../../components/admin/OrderStatusForm/OrderStatusForm'
import useAdminResource from '../../hooks/useAdminResource'
import usePageTitle from '../../hooks/usePageTitle'
import { ORDER_STATUS_LABELS, describePayment, orderItemCount } from '../../services/adminRules'
import { formatDate, formatDateTime, formatPrice, pluralize } from '../../utils/format'
import './AdminOrderDetails.css'

// Order URLs take an order number (SS100001) or an _id, as GET /api/orders/:ref does.
const ORDER_REF = /^(ss\d+|[a-f0-9]{24})$/i

const backLink = (
  <Link to="/admin/orders">
    <FiArrowLeft aria-hidden="true" />
    All orders
  </Link>
)

/**
 * One order as the store sees it: what was bought, where it goes, how it was paid, every
 * status it has had, and the control that moves it on (GET /api/orders/:ref and
 * PATCH /api/orders/:ref/status).
 */
function AdminOrderDetails() {
  const { ref } = useParams()
  const validRef = ORDER_REF.test(ref)
  const heading = useRef(null)
  const statusHeading = useRef(null)
  const focusStatusAfterUpdate = useRef(false)
  const { data, status, error, isRefreshing, reload, setData } = useAdminResource(
    validRef ? `/orders/${encodeURIComponent(ref)}` : null,
    { keepPreviousData: false }
  )
  const order = data ? data.order : null
  usePageTitle(order ? `Order ${order.number}` : 'Order')

  // A status change can remove the button that was pressed (a delivered order has no
  // further steps), so focus moves to the status heading once the page shows the change
  // and any confirmation dialog has gone.
  const orderVersion = order ? `${order.status}:${order.updatedAt}` : ''
  useEffect(() => {
    if (focusStatusAfterUpdate.current && orderVersion) {
      focusStatusAfterUpdate.current = false
      statusHeading.current?.focus()
    }
  }, [orderVersion])

  const notFound = !validRef || (error && error.code === 'ORDER_NOT_FOUND')
  if (notFound) {
    return (
      <div className="admin-order-details">
        <AdminPageHeader
          eyebrow={backLink}
          title="Order not found"
          description={`There is no order ${ref}. Check the order number, or find the order in the list.`}
          actions={
            <Link className="btn btn-primary" to="/admin/orders">
              Back to orders
            </Link>
          }
        />
      </div>
    )
  }

  if (!order) {
    return (
      <div className="admin-order-details">
        <AdminPageHeader headingRef={heading} eyebrow={backLink} title={`Order ${ref.toUpperCase()}`} />
        {status === 'error' ? (
          <AdminLoadError
            title="This order could not be loaded"
            error={error}
            onRetry={() => {
              heading.current?.focus()
              reload()
            }}
          />
        ) : (
          <div role="status">
            <span className="visually-hidden">Loading the order</span>
            <div className="skeleton admin-order-skeleton" aria-hidden="true" />
          </div>
        )}
      </div>
    )
  }

  const customer = order.user
  const { delivery } = order

  return (
    <div className="admin-order-details">
      <AdminPageHeader
        headingRef={heading}
        eyebrow={backLink}
        title={`Order ${order.number}`}
        description={`Placed ${formatDateTime(order.createdAt)} by ${customer ? customer.name : delivery.name}. ${pluralize(orderItemCount(order), 'item')}, ${formatPrice(order.total)}.`}
        actions={<OrderStatusBadge status={order.status} />}
      />

      {status === 'error' ? (
        <AdminLoadError compact title="The latest version could not be loaded" error={error} onRetry={reload} />
      ) : null}
      {isRefreshing ? (
        <p className="admin-muted" role="status">
          Loading the latest version of this order
        </p>
      ) : null}

      <div className="admin-order-layout">
        {/* The status control is what an admin opens an order for, so it comes first in
            the page; on wide screens it sits in the right-hand column. */}
        <div className="admin-order-side">
          <section className="admin-panel card" aria-labelledby="admin-order-status-title">
            <h2 id="admin-order-status-title" ref={statusHeading} tabIndex={-1}>
              Status: {ORDER_STATUS_LABELS[order.status] || order.status}
            </h2>
            <OrderStatusForm
              order={order}
              onUpdated={(updated) => {
                focusStatusAfterUpdate.current = true
                setData((current) => ({ ...current, order: updated }))
              }}
              onStale={reload}
            />
          </section>

          <section className="admin-panel card" aria-labelledby="admin-order-customer-title">
            <h2 id="admin-order-customer-title">
              <FiUser aria-hidden="true" />
              Customer
            </h2>
            {customer ? (
              <p className="admin-order-block">
                <strong>{customer.name}</strong>
                <span>{customer.email}</span>
                <Link className="admin-text-link" to={`/admin/users?q=${encodeURIComponent(customer.email)}`}>
                  Find the account
                </Link>
              </p>
            ) : (
              <p className="admin-muted">
                The account that placed this order has been deleted. The delivery details below
                were kept with the order.
              </p>
            )}
          </section>

          <section className="admin-panel card" aria-labelledby="admin-order-delivery-title">
            <h2 id="admin-order-delivery-title">
              <FiMapPin aria-hidden="true" />
              Delivery
            </h2>
            <address className="admin-order-block">
              <strong>{delivery.name}</strong>
              <span>{delivery.address}</span>
              <span>
                {delivery.city}, {delivery.state} {delivery.pincode}
              </span>
              <span>Phone {delivery.phone}</span>
              <span>{delivery.email}</span>
            </address>
          </section>

          <section className="admin-panel card" aria-labelledby="admin-order-payment-title">
            <h2 id="admin-order-payment-title">
              <FiCreditCard aria-hidden="true" />
              Payment
            </h2>
            <p>{describePayment(order.payment)}</p>
            <p className="admin-muted">
              {order.payment && order.payment.method === 'cod'
                ? `${formatPrice(order.total)} is collected on delivery.`
                : 'Paid at checkout. Only the last digits of a card are kept.'}
            </p>
          </section>
        </div>
        <div className="admin-order-main">
          <section className="admin-panel card" aria-labelledby="admin-order-items-title">
            <h2 id="admin-order-items-title">
              <FiShoppingBag aria-hidden="true" />
              Items
            </h2>
            <ul className="admin-order-items">
              {order.items.map((item) => (
                <li key={item.id}>
                  <img className="admin-thumb" src={item.thumbnail} alt="" width="44" height="44" loading="lazy" />
                  <span className="admin-cell-text">
                    <Link className="admin-cell-title admin-text-link" to={`/admin/products/${item.id}/edit`}>
                      {item.title}
                    </Link>
                    <span className="admin-cell-sub">
                      {item.brand ? `${item.brand} - ` : ''}
                      {item.quantity} x {formatPrice(item.price)}
                      {item.originalPrice > item.price ? ` (was ${formatPrice(item.originalPrice)})` : ''}
                    </span>
                  </span>
                  <span className="admin-order-line-total">{formatPrice(item.price * item.quantity)}</span>
                </li>
              ))}
            </ul>
            <dl className="admin-order-totals">
              <div>
                <dt>Subtotal</dt>
                <dd>{formatPrice(order.subtotal)}</dd>
              </div>
              {order.savings > 0 ? (
                <div>
                  <dt>Shopper saved</dt>
                  <dd>{formatPrice(order.savings)}</dd>
                </div>
              ) : null}
              <div>
                <dt>Delivery</dt>
                <dd>{order.deliveryFee ? formatPrice(order.deliveryFee) : 'Free'}</dd>
              </div>
              <div className="is-total">
                <dt>Total</dt>
                <dd>{formatPrice(order.total)}</dd>
              </div>
            </dl>
          </section>

          <section className="admin-panel card" aria-labelledby="admin-order-history-title">
            <h2 id="admin-order-history-title">
              <FiClock aria-hidden="true" />
              History
            </h2>
            <ol className="admin-order-history">
              {(order.statusHistory || []).map((entry, index) => (
                <li key={`${entry.status}-${entry.at}-${index}`}>
                  <OrderStatusBadge status={entry.status} />
                  <span className="admin-cell-text">
                    <time dateTime={entry.at}>{formatDateTime(entry.at)}</time>
                    {entry.note ? <span className="admin-cell-sub">{entry.note}</span> : null}
                  </span>
                </li>
              ))}
            </ol>
            {order.status !== 'cancelled' && order.status !== 'delivered' ? (
              <p className="admin-muted">
                The shopper was told to expect it by {formatDate(order.arrivesOn)}.
              </p>
            ) : null}
          </section>
        </div>

      </div>
    </div>
  )
}

export default AdminOrderDetails
