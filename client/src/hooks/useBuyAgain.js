import { useCallback, useState } from 'react'
import { useCatalog } from '../context/CatalogContext'
import { useShop } from '../context/ShopContext'
import { buyAgainLines } from '../utils/orders'
import { pluralize } from '../utils/format'

/**
 * Puts an order's products back in the cart and says what happened, because a product
 * may have sold out or left the catalogue since the order was placed. The result is
 * { orderNumber, text, added } so the page can show it next to the right order.
 */
export default function useBuyAgain() {
  const { products, status } = useCatalog()
  const { addToCart } = useShop()
  const [result, setResult] = useState(null)

  const buyAgain = useCallback(
    (order) => {
      const { available, unavailable } = buyAgainLines(order, status === 'ready' ? products : null)
      let added = 0
      let cartFull = false

      available.forEach((line) => {
        if (addToCart(line.id, line.quantity)) added += line.quantity
        else cartFull = true
      })

      const parts = []
      if (added) parts.push(`Added ${pluralize(added, 'item')} to your cart.`)
      if (unavailable.length) parts.push(`No longer available: ${unavailable.join(', ')}.`)
      if (cartFull) parts.push('Your cart is full, so some products were left out.')
      if (!parts.length) parts.push('None of these products can be bought right now.')

      setResult({ orderNumber: order.number, text: parts.join(' '), added })
    },
    [products, status, addToCart]
  )

  return { buyAgain, result }
}
