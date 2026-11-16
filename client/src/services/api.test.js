import { describe, expect, it } from 'vitest'
import { normalizeProduct } from './api'

const serverProduct = {
  id: 1,
  title: 'Essence Mascara Lash Princess',
  description: 'A popular mascara.',
  brand: 'Essence',
  category: 'beauty',
  price: 9.99,
  discountPercentage: 10.48,
  rating: 2.56,
  reviewCount: 3,
  soldCount: 7,
  stock: 99,
  tags: ['beauty', 'mascara'],
  sku: 'BEA-ESS-ESS-001',
  weight: 4,
  dimensions: { width: 15.14, height: 13.08, depth: 22.99 },
  warrantyInformation: '1 week warranty',
  shippingInformation: 'Ships in 3-5 business days',
  returnPolicy: 'No return policy',
  minimumOrderQuantity: 48,
  thumbnail: 'https://cdn.example/thumb.webp',
  images: [],
  availabilityStatus: 'In Stock',
  meta: { createdAt: '2025-10-09T14:47:01.588Z', updatedAt: '2025-10-09T14:47:01.588Z' }
}

describe('normalizeProduct', () => {
  it('reads the counts the server sends instead of an embedded review list', () => {
    const product = normalizeProduct(serverProduct)
    expect(product.reviewCount).toBe(3)
    expect(product.soldCount).toBe(7)
    expect(product.availability).toBe('In Stock')
    expect(product.reviews).toBeUndefined()
  })

  it('rebuilds the struck-through price the way the server does', () => {
    const product = normalizeProduct(serverProduct)
    expect(product.originalPrice).toBe(11.16)
    expect(product.discount).toBe(10)
  })

  it('fills gaps for a product an admin added', () => {
    const product = normalizeProduct({
      id: 195,
      title: 'Rare Vase',
      description: 'A handmade vase.',
      category: 'home-decoration',
      price: 40,
      stock: 3,
      thumbnail: 'https://cdn.example/vase.webp',
      availabilityStatus: 'Low Stock'
    })
    expect(product.brand).toBe('Generic')
    expect(product.categoryLabel).toBe('Home Decoration')
    expect(product.images).toEqual(['https://cdn.example/vase.webp'])
    expect(product.reviewCount).toBe(0)
    expect(product.specs.Dimensions).toBe('Not specified')
    expect(product.specs['Minimum order']).toBe('1 unit(s)')
  })
})
