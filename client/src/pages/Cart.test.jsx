import { fireEvent, screen } from '@testing-library/react'
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
})
