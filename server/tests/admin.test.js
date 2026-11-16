import {
  api,
  bearer,
  createAdmin,
  createProduct,
  createUser,
  useTestDatabase,
  validDelivery
} from './helpers/testApp.js'
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import Order from '../models/order.js'

useTestDatabase('admin')

const DAY = 24 * 60 * 60 * 1000

async function placeOrder(token, product, quantity = 1) {
  const res = await api()
    .post('/api/orders')
    .set(bearer(token))
    .send({ items: [{ id: product.id, quantity }], delivery: validDelivery(), payment: { method: 'cod' } })
    .expect(201)
  return res.body.order
}

function setStatus(adminToken, order, status) {
  return api().patch(`/api/orders/${order.number}/status`).set(bearer(adminToken)).send({ status }).expect(200)
}

// The native driver is used so Mongoose's timestamps do not overwrite the backdated time.
function backdate(order, daysAgo) {
  return Order.collection.updateOne({ number: order.number }, { $set: { createdAt: new Date(Date.now() - daysAgo * DAY) } })
}

describe('GET /api/admin/summary', () => {
  it('adds up the store for the dashboard', async () => {
    const { token: adminToken } = await createAdmin()
    const { user: shopper, token } = await createUser()
    const kettle = await createProduct({ title: 'Kettle', price: 200, stock: 30 })
    const toaster = await createProduct({ title: 'Toaster', price: 50, stock: 30 })
    const vase = await createProduct({ title: 'Vase', price: 10, stock: 3 })
    const lamp = await createProduct({ title: 'Lamp', price: 10, stock: 0 })

    const first = await placeOrder(token, kettle, 2) // 400, free delivery
    const second = await placeOrder(token, toaster, 3) // 150, free delivery
    const third = await placeOrder(token, toaster, 1) // 50 + 4.99 delivery
    const cancelled = await placeOrder(token, kettle, 1)
    const old = await placeOrder(token, vase, 1) // 10 + 4.99, three weeks ago

    await setStatus(adminToken, second, 'shipped')
    await setStatus(adminToken, third, 'shipped')
    await setStatus(adminToken, third, 'delivered')
    await setStatus(adminToken, cancelled, 'cancelled')
    await backdate(first, 3)
    await backdate(old, 21)

    const res = await api().get('/api/admin/summary').set(bearer(adminToken)).expect(200)
    const summary = res.body

    assert.deepEqual(summary.totals, { users: 2, products: 4, orders: 5, revenue: 619.98 })
    assert.deepEqual(summary.ordersByStatus, { processing: 2, shipped: 1, delivered: 1, cancelled: 1 })

    assert.deepEqual(summary.lowStock.map((product) => [product.title, product.stock]), [['Lamp', 0], ['Vase', 2]])
    assert.deepEqual(
      summary.topProducts.map(({ product, soldCount }) => [product.title, soldCount]),
      [['Toaster', 4], ['Kettle', 2], ['Vase', 1]],
      'the cancelled kettle does not count as sold'
    )

    assert.deepEqual(
      summary.recentOrders.map((order) => order.number),
      [cancelled, third, second, first, old].map((order) => order.number),
      'newest first, by the time each order was placed'
    )
    assert.deepEqual(summary.recentOrders[0].user, { _id: shopper._id.toString(), name: shopper.name, email: shopper.email })

    assert.equal(summary.salesByDay.length, 14)
    const today = new Date().toISOString().slice(0, 10)
    const threeDaysAgo = new Date(Date.now() - 3 * DAY).toISOString().slice(0, 10)
    assert.equal(summary.salesByDay.at(-1).date, today)
    assert.deepEqual(summary.salesByDay.at(-1), { date: today, orders: 2, revenue: 204.99 })
    assert.deepEqual(summary.salesByDay.find((day) => day.date === threeDaysAgo), { date: threeDaysAgo, orders: 1, revenue: 400 })
    const counted = summary.salesByDay.reduce((total, day) => total + day.orders, 0)
    assert.equal(counted, 3, 'cancelled orders and orders older than two weeks are left out')
  })

  it('is only for admins', async () => {
    const { token } = await createUser()
    assert.equal((await api().get('/api/admin/summary').expect(401)).body.code, 'NO_TOKEN')
    assert.equal((await api().get('/api/admin/summary').set(bearer(token)).expect(403)).body.code, 'FORBIDDEN')
  })
})
