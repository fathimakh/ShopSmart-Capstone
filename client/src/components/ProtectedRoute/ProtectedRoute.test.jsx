import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { beforeEach, describe, expect, it } from 'vitest'
import { AuthProvider } from '../../context/AuthContext'
import ProtectedRoute from './ProtectedRoute'
import { setToken } from '../../services/http'
import { fakeApi, fakeToken } from '../../test/fakeApi'

const token = fakeToken(Math.floor(Date.now() / 1000) + 3600)
const shopper = { _id: '6afb790454cff2253a63b03a', name: 'Demo Shopper', email: 'demo@shopsmart.dev', role: 'customer' }

function LoginProbe() {
  const location = useLocation()
  return <p>Sign in page, back to {location.state?.from?.pathname}</p>
}

function renderAt(path) {
  return render(
    <MemoryRouter initialEntries={[path]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginProbe />} />
          <Route
            path="/account"
            element={
              <ProtectedRoute>
                <h1>Your account</h1>
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/*"
            element={
              <ProtectedRoute requiredRole="admin">
                <h1>Store admin</h1>
              </ProtectedRoute>
            }
          />
        </Routes>
      </AuthProvider>
    </MemoryRouter>
  )
}

describe('ProtectedRoute', () => {
  beforeEach(() => setToken(null))

  it('sends a guest to sign in and remembers the page', () => {
    fakeApi({})
    renderAt('/account')
    expect(screen.getByText('Sign in page, back to /account')).toBeInTheDocument()
  })

  it('waits for a stored session to be checked', async () => {
    setToken(token)
    fakeApi({ 'GET /auth/me': () => [200, { success: true, user: shopper }] })
    renderAt('/account')

    expect(screen.getByRole('status')).toHaveTextContent('Checking your sign in')
    expect(await screen.findByRole('heading', { level: 1, name: 'Your account' })).toBeInTheDocument()
  })

  it('shows a shopper the access panel instead of the admin area', async () => {
    setToken(token)
    fakeApi({ 'GET /auth/me': () => [200, { success: true, user: shopper }] })
    renderAt('/admin/products')

    expect(
      await screen.findByRole('heading', { level: 1, name: 'This page is for store admins only' })
    ).toBeInTheDocument()
    expect(screen.queryByText('Store admin')).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Back to the shop' })).toHaveAttribute('href', '/')
  })

  it('lets an admin in', async () => {
    setToken(token)
    fakeApi({ 'GET /auth/me': () => [200, { success: true, user: { ...shopper, role: 'admin' } }] })
    renderAt('/admin')

    expect(await screen.findByRole('heading', { level: 1, name: 'Store admin' })).toBeInTheDocument()
  })

  it('offers a retry when the session could not be checked', async () => {
    setToken(token)
    fakeApi({ 'GET /auth/me': () => [503, { success: false, message: 'Server is busy', code: 'SERVER_ERROR' }] })
    renderAt('/account')

    expect(
      await screen.findByRole('heading', { level: 1, name: 'We could not check your sign in' })
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument()
  })
})
