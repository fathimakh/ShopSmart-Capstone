import { api, bearer, createAdmin, createProduct, createUser, env, useTestDatabase } from './helpers/testApp.js'
import assert from 'node:assert/strict'
import { before, describe, it } from 'node:test'
import jwt from 'jsonwebtoken'
import Product from '../models/product.js'
import Review from '../models/review.js'
import User from '../models/user.js'

useTestDatabase('products')

const newProduct = () => ({
  title: 'Trail Running Shoes',
  description: 'Light shoes with a grippy sole for muddy trails.',
  category: 'mens-shoes',
  price: 89.99,
  stock: 25,
  thumbnail: 'https://cdn.example.com/shoes.webp'
})

describe('GET /api/products', () => {
  let phone
  let laptop
  let lamp

  before(async () => {
    phone = await createProduct({
      title: 'Galaxy Phone',
      brand: 'Samsung',
      category: 'smartphones',
      price: 499,
      rating: 4.6,
      discountPercentage: 12,
      reviewCount: 30,
      tags: ['android']
    })
    laptop = await createProduct({ title: 'Air Laptop', brand: 'Apple', category: 'laptops', price: 1299, rating: 4.9, stock: 0 })
    lamp = await createProduct({
      title: 'Desk Lamp',
      brand: 'Generic',
      category: 'home-decoration',
      price: 25,
      rating: 3.2,
      stock: 4,
      description: 'A warm light for a phone call at night.'
    })
  })

  it('pages through the catalogue in the DummyJSON shape', async () => {
    const res = await api().get('/api/products?limit=2').expect(200)
    assert.equal(res.body.products.length, 2)
    assert.deepEqual(res.body.pagination, { page: 1, limit: 2, total: 3, pages: 2 })

    const [first] = res.body.products
    assert.equal(first.id, phone.id)
    assert.equal(first.availabilityStatus, 'In Stock')
    assert.ok(first.meta.createdAt)
    for (const hidden of ['_id', '__v', 'priceHistory', 'reviewSummary', 'createdAt']) {
      assert.equal(hidden in first, false, `${hidden} must not be sent`)
    }
  })

  it('returns everything with limit=0', async () => {
    const res = await api().get('/api/products?limit=0').expect(200)
    assert.equal(res.body.products.length, 3)
    assert.deepEqual(res.body.pagination, { page: 1, limit: 3, total: 3, pages: 1 })
  })

  it('needs every search word to match somewhere', async () => {
    const res = await api().get('/api/products?q=phone%20galaxy').expect(200)
    assert.deepEqual(res.body.products.map((product) => product.id), [phone.id])

    const description = await api().get('/api/products?q=phone').expect(200)
    assert.deepEqual(description.body.products.map((product) => product.id).sort(), [phone.id, lamp.id].sort())
  })

  it('filters by category, brand, price, rating, discount and stock', async () => {
    const ids = async (query) => (await api().get(`/api/products?${query}`).expect(200)).body.products.map((p) => p.id)

    assert.deepEqual(await ids('category=laptops,smartphones&sort=price-asc'), [phone.id, laptop.id])
    assert.deepEqual(await ids('brand=Apple'), [laptop.id])
    assert.deepEqual(await ids('minPrice=20&maxPrice=500&sort=price-desc'), [phone.id, lamp.id])
    assert.deepEqual(await ids('minRating=4.5&sort=rating'), [laptop.id, phone.id])
    assert.deepEqual(await ids('minDiscount=10'), [phone.id])
    assert.deepEqual(await ids('inStock=true&sort=price-asc'), [lamp.id, phone.id])
    assert.deepEqual(await ids('stockBelow=5&sort=price-asc'), [lamp.id, laptop.id])
  })

  it('rejects invalid query parameters together', async () => {
    const res = await api().get('/api/products?minPrice=cheap&sort=random&limit=-1').expect(400)
    assert.equal(res.body.code, 'VALIDATION_ERROR')
    assert.equal(res.body.message, 'Invalid query parameters')
    assert.deepEqual(res.body.errors.map((error) => error.field).sort(), ['limit', 'minPrice', 'sort'])
  })

  it('lists categories with their product counts', async () => {
    const res = await api().get('/api/products/categories').expect(200)
    assert.deepEqual(res.body.categories, [
      { slug: 'home-decoration', count: 1 },
      { slug: 'laptops', count: 1 },
      { slug: 'smartphones', count: 1 }
    ])
  })
})

describe('GET /api/products/:id', () => {
  it('returns one product', async () => {
    const product = await createProduct({ stock: 3 })
    const res = await api().get(`/api/products/${product.id}`).expect(200)
    assert.equal(res.body.product.title, product.title)
    assert.equal(res.body.product.availabilityStatus, 'Low Stock')
  })

  it('answers 404 PRODUCT_NOT_FOUND and 400 INVALID_ID', async () => {
    assert.equal((await api().get('/api/products/999999').expect(404)).body.code, 'PRODUCT_NOT_FOUND')
    assert.equal((await api().get('/api/products/abc').expect(400)).body.code, 'INVALID_ID')
    assert.equal((await api().get('/api/products/0').expect(400)).body.code, 'INVALID_ID')
  })
})

describe('Admin product editing', () => {
  it('creates a product with the next numeric id and a first price point', async () => {
    const { token } = await createAdmin()
    const last = await createProduct()
    const res = await api().post('/api/products').set(bearer(token)).send(newProduct()).expect(201)

    const { product } = res.body
    assert.equal(product.id, last.id + 1)
    assert.equal(product.brand, 'Generic')
    assert.deepEqual(product.images, [newProduct().thumbnail])

    const stored = await Product.findOne({ id: product.id }).select('+priceHistory')
    assert.equal(stored.priceHistory.length, 1)
    assert.equal(stored.priceHistory[0].price, 89.99)
  })

  it('validates a new product', async () => {
    const { token } = await createAdmin()
    const res = await api()
      .post('/api/products')
      .set(bearer(token))
      .send({ ...newProduct(), category: 'Mens Shoes', price: 0, thumbnail: 'shoes.webp' })
      .expect(400)
    assert.deepEqual(res.body.errors.map((error) => error.field).sort(), ['category', 'price', 'thumbnail'])
  })

  it('adds a price point only when the price changes', async () => {
    const { token } = await createAdmin()
    const product = await createProduct({ price: 50, priceHistory: [{ price: 50, at: new Date() }] })

    await api().put(`/api/products/${product.id}`).set(bearer(token)).send({ stock: 7 }).expect(200)
    const res = await api().put(`/api/products/${product.id}`).set(bearer(token)).send({ price: '45.5' }).expect(200)

    assert.equal(res.body.product.price, 45.5)
    assert.equal(res.body.product.stock, 7)
    const stored = await Product.findOne({ id: product.id }).select('+priceHistory')
    assert.deepEqual(stored.priceHistory.map((point) => point.price), [50, 45.5])
  })

  it('answers 400 NOTHING_TO_UPDATE and 404 for an unknown product', async () => {
    const { token } = await createAdmin()
    const product = await createProduct()
    const empty = await api().put(`/api/products/${product.id}`).set(bearer(token)).send({ colour: 'red' }).expect(400)
    assert.equal(empty.body.code, 'NOTHING_TO_UPDATE')
    await api().put('/api/products/999999').set(bearer(token)).send({ stock: 1 }).expect(404)
  })

  it('deletes a product with its reviews and removes it from every list', async () => {
    const { token } = await createAdmin()
    const product = await createProduct()
    const keep = await createProduct()
    await Review.create({ product: product.id, reviewerName: 'Old', rating: 4, comment: 'Lovely thing' })
    const { user } = await createUser({
      cart: [{ id: product.id, quantity: 2 }, { id: keep.id, quantity: 1 }],
      wishlist: [product.id, keep.id],
      recentlyViewed: [product.id]
    })

    const res = await api().delete(`/api/products/${product.id}`).set(bearer(token)).expect(200)
    assert.equal(res.body.message, 'Product deleted')

    assert.equal(await Product.exists({ id: product.id }), null)
    assert.equal(await Review.countDocuments({ product: product.id }), 0)
    const lists = await User.findById(user._id)
    assert.deepEqual(lists.cart.map((line) => line.id), [keep.id])
    assert.deepEqual([...lists.wishlist], [keep.id])
    assert.deepEqual([...lists.recentlyViewed], [])
  })
})

describe('Product editing permissions', () => {
  const adminRequests = (id) => [
    ['post', '/api/products', newProduct()],
    ['put', `/api/products/${id}`, { stock: 3 }],
    ['delete', `/api/products/${id}`, undefined]
  ]

  it('answers 401 NO_TOKEN to guests', async () => {
    const product = await createProduct()
    for (const [method, path, body] of adminRequests(product.id)) {
      const res = await api()[method](path).send(body).expect(401)
      assert.equal(res.body.code, 'NO_TOKEN', `${method} ${path}`)
    }
  })

  it('answers 403 FORBIDDEN to shoppers', async () => {
    const product = await createProduct()
    const { token } = await createUser()
    for (const [method, path, body] of adminRequests(product.id)) {
      const res = await api()[method](path).set(bearer(token)).send(body).expect(403)
      assert.equal(res.body.code, 'FORBIDDEN', `${method} ${path}`)
    }
  })

  it('reads the role from the database, not from the token', async () => {
    const { user } = await createUser()
    const forged = jwt.sign({ id: user._id.toString(), role: 'admin', tv: 0 }, env.jwtSecret)
    const res = await api().post('/api/products').set(bearer(forged)).send(newProduct()).expect(403)
    assert.equal(res.body.code, 'FORBIDDEN')
  })
})
