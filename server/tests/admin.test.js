import {
  api,
  bearer,
  createAdmin,
  createProduct,
  createUser,
  env,
  useTestDatabase,
  validDelivery
} from './helpers/testApp.js'
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import Order from '../models/order.js'
import User from '../models/user.js'

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

  it('counts days in the store\'s time zone', async () => {
    const { token: adminToken } = await createAdmin()
    env.storeTimezone = 'Pacific/Kiritimati'
    try {
      const res = await api().get('/api/admin/summary').set(bearer(adminToken)).expect(200)
      const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Pacific/Kiritimati' }).format(new Date())
      assert.equal(res.body.salesByDay.at(-1).date, today)
      assert.equal(res.body.salesByDay.at(-1).orders, 2, 'the same two orders, on the store\'s calendar')
    } finally {
      env.storeTimezone = 'UTC'
    }
  })

  it('is only for admins', async () => {
    const { token } = await createUser()
    assert.equal((await api().get('/api/admin/summary').expect(401)).body.code, 'NO_TOKEN')
    assert.equal((await api().get('/api/admin/summary').set(bearer(token)).expect(403)).body.code, 'FORBIDDEN')
  })
})

describe('Account management', () => {
  it('lists accounts with a search, a role filter, pages and order counts', async () => {
    const { token: adminToken } = await createAdmin({ name: 'Store Owner' })
    const { token } = await createUser({ name: 'Farah Khan', email: 'farah@example.com' })
    await createUser({ name: 'Noor', email: 'noor@example.com' })
    await placeOrder(token, await createProduct())

    const search = await api().get('/api/users?q=FARAH').set(bearer(adminToken)).expect(200)
    assert.equal(search.body.users.length, 1)
    const [farah] = search.body.users
    assert.equal(farah.email, 'farah@example.com')
    assert.equal(farah.orderCount, 1)
    assert.equal('password' in farah, false)
    assert.equal('tokenVersion' in farah, false)

    const admins = await api().get('/api/users?role=admin').set(bearer(adminToken)).expect(200)
    assert.ok(admins.body.users.every((user) => user.role === 'admin'))

    const paged = await api().get('/api/users?limit=1&page=2').set(bearer(adminToken)).expect(200)
    assert.equal(paged.body.users.length, 1)
    assert.equal(paged.body.pagination.limit, 1)
    assert.equal(paged.body.pagination.page, 2)

    await api().get('/api/users?role=owner').set(bearer(adminToken)).expect(400)
  })

  it('promotes a shopper, whose current session gets admin access at once', async () => {
    const { token: adminToken } = await createAdmin()
    const { user, token } = await createUser()
    await api().get('/api/admin/summary').set(bearer(token)).expect(403)

    const res = await api().patch(`/api/users/${user._id}`).set(bearer(adminToken)).send({ role: 'admin' }).expect(200)
    assert.equal(res.body.user.role, 'admin')
    await api().get('/api/admin/summary').set(bearer(token)).expect(200)

    await api().patch(`/api/users/${user._id}`).set(bearer(adminToken)).send({ role: 'customer' }).expect(200)
    await api().get('/api/admin/summary').set(bearer(token)).expect(403)
  })

  it('stops admins from changing their own role or deleting themselves', async () => {
    const { user, token } = await createAdmin()
    const role = await api().patch(`/api/users/${user._id}`).set(bearer(token)).send({ role: 'customer' }).expect(409)
    assert.equal(role.body.code, 'SELF_ROLE_CHANGE')
    const remove = await api().delete(`/api/users/${user._id}`).set(bearer(token)).expect(409)
    assert.equal(remove.body.code, 'SELF_DELETE')
  })

  it('validates the role and the account id', async () => {
    const { token } = await createAdmin()
    const { user } = await createUser()
    const invalid = await api().patch(`/api/users/${user._id}`).set(bearer(token)).send({ role: 'owner' }).expect(400)
    assert.equal(invalid.body.errors[0].field, 'role')
    assert.equal((await api().patch('/api/users/123').set(bearer(token)).send({ role: 'admin' }).expect(400)).body.code, 'INVALID_ID')
    const missing = await api().delete('/api/users/0123456789abcdef01234567').set(bearer(token)).expect(404)
    assert.equal(missing.body.code, 'ACCOUNT_NOT_FOUND')
  })

  it('deletes an account, ends its sessions and keeps its orders', async () => {
    const { token: adminToken } = await createAdmin()
    const { user, token } = await createUser()
    const order = await placeOrder(token, await createProduct())

    const res = await api().delete(`/api/users/${user._id}`).set(bearer(adminToken)).expect(200)
    assert.equal(res.body.message, `Account ${user.email} deleted`)
    assert.equal(await User.exists({ _id: user._id }), null)

    const session = await api().get('/api/auth/me').set(bearer(token)).expect(401)
    assert.equal(session.body.code, 'USER_NOT_FOUND')

    const kept = await api().get(`/api/orders/${order.number}`).set(bearer(adminToken)).expect(200)
    assert.equal(kept.body.order.user, null)
  })

  it('keeps the shared demo accounts from being demoted, promoted or deleted', async () => {
    const { token: adminToken } = await createAdmin()
    const { user: demoAdmin } = await createAdmin({ email: 'admin@shopsmart.dev' })
    const { user: demoShopper } = await createUser({ email: 'demo@shopsmart.dev' })

    const demote = await api().patch(`/api/users/${demoAdmin._id}`).set(bearer(adminToken)).send({ role: 'customer' }).expect(403)
    assert.equal(demote.body.code, 'DEMO_ACCOUNT_LOCKED')
    const promote = await api().patch(`/api/users/${demoShopper._id}`).set(bearer(adminToken)).send({ role: 'admin' }).expect(403)
    assert.equal(promote.body.code, 'DEMO_ACCOUNT_LOCKED')
    for (const account of [demoAdmin, demoShopper]) {
      const remove = await api().delete(`/api/users/${account._id}`).set(bearer(adminToken)).expect(403)
      assert.equal(remove.body.code, 'DEMO_ACCOUNT_LOCKED')
    }

    // Saving the role an account already has changes nothing, so it is still allowed.
    await api().patch(`/api/users/${demoAdmin._id}`).set(bearer(adminToken)).send({ role: 'admin' }).expect(200)
    const stored = await User.find({ _id: { $in: [demoAdmin._id, demoShopper._id] } }).sort({ email: 1 })
    assert.deepEqual(stored.map((account) => account.role), ['admin', 'customer'])
  })

  it('is only for admins', async () => {
    const { user, token } = await createUser()
    const requests = [
      ['get', '/api/users', undefined],
      ['patch', `/api/users/${user._id}`, { role: 'admin' }],
      ['delete', `/api/users/${user._id}`, undefined]
    ]
    for (const [method, path, body] of requests) {
      assert.equal((await api()[method](path).send(body).expect(401)).body.code, 'NO_TOKEN', `${method} ${path}`)
      assert.equal((await api()[method](path).set(bearer(token)).send(body).expect(403)).body.code, 'FORBIDDEN', `${method} ${path}`)
    }
  })
})
