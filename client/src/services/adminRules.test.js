import { describe, expect, it } from 'vitest'
import {
  changedProductFields,
  describePayment,
  emptyProductValues,
  nextStatuses,
  productPayload,
  productToValues,
  toSlug,
  validateProductValues
} from './adminRules'

const validValues = {
  ...emptyProductValues,
  title: 'Teapot',
  category: 'kitchen-accessories',
  description: 'A teapot for testing the form.',
  price: '15.50',
  stock: '7',
  thumbnail: 'https://cdn.example/teapot.webp'
}

// A product as GET /api/products/:id returns it.
const product = {
  id: 195,
  title: 'Teapot',
  description: 'A teapot for testing the form.',
  brand: 'Generic',
  category: 'kitchen-accessories',
  price: 15.5,
  discountPercentage: 0,
  stock: 7,
  minimumOrderQuantity: 1,
  thumbnail: 'https://cdn.example/teapot.webp',
  images: ['https://cdn.example/teapot.webp'],
  tags: ['kitchen'],
  warrantyInformation: 'No warranty',
  shippingInformation: 'Ships in 3-5 business days',
  returnPolicy: '30 days return policy'
}

describe('order status rules', () => {
  it('offers only the next statuses the API allows', () => {
    expect(nextStatuses('processing')).toEqual(['shipped', 'cancelled'])
    expect(nextStatuses('shipped')).toEqual(['delivered', 'cancelled'])
    expect(nextStatuses('delivered')).toEqual([])
    expect(nextStatuses('cancelled')).toEqual([])
    expect(nextStatuses('lost')).toEqual([])
  })

  it('describes each way of paying', () => {
    expect(describePayment({ method: 'card', cardLast4: '4242' })).toBe('Card ending 4242')
    expect(describePayment({ method: 'upi', upiId: 'meera@okbank' })).toBe('UPI (meera@okbank)')
    expect(describePayment({ method: 'cod' })).toBe('Cash on delivery')
    expect(describePayment(null)).toBe('Not recorded')
  })
})

describe('product form rules', () => {
  it('accepts a complete form', () => {
    expect(validateProductValues(validValues)).toEqual({})
  })

  it('names every missing required field at once', () => {
    const errors = validateProductValues(emptyProductValues)
    expect(Object.keys(errors).sort()).toEqual(
      ['category', 'description', 'price', 'stock', 'thumbnail', 'title'].sort()
    )
    expect(errors.title).toBe('Title is required')
  })

  it('checks numbers, slugs, addresses and lists the way the API does', () => {
    const errors = validateProductValues({
      ...validValues,
      title: 'ab',
      category: 'Home Decor',
      price: '0',
      discountPercentage: '95',
      stock: '2.5',
      minimumOrderQuantity: '0',
      thumbnail: 'ftp://cdn.example/a.webp',
      images: 'https://cdn.example/1.webp not-a-url',
      tags: Array.from({ length: 13 }, (_, index) => `tag${index}`).join(', ')
    })

    expect(errors).toEqual({
      title: 'Title must be at least 3 characters',
      category: 'Use lowercase letters, numbers and dashes, such as home-decoration',
      price: 'Price must be at least 0.01',
      discountPercentage: 'Discount must be at most 90',
      stock: 'Stock must be a whole number',
      minimumOrderQuantity: 'Minimum order must be at least 1',
      thumbnail: 'Image URL must start with http:// or https://',
      images: 'Image 2 must be a web address starting with http:// or https://',
      tags: 'Use at most 12 tags'
    })
  })

  it('refuses prices with more than two decimal places', () => {
    expect(validateProductValues({ ...validValues, price: '9.999' }).price).toBe(
      'Price must be a number with at most two decimal places'
    )
  })

  it('turns free text into a category slug', () => {
    expect(toSlug(' Home Decoration ')).toBe('home-decoration')
    expect(toSlug('kitchen__tools')).toBe('kitchen-tools')
  })

  it('builds a create body that leaves empty optional fields to the server', () => {
    const body = productPayload({ ...validValues, category: 'Kitchen Accessories', tags: 'Tea, , POTS' })
    expect(body).toEqual({
      title: 'Teapot',
      category: 'kitchen-accessories',
      description: 'A teapot for testing the form.',
      price: 15.5,
      stock: 7,
      thumbnail: 'https://cdn.example/teapot.webp',
      tags: ['tea', 'pots']
    })
  })

  it('sends only the fields that changed when editing', () => {
    const values = productToValues(product)
    expect(changedProductFields(values, product)).toEqual({})

    expect(changedProductFields({ ...values, stock: '3' }, product)).toEqual({ stock: 3 })
    expect(changedProductFields({ ...values, price: '14.25' }, product)).toEqual({ price: 14.25 })
  })

  it('gives emptied optional fields the value a new product starts with', () => {
    const values = productToValues(product)
    const changes = changedProductFields({ ...values, brand: 'Acme', images: '', tags: '' }, product)
    expect(changes).toEqual({ brand: 'Acme', tags: [] })

    const cleared = changedProductFields(
      productToValues({ ...product, brand: 'Acme', images: ['https://cdn.example/2.webp'] }),
      { ...product, brand: 'Acme', images: ['https://cdn.example/2.webp'] }
    )
    expect(cleared).toEqual({})

    const emptied = changedProductFields(
      { ...productToValues({ ...product, brand: 'Acme' }), brand: '', images: '' },
      { ...product, brand: 'Acme', images: ['https://cdn.example/2.webp'] }
    )
    expect(emptied).toEqual({ brand: 'Generic', images: ['https://cdn.example/teapot.webp'] })
  })
})
