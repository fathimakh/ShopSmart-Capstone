import { fireEvent, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import Compare from './Compare'
import { fakeApi } from '../test/fakeApi'
import { apiProduct, renderShopPage } from '../test/renderShopPage'

describe('Compare', () => {
  it('does not offer a sold out product for the cart, and names the product on each button', async () => {
    fakeApi({
      'GET /products': () => [
        200,
        {
          success: true,
          products: [
            apiProduct(1, { title: 'Sold Vase', stock: 0, availabilityStatus: 'Out of Stock' }),
            apiProduct(2, { title: 'Last Lamp', stock: 2 })
          ]
        }
      ]
    })
    window.localStorage.setItem('shopsmart:compare', JSON.stringify([1, 2]))
    renderShopPage(<Compare />, { path: '/compare' })

    expect(await screen.findByRole('button', { name: 'Sold out - Sold Vase' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'Add to cart - Last Lamp' }))

    // The button gives way to a link to the cart, which takes the focus.
    expect(screen.getByRole('link', { name: 'Go to cart - Last Lamp is in your cart' })).toHaveFocus()
    expect(JSON.parse(window.localStorage.getItem('shopsmart:cart'))).toEqual([{ id: 2, quantity: 1 }])
  })
})
