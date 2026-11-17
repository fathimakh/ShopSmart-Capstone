import { fireEvent, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import Cart from './Cart'
import { fakeApi } from '../test/fakeApi'
import { apiProduct, renderShopPage } from '../test/renderShopPage'

describe('Cart', () => {
  it('asks a guest to sign in before checking out and brings them back to checkout', async () => {
    fakeApi({ 'GET /products': () => [200, { success: true, products: [apiProduct(1)] }] })
    window.localStorage.setItem('shopsmart:cart', JSON.stringify([{ id: 1, quantity: 2 }]))
    renderShopPage(<Cart />, { path: '/cart' })

    const button = await screen.findByRole('button', { name: 'Sign in to check out' })
    expect(button).toHaveAccessibleDescription(/Checkout needs an account/)
    expect(screen.queryByRole('button', { name: 'Proceed to checkout' })).not.toBeInTheDocument()

    fireEvent.click(button)
    const location = screen.getByTestId('location')
    expect(location).toHaveTextContent('/login')
    expect(JSON.parse(location.dataset.state)).toEqual({ from: { pathname: '/checkout' } })
  })

  it('flags a line the stock no longer covers before checkout does', async () => {
    fakeApi({
      'GET /products': () => [
        200,
        {
          success: true,
          products: [
            apiProduct(1, { title: 'Sold Vase', stock: 0, availabilityStatus: 'Out of Stock' }),
            apiProduct(2, { title: 'Last Lamp', stock: 2, availabilityStatus: 'Low Stock' })
          ]
        }
      ]
    })
    window.localStorage.setItem(
      'shopsmart:cart',
      JSON.stringify([
        { id: 1, quantity: 1 },
        { id: 2, quantity: 5 }
      ])
    )
    renderShopPage(<Cart />, { path: '/cart' })

    expect(await screen.findByText('Sold out, so checkout cannot take it.')).toBeInTheDocument()
    expect(screen.getByText('Only 2 left, so checkout cannot take 5.')).toBeInTheDocument()

    // Each line's controls carry its product's name.
    expect(screen.getByRole('button', { name: 'Increase quantity of Last Lamp' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Decrease quantity of Sold Vase' })).toBeDisabled()

    fireEvent.click(screen.getByRole('button', { name: 'Change to 2 for Last Lamp' }))
    expect(screen.queryByText(/Only 2 left/)).not.toBeInTheDocument()
    expect(within(screen.getByRole('heading', { name: 'Last Lamp' })).getByRole('link')).toHaveFocus()

    fireEvent.click(screen.getByRole('button', { name: /^Remove from cart.*Sold Vase$/ }))
    expect(JSON.parse(window.localStorage.getItem('shopsmart:cart'))).toEqual([{ id: 2, quantity: 2 }])
  })
})
