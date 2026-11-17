import { fireEvent, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import Login from './Login'
import { setToken } from '../services/http'
import { fakeApi } from '../test/fakeApi'
import { renderShopPage } from '../test/renderShopPage'

describe('Login', () => {
  beforeEach(() => setToken(null))

  it('keeps focus on the sign in button while it waits and after a refused password', async () => {
    let refuse
    fakeApi({
      'GET /products': () => [200, { success: true, products: [] }],
      'POST /auth/login': () =>
        new Promise((resolve) => {
          refuse = () =>
            resolve([401, { success: false, message: 'Wrong email or password.', code: 'INVALID_CREDENTIALS' }])
        })
    })
    renderShopPage(<Login />, { path: '/login' })

    fireEvent.change(screen.getByLabelText('Email address'), { target: { value: 'demo@shopsmart.dev' } })
    fireEvent.change(screen.getByLabelText('Password', { selector: 'input' }), { target: { value: 'Wrong@1234' } })
    const button = screen.getByRole('button', { name: 'Sign in' })
    button.focus()
    fireEvent.click(button)

    // Busy, but not disabled: a disabled button would drop focus to the page.
    const busy = await screen.findByRole('button', { name: 'Signing in' })
    expect(busy).toHaveAttribute('aria-disabled', 'true')
    expect(busy).toBeEnabled()
    expect(busy).toHaveFocus()

    refuse()
    expect(await screen.findByRole('alert')).toHaveTextContent('Wrong email or password.')
    expect(screen.getByRole('button', { name: 'Sign in' })).toHaveFocus()
  })
})
