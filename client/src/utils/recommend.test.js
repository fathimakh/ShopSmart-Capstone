import { describe, expect, it } from 'vitest'
import { buildTextIndex, cosineSimilarity, tokenize } from './textIndex'
import { getRecommendations, getSimilarProducts } from './recommend'
import { sampleProducts } from '../test/products'

const index = buildTextIndex(sampleProducts)

describe('text index', () => {
  it('drops stop words and short tokens', () => {
    expect(tokenize('Show me the iPhone 13 Pro!')).toEqual(['iphone', 'pro'])
  })

  it('scores two phones closer than a phone and a mascara', () => {
    expect(cosineSimilarity(index, 1, 2)).toBeGreaterThan(cosineSimilarity(index, 1, 3))
  })
})

describe('recommendations', () => {
  it('suggests products from the same aisle first', () => {
    const similar = getSimilarProducts(sampleProducts[0], sampleProducts, index)
    expect(similar[0].id).toBe(2)
    expect(similar.map((product) => product.id)).not.toContain(1)
  })

  it('builds picks from the cart, wishlist and viewed list, leaving those out', () => {
    const picks = getRecommendations(sampleProducts, index, { cart: [3], wishlist: [], viewed: [] })
    expect(picks.map((product) => product.id)).toEqual([4])
  })

  it('has nothing to say without any interests', () => {
    expect(getRecommendations(sampleProducts, index, { cart: [], wishlist: [], viewed: [] })).toEqual([])
  })
})
