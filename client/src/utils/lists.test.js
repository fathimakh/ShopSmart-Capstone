import { describe, expect, it } from 'vitest'
import {
  CART_LINE_LIMIT,
  MAX_QUANTITY,
  VIEWED_LIMIT,
  clampQuantity,
  sameList,
  sanitizeCart,
  sanitizeIds
} from './lists'

describe('list limits', () => {
  it('keeps quantities between 1 and 99', () => {
    expect(clampQuantity(0)).toBe(1)
    expect(clampQuantity(-4)).toBe(1)
    expect(clampQuantity('3')).toBe(3)
    expect(clampQuantity(2.7)).toBe(2)
    expect(clampQuantity(150)).toBe(MAX_QUANTITY)
    expect(clampQuantity('abc')).toBe(1)
  })

  it('joins repeated cart lines and caps the total at 99', () => {
    expect(
      sanitizeCart([
        { id: 1, quantity: 60 },
        { id: 2, quantity: 1 },
        { id: 1, quantity: 60 }
      ])
    ).toEqual([
      { id: 1, quantity: 99 },
      { id: 2, quantity: 1 }
    ])
  })

  it('drops broken cart lines', () => {
    expect(
      sanitizeCart([
        null,
        { id: '3', quantity: 1 },
        { id: 0, quantity: 1 },
        { id: 4, quantity: 0 },
        { id: 5, quantity: 2 }
      ])
    ).toEqual([{ id: 5, quantity: 2 }])
    expect(sanitizeCart('nonsense')).toEqual([])
  })

  it('keeps at most 50 cart lines', () => {
    const lines = Array.from({ length: 60 }, (_, index) => ({ id: index + 1, quantity: 1 }))
    expect(sanitizeCart(lines)).toHaveLength(CART_LINE_LIMIT)
  })

  it('keeps ids unique, valid and in order, up to the limit', () => {
    expect(sanitizeIds([3, 1, 3, '2', -1, 2], 10)).toEqual([3, 1, 2])
    const ids = Array.from({ length: 20 }, (_, index) => index + 1)
    expect(sanitizeIds(ids, VIEWED_LIMIT)).toHaveLength(12)
    expect(sanitizeIds(undefined, 5)).toEqual([])
  })

  it('compares lists by content and order', () => {
    expect(sameList([1, 2], [1, 2])).toBe(true)
    expect(sameList([2, 1], [1, 2])).toBe(false)
    expect(sameList([{ id: 1, quantity: 2 }], [{ id: 1, quantity: 2 }])).toBe(true)
  })
})
