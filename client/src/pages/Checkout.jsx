import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  FiAlertTriangle,
  FiCheck,
  FiCreditCard,
  FiInfo,
  FiShoppingBag,
  FiSmartphone,
  FiTruck
} from 'react-icons/fi'
import { useAuth } from '../context/AuthContext'
import { useCatalog } from '../context/CatalogContext'
import { useShop } from '../context/ShopContext'
import usePageTitle from '../hooks/usePageTitle'
import FormField from '../components/FormField/FormField'
import EmptyState from '../components/EmptyState/EmptyState'
import RetryNotice from '../components/RetryNotice/RetryNotice'
import { placeOrder as sendOrder } from '../services/orders'
import { availabilityFor } from '../services/api'
import { formatPrice, pluralize } from '../utils/format'
import { buildOrderRequest, checkoutErrors, stockProblems } from '../utils/orders'
import {
  deliveryFromAccount,
  digitsOnly,
  formatCardNumber,
  formatExpiry,
  validateDelivery,
  validatePayment
} from '../utils/checkoutValidation'
import './Checkout.css'

// The same rule the server prices with (server/models/order.js); the order it returns
// carries the final figures.
const DELIVERY_FEE = 4.99
const FREE_DELIVERY_THRESHOLD = 150

// Failures where the order may still have reached the server before the answer was lost.
const UNCERTAIN_CODES = ['TIMEOUT', 'NETWORK_ERROR']

const steps = [
  { id: 'delivery', label: 'Delivery' },
  { id: 'payment', label: 'Payment' },
  { id: 'review', label: 'Review' }
]

const paymentMethods = [
  { id: 'card', label: 'Card', description: 'Credit or debit card', icon: FiCreditCard },
  { id: 'upi', label: 'UPI', description: 'Pay using any UPI app', icon: FiSmartphone },
  { id: 'cod', label: 'Cash on delivery', description: 'Pay when it arrives', icon: FiTruck }
]

const emptyPayment = {
  method: 'card',
  cardName: '',
  cardNumber: '',
  expiry: '',
  cvv: '',
  upiId: ''
}

// Every input id starts with this, so the page can move focus to a field by its name.
const fieldId = (name) => `checkout-${name}`
const STEP_HEADING = 'checkout-step-heading'

function Checkout() {
  usePageTitle('Checkout')
  const navigate = useNavigate()
  const { user, refreshUser } = useAuth()
  const { status: catalogueStatus, updateProduct } = useCatalog()
  const {
    cartItems,
    cartCount,
    subtotal,
    savings,
    listsStatus,
    updateQuantity,
    removeFromCart,
    removeOrderedLines
  } = useShop()

  const [step, setStep] = useState('delivery')
  // Filled in from the account: every order saves its address there for next time.
  const [delivery, setDelivery] = useState(() => deliveryFromAccount(user))
  const filledFrom = useRef(user ? user._id : null)
  const hasSavedAddress = Boolean(user?.address?.address)
  const [payment, setPayment] = useState(emptyPayment)
  const [errors, setErrors] = useState({})
  const [isPlacing, setIsPlacing] = useState(false)
  const [placeError, setPlaceError] = useState(null)
  const [cartMessage, setCartMessage] = useState('')
  // Lines the server could not fill at the last attempt, keyed by product id.
  const [stockIssues, setStockIssues] = useState({})
  const [placedNumber, setPlacedNumber] = useState(null)
  const [focusTarget, setFocusTarget] = useState(null)
  // Guards against a double click sending the same order twice before a re-render.
  const placing = useRef(false)

  // The account can arrive after the page (a session still being checked). The form is
  // filled in then, unless the shopper has already started typing.
  useEffect(() => {
    if (!user || filledFrom.current === user._id) return
    filledFrom.current = user._id
    setDelivery((current) =>
      Object.values(current).some((value) => value.trim()) ? current : deliveryFromAccount(user)
    )
  }, [user])

  // Focus moves after the render that shows the target (a new step, a field marked invalid).
  useEffect(() => {
    if (!focusTarget) return
    const element = document.getElementById(focusTarget)
    if (element) element.focus()
    setFocusTarget(null)
  }, [focusTarget])

  const deliveryFee = subtotal >= FREE_DELIVERY_THRESHOLD ? 0 : DELIVERY_FEE
  const total = subtotal + deliveryFee

  // A problem line stops counting once the shopper has lowered it or taken it out.
  const openIssues = cartItems.filter(
    (item) => stockIssues[item.id] && item.quantity > stockIssues[item.id].available
  )
  const hadIssues = Object.keys(stockIssues).length > 0

  const goTo = (nextStep) => {
    setStep(nextStep)
    setFocusTarget(STEP_HEADING)
  }

  const showErrors = (found) => {
    setErrors(found)
    const first = Object.keys(found)[0]
    if (first) setFocusTarget(fieldId(first === 'method' ? 'method-card' : first))
    return !first
  }

  const updateDelivery = (field) => (event) => {
    setDelivery((current) => ({ ...current, [field]: event.target.value }))
    setErrors((current) => ({ ...current, [field]: undefined }))
  }

  const updatePayment = (field, transform) => (event) => {
    const value = transform ? transform(event.target.value) : event.target.value
    setPayment((current) => ({ ...current, [field]: value }))
    setErrors((current) => ({ ...current, [field]: undefined }))
  }

  const goToPayment = (event) => {
    event.preventDefault()
    if (showErrors(validateDelivery(delivery))) goTo('payment')
  }

  const goToReview = (event) => {
    event.preventDefault()
    if (showErrors(validatePayment(payment))) goTo('review')
  }

  const handleFailure = (error) => {
    if (error.code === 'OUT_OF_STOCK') {
      const issues = stockProblems(error)
      setStockIssues(issues)
      setPlaceError(error)
      // The catalogue on this device was out of date; show the stock the server has now.
      Object.entries(issues).forEach(([id, issue]) => {
        updateProduct(Number(id), { stock: issue.available, availability: availabilityFor(issue.available) })
      })
      setFocusTarget('checkout-place-error')
      return
    }

    if (error.code === 'VALIDATION_ERROR') {
      const mapped = checkoutErrors(error)
      setErrors(mapped.fields)
      setCartMessage(mapped.cartMessage)
      if (mapped.step) {
        setStep(mapped.step)
        const first = Object.keys(mapped.fields)[0]
        setFocusTarget(fieldId(first === 'method' ? 'method-card' : first))
        return
      }
    }

    setPlaceError(error)
    setFocusTarget('checkout-place-error')
  }

  const placeOrder = async () => {
    if (placing.current) return
    placing.current = true
    setIsPlacing(true)
    setPlaceError(null)
    setCartMessage('')

    try {
      const order = await sendOrder(buildOrderRequest(cartItems, delivery, payment))
      setPlacedNumber(order.number)

      // The server already took these lines out of the saved cart and kept the address.
      removeOrderedLines(order.items.map((item) => item.id))
      order.items.forEach((item) => {
        updateProduct(item.id, (product) => {
          const stock = Math.max(product.stock - item.quantity, 0)
          return { stock, availability: availabilityFor(stock), soldCount: product.soldCount + item.quantity }
        })
      })
      refreshUser().catch(() => {
        // The next checkout still opens with this address typed in by the shopper.
      })
      navigate(`/orders/${order.number}`, { replace: true, state: { justPlaced: true, order } })
    } catch (error) {
      placing.current = false
      setIsPlacing(false)
      handleFailure(error)
    }
  }

  // Between the order being accepted and the order page opening, the cart is already empty.
  if (placedNumber) {
    return (
      <div className="container checkout-done" role="status">
        <p>Order {placedNumber} is placed. Opening it now.</p>
      </div>
    )
  }

  const cartLoading = catalogueStatus === 'loading' || (listsStatus === 'syncing' && !cartItems.length)
  if (cartLoading) {
    return (
      <div className="container checkout-loading" role="status">
        <h1>Checkout</h1>
        <div className="skeleton checkout-loading-panel" />
        <span className="visually-hidden">Loading your cart</span>
      </div>
    )
  }

  if (!cartItems.length) {
    return (
      <div className="container">
        <EmptyState
          icon={FiShoppingBag}
          headingLevel={1}
          title="There is nothing to check out"
          message={
            hadIssues
              ? 'The products that were not available are out of your cart. Add something else and the checkout will open here.'
              : 'Add a product to your cart and the checkout will open here.'
          }
          action={
            <Link className="btn btn-primary" to="/">
              Browse products
            </Link>
          }
        />
      </div>
    )
  }

  const activeIndex = steps.findIndex((entry) => entry.id === step)
  const cardLast4 = digitsOnly(payment.cardNumber).slice(-4)
  const uncertain = placeError && UNCERTAIN_CODES.includes(placeError.code)

  return (
    <div className="container checkout">
      <div className="section-heading">
        <h1>Checkout</h1>
        <p>{pluralize(cartCount, 'item')} in this order</p>
      </div>

      <p className="checkout-demo" role="note">
        <FiInfo aria-hidden="true" />
        ShopSmart is a demo store, so no payment is taken. Your order is saved to your account
        and the store sets the stock aside for it. For a card, only the last four digits go with
        the order; the full number and CVV never leave this page. Please use made up card details.
      </p>

      <ol className="checkout-steps">
        {steps.map((entry, index) => (
          <li
            key={entry.id}
            className={index <= activeIndex ? 'is-active' : ''}
            aria-current={entry.id === step ? 'step' : undefined}
          >
            <span className="checkout-step-number">{index < activeIndex ? <FiCheck aria-hidden="true" /> : index + 1}</span>
            {entry.label}
          </li>
        ))}
      </ol>

      <div className="checkout-layout">
        <div className="checkout-panel card">
          {step === 'delivery' ? (
            <form onSubmit={goToPayment} noValidate>
              <h2 id={STEP_HEADING} tabIndex={-1}>
                Delivery address
              </h2>
              {hasSavedAddress ? (
                <p className="checkout-note checkout-prefill">
                  Filled in from your account. The address you use is saved with the order, ready
                  for next time.
                </p>
              ) : null}
              <div className="checkout-grid">
                <FormField
                  id={fieldId('name')}
                  label="Full name"
                  value={delivery.name}
                  onChange={updateDelivery('name')}
                  error={errors.name}
                  autoComplete="name"
                  maxLength={60}
                />
                <FormField
                  id={fieldId('email')}
                  label="Email"
                  type="email"
                  value={delivery.email}
                  onChange={updateDelivery('email')}
                  error={errors.email}
                  autoComplete="email"
                />
                <FormField
                  id={fieldId('phone')}
                  label="Phone"
                  type="tel"
                  inputMode="numeric"
                  value={delivery.phone}
                  onChange={updateDelivery('phone')}
                  error={errors.phone}
                  autoComplete="tel"
                />
                <FormField
                  id={fieldId('pincode')}
                  label="PIN code"
                  inputMode="numeric"
                  value={delivery.pincode}
                  onChange={updateDelivery('pincode')}
                  error={errors.pincode}
                  autoComplete="postal-code"
                />
                <div className="checkout-grid-wide">
                  <FormField
                    id={fieldId('address')}
                    label="Street address"
                    value={delivery.address}
                    onChange={updateDelivery('address')}
                    error={errors.address}
                    autoComplete="street-address"
                    maxLength={160}
                  />
                </div>
                <FormField
                  id={fieldId('city')}
                  label="City"
                  value={delivery.city}
                  onChange={updateDelivery('city')}
                  error={errors.city}
                  autoComplete="address-level2"
                  maxLength={60}
                />
                <FormField
                  id={fieldId('state')}
                  label="State"
                  value={delivery.state}
                  onChange={updateDelivery('state')}
                  error={errors.state}
                  autoComplete="address-level1"
                  maxLength={60}
                />
              </div>

              <div className="checkout-actions">
                <Link className="btn btn-ghost" to="/cart">
                  Back to cart
                </Link>
                <button type="submit" className="btn btn-primary">
                  Continue to payment
                </button>
              </div>
            </form>
          ) : null}

          {step === 'payment' ? (
            <form onSubmit={goToReview} noValidate>
              <h2 id={STEP_HEADING} tabIndex={-1}>
                Payment method
              </h2>

              <fieldset className="checkout-methods">
                <legend className="visually-hidden">Choose how to pay</legend>
                {paymentMethods.map(({ id, label, description, icon: Icon }) => (
                  <label key={id} className={payment.method === id ? 'is-selected' : ''}>
                    <input
                      id={fieldId(`method-${id}`)}
                      type="radio"
                      name="method"
                      value={id}
                      checked={payment.method === id}
                      onChange={() => {
                        setPayment((current) => ({ ...current, method: id }))
                        setErrors({})
                      }}
                    />
                    <Icon aria-hidden="true" />
                    <span>
                      <strong>{label}</strong>
                      {description}
                    </span>
                  </label>
                ))}
              </fieldset>
              {errors.method ? (
                <p className="form-field-error" role="alert">
                  {errors.method}
                </p>
              ) : null}

              {payment.method === 'card' ? (
                <div className="checkout-grid">
                  <div className="checkout-grid-wide">
                    <FormField
                      id={fieldId('cardName')}
                      label="Name on card"
                      value={payment.cardName}
                      onChange={updatePayment('cardName')}
                      error={errors.cardName}
                      autoComplete="off"
                    />
                  </div>
                  <div className="checkout-grid-wide">
                    <FormField
                      id={fieldId('cardNumber')}
                      label="Card number"
                      inputMode="numeric"
                      placeholder="4242 4242 4242 4242"
                      hint="Any 16 digits work here. Never enter a real card number."
                      value={payment.cardNumber}
                      onChange={updatePayment('cardNumber', formatCardNumber)}
                      error={errors.cardNumber}
                      autoComplete="off"
                    />
                  </div>
                  <FormField
                    id={fieldId('expiry')}
                    label="Expiry"
                    placeholder="MM/YY"
                    inputMode="numeric"
                    value={payment.expiry}
                    onChange={updatePayment('expiry', formatExpiry)}
                    error={errors.expiry}
                    autoComplete="off"
                  />
                  <FormField
                    id={fieldId('cvv')}
                    label="CVV"
                    inputMode="numeric"
                    maxLength={3}
                    value={payment.cvv}
                    onChange={updatePayment('cvv')}
                    error={errors.cvv}
                    autoComplete="off"
                  />
                </div>
              ) : null}

              {payment.method === 'upi' ? (
                <div className="checkout-grid">
                  <div className="checkout-grid-wide">
                    <FormField
                      id={fieldId('upiId')}
                      label="UPI ID"
                      placeholder="name@bank"
                      value={payment.upiId}
                      onChange={updatePayment('upiId')}
                      error={errors.upiId}
                    />
                  </div>
                </div>
              ) : null}

              {payment.method === 'cod' ? (
                <p className="checkout-note">
                  Pay {formatPrice(total)} when the order arrives. As this is a demo store, nobody
                  will actually come to collect it.
                </p>
              ) : null}

              <div className="checkout-actions">
                <button type="button" className="btn btn-ghost" onClick={() => goTo('delivery')}>
                  Back
                </button>
                <button type="submit" className="btn btn-primary">
                  Review order
                </button>
              </div>
            </form>
          ) : null}

          {step === 'review' ? (
            <div>
              <h2 id={STEP_HEADING} tabIndex={-1}>
                Review and confirm
              </h2>

              <div className="checkout-review">
                <section aria-labelledby="checkout-review-delivery">
                  <h3 id="checkout-review-delivery">Delivering to</h3>
                  <p>{delivery.name}</p>
                  <p>
                    {delivery.address}, {delivery.city}, {delivery.state} {delivery.pincode}
                  </p>
                  <p>
                    {delivery.phone} - {delivery.email}
                  </p>
                  <button type="button" className="btn btn-ghost" onClick={() => goTo('delivery')}>
                    Change<span className="visually-hidden"> delivery address</span>
                  </button>
                </section>

                <section aria-labelledby="checkout-review-payment">
                  <h3 id="checkout-review-payment">Paying with</h3>
                  <p>
                    {payment.method === 'card' ? `Card ending ${cardLast4}` : null}
                    {payment.method === 'upi' ? `UPI (${payment.upiId.trim()})` : null}
                    {payment.method === 'cod' ? 'Cash on delivery' : null}
                  </p>
                  <button type="button" className="btn btn-ghost" onClick={() => goTo('payment')}>
                    Change<span className="visually-hidden"> payment method</span>
                  </button>
                </section>
              </div>

              {placeError && placeError.code === 'OUT_OF_STOCK' ? (
                openIssues.length ? (
                  <div className="checkout-alert" role="alert" id="checkout-place-error" tabIndex={-1}>
                    <FiAlertTriangle aria-hidden="true" />
                    <p>
                      <strong>{placeError.message}</strong> Change or remove the{' '}
                      {openIssues.length === 1 ? 'line marked below' : 'lines marked below'}, then
                      place the order again. Nothing was ordered yet.
                    </p>
                  </div>
                ) : (
                  <p className="checkout-fixed" role="status" id="checkout-place-error" tabIndex={-1}>
                    <FiCheck aria-hidden="true" />
                    Your cart now fits the stock. Check the total and place the order again.
                  </p>
                )
              ) : null}

              {placeError && placeError.code !== 'OUT_OF_STOCK' ? (
                <div className="checkout-place-error" id="checkout-place-error" tabIndex={-1}>
                  <RetryNotice
                    title="We could not place your order."
                    message={
                      uncertain
                        ? `${placeError.message} It may have gone through, so check your orders before trying again.`
                        : placeError.message
                    }
                    onRetry={uncertain ? undefined : placeOrder}
                    busy={isPlacing}
                  />
                  {uncertain ? (
                    <p className="checkout-uncertain">
                      <Link to="/orders">Check your orders</Link>
                      <button type="button" className="btn btn-outline" onClick={placeOrder} disabled={isPlacing}>
                        It is not there, try again
                      </button>
                    </p>
                  ) : null}
                </div>
              ) : null}

              {cartMessage ? (
                <p className="form-field-error" role="alert">
                  {cartMessage}
                </p>
              ) : null}

              <ul className="checkout-items">
                {cartItems.map((item) => {
                  const issue = stockIssues[item.id]
                  const isOpen = issue && item.quantity > issue.available
                  return (
                    <li key={item.id} className={isOpen ? 'is-unavailable' : ''}>
                      <div className="checkout-item-line">
                        <img src={item.thumbnail} alt="" width="48" height="48" loading="lazy" />
                        <span className="checkout-item-title">{item.title}</span>
                        <span className="checkout-item-qty">x{item.quantity}</span>
                        <span>{formatPrice(item.price * item.quantity)}</span>
                      </div>
                      {isOpen ? (
                        <div className="checkout-item-issue">
                          <p>{issue.message}</p>
                          {issue.available > 0 ? (
                            <button
                              type="button"
                              className="btn btn-outline"
                              onClick={() => {
                                updateQuantity(item.id, issue.available)
                                // The button goes away with the problem, so focus moves
                                // to the note that says what is left to do.
                                setFocusTarget('checkout-place-error')
                              }}
                            >
                              Change to {issue.available}
                              <span className="visually-hidden"> for {item.title}</span>
                            </button>
                          ) : null}
                          <button
                            type="button"
                            className="btn btn-ghost"
                            onClick={() => {
                              removeFromCart(item.id)
                              setFocusTarget('checkout-place-error')
                            }}
                          >
                            Remove from cart<span className="visually-hidden">: {item.title}</span>
                          </button>
                        </div>
                      ) : null}
                    </li>
                  )
                })}
              </ul>

              <div className="checkout-actions">
                <button type="button" className="btn btn-ghost" onClick={() => goTo('payment')}>
                  Back
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={placeOrder}
                  disabled={isPlacing || openIssues.length > 0}
                >
                  {isPlacing ? 'Placing order' : `Place order - ${formatPrice(total)}`}
                </button>
              </div>
              <p className="visually-hidden" role="status">
                {isPlacing ? 'Placing your order' : ''}
              </p>
            </div>
          ) : null}
        </div>

        <aside className="checkout-summary card" aria-label="Order summary">
          <h2>Summary</h2>
          <dl>
            <div>
              <dt>Subtotal</dt>
              <dd>{formatPrice(subtotal)}</dd>
            </div>
            {savings > 0 ? (
              <div className="checkout-summary-savings">
                <dt>Discount savings</dt>
                <dd>-{formatPrice(savings)}</dd>
              </div>
            ) : null}
            <div>
              <dt>Delivery</dt>
              <dd>{deliveryFee === 0 ? 'Free' : formatPrice(deliveryFee)}</dd>
            </div>
            <div className="checkout-summary-total">
              <dt>Total</dt>
              <dd>{formatPrice(total)}</dd>
            </div>
          </dl>
          <p className="checkout-summary-hint">
            The store checks every price and the stock again when you place the order.
          </p>
          <button type="button" className="btn btn-ghost btn-block" onClick={() => navigate('/cart')}>
            Edit cart
          </button>
        </aside>
      </div>
    </div>
  )
}

export default Checkout
