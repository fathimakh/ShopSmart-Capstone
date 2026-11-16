import { describe, expect, it } from 'vitest'
import { buildQuery, deleteUser, updateOrderStatus, updateProduct, updateUserRole } from './adminApi'
import { fakeApi } from '../test/fakeApi'

describe('admin API calls', () => {
  it('leaves empty filters out of the query string', () => {
    expect(buildQuery({ q: '', status: 'shipped', page: 2, role: null, limit: undefined })).toBe(
      '?status=shipped&page=2'
    )
    expect(buildQuery({ q: '' })).toBe('')
    expect(buildQuery({ stockBelow: 0 })).toBe('?stockBelow=0')
  })

  it('sends a status change with its note only when there is one', async () => {
    const { calls } = fakeApi({
      'PATCH /orders/SS100001/status': () => [200, { success: true, order: { number: 'SS100001' } }]
    })

    await updateOrderStatus('SS100001', { status: 'shipped', note: '' })
    await updateOrderStatus('SS100001', { status: 'cancelled', note: 'Asked by phone' })

    expect(calls[0].body).toEqual({ status: 'shipped' })
    expect(calls[1].body).toEqual({ status: 'cancelled', note: 'Asked by phone' })
  })

  it('edits products and accounts with the methods the API expects', async () => {
    const { calls } = fakeApi({
      'PUT /products/195': ({ body }) => [200, { success: true, product: { id: 195, ...body } }],
      'PATCH /users/abc': ({ body }) => [200, { success: true, user: { _id: 'abc', ...body } }],
      'DELETE /users/abc': () => [200, { success: true, message: 'Account a@b.co deleted' }]
    })

    await updateProduct(195, { stock: 3 })
    await updateUserRole('abc', 'admin')
    const answer = await deleteUser('abc')

    expect(calls.map((call) => `${call.method} ${call.path}`)).toEqual([
      'PUT /products/195',
      'PATCH /users/abc',
      'DELETE /users/abc'
    ])
    expect(calls[1].body).toEqual({ role: 'admin' })
    expect(answer.message).toBe('Account a@b.co deleted')
  })
})
