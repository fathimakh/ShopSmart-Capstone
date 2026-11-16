import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import useAdminMutation from './useAdminMutation'
import { AdminToastContext } from './useAdminToast'
import { ApiError } from '../services/http'

function renderWithToasts() {
  const notify = vi.fn()
  const wrapper = ({ children }) => (
    <AdminToastContext.Provider value={notify}>{children}</AdminToastContext.Provider>
  )
  return { notify, ...renderHook(() => useAdminMutation(), { wrapper }) }
}

describe('useAdminMutation', () => {
  it('resolves with the answer and announces the success message', async () => {
    const { result, notify } = renderWithToasts()

    let outcome
    await act(async () => {
      outcome = await result.current.run('save', async () => ({ product: { title: 'Teapot' } }), {
        successMessage: (body) => `${body.product.title} saved`
      })
    })

    expect(outcome).toEqual({ ok: true, data: { product: { title: 'Teapot' } }, error: null })
    expect(notify).toHaveBeenCalledWith('Teapot saved')
    expect(result.current.isPending).toBe(false)
  })

  it('never throws, and keeps the failure with the key of the action that failed', async () => {
    const { result, notify } = renderWithToasts()
    const failure = new ApiError({ message: 'You cannot delete your own account.', status: 409, code: 'SELF_DELETE' })

    let outcome
    await act(async () => {
      outcome = await result.current.run('delete:abc', () => Promise.reject(failure), {
        successMessage: 'Deleted'
      })
    })

    expect(outcome.ok).toBe(false)
    expect(outcome.error).toBe(failure)
    expect(result.current.error).toBe(failure)
    expect(result.current.errorKey).toBe('delete:abc')
    expect(notify).not.toHaveBeenCalled()

    act(() => result.current.resetError())
    expect(result.current.error).toBeNull()
  })

  it('shows which change is running and refuses a second one meanwhile', async () => {
    const { result } = renderWithToasts()
    let finish
    const request = vi.fn(
      () =>
        new Promise((resolve) => {
          finish = resolve
        })
    )

    let first
    act(() => {
      first = result.current.run('status:SS100001', request)
    })
    expect(result.current.pendingKey).toBe('status:SS100001')
    expect(result.current.isPending).toBe(true)

    let second
    await act(async () => {
      second = await result.current.run('status:SS100001', request)
    })
    expect(second.skipped).toBe(true)
    expect(request).toHaveBeenCalledTimes(1)

    await act(async () => {
      finish({ order: {} })
      await first
    })
    expect(result.current.pendingKey).toBeNull()
  })
})
