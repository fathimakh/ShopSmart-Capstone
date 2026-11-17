import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthProvider, useAuth } from './AuthContext'
import { TOKEN_KEY, api, getToken, setToken } from '../services/http'
import { fakeApi, fakeToken, jsonResponse } from '../test/fakeApi'

const shopper = {
  _id: '6afb790454cff2253a63b03a',
  name: 'Demo Shopper',
  email: 'demo@shopsmart.dev',
  role: 'customer',
  address: { name: '', phone: '', address: '', city: '', state: '', pincode: '' }
}

// Far enough ahead that the expiry timer never fires during a test.
const validToken = fakeToken(Math.floor(Date.now() / 1000) + 3600)
const renderAuth = () => renderHook(() => useAuth(), { wrapper: AuthProvider })

describe('AuthContext', () => {
  beforeEach(() => setToken(null))

  it('starts signed out and initialised when no token is stored', () => {
    const { fetchMock } = fakeApi({})
    const { result } = renderAuth()

    expect(result.current.status).toBe('signed-out')
    expect(result.current.initialized).toBe(true)
    expect(result.current.user).toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('restores a stored session through GET /auth/me', async () => {
    setToken(validToken)
    const { calls } = fakeApi({ 'GET /auth/me': () => [200, { success: true, user: shopper }] })
    const { result } = renderAuth()

    expect(result.current.status).toBe('checking')
    expect(result.current.initialized).toBe(false)
    await waitFor(() => expect(result.current.status).toBe('signed-in'))
    expect(result.current.user.email).toBe('demo@shopsmart.dev')
    expect(result.current.isAdmin).toBe(false)
    expect(calls[0].headers.Authorization).toBe(`Bearer ${validToken}`)
  })

  it('drops a stored token the server rejects and says why', async () => {
    setToken(validToken)
    fakeApi({
      'GET /auth/me': () => [
        401,
        { success: false, message: 'This session was signed out. Please sign in again.', code: 'TOKEN_REVOKED' }
      ]
    })
    const { result } = renderAuth()

    await waitFor(() => expect(result.current.status).toBe('signed-out'))
    expect(result.current.sessionNotice).toBe('This session was signed out. Please sign in again.')
    expect(window.localStorage.getItem(TOKEN_KEY)).toBeNull()
  })

  it('keeps the token when the server cannot be reached, and retries on request', async () => {
    setToken(validToken)
    let reachable = false
    fakeApi({
      'GET /auth/me': () =>
        reachable ? [200, { success: true, user: shopper }] : [503, { success: false, message: 'Down', code: 'SERVER_ERROR' }]
    })
    const { result } = renderAuth()

    await waitFor(() => expect(result.current.status).toBe('error'))
    expect(getToken()).toBe(validToken)
    expect(result.current.restoreError.message).toBe('Down')

    reachable = true
    act(() => result.current.retrySession())
    await waitFor(() => expect(result.current.status).toBe('signed-in'))
  })

  it('waits up to a minute for a sleeping server before giving up on a stored session', async () => {
    setToken(validToken)
    let answer
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (url, init) =>
          new Promise((resolve, reject) => {
            answer = resolve
            init.signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))
          })
      )
    )
    vi.useFakeTimers()
    try {
      const { result } = renderAuth()
      // Longer than an ordinary request waits, as long as a free server takes to wake.
      await act(() => vi.advanceTimersByTimeAsync(45000))
      expect(result.current.status).toBe('checking')

      await act(async () => answer(jsonResponse(200, { success: true, user: shopper })))
      expect(result.current.status).toBe('signed-in')
    } finally {
      vi.useRealTimers()
    }
  })

  it('checks the stored session again when the connection comes back', async () => {
    setToken(validToken)
    let reachable = false
    fakeApi({
      'GET /auth/me': () =>
        reachable ? [200, { success: true, user: shopper }] : [503, { success: false, message: 'Down', code: 'SERVER_ERROR' }]
    })
    const { result } = renderAuth()
    await waitFor(() => expect(result.current.status).toBe('error'))

    reachable = true
    act(() => {
      window.dispatchEvent(new Event('online'))
    })
    await waitFor(() => expect(result.current.status).toBe('signed-in'))
  })

  it('ends a token that has already expired without asking the server', async () => {
    setToken(fakeToken(Math.floor(Date.now() / 1000) - 60))
    fakeApi({ 'GET /auth/me': () => [200, { success: true, user: shopper }] })
    const { result } = renderAuth()

    await waitFor(() => expect(result.current.status).toBe('signed-out'))
    expect(result.current.sessionNotice).toBe('Your session has expired. Please sign in again.')
  })

  it('signs in, stores the token and keeps it off the sign in request', async () => {
    const { calls } = fakeApi({
      'POST /auth/login': () => [200, { success: true, token: validToken, user: shopper }]
    })
    const { result } = renderAuth()

    await act(() => result.current.login({ email: 'demo@shopsmart.dev', password: 'Demo@1234' }))

    expect(result.current.status).toBe('signed-in')
    expect(result.current.user.name).toBe('Demo Shopper')
    expect(window.localStorage.getItem(TOKEN_KEY)).toBe(validToken)
    expect(calls[0].body).toEqual({ email: 'demo@shopsmart.dev', password: 'Demo@1234' })
    expect(calls[0].headers.Authorization).toBeUndefined()
  })

  it('passes sign in errors back to the form', async () => {
    fakeApi({
      'POST /auth/login': () => [
        401,
        { success: false, message: 'The email or password is not right.', code: 'INVALID_CREDENTIALS' }
      ]
    })
    const { result } = renderAuth()

    await expect(result.current.login({ email: 'a@b.co', password: 'nope' })).rejects.toMatchObject({
      code: 'INVALID_CREDENTIALS'
    })
    expect(result.current.status).toBe('signed-out')
    expect(result.current.sessionNotice).toBeNull()
  })

  it('registers a new account and signs it in', async () => {
    fakeApi({
      'POST /auth/register': ({ body }) => [
        201,
        { success: true, token: validToken, user: { ...shopper, name: body.name, email: body.email } }
      ]
    })
    const { result } = renderAuth()

    await act(() => result.current.register({ name: 'Meera Das', email: 'meera@example.com', password: 'Shopping1' }))

    expect(result.current.user.email).toBe('meera@example.com')
    expect(getToken()).toBe(validToken)
  })

  it('runs sign out tasks, tells the server and forgets the session', async () => {
    setToken(validToken)
    const { callsTo } = fakeApi({
      'GET /auth/me': () => [200, { success: true, user: shopper }],
      'POST /auth/logout': () => [200, { success: true, message: 'Signed out' }]
    })
    const { result } = renderAuth()
    await waitFor(() => expect(result.current.status).toBe('signed-in'))

    const task = vi.fn().mockResolvedValue()
    act(() => {
      result.current.registerSignOutTask(task)
    })
    await act(() => result.current.logout())

    expect(task).toHaveBeenCalledTimes(1)
    expect(callsTo('POST /auth/logout')[0].headers.Authorization).toBe(`Bearer ${validToken}`)
    expect(result.current.status).toBe('signed-out')
    expect(result.current.sessionNotice).toBeNull()
    expect(getToken()).toBeNull()
  })

  it('keeps the session when signing out of every device fails', async () => {
    setToken(validToken)
    fakeApi({
      'GET /auth/me': () => [200, { success: true, user: shopper }],
      'POST /auth/logout': () => [500, { success: false, message: 'Something broke', code: 'SERVER_ERROR' }]
    })
    const { result } = renderAuth()
    await waitFor(() => expect(result.current.status).toBe('signed-in'))

    await act(() => expect(result.current.logout({ allDevices: true })).rejects.toMatchObject({ status: 500 }))

    expect(result.current.status).toBe('signed-in')
    expect(getToken()).toBe(validToken)
  })

  it('sends allDevices when signing out everywhere', async () => {
    setToken(validToken)
    const { callsTo } = fakeApi({
      'GET /auth/me': () => [200, { success: true, user: shopper }],
      'POST /auth/logout': () => [200, { success: true, message: 'Signed out on every device' }]
    })
    const { result } = renderAuth()
    await waitFor(() => expect(result.current.status).toBe('signed-in'))

    await act(() => result.current.logout({ allDevices: true }))

    expect(callsTo('POST /auth/logout')[0].body).toEqual({ allDevices: true })
    expect(result.current.status).toBe('signed-out')
  })

  it('stores the new token a password change returns', async () => {
    setToken(validToken)
    const newToken = fakeToken(Math.floor(Date.now() / 1000) + 7200)
    fakeApi({
      'GET /auth/me': () => [200, { success: true, user: shopper }],
      'PATCH /auth/password': () => [200, { success: true, message: 'Password changed', token: newToken }]
    })
    const { result } = renderAuth()
    await waitFor(() => expect(result.current.status).toBe('signed-in'))

    let message
    await act(async () => {
      message = await result.current.changePassword({ currentPassword: 'Demo@1234', newPassword: 'Shopping2' })
    })

    expect(message).toBe('Password changed')
    expect(getToken()).toBe(newToken)
    expect(result.current.token).toBe(newToken)
    expect(result.current.status).toBe('signed-in')
  })

  it('updates the profile from the server answer', async () => {
    setToken(validToken)
    const { callsTo } = fakeApi({
      'GET /auth/me': () => [200, { success: true, user: shopper }],
      'PATCH /auth/me': ({ body }) => [200, { success: true, user: { ...shopper, name: body.name } }]
    })
    const { result } = renderAuth()
    await waitFor(() => expect(result.current.status).toBe('signed-in'))

    await act(() => result.current.updateProfile({ name: 'Asha N', address: { city: 'Kochi' } }))

    expect(callsTo('PATCH /auth/me')[0].body).toEqual({ name: 'Asha N', address: { city: 'Kochi' } })
    expect(result.current.user.name).toBe('Asha N')
  })

  it('ends the session when any request finds the token dead', async () => {
    setToken(validToken)
    fakeApi({
      'GET /auth/me': () => [200, { success: true, user: shopper }],
      'GET /lists': () => [
        401,
        { success: false, message: 'Your session has expired. Please sign in again.', code: 'TOKEN_EXPIRED' }
      ]
    })
    const { result } = renderAuth()
    await waitFor(() => expect(result.current.status).toBe('signed-in'))

    await act(() => api.get('/lists').catch(() => {}))

    expect(result.current.status).toBe('signed-out')
    expect(result.current.sessionNotice).toBe('Your session has expired. Please sign in again.')
  })

  it('follows a sign out made in another tab', async () => {
    setToken(validToken)
    fakeApi({ 'GET /auth/me': () => [200, { success: true, user: shopper }] })
    const { result } = renderAuth()
    await waitFor(() => expect(result.current.status).toBe('signed-in'))

    act(() => {
      window.localStorage.removeItem(TOKEN_KEY)
      window.dispatchEvent(new StorageEvent('storage', { key: TOKEN_KEY, oldValue: validToken, newValue: null }))
    })

    expect(result.current.status).toBe('signed-out')
    expect(result.current.sessionNotice).toBe('You were signed out in another tab.')
  })

  it('follows a sign in made in another tab', async () => {
    fakeApi({ 'GET /auth/me': () => [200, { success: true, user: shopper }] })
    const { result } = renderAuth()
    expect(result.current.status).toBe('signed-out')

    act(() => {
      window.localStorage.setItem(TOKEN_KEY, validToken)
      window.dispatchEvent(new StorageEvent('storage', { key: TOKEN_KEY, oldValue: null, newValue: validToken }))
    })

    await waitFor(() => expect(result.current.status).toBe('signed-in'))
    expect(getToken()).toBe(validToken)
  })
})
