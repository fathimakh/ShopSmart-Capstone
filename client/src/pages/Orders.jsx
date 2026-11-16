import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { FiChevronRight, FiPackage, FiShoppingCart, FiWifiOff } from 'react-icons/fi'
import useBuyAgain from '../hooks/useBuyAgain'
import usePageTitle from '../hooks/usePageTitle'
import EmptyState from '../components/EmptyState/EmptyState'
import OrderStatus from '../components/OrderStatus/OrderStatus'
import { fetchMyOrders } from '../services/orders'
import { isAbortError } from '../services/http'
import { formatDate, formatPrice, pluralize } from '../utils/format'
import { orderItemCount } from '../utils/orders'
import './Orders.css'

const SKELETON_CARDS = 3

function Orders() {
  usePageTitle('Your orders')
  const [orders, setOrders] = useState([])
  const [status, setStatus] = useState('loading')
  const [error, setError] = useState(null)
  const [attempt, setAttempt] = useState(0)
  const { buyAgain, result } = useBuyAgain()
  const heading = useRef(null)

  useEffect(() => {
    const controller = new AbortController()
    setStatus('loading')
    setError(null)

    fetchMyOrders({ signal: controller.signal })
      .then((list) => {
        setOrders(list)
        setStatus('ready')
      })
      .catch((loadError) => {
        if (isAbortError(loadError)) return
        setError(loadError)
        setStatus('error')
      })

    return () => controller.abort()
  }, [attempt])

  // The retry button disappears while the list reloads, so focus waits on the heading.
  const retry = () => {
    heading.current?.focus()
    setAttempt((count) => count + 1)
  }

  let summary = 'Loading your orders'
  if (status === 'ready') summary = `${pluralize(orders.length, 'order')} on your account`
  if (status === 'error') summary = 'Your orders could not be loaded'

  return (
    <div className="container orders">
      <div className="section-heading">
        <h1 ref={heading} tabIndex={-1}>
          Your orders
        </h1>
        <p role="status">{summary}</p>
      </div>

      {/* Read out after "Buy again", while the visible note sits on the order itself. */}
      <p className="visually-hidden" role="status">
        {result ? result.text : ''}
      </p>

      {status === 'loading' ? (
        <ul className="orders-list" aria-hidden="true">
          {Array.from({ length: SKELETON_CARDS }, (_, index) => (
            <li key={index} className="order-card card">
              <div className="skeleton order-skeleton-line is-short" />
              <div className="skeleton order-skeleton-line" />
              <div className="skeleton order-skeleton-thumbs" />
            </li>
          ))}
        </ul>
      ) : null}

      {status === 'error' ? (
        <EmptyState
          icon={FiWifiOff}
          title="We could not load your orders"
          message={error ? error.message : undefined}
          action={
            <button type="button" className="btn btn-primary" onClick={retry}>
              Try again
            </button>
          }
        />
      ) : null}

      {status === 'ready' && !orders.length ? (
        <EmptyState
          icon={FiPackage}
          title="No orders yet"
          message="When you place an order it is saved to your account, and you can follow it here from any device."
          action={
            <Link className="btn btn-primary" to="/">
              Start shopping
            </Link>
          }
        />
      ) : null}

      {status === 'ready' && orders.length ? (
        <ul className="orders-list">
          {orders.map((order) => (
            <li key={order.number} className="order-card card">
              <div className="order-card-head">
                <div>
                  <h2 className="order-card-number">Order {order.number}</h2>
                  <p className="order-card-date">Placed on {formatDate(order.createdAt)}</p>
                </div>
                <OrderStatus order={order} />
              </div>

              <ul className="order-card-items">
                {order.items.slice(0, 4).map((item) => (
                  <li key={item.id}>
                    <img src={item.thumbnail} alt={item.title} width="48" height="48" loading="lazy" />
                  </li>
                ))}
                {order.items.length > 4 ? (
                  <li className="order-card-more">+{order.items.length - 4}</li>
                ) : null}
              </ul>

              <div className="order-card-foot">
                <p>
                  {pluralize(orderItemCount(order), 'item')} - {formatPrice(order.total)}
                </p>
                <div className="order-card-actions">
                  <button type="button" className="btn btn-outline" onClick={() => buyAgain(order)}>
                    Buy again
                  </button>
                  <Link className="btn btn-primary" to={`/orders/${order.number}`}>
                    View details
                    <span className="visually-hidden"> of order {order.number}</span>
                    <FiChevronRight aria-hidden="true" />
                  </Link>
                </div>
              </div>

              {result && result.orderNumber === order.number ? (
                <p className="order-card-note">
                  {result.text}
                  {result.added ? (
                    <Link to="/cart">
                      <FiShoppingCart aria-hidden="true" />
                      Go to cart
                    </Link>
                  ) : null}
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}

export default Orders
