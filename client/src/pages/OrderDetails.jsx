import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import {
  FiCheck,
  FiChevronRight,
  FiCreditCard,
  FiPackage,
  FiShoppingCart,
  FiTruck,
  FiWifiOff,
  FiXCircle
} from 'react-icons/fi'
import useBuyAgain from '../hooks/useBuyAgain'
import usePageTitle from '../hooks/usePageTitle'
import EmptyState from '../components/EmptyState/EmptyState'
import OrderStatus from '../components/OrderStatus/OrderStatus'
import OrderTimeline from '../components/OrderTimeline/OrderTimeline'
import FormField from '../components/FormField/FormField'
import { cancelOrder, fetchOrder } from '../services/orders'
import { isAbortError } from '../services/http'
import { formatDate, formatPrice, pluralize } from '../utils/format'
import { canCancel, orderItemCount, paymentSummary, statusDate } from '../utils/orders'
import './OrderDetails.css'

const REASON_LIMIT = 200
// Answers that mean the order moved on (shipped, or cancelled elsewhere) since it loaded.
const STALE_ORDER_CODES = ['ORDER_NOT_CANCELLABLE', 'ORDER_CHANGED']
const NOT_FOUND_CODES = ['ORDER_NOT_FOUND', 'INVALID_ID']

// Order URLs take the number in any letter case, or the order's _id.
function isOrder(order, ref) {
  if (!order || !ref) return false
  return order.number.toUpperCase() === ref.toUpperCase() || order._id === ref
}

function deliveryDate(order) {
  if (order.status === 'delivered') {
    return { label: 'Delivered on', value: statusDate(order, 'delivered') || order.arrivesOn }
  }
  if (order.status === 'cancelled') {
    return { label: 'Cancelled on', value: statusDate(order, 'cancelled') || order.updatedAt }
  }
  return { label: 'Arriving by', value: order.arrivesOn }
}

function OrderDetails() {
  const { number } = useParams()
  const location = useLocation()
  const navigate = useNavigate()
  // Checkout hands over the order it just placed, so the page can show it at once.
  const handedOver = location.state?.order
  const initialOrder = isOrder(handedOver, number) ? handedOver : null
  // Kept from the first render, because the router state is cleared below.
  const [placedNumber] = useState(() =>
    location.state?.justPlaced && initialOrder ? initialOrder.number : null
  )

  const [loadedOrder, setOrder] = useState(initialOrder)
  const [status, setStatus] = useState(initialOrder ? 'ready' : 'loading')
  const [error, setError] = useState(null)
  const [attempt, setAttempt] = useState(0)

  // 'idle', 'confirm' (the question is showing) or 'sending'.
  const [cancelStep, setCancelStep] = useState('idle')
  const [reason, setReason] = useState('')
  const [cancelError, setCancelError] = useState('')
  const [notice, setNotice] = useState('')

  const { buyAgain, result } = useBuyAgain()
  const heading = useRef(null)
  const cancelButton = useRef(null)
  const confirmHeading = useRef(null)
  const noticeRef = useRef(null)

  usePageTitle(`Order ${number}`)

  // After following a link to another order, the previous one is not shown in its place.
  const order = isOrder(loadedOrder, number) ? loadedOrder : null
  // The confirmation greets the checkout once. It is not shown again for a cancelled order.
  const justPlaced = Boolean(order && order.number === placedNumber && order.status !== 'cancelled')

  // The browser keeps router state through a reload and the back button, which would
  // greet the shopper with "Order confirmed" and an old copy of the order every time.
  useEffect(() => {
    if (location.state) navigate(location.pathname, { replace: true, state: null })
  }, [location.state, location.pathname, navigate])

  const shownOrder = useRef(order)
  shownOrder.current = order

  useEffect(() => {
    const controller = new AbortController()
    // An order already on screen stays there while it is refreshed, and stays if the
    // refresh fails; only a first load shows the skeleton or the error.
    const keepShowing = Boolean(shownOrder.current)
    setError(null)
    setStatus(keepShowing ? 'ready' : 'loading')

    fetchOrder(number, { signal: controller.signal })
      .then((loaded) => {
        setOrder(loaded)
        setStatus('ready')
      })
      .catch((loadError) => {
        if (isAbortError(loadError)) return
        setError(loadError)
        setStatus(keepShowing ? 'ready' : 'error')
      })

    return () => controller.abort()
  }, [number, attempt])

  useEffect(() => {
    if (cancelStep === 'confirm') confirmHeading.current?.focus()
  }, [cancelStep])

  useEffect(() => {
    if (notice) noticeRef.current?.focus()
  }, [notice])

  const retry = () => {
    heading.current?.focus()
    setStatus('loading')
    setAttempt((count) => count + 1)
  }

  const askToCancel = () => {
    setCancelError('')
    setNotice('')
    setCancelStep('confirm')
  }

  const keepOrder = () => {
    setCancelStep('idle')
    setReason('')
    setCancelError('')
    // The button comes back on the next render; focus returns to it once it exists.
    window.requestAnimationFrame(() => cancelButton.current?.focus())
  }

  const confirmCancel = async (event) => {
    event.preventDefault()
    setCancelStep('sending')
    setCancelError('')

    try {
      const cancelled = await cancelOrder(order.number, reason.trim())
      setOrder(cancelled)
      setCancelStep('idle')
      setReason('')
      setNotice('Your order is cancelled. Its products are back on the shelf, and no payment was taken.')
    } catch (cancelFailure) {
      if (STALE_ORDER_CODES.includes(cancelFailure.code)) {
        // The order is not what the shopper saw, so show them what it is now.
        setCancelStep('idle')
        setNotice(cancelFailure.message)
        setAttempt((count) => count + 1)
        return
      }
      setCancelError(cancelFailure.message)
      setCancelStep('confirm')
    }
  }

  const breadcrumb = (
    <nav className="breadcrumb" aria-label="Breadcrumb">
      <Link to="/">Shop</Link>
      <FiChevronRight aria-hidden="true" />
      <Link to="/orders">Your orders</Link>
      <FiChevronRight aria-hidden="true" />
      <span aria-current="page">{number}</span>
    </nav>
  )

  if (status !== 'ready' || !order) {
    const notFound = status === 'error' && error && NOT_FOUND_CODES.includes(error.code)
    const isLoading = status === 'loading'

    return (
      <div className="container order-details">
        {breadcrumb}
        <h1 className="order-details-title" ref={heading} tabIndex={-1}>
          Order {number}
        </h1>

        {isLoading ? (
          <div className="order-details-loading" role="status">
            <div className="skeleton order-details-skeleton" />
            <div className="skeleton order-details-skeleton is-tall" />
            <span className="visually-hidden">Loading the order</span>
          </div>
        ) : null}

        {notFound ? (
          <EmptyState
            icon={FiPackage}
            title="We could not find this order"
            message="It is not one of the orders on your account. Check the order number, or open it from your orders."
            action={
              <Link className="btn btn-primary" to="/orders">
                Back to your orders
              </Link>
            }
          />
        ) : null}

        {status === 'error' && !notFound ? (
          <EmptyState
            icon={FiWifiOff}
            title="We could not load this order"
            message={error ? error.message : undefined}
            action={
              <button type="button" className="btn btn-primary" onClick={retry}>
                Try again
              </button>
            }
          />
        ) : null}
      </div>
    )
  }

  const arrival = deliveryDate(order)
  const firstName = order.delivery.name.split(' ')[0]
  const isCancelled = order.status === 'cancelled'

  return (
    <div className="container order-details">
      {breadcrumb}

      {justPlaced ? (
        <div className="order-confirmed" role="status">
          <span aria-hidden="true">
            <FiCheck />
          </span>
          <div>
            <h1 ref={heading} tabIndex={-1}>
              Order confirmed
            </h1>
            <p>
              Thanks {firstName}, order {order.number} is placed and saved to your account. We
              also kept this delivery address for your next checkout.
            </p>
          </div>
        </div>
      ) : (
        <h1 className="order-details-title" ref={heading} tabIndex={-1}>
          Order {order.number}
        </h1>
      )}

      {notice ? (
        <p
          className={isCancelled ? 'order-notice is-cancelled' : 'order-notice'}
          role="status"
          tabIndex={-1}
          ref={noticeRef}
        >
          {notice}
        </p>
      ) : null}

      <div className="order-summary-bar card">
        <dl>
          <div>
            <dt>Status</dt>
            <dd>
              <OrderStatus order={order} />
            </dd>
          </div>
          <div>
            <dt>Placed on</dt>
            <dd>{formatDate(order.createdAt)}</dd>
          </div>
          <div>
            <dt>{arrival.label}</dt>
            <dd>{formatDate(arrival.value)}</dd>
          </div>
          <div>
            <dt>Total</dt>
            <dd>{formatPrice(order.total)}</dd>
          </div>
        </dl>
      </div>

      <div className="order-details-layout">
        <div className="order-main">
          <section className="card order-panel" aria-labelledby="order-progress">
            <h2 id="order-progress">
              <FiTruck aria-hidden="true" />
              Progress
            </h2>
            <OrderTimeline order={order} />

            {canCancel(order) && cancelStep === 'idle' ? (
              <div className="order-cancel-start">
                <p>You can cancel until the order is handed to the courier.</p>
                <button
                  type="button"
                  className="btn btn-outline order-cancel-button"
                  ref={cancelButton}
                  onClick={askToCancel}
                >
                  <FiXCircle aria-hidden="true" />
                  Cancel order
                </button>
              </div>
            ) : null}

            {canCancel(order) && cancelStep !== 'idle' ? (
              <form
                className="order-cancel"
                onSubmit={confirmCancel}
                onKeyDown={(event) => {
                  if (event.key === 'Escape' && cancelStep === 'confirm') keepOrder()
                }}
                aria-labelledby="order-cancel-heading"
              >
                <h3 id="order-cancel-heading" ref={confirmHeading} tabIndex={-1}>
                  Cancel order {order.number}?
                </h3>
                <p>
                  The products go back on the shelf and the order cannot be restarted. You
                  can always order them again.
                </p>
                <FormField id="cancel-reason" label="Reason (optional)" hint={`Up to ${REASON_LIMIT} characters.`}>
                  <textarea
                    id="cancel-reason"
                    rows={2}
                    maxLength={REASON_LIMIT}
                    value={reason}
                    onChange={(event) => setReason(event.target.value)}
                    aria-describedby="cancel-reason-hint"
                  />
                </FormField>
                {cancelError ? (
                  <p className="order-cancel-error" role="alert">
                    {cancelError}
                  </p>
                ) : null}
                <div className="order-cancel-actions">
                  <button
                    type="submit"
                    className="btn btn-primary order-cancel-confirm"
                    disabled={cancelStep === 'sending'}
                  >
                    {cancelStep === 'sending' ? 'Cancelling' : 'Yes, cancel the order'}
                  </button>
                  <button
                    type="button"
                    className="btn btn-outline"
                    onClick={keepOrder}
                    disabled={cancelStep === 'sending'}
                  >
                    Keep the order
                  </button>
                </div>
              </form>
            ) : null}
          </section>

          <section className="card order-items-panel" aria-labelledby="order-items">
            <h2 id="order-items">{pluralize(orderItemCount(order), 'item')} in this order</h2>

            <ul className="order-items">
              {order.items.map((item) => (
                <li key={item.id}>
                  <Link to={`/product/${item.id}`} className="order-item-media" tabIndex={-1} aria-hidden="true">
                    <img src={item.thumbnail} alt="" width="64" height="64" loading="lazy" />
                  </Link>
                  <div className="order-item-info">
                    <p className="order-item-brand">{item.brand}</p>
                    <p className="order-item-title">
                      <Link to={`/product/${item.id}`}>{item.title}</Link>
                    </p>
                    <p className="order-item-qty">
                      {pluralize(item.quantity, 'unit')} at {formatPrice(item.price)}
                    </p>
                  </div>
                  <span className="order-item-total">{formatPrice(item.price * item.quantity)}</span>
                </li>
              ))}
            </ul>

            <button type="button" className="btn btn-outline" onClick={() => buyAgain(order)}>
              {isCancelled ? 'Add these to your cart' : 'Buy these again'}
            </button>
            <p className="order-buy-again" role="status">
              {result ? result.text : ''}
              {result && result.added ? (
                <Link to="/cart">
                  <FiShoppingCart aria-hidden="true" />
                  Go to cart
                </Link>
              ) : null}
            </p>
          </section>
        </div>

        <aside className="order-side">
          <section className="card order-panel" aria-labelledby="order-delivery">
            <h2 id="order-delivery">
              <FiPackage aria-hidden="true" />
              Delivery
            </h2>
            <p>{order.delivery.name}</p>
            <p>
              {order.delivery.address}, {order.delivery.city}, {order.delivery.state}{' '}
              {order.delivery.pincode}
            </p>
            <p>{order.delivery.phone}</p>
            <p className="order-panel-muted">{order.delivery.email}</p>
          </section>

          <section className="card order-panel" aria-labelledby="order-payment">
            <h2 id="order-payment">
              <FiCreditCard aria-hidden="true" />
              Payment
            </h2>
            <p>{paymentSummary(order)}</p>
            <dl className="order-totals">
              <div>
                <dt>Subtotal</dt>
                <dd>{formatPrice(order.subtotal)}</dd>
              </div>
              {order.savings > 0 ? (
                <div className="order-totals-savings">
                  <dt>Discount savings</dt>
                  <dd>-{formatPrice(order.savings)}</dd>
                </div>
              ) : null}
              <div>
                <dt>Delivery</dt>
                <dd>{order.deliveryFee === 0 ? 'Free' : formatPrice(order.deliveryFee)}</dd>
              </div>
              <div className="order-totals-grand">
                <dt>Total</dt>
                <dd>{formatPrice(order.total)}</dd>
              </div>
            </dl>
            <p className="order-panel-muted">
              Prices and totals were worked out by the store when the order was placed.
              ShopSmart is a demo store, so the payment was recorded but nothing was charged.
            </p>
          </section>
        </aside>
      </div>

      <div className="order-details-actions">
        <Link className="btn btn-primary" to="/">
          Continue shopping
        </Link>
        <Link className="btn btn-outline" to="/orders">
          All your orders
        </Link>
      </div>
    </div>
  )
}

export default OrderDetails
