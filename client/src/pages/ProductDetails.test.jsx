import { fireEvent, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import ProductDetails from './ProductDetails'
import { fakeApi } from '../test/fakeApi'
import { apiProduct, renderShopPage } from '../test/renderShopPage'

function productRoutes(product) {
  return {
    'GET /products': () => [200, { success: true, products: [product] }],
    'GET /products/1/price-history': () => [
      200,
      { success: true, productId: 1, currentPrice: 10, points: [], prediction: { hasEnoughData: false } }
    ],
    'GET /products/1/reviews': () => [
      200,
      {
        success: true,
        reviews: [],
        pagination: { page: 1, limit: 5, total: 0, pages: 0 },
        stats: { rating: 0, reviewCount: 0, breakdown: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } },
        myReview: null
      }
    ]
  }
}

describe('ProductDetails', () => {
  // The page scrolls to the top when it opens, which jsdom does not implement.
  beforeEach(() => vi.stubGlobal('scrollTo', vi.fn()))

  it('stops adding once the cart holds all the stock left', async () => {
    fakeApi(productRoutes(apiProduct(1, { title: 'Last Lamp', stock: 3, availabilityStatus: 'Low Stock' })))
    window.localStorage.setItem('shopsmart:cart', JSON.stringify([{ id: 1, quantity: 1 }]))
    renderShopPage(<ProductDetails />, { path: '/product/:id', url: '/product/1' })

    expect(await screen.findByText('Low Stock - 3 left, 1 in your cart')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Increase quantity' }))
    fireEvent.click(screen.getByRole('button', { name: 'Increase quantity' }))
    // Two more fit, so the stepper stops there.
    expect(screen.getByRole('button', { name: 'Increase quantity' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'Add more' }))

    expect(JSON.parse(window.localStorage.getItem('shopsmart:cart'))).toEqual([{ id: 1, quantity: 3 }])
    expect(screen.getByRole('button', { name: 'All in your cart' })).toBeDisabled()
    expect(screen.queryByRole('button', { name: 'Increase quantity' })).not.toBeInTheDocument()
  })
})
