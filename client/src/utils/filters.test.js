import { describe, expect, it } from 'vitest'
import {
  applyFilters,
  countActiveFilters,
  defaultFilters,
  searchProducts,
  sortProducts,
  toggleValue
} from './filters'
import { sampleProducts } from '../test/products'

const ids = (products) => products.map((product) => product.id)

describe('filters', () => {
  it('filters by category, brand, price, rating and discount together', () => {
    expect(ids(applyFilters(sampleProducts, { ...defaultFilters, categories: ['beauty'] }))).toEqual([3, 4])
    expect(ids(applyFilters(sampleProducts, { ...defaultFilters, brands: ['Samsung'] }))).toEqual([2])
    expect(ids(applyFilters(sampleProducts, { ...defaultFilters, minPrice: '10', maxPrice: '700' }))).toEqual([2, 4])
    expect(ids(applyFilters(sampleProducts, { ...defaultFilters, minRating: 4.5 }))).toEqual([1, 4])
    expect(ids(applyFilters(sampleProducts, { ...defaultFilters, minDiscount: 10 }))).toEqual([2, 3])
  })

  it('counts each active filter once and a price range as one', () => {
    expect(countActiveFilters(defaultFilters)).toBe(0)
    expect(
      countActiveFilters({ ...defaultFilters, categories: ['a', 'b'], minPrice: '5', maxPrice: '9', minRating: 4 })
    ).toBe(4)
  })

  it('toggles a value in a list', () => {
    expect(toggleValue(['a'], 'b')).toEqual(['a', 'b'])
    expect(toggleValue(['a', 'b'], 'a')).toEqual(['b'])
  })

  it('needs every search word to appear somewhere in the product', () => {
    expect(ids(searchProducts(sampleProducts, 'long lasting'))).toEqual([2, 4])
    expect(ids(searchProducts(sampleProducts, 'apple titanium'))).toEqual([1])
    expect(searchProducts(sampleProducts, '   ')).toBe(sampleProducts)
  })

  it('sorts without changing the original list', () => {
    expect(ids(sortProducts(sampleProducts, 'price-asc'))).toEqual([3, 4, 2, 1])
    expect(ids(sortProducts(sampleProducts, 'price-desc'))).toEqual([1, 2, 4, 3])
    expect(ids(sortProducts(sampleProducts, 'rating'))).toEqual([4, 1, 2, 3])
    expect(ids(sortProducts(sampleProducts, 'popularity'))).toEqual([2, 1, 3, 4])
    expect(ids(sortProducts(sampleProducts, 'newest'))).toEqual([2, 3, 1, 4])
    expect(ids(sortProducts(sampleProducts, 'discount'))).toEqual([2, 3, 1, 4])
    expect(ids(sortProducts(sampleProducts, 'featured'))).toEqual([1, 2, 3, 4])
    expect(ids(sampleProducts)).toEqual([1, 2, 3, 4])
  })
})
