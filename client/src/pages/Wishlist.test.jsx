import { fireEvent, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import Wishlist from './Wishlist'
import { fakeApi } from '../test/fakeApi'
import { apiProduct, renderShopPage } from '../test/renderShopPage'

describe('Wishlist', () => {
  it('adds what can be bought to the cart and says what it left out', async () => {
    fakeApi({
      'GET /products': () => [
        200,
        {
          success: true,
          products: [
            apiProduct(1, { title: 'Sold Vase', stock: 0, availabilityStatus: 'Out of Stock' }),
            apiProduct(2, { title: 'Desk Lamp' }),
            apiProduct(3, { title: 'Tea Cup' })
          ]
        }
      ]
    })
    window.localStorage.setItem('shopsmart:wishlist', JSON.stringify([1, 2, 3]))
    window.localStorage.setItem('shopsmart:cart', JSON.stringify([{ id: 2, quantity: 2 }]))
    renderShopPage(<Wishlist />, { path: '/wishlist' })

    fireEvent.click(await screen.findByRole('button', { name: 'Add everything to cart' }))
    // An h2 sits between the page's h1 and the cards' h3 titles.
    expect(screen.getByRole('heading', { level: 2, name: 'Saved products' })).toBeInTheDocument()

    expect(
      screen.getByText('Added 1 product to your cart. 1 product was already in your cart. Sold out: Sold Vase.')
    ).toHaveAttribute('role', 'status')
    expect(JSON.parse(window.localStorage.getItem('shopsmart:cart'))).toEqual([
      { id: 2, quantity: 2 },
      { id: 3, quantity: 1 }
    ])
    // Nothing is taken off the wishlist, as the button says.
    expect(JSON.parse(window.localStorage.getItem('shopsmart:wishlist'))).toEqual([1, 2, 3])
  })
})
