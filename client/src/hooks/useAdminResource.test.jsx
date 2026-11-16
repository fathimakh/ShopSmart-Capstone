import { act, renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import useAdminResource from './useAdminResource'
import { fakeApi } from '../test/fakeApi'

// Answers that can be released one at a time, to put a slow request behind a fast one.
function deferred() {
  let resolve
  const promise = new Promise((done) => {
    resolve = done
  })
  return { promise, resolve }
}

describe('useAdminResource', () => {
  it('loads the resource with its filters and reports success', async () => {
    const { calls } = fakeApi({
      'GET /orders': () => [200, { success: true, orders: [{ number: 'SS100001' }] }]
    })

    const { result } = renderHook(() =>
      useAdminResource('/orders', { params: { status: 'shipped', q: '', page: 1 } })
    )

    expect(result.current.status).toBe('loading')
    await waitFor(() => expect(result.current.status).toBe('success'))
    expect(result.current.data.orders).toEqual([{ number: 'SS100001' }])
    expect(calls[0].url).toBe('/api/orders?status=shipped&page=1')
  })

  it('keeps the last answer on screen while the next page loads', async () => {
    const second = deferred()
    fakeApi({
      'GET /products': ({ url }) =>
        url.includes('page=2') ? second.promise : [200, { success: true, products: [{ id: 1 }] }]
    })

    const { result, rerender } = renderHook(({ page }) => useAdminResource('/products', { params: { page } }), {
      initialProps: { page: 1 }
    })
    await waitFor(() => expect(result.current.status).toBe('success'))

    rerender({ page: 2 })
    expect(result.current.status).toBe('loading')
    expect(result.current.isRefreshing).toBe(true)
    expect(result.current.data.products).toEqual([{ id: 1 }])

    await act(async () => second.resolve([200, { success: true, products: [{ id: 21 }] }]))
    await waitFor(() => expect(result.current.data.products).toEqual([{ id: 21 }]))
    expect(result.current.isRefreshing).toBe(false)
  })

  it('never lets a slow earlier answer replace a later one', async () => {
    const slow = deferred()
    fakeApi({
      'GET /users': ({ url }) =>
        url.includes('q=old') ? slow.promise : [200, { success: true, users: [{ name: 'New' }] }]
    })

    const { result, rerender } = renderHook(({ q }) => useAdminResource('/users', { params: { q } }), {
      initialProps: { q: 'old' }
    })
    rerender({ q: 'new' })
    await waitFor(() => expect(result.current.status).toBe('success'))

    await act(async () => slow.resolve([200, { success: true, users: [{ name: 'Old' }] }]))
    expect(result.current.data.users).toEqual([{ name: 'New' }])
  })

  it('reports a failure and loads again on reload', async () => {
    let attempts = 0
    fakeApi({
      'GET /admin/summary': () => {
        attempts += 1
        return attempts === 1
          ? [500, { success: false, message: 'Something went wrong on our side.', code: 'SERVER_ERROR' }]
          : [200, { success: true, totals: { users: 2 } }]
      }
    })

    const { result } = renderHook(() => useAdminResource('/admin/summary'))
    await waitFor(() => expect(result.current.status).toBe('error'))
    expect(result.current.error.code).toBe('SERVER_ERROR')
    expect(result.current.data).toBeUndefined()

    act(() => result.current.reload())
    expect(result.current.status).toBe('loading')
    await waitFor(() => expect(result.current.status).toBe('success'))
    expect(result.current.data.totals.users).toBe(2)
    expect(result.current.error).toBeNull()
  })

  it('does not show one record while another loads when asked not to', async () => {
    const second = deferred()
    fakeApi({
      'GET /orders/SS100001': () => [200, { success: true, order: { number: 'SS100001' } }],
      'GET /orders/SS100002': () => second.promise
    })

    const { result, rerender } = renderHook(
      ({ ref }) => useAdminResource(`/orders/${ref}`, { keepPreviousData: false }),
      { initialProps: { ref: 'SS100001' } }
    )
    await waitFor(() => expect(result.current.status).toBe('success'))

    rerender({ ref: 'SS100002' })
    expect(result.current.data).toBeUndefined()
    await act(async () => second.resolve([200, { success: true, order: { number: 'SS100002' } }]))
    await waitFor(() => expect(result.current.data.order.number).toBe('SS100002'))
  })

  it('patches the stored answer without asking again, and waits while disabled', async () => {
    const { calls } = fakeApi({
      'GET /orders/SS100001': () => [200, { success: true, order: { status: 'processing' } }]
    })

    const { result, rerender } = renderHook(({ path }) => useAdminResource(path), {
      initialProps: { path: null }
    })
    expect(result.current.status).toBe('idle')
    expect(calls).toHaveLength(0)

    rerender({ path: '/orders/SS100001' })
    await waitFor(() => expect(result.current.status).toBe('success'))

    act(() => result.current.setData((current) => ({ ...current, order: { status: 'shipped' } })))
    expect(result.current.data.order.status).toBe('shipped')
    expect(calls).toHaveLength(1)
  })
})
