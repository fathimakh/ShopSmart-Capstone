import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { FiCheck, FiColumns, FiShoppingCart, FiX } from 'react-icons/fi'
import { useShop } from '../context/ShopContext'
import StarRating from '../components/StarRating/StarRating'
import EmptyState from '../components/EmptyState/EmptyState'
import { formatPrice } from '../utils/format'
import './Compare.css'
import usePageTitle from '../hooks/usePageTitle'

const specRows = ['SKU', 'Warranty', 'Shipping', 'Returns', 'Weight', 'Dimensions']

function Compare() {
  usePageTitle('Compare products')
  const { compareItems, compareLimit, toggleCompare, clearCompare, addToCart, isInCart } = useShop()
  const cartLinks = useRef({})
  const [addedId, setAddedId] = useState(null)

  // The Add to cart button is replaced by a Go to cart link, so focus moves to the link
  // instead of falling back to the top of the page.
  useEffect(() => {
    if (addedId === null) return
    if (cartLinks.current[addedId]) cartLinks.current[addedId].focus()
    setAddedId(null)
  }, [addedId])

  const add = (productId) => {
    if (addToCart(productId)) setAddedId(productId)
  }

  if (!compareItems.length) {
    return (
      <div className="container">
        <EmptyState
          icon={FiColumns}
          title="Nothing to compare yet"
          headingLevel={1}
          message={`Select up to ${compareLimit} products from the shop to line up their price, rating and specifications.`}
          action={
            <Link className="btn btn-primary" to="/">
              Pick products to compare
            </Link>
          }
        />
      </div>
    )
  }

  const lowestPrice = Math.min(...compareItems.map((item) => item.price))
  const highestRating = Math.max(...compareItems.map((item) => item.rating))

  return (
    <div className="container compare">
      <div className="section-heading">
        <h1>Compare products</h1>
        <button type="button" className="btn btn-ghost" onClick={clearCompare}>
          Clear all
        </button>
      </div>

      <div className="compare-scroll">
        <table className={compareItems.length < 3 ? 'compare-table is-narrow' : 'compare-table'}>
          <caption className="visually-hidden">
            Side by side comparison of the selected products
          </caption>
          <thead>
            <tr>
              <th scope="col" className="compare-label">
                Product
              </th>
              {compareItems.map((item) => (
                <th key={item.id} scope="col">
                  <div className="compare-head">
                    <button
                      type="button"
                      className="compare-remove"
                      onClick={() => toggleCompare(item.id)}
                    >
                      <FiX aria-hidden="true" />
                      <span className="visually-hidden">Remove {item.title} from comparison</span>
                    </button>
                    <Link to={`/product/${item.id}`}>
                      <img src={item.thumbnail} alt={item.title} loading="lazy" width="120" height="120" />
                      <span className="compare-title">{item.title}</span>
                    </Link>
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              <th scope="row" className="compare-label">
                Price
              </th>
              {compareItems.map((item) => (
                <td key={item.id}>
                  <span
                    className={
                      item.price === lowestPrice ? 'compare-value is-best' : 'compare-value'
                    }
                  >
                    {formatPrice(item.price)}
                  </span>
                  {item.price === lowestPrice ? (
                    <span className="badge badge-primary compare-flag">Lowest price</span>
                  ) : null}
                </td>
              ))}
            </tr>
            <tr>
              <th scope="row" className="compare-label">
                Rating
              </th>
              {compareItems.map((item) => (
                <td key={item.id}>
                  <StarRating value={item.rating} size="sm" />
                  {item.rating === highestRating ? (
                    <span className="badge badge-primary compare-flag">Best rated</span>
                  ) : null}
                </td>
              ))}
            </tr>
            <tr>
              <th scope="row" className="compare-label">
                Brand
              </th>
              {compareItems.map((item) => (
                <td key={item.id}>{item.brand}</td>
              ))}
            </tr>
            <tr>
              <th scope="row" className="compare-label">
                Category
              </th>
              {compareItems.map((item) => (
                <td key={item.id}>{item.categoryLabel}</td>
              ))}
            </tr>
            <tr>
              <th scope="row" className="compare-label">
                Discount
              </th>
              {compareItems.map((item) => (
                <td key={item.id}>{item.discount}% off</td>
              ))}
            </tr>
            <tr>
              <th scope="row" className="compare-label">
                Availability
              </th>
              {compareItems.map((item) => (
                <td key={item.id}>
                  {item.availability} ({item.stock})
                </td>
              ))}
            </tr>
            {specRows.map((row) => (
              <tr key={row}>
                <th scope="row" className="compare-label">
                  {row}
                </th>
                {compareItems.map((item) => (
                  <td key={item.id}>{item.specs[row]}</td>
                ))}
              </tr>
            ))}
            <tr>
              <th scope="row" className="compare-label">
                Action
              </th>
              {compareItems.map((item) => (
                <td key={item.id}>
                  {isInCart(item.id) ? (
                    <Link
                      className="btn btn-outline compare-cart"
                      to="/cart"
                      ref={(node) => {
                        cartLinks.current[item.id] = node
                      }}
                    >
                      <FiCheck aria-hidden="true" />
                      Go to cart
                      <span className="visually-hidden"> - {item.title} is in your cart</span>
                    </Link>
                  ) : null}
                  {/* Checkout would refuse it, so a sold out product is not offered for the cart. */}
                  {!isInCart(item.id) && item.stock < 1 ? (
                    <button type="button" className="btn btn-outline compare-cart" disabled>
                      Sold out
                      <span className="visually-hidden"> - {item.title}</span>
                    </button>
                  ) : null}
                  {!isInCart(item.id) && item.stock >= 1 ? (
                    <button
                      type="button"
                      className="btn btn-primary compare-cart"
                      onClick={() => add(item.id)}
                    >
                      <FiShoppingCart aria-hidden="true" />
                      Add to cart
                      <span className="visually-hidden"> - {item.title}</span>
                    </button>
                  ) : null}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default Compare
