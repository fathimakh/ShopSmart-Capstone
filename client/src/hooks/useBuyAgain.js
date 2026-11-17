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
  const { addToCart, isInCart } = useShop()
  const [result, setResult] = useState(null)

  const buyAgain = useCallback(
    (order) => {
      const { available, unavailable } = buyAgainLines(order, status === 'ready' ? products : null)
      let added = 0
      let cartFull = false
      const atStock = []

      available.forEach((line) => {
        const units = addToCart(line.id, line.quantity)
        added += units
        if (units >= line.quantity) return
        // A product already in the cart stops at the stock left; a new one only misses out
        // when the cart is full.
        if (isInCart(line.id)) atStock.push(order.items.find((item) => item.id === line.id).title)
        else cartFull = true
      })

      const parts = []
      if (added) parts.push(`Added ${pluralize(added, 'item')} to your cart.`)
      if (unavailable.length) parts.push(`No longer available: ${unavailable.join(', ')}.`)
      if (atStock.length) parts.push(`Your cart already holds all the stock of ${atStock.join(', ')}.`)
      if (cartFull) parts.push('Your cart is full, so some products were left out.')
      if (!parts.length) parts.push('None of these products can be bought right now.')

      setResult({ orderNumber: order.number, text: parts.join(' '), added })
    },
    [products, status, addToCart, isInCart]
  )

  return { buyAgain, result }
}
