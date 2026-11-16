import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  ApiError,
  TOKEN_KEY,
  api,
  getFieldErrors,
  getToken,
  onSessionEnd,
  request,
  setToken
} from './http'
import { fakeApi, jsonResponse } from '../test/fakeApi'

describe('http wrapper', () => {
  beforeEach(() => setToken(null))
  afterEach(() => vi.useRealTimers())

  it('calls the API under /api and resolves with the body', async () => {
    const { calls } = fakeApi({
      'GET /products': () => [200, { success: true, products: [{ id: 1 }] }]
    })

    const data = await api.get('/products?limit=0')

    expect(data.products).toEqual([{ id: 1 }])
    expect(calls[0].url).toBe('/api/products?limit=0')
    expect(calls[0].headers.Authorization).toBeUndefined()
  })

  it('sends the stored token as a Bearer header and JSON bodies', async () => {
    setToken('abc.def.ghi')
    const { calls } = fakeApi({ 'PUT /lists/cart': () => [200, { success: true, cart: [] }] })

    await api.put('/lists/cart', { items: [] })

    expect(calls[0].headers.Authorization).toBe('Bearer abc.def.ghi')
    expect(calls[0].headers['Content-Type']).toBe('application/json')
    expect(calls[0].body).toEqual({ items: [] })
    expect(window.localStorage.getItem(TOKEN_KEY)).toBe('abc.def.ghi')
  })

  it('leaves the token off when auth is false', async () => {
    setToken('abc.def.ghi')
    const { calls } = fakeApi({ 'POST /auth/login': () => [200, { success: true }] })

    await api.post('/auth/login', { email: 'a@b.co', password: 'x' }, { auth: false })

    expect(calls[0].headers.Authorization).toBeUndefined()
  })

  it('turns the error envelope into an ApiError with status, code, fields and details', async () => {
    fakeApi({
      'POST /orders': () => [
        400,
        {
          success: false,
          message: 'Please check the highlighted fields',
          code: 'VALIDATION_ERROR',
          errors: [
            { field: 'delivery.phone', message: 'Enter a 10 digit phone number' },
            { field: 'items[0].quantity', message: 'Quantity must be at most 99' }
          ],
          details: { hint: true }
        }
      ]
    })

    const error = await api.post('/orders', {}).catch((caught) => caught)

    expect(error).toBeInstanceOf(ApiError)
    expect(error.status).toBe(400)
    expect(error.code).toBe('VALIDATION_ERROR')
    expect(error.message).toBe('Please check the highlighted fields')
    expect(error.fieldErrors).toEqual({
      'delivery.phone': 'Enter a 10 digit phone number',
      'items[0].quantity': 'Quantity must be at most 99'
    })
    expect(error.details).toEqual({ hint: true })
    expect(getFieldErrors(error)).toEqual({
      phone: 'Enter a 10 digit phone number',
      quantity: 'Quantity must be at most 99'
    })
  })

  it('reports a network failure with a friendly message', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))

    const error = await api.get('/health').catch((caught) => caught)

    expect(error.code).toBe('NETWORK_ERROR')
    expect(error.status).toBe(0)
    expect(error.message).toMatch(/could not reach/)
  })

  it('gives up after the timeout', async () => {
    vi.useFakeTimers()
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (url, init) =>
          new Promise((resolve, reject) => {
            init.signal.addEventListener('abort', () =>
              reject(new DOMException('Aborted', 'AbortError'))
            )
          })
      )
    )

    const pending = request('/health', { timeout: 1000 }).catch((caught) => caught)
    await vi.advanceTimersByTimeAsync(1000)
    const error = await pending

    expect(error.code).toBe('TIMEOUT')
  })

  it('hands back a plain abort when the caller cancels', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (url, init) =>
          new Promise((resolve, reject) => {
            init.signal.addEventListener('abort', () =>
              reject(new DOMException('Aborted', 'AbortError'))
            )
          })
      )
    )
    const controller = new AbortController()

    const pending = request('/health', { signal: controller.signal }).catch((caught) => caught)
    controller.abort()
    const error = await pending

    expect(error.name).toBe('AbortError')
  })

  it('treats an HTML answer as a bad response instead of crashing', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response('<!doctype html>', { status: 200, headers: { 'Content-Type': 'text/html' } })
      )
    )

    const error = await api.get('/products').catch((caught) => caught)

    expect(error.code).toBe('BAD_RESPONSE')
  })

  describe('session end', () => {
    it('is announced for a 401 session code on a request that carried the current token', async () => {
      setToken('current.token.here')
      const listener = vi.fn()
      const stop = onSessionEnd(listener)
      fakeApi({
        'GET /lists': () => [
          401,
          { success: false, message: 'Your session has expired. Please sign in again.', code: 'TOKEN_EXPIRED' }
        ]
      })

      await api.get('/lists').catch(() => {})
      stop()

      expect(listener).toHaveBeenCalledWith({
        code: 'TOKEN_EXPIRED',
        message: 'Your session has expired. Please sign in again.',
        status: 401
      })
    })

    it.each(['TOKEN_INVALID', 'TOKEN_REVOKED', 'USER_NOT_FOUND', 'NO_TOKEN'])(
      'is announced for %s',
      async (code) => {
        setToken('current.token.here')
        const listener = vi.fn()
        const stop = onSessionEnd(listener)
        fakeApi({ 'GET /auth/me': () => [401, { success: false, message: 'Ended', code }] })

        await api.get('/auth/me').catch(() => {})
        stop()

        expect(listener).toHaveBeenCalledTimes(1)
      }
    )

    it('is not announced for NO_TOKEN when no token was sent', async () => {
      const listener = vi.fn()
      const stop = onSessionEnd(listener)
      fakeApi({ 'GET /lists': () => [401, { success: false, message: 'Sign in', code: 'NO_TOKEN' }] })

      await api.get('/lists').catch(() => {})
      stop()

      expect(listener).not.toHaveBeenCalled()
    })

    it('is not announced for a wrong password', async () => {
      setToken('current.token.here')
      const listener = vi.fn()
      const stop = onSessionEnd(listener)
      fakeApi({
        'PATCH /auth/password': () => [
          401,
          { success: false, message: 'The email or password is not right.', code: 'INVALID_CREDENTIALS' }
        ]
      })

      await api.patch('/auth/password', {}).catch(() => {})
      stop()

      expect(listener).not.toHaveBeenCalled()
    })

    it('ignores a late answer for a token that has since been replaced', async () => {
      setToken('old.token.value')
      const listener = vi.fn()
      const stop = onSessionEnd(listener)
      let answer
      vi.stubGlobal(
        'fetch',
        vi.fn(
          () =>
            new Promise((resolve) => {
              answer = resolve
            })
        )
      )

      const pending = api.get('/lists').catch(() => {})
      setToken('new.token.value')
      answer(jsonResponse(401, { success: false, message: 'Signed out', code: 'TOKEN_REVOKED' }))
      await pending
      stop()

      expect(listener).not.toHaveBeenCalled()
      expect(getToken()).toBe('new.token.value')
    })
  })
})
