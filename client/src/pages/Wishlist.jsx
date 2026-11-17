import { useState } from 'react'
import { Link } from 'react-router-dom'
import { FiHeart, FiShoppingCart } from 'react-icons/fi'
import { useShop } from '../context/ShopContext'
import { useCatalog } from '../context/CatalogContext'
import ProductGrid from '../components/ProductGrid/ProductGrid'
import EmptyState from '../components/EmptyState/EmptyState'
import { formatPrice, pluralize } from '../utils/format'
import './Wishlist.css'
import usePageTitle from '../hooks/usePageTitle'

function Wishlist() {
  usePageTitle('Wishlist')
  const { wishlistItems, clearWishlist, addToCart, isInCart } = useShop()
  const { status } = useCatalog()
  const [note, setNote] = useState(null)

  if (status === 'loading') {
    return (
      <div className="container">
        <ProductGrid products={[]} isLoading skeletonCount={4} />
      </div>
    )
  }

  if (!wishlistItems.length) {
    return (
      <div className="container">
        <EmptyState
          icon={FiHeart}
          title="No saved products yet"
          headingLevel={1}
          message="Tap the heart on any product to keep it here for later."
          action={
            <Link className="btn btn-primary" to="/">
              Browse products
            </Link>
          }
        />
      </div>
    )
  }

  const wishlistValue = wishlistItems.reduce((total, item) => total + item.price, 0)

  // Adds one of each saved product the cart does not have yet, and says what it left
  // out: checkout would refuse a sold out product, and a product already in the cart
  // keeps the quantity the shopper chose. The wishlist itself stays as it is.
  const addEverything = () => {
    let added = 0
    let already = 0
    let cartFull = false
    const soldOut = []

    wishlistItems.forEach((item) => {
      if (item.stock < 1) soldOut.push(item.title)
      else if (isInCart(item.id)) already += 1
      else if (addToCart(item.id)) added += 1
      else cartFull = true
    })

    const parts = []
    if (added) parts.push(`Added ${pluralize(added, 'product')} to your cart.`)
    if (already) parts.push(`${pluralize(already, 'product was', 'products were')} already in your cart.`)
    if (soldOut.length) parts.push(`Sold out: ${soldOut.join(', ')}.`)
    if (cartFull) parts.push('Your cart is full, so some products were left out.')
    setNote({ text: parts.join(' '), added })
  }

  return (
    <div className="container wishlist">
      <div className="section-heading">
        <h1>Wishlist</h1>
        <p>
          {pluralize(wishlistItems.length, 'product')} worth {formatPrice(wishlistValue)}
        </p>
      </div>

      <div className="wishlist-actions">
        <button type="button" className="btn btn-primary" onClick={addEverything}>
          Add everything to cart
        </button>
        <button type="button" className="btn btn-outline" onClick={clearWishlist}>
          Clear wishlist
        </button>
      </div>
      <p className="wishlist-note" role="status">
        {note ? note.text : ''}
        {note && note.added ? (
          <Link to="/cart">
            <FiShoppingCart aria-hidden="true" />
            Go to cart
          </Link>
        ) : null}
      </p>

      <ProductGrid products={wishlistItems} />
    </div>
  )
}

export default Wishlist
