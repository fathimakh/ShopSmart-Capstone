import { memo, useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { FiCheck, FiHeart, FiShoppingCart } from 'react-icons/fi'
import StarRating from '../StarRating/StarRating'
import { useShop } from '../../context/ShopContext'
import { formatPrice } from '../../utils/format'
import './ProductCard.css'

function ProductCard({ product }) {
  const { addToCart, isInCart, isWishlisted, toggleWishlist, isCompared, isCompareFull, toggleCompare } =
    useShop()
  const inCart = isInCart(product.id)
  const wishlisted = isWishlisted(product.id)
  const compared = isCompared(product.id)
  // Checkout would refuse it, so a sold out product is not offered for the cart at all.
  const soldOut = product.stock < 1
  const cartLink = useRef(null)
  const addedHere = useRef(false)

  // Add to cart gives way to Go to cart, so focus moves to the link instead of falling
  // back to the top of the page. Only after this card's own button was pressed.
  useEffect(() => {
    if (!inCart || !addedHere.current) return
    addedHere.current = false
    cartLink.current?.focus()
  }, [inCart])

  const add = () => {
    addedHere.current = Boolean(addToCart(product.id))
  }

  return (
    <article className="product-card card">
      <Link className="product-card-media" to={`/product/${product.id}`}>
        <img src={product.thumbnail} alt={product.title} loading="lazy" width="320" height="320" />
        {product.discount >= 10 ? (
          <span className="badge badge-accent product-card-discount">{product.discount}% off</span>
        ) : null}
      </Link>

      <button
        type="button"
        className={wishlisted ? 'product-card-wish is-active' : 'product-card-wish'}
        aria-pressed={wishlisted}
        onClick={() => toggleWishlist(product.id)}
      >
        <FiHeart aria-hidden="true" />
        <span className="visually-hidden">
          {wishlisted ? 'Remove from wishlist' : 'Save to wishlist'} - {product.title}
        </span>
      </button>

      <div className="product-card-body">
        <p className="product-card-brand">{product.brand}</p>
        <h3 className="product-card-title">
          <Link to={`/product/${product.id}`}>{product.title}</Link>
        </h3>
        <div className="product-card-signals">
          <StarRating value={product.rating} size="sm" />
          {soldOut ? <span className="product-card-stock">Sold out</span> : null}
          {!soldOut && product.stock <= 10 ? (
            <span className="product-card-stock">Only {product.stock} left</span>
          ) : null}
        </div>

        <div className="product-card-footer">
          <p className="product-card-price">
            {formatPrice(product.price)}
            {product.discount >= 10 ? (
              <span className="product-card-original">{formatPrice(product.originalPrice)}</span>
            ) : null}
          </p>

          {soldOut && !inCart ? (
            <button type="button" className="btn btn-outline product-card-cart" disabled>
              Sold out
              <span className="visually-hidden"> - {product.title}</span>
            </button>
          ) : null}
          {inCart ? (
            <Link className="btn btn-outline product-card-cart" to="/cart" ref={cartLink}>
              <FiCheck aria-hidden="true" />
              Go to cart
              <span className="visually-hidden"> - {product.title} is in your cart</span>
            </Link>
          ) : null}
          {!inCart && !soldOut ? (
            <button
              type="button"
              className="btn btn-primary product-card-cart"
              onClick={add}
            >
              <FiShoppingCart aria-hidden="true" />
              Add to cart
              <span className="visually-hidden"> - {product.title}</span>
            </button>
          ) : null}

          <label className={compared ? 'product-card-compare is-active' : 'product-card-compare'}>
            <input
              type="checkbox"
              checked={compared}
              disabled={!compared && isCompareFull}
              onChange={() => toggleCompare(product.id)}
            />
            <span>
              Compare<span className="visually-hidden"> {product.title}</span>
            </span>
          </label>
        </div>
      </div>
    </article>
  )
}

export default memo(ProductCard)
