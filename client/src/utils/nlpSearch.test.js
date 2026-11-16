import { describe, expect, it } from 'vitest'
import { describeFilters, mergeWithPrevious, parseQuery, rankByRelevance } from './nlpSearch'
import { buildTextIndex } from './textIndex'
import { sampleProducts } from '../test/products'

const catalogue = {
  categories: ['beauty', 'smartphones', 'mens-shoes', 'womens-shoes'],
  brands: ['Apple', 'Samsung', 'Essence']
}

describe('on-device query parser', () => {
  it('reads category, brand, price ceiling and rating from a sentence', () => {
    const parsed = parseQuery('samsung phones under $800 with good reviews', catalogue)
    expect(parsed.filters.categories).toEqual(['smartphones'])
    expect(parsed.filters.brands).toEqual(['Samsung'])
    expect(parsed.filters.maxPrice).toBe('800')
    expect(parsed.filters.minRating).toBe(4)
    expect(parsed.source).toBe('device')
  })

  it('understands ranges, thousands and deals', () => {
    const parsed = parseQuery('phones between 1k and 2k on sale', catalogue)
    expect(parsed.filters.minPrice).toBe('1000')
    expect(parsed.filters.maxPrice).toBe('2000')
    expect(parsed.filters.minDiscount).toBe(10)
  })

  it('narrows shoes by gender and picks a sort order', () => {
    const parsed = parseQuery('cheapest shoes for women', catalogue)
    expect(parsed.filters.categories).toEqual(['womens-shoes'])
    expect(parsed.sortBy).toBe('price-asc')
  })

  it('keeps descriptive words as keywords', () => {
    expect(parseQuery('titanium phone', catalogue).keywords).toContain('titanium')
  })

  it('describes filters as chips', () => {
    expect(
      describeFilters(
        { categories: ['smartphones'], brands: [], minPrice: '', maxPrice: '500', minRating: 4, minDiscount: 10 },
        ['titanium']
      )
    ).toEqual(['In Smartphones', 'Under $500', '4 stars and up', 'On discount', 'Matching "titanium"'])
  })

  it('carries earlier filters into a follow-up that does not mention them', () => {
    const first = parseQuery('samsung phones under 800', catalogue)
    const followUp = mergeWithPrevious(parseQuery('cheapest', catalogue), first.filters)
    expect(followUp.filters.brands).toEqual(['Samsung'])
    expect(followUp.filters.maxPrice).toBe('800')
    expect(followUp.sortBy).toBe('price-asc')
  })

  it('ranks products by keyword match', () => {
    const index = buildTextIndex(sampleProducts)
    expect(rankByRelevance(sampleProducts, index, ['titanium']).map((product) => product.id)).toEqual([1])
    expect(rankByRelevance(sampleProducts, index, [])).toBe(sampleProducts)
  })
})
