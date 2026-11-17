import { api, bearer, createAdmin, createUser, useTestDatabase, validDelivery } from './helpers/testApp.js'
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import Product from '../models/product.js'
import { seedCatalogue } from '../scripts/seed.js'

useTestDatabase('seed')

function catalogueEntry(id) {
  return {
    id,
    title: `Catalogue Product ${id}`,
    description: 'A product from the test catalogue.',
    brand: 'Testco',
    category: 'test-gear',
    price: 10,
    rating: 4,
    stock: 99,
    thumbnail: `https://cdn.example.com/products/${id}.webp`,
    reviews: [{ reviewerName: 'Asha', rating: 5, comment: 'Just right.', date: '2026-01-01T00:00:00.000Z' }]
  }
}

const catalogue = [catalogueEntry(1), catalogueEntry(2)]

const newProduct = (title) => ({
  title,
  description: 'Added by an admin between two seeds.',
  category: 'test-gear',
  price: 25,
  stock: 5,
  thumbnail: 'https://cdn.example.com/products/admin.webp'
})

async function placeOrder(token, id, quantity) {
  const res = await api()
    .post('/api/orders')
    .set(bearer(token))
    .send({ items: [{ id, quantity }], delivery: validDelivery(), payment: { method: 'cod' } })
    .expect(201)
  return res.body.order
}

async function stockAndSold(id) {
  const product = await Product.findOne({ id })
  return [product.stock, product.soldCount]
}

describe('npm run seed without --fresh', () => {
  it('counts the orders it keeps and never hands out a product id twice', async () => {
    await seedCatalogue(catalogue)
    const { token: adminToken } = await createAdmin()
    const { token } = await createUser()

    const added = await api().post('/api/products').set(bearer(adminToken)).send(newProduct('Admin Widget')).expect(201)
    assert.equal(added.body.product.id, 3)

    const open = await placeOrder(token, 1, 4)
    const delivered = await placeOrder(token, 2, 2)
    for (const status of ['shipped', 'delivered']) {
      await api().patch(`/api/orders/${delivered.number}/status`).set(bearer(adminToken)).send({ status }).expect(200)
    }
    const cancelled = await placeOrder(token, 2, 1)
    await api().patch(`/api/orders/${cancelled.number}/cancel`).set(bearer(token)).expect(200)

    await seedCatalogue(catalogue)

    // The open order's 4 units are still reserved; the delivered ones have left the shelf.
    assert.deepEqual(await stockAndSold(1), [95, 4])
    assert.deepEqual(await stockAndSold(2), [99, 2])

    await api().patch(`/api/orders/${open.number}/cancel`).set(bearer(token)).expect(200)
    assert.deepEqual(await stockAndSold(1), [99, 0])

    // Product 3 went with the reseed, but the delivered order history may still name it.
    const next = await api().post('/api/products').set(bearer(adminToken)).send(newProduct('Other Widget')).expect(201)
    assert.equal(next.body.product.id, 4)
  })

  it('never takes a sold count below zero when an order is cancelled', async () => {
    await seedCatalogue(catalogue)
    const { token } = await createUser()
    const order = await placeOrder(token, 1, 3)
    // As if the units had never been counted, for an order restored from a backup.
    await Product.updateOne({ id: 1 }, { $set: { soldCount: 1 } })

    await api().patch(`/api/orders/${order.number}/cancel`).set(bearer(token)).expect(200)
    assert.deepEqual(await stockAndSold(1), [99, 0])
  })
})
