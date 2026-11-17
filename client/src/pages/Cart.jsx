import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { FiShoppingCart, FiTrash2 } from 'react-icons/fi'
import { useShop } from '../context/ShopContext'
import { useAuth } from '../context/AuthContext'
import QuantityStepper from '../components/QuantityStepper/QuantityStepper'
import EmptyState from '../components/EmptyState/EmptyState'
import { formatPrice, pluralize } from '../utils/format'
import { DELIVERY_FEE, FREE_DELIVERY_THRESHOLD } from '../utils/orders'
import './Cart.css'
import usePageTitle from '../hooks/usePageTitle'

function Cart() {
  usePageTitle('Shopping cart')
  const {
    cartItems,
    cartCount,
    subtotal,
    savings,
    maxQuantity,
    updateQuantity,
    removeFromCart,
    clearCart
  } = useShop()
  const { user } = useAuth()
  const navigate = useNavigate()
  const titleLinks = useRef({})
  const [fixedId, setFixedId] = useState(null)

  // "Change to N" goes away once the line fits the stock, so focus moves to the line's
  // product instead of falling back to the top of the page.
  useEffect(() => {
    if (fixedId === null) return
    if (titleLinks.current[fixedId]) titleLinks.current[fixedId].focus()
    setFixedId(null)
  }, [fixedId])

  if (!cartItems.length) {
    return (
      <div className="container">
        <EmptyState
          icon={FiShoppingCart}
          title="Your cart is empty"
          headingLevel={1}
          message={
            user
              ? 'Products you add are saved to your account, so they wait for you on every device.'
              : 'Products you add stay on this device. Sign in and they follow you everywhere.'
          }
          action={
            <Link className="btn btn-primary" to="/">
              Start shopping
            </Link>
          }
        />
      </div>
    )
  }

  const delivery = subtotal >= FREE_DELIVERY_THRESHOLD ? 0 : DELIVERY_FEE
  const total = subtotal + delivery

  return (
    <div className="container cart">
      <div className="section-heading">
        <h1>Shopping cart</h1>
        <p>{pluralize(cartCount, 'item')}</p>
      </div>

      <div className="cart-layout">
        <ul className="cart-items">
          {cartItems.map((item) => {
            // Checkout would refuse the line as it is, so the shopper hears about it here
            // rather than after filling in delivery and payment.
            const overStock = item.quantity > item.stock
            return (
              <li
                key={item.id}
                className={overStock ? 'cart-item card is-unavailable' : 'cart-item card'}
              >
                <Link to={`/product/${item.id}`} className="cart-item-media">
                  <img src={item.thumbnail} alt={item.title} loading="lazy" width="96" height="96" />
                </Link>

                <div className="cart-item-info">
                  <p className="cart-item-brand">{item.brand}</p>
                  <h2 className="cart-item-title">
                    <Link
                      to={`/product/${item.id}`}
                      ref={(node) => {
                        titleLinks.current[item.id] = node
                      }}
                    >
                      {item.title}
                    </Link>
                  </h2>
                  <p className="cart-item-unit">{formatPrice(item.price)} each</p>
                </div>

                <div className="cart-item-actions">
                  <QuantityStepper
                    label={`Quantity of ${item.title}`}
                    value={item.quantity}
                    max={Math.min(item.stock, maxQuantity)}
                    onChange={(quantity) => updateQuantity(item.id, quantity)}
                  />
                  <p className="cart-item-total">{formatPrice(item.price * item.quantity)}</p>
                  <button
                    type="button"
                    className="btn btn-ghost cart-item-remove"
                    onClick={() => removeFromCart(item.id)}
                  >
                    <FiTrash2 aria-hidden="true" />
                    <span className="visually-hidden">Remove {item.title} from cart</span>
                  </button>
                </div>

                {overStock ? (
                  <div className="cart-item-issue">
                    <p>
                      {item.stock < 1
                        ? 'Sold out, so checkout cannot take it.'
                        : `Only ${item.stock} left, so checkout cannot take ${item.quantity}.`}
                    </p>
                    {item.stock >= 1 ? (
                      <button
                        type="button"
                        className="btn btn-outline"
                        onClick={() => {
                          updateQuantity(item.id, item.stock)
                          setFixedId(item.id)
                        }}
                      >
                        Change to {item.stock}
                        <span className="visually-hidden"> for {item.title}</span>
                      </button>
                    ) : null}
                    <button
                      type="button"
                      className="btn btn-ghost"
                      onClick={() => removeFromCart(item.id)}
                    >
                      Remove from cart<span className="visually-hidden">: {item.title}</span>
                    </button>
                  </div>
                ) : null}
              </li>
            )
          })}
        </ul>

        <aside className="cart-summary card" aria-label="Order summary">
          <h2>Order summary</h2>
          <dl>
            <div>
              <dt>Subtotal</dt>
              <dd>{formatPrice(subtotal)}</dd>
            </div>
            {savings > 0 ? (
              <div className="cart-summary-savings">
                <dt>Discount savings</dt>
                <dd>-{formatPrice(savings)}</dd>
              </div>
            ) : null}
            <div>
              <dt>Delivery</dt>
              <dd>{delivery === 0 ? 'Free' : formatPrice(delivery)}</dd>
            </div>
            <div className="cart-summary-total">
              <dt>Total</dt>
              <dd>{formatPrice(total)}</dd>
            </div>
          </dl>

          {delivery > 0 ? (
            <p className="cart-summary-hint">
              Add {formatPrice(FREE_DELIVERY_THRESHOLD - subtotal)} more to get free delivery.
            </p>
          ) : null}

          {user ? (
            <button
              type="button"
              className="btn btn-primary btn-block"
              onClick={() => navigate('/checkout')}
            >
              Proceed to checkout
            </button>
          ) : (
            <>
              {/* Orders belong to an account, so a guest signs in first and comes
                  straight back to the checkout with the cart merged in. */}
              <button
                type="button"
                className="btn btn-primary btn-block"
                aria-describedby="cart-sign-in-hint"
                onClick={() => navigate('/login', { state: { from: { pathname: '/checkout' } } })}
              >
                Sign in to check out
              </button>
              <p className="cart-summary-hint" id="cart-sign-in-hint">
                Checkout needs an account, so your order and its delivery updates are saved
                for you. Your cart comes with you.
              </p>
            </>
          )}
          <button type="button" className="btn btn-ghost btn-block" onClick={clearCart}>
            Clear cart
          </button>
        </aside>
      </div>
    </div>
  )
}

export default Cart
