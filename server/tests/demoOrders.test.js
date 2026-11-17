import { api, bearer, createAdmin, createUser, useTestDatabase, validDelivery } from './helpers/testApp.js'
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import Order, { DELIVERY_DAYS, NEXT_STATUS, STATUS_NOTES } from '../models/order.js'
import Product from '../models/product.js'
import User from '../models/user.js'
import generateToken from '../utils/generateToken.js'
import { DEMO_ORDER_IDS, DEMO_ORDER_PLAN } from '../scripts/demoOrders.js'
import { readCatalogue, seed, seedCatalogue } from '../scripts/seed.js'

useTestDatabase('demo_orders')

const HOUR = 60 * 60 * 1000
const DAY = 24 * HOUR
const OPEN_STATUSES = ['processing', 'shipped']
const catalogue = await readCatalogue()
const catalogueStock = new Map(catalogue.map((entry) => [entry.id, entry.stock]))

async function demoOrders() {
  return Order.find({ _id: { $in: DEMO_ORDER_IDS } }).sort({ createdAt: 1 }).lean()
}

async function shopperToken() {
  const shopper = await User.findOne({ email: 'demo@shopsmart.dev' })
  return generateToken(shopper)
}

/** { id: [stock, soldCount] } for every product. */
async function stockAndSold() {
  const products = await Product.find().select('id stock soldCount').lean()
  return Object.fromEntries(products.map((product) => [product.id, [product.stock, product.soldCount]]))
}

// Units per product id, from the orders whose status passes the test.
function unitsBy(orders, keep) {
  const units = new Map()
  orders.filter((order) => keep(order.status)).forEach((order) => {
    order.items.forEach(({ id, quantity }) => units.set(id, (units.get(id) || 0) + quantity))
  })
  return units
}

describe('demo orders written by npm run seed', () => {
  it('gives the demo shopper sixteen orders over the last thirteen days, in every status', async () => {
    const now = Date.now()
    await seed(catalogue, { fresh: true, now })

    const orders = await demoOrders()
    const shopper = await User.findOne({ email: 'demo@shopsmart.dev' })
    assert.equal(orders.length, 16)
    assert.equal(await Order.countDocuments({ user: shopper._id }), 16)

    const byStatus = {}
    orders.forEach((order) => {
      byStatus[order.status] = (byStatus[order.status] || 0) + 1
    })
    assert.deepEqual(byStatus, { delivered: 8, cancelled: 3, shipped: 3, processing: 2 })

    // Numbered from SS100001 in the order they were placed.
    assert.deepEqual(
      orders.map((order) => order.number),
      Array.from({ length: 16 }, (_, index) => `SS${100001 + index}`)
    )
    orders.forEach((order) => {
      assert.ok(order.createdAt.getTime() >= now - 13 * DAY && order.createdAt.getTime() < now)
    })
  })

  it('prices every order exactly as checkout prices the same cart', async () => {
    await seed(catalogue, { fresh: true })
    const { token } = await createUser()

    for (const order of await demoOrders()) {
      const res = await api()
        .post('/api/orders')
        .set(bearer(token))
        .send({
          items: order.items.map(({ id, quantity }) => ({ id, quantity })),
          delivery: validDelivery(),
          payment: { method: 'cod' }
        })
        .expect(201)

      const placed = res.body.order
      assert.deepEqual(order.items, placed.items, order.number)
      for (const field of ['subtotal', 'savings', 'deliveryFee', 'total']) {
        assert.equal(order[field], placed[field], `${order.number} ${field}`)
      }
    }
  })

  it('records only the steps the API allows, at times a real order would take them', async () => {
    const now = Date.now()
    await seed(catalogue, { fresh: true, now })

    for (const order of await demoOrders()) {
      const history = order.statusHistory
      assert.deepEqual(history[0], { status: 'processing', at: order.createdAt, note: STATUS_NOTES.processing })
      for (let index = 1; index < history.length; index += 1) {
        const from = history[index - 1].status
        const to = history[index].status
        assert.ok(NEXT_STATUS[from] === to || (to === 'cancelled' && OPEN_STATUSES.includes(from)), `${from} to ${to}`)
        assert.ok(history[index].at > history[index - 1].at)
      }

      const latest = history.at(-1)
      assert.equal(order.status, latest.status)
      assert.ok(latest.at.getTime() <= now)
      assert.deepEqual(order.updatedAt, latest.at)
      assert.equal(order.arrivesOn.getTime(), order.createdAt.getTime() + DELIVERY_DAYS * DAY)
      if (order.status === 'delivered') assert.ok(latest.at <= order.arrivesOn)

      const { method, cardLast4, upiId } = order.payment
      assert.equal(cardLast4 !== null, method === 'card')
      assert.equal(upiId !== null, method === 'upi')
    }
  })

  it('reserves stock for open orders and counts every order not cancelled', async () => {
    await seed(catalogue, { fresh: true })
    const orders = await demoOrders()
    const sold = unitsBy(orders, (status) => status !== 'cancelled')
    const reserved = unitsBy(orders, (status) => OPEN_STATUSES.includes(status))

    const products = await stockAndSold()
    catalogue.forEach(({ id }) => {
      assert.deepEqual(products[id], [catalogueStock.get(id) - (reserved.get(id) || 0), sold.get(id) || 0], `product ${id}`)
    })
    // Nothing the demo orders hold leaves a product low on stock.
    reserved.forEach((units, id) => assert.ok(products[id][0] >= 10, `product ${id}`))
  })

  it('leaves stock and sold counts where the same orders placed through checkout leave them', async () => {
    const now = Date.now()
    await seed(catalogue, { fresh: true, now })
    const seeded = await stockAndSold()

    // The same orders again, this time placed by the demo shopper and moved on through the API.
    await Order.deleteMany({ _id: { $in: DEMO_ORDER_IDS } })
    await seedCatalogue(catalogue, now)
    const token = await shopperToken()
    const { token: adminToken } = await createAdmin()

    for (const plan of DEMO_ORDER_PLAN) {
      const res = await api()
        .post('/api/orders')
        .set(bearer(token))
        .send({
          items: plan.items.map(([id, quantity]) => ({ id, quantity })),
          delivery: validDelivery(),
          payment: { method: 'cod' }
        })
        .expect(201)
      const { number } = res.body.order

      for (const [status, , note = ''] of plan.steps) {
        if (note.startsWith('Cancelled by the shopper')) {
          const reason = note.split(': ')[1]
          await api().patch(`/api/orders/${number}/cancel`).set(bearer(token)).send(reason ? { reason } : {}).expect(200)
        } else {
          const body = note ? { status, note } : { status }
          await api().patch(`/api/orders/${number}/status`).set(bearer(adminToken)).send(body).expect(200)
        }
      }
    }

    // Checkout took the delivered units off the shelf as well; the catalogue a reseed
    // loads already counts them as gone, so they come back on the shelf there.
    const live = await stockAndSold()
    const orders = await Order.find().lean()
    const delivered = unitsBy(orders, (status) => status === 'delivered')
    catalogue.forEach(({ id }) => {
      assert.deepEqual(live[id], [seeded[id][0] - (delivered.get(id) || 0), seeded[id][1]], `product ${id}`)
    })

    await seedCatalogue(catalogue, now)
    assert.deepEqual(await stockAndSold(), seeded)
  })

  it('refreshes its own orders on a second run and keeps every other order', async () => {
    const now = Date.now()
    await seed(catalogue, { fresh: true, now })
    const first = await demoOrders()
    const token = await shopperToken()
    const { token: adminToken } = await createAdmin()

    // A visitor places an order as the demo shopper, and an admin ships a demo order.
    const real = await api()
      .post('/api/orders')
      .set(bearer(token))
      .send({ items: [{ id: 30, quantity: 5 }], delivery: validDelivery(), payment: { method: 'cod' } })
      .expect(201)
    assert.equal(real.body.order.number, 'SS100017')
    await api().patch(`/api/orders/${first.at(-1).number}/status`).set(bearer(adminToken)).send({ status: 'shipped' }).expect(200)

    const later = now + 2 * DAY
    await seed(catalogue, { now: later })
    const second = await demoOrders()

    assert.equal(await Order.countDocuments(), 17)
    assert.deepEqual(
      second.map((order) => order.number),
      first.map((order) => order.number)
    )
    assert.deepEqual(
      second.map((order) => order.status),
      first.map((order) => order.status)
    )
    second.forEach((order, index) => {
      assert.equal(order.createdAt.getTime(), first[index].createdAt.getTime() + 2 * DAY)
    })
    assert.equal((await Order.findOne({ number: 'SS100017' })).status, 'processing')

    // Kiwi: 4 units in the shipped demo order and 5 in the kept order are reserved; the
    // 3 delivered ones were already gone from the catalogue's stock.
    const products = await stockAndSold()
    assert.deepEqual(products[30], [catalogueStock.get(30) - 4 - 5, 3 + 4 + 5])

    const next = await api()
      .post('/api/orders')
      .set(bearer(token))
      .send({ items: [{ id: 30, quantity: 1 }], delivery: validDelivery(), payment: { method: 'cod' } })
      .expect(201)
    assert.equal(next.body.order.number, 'SS100018')
  })

  it('starts again from SS100001 with --fresh and never doubles the orders', async () => {
    await seed(catalogue, { fresh: true })
    await seed(catalogue, { fresh: true })

    assert.equal(await Order.countDocuments(), 16)
    assert.equal(await User.countDocuments(), 2)
    assert.equal((await demoOrders())[0].number, 'SS100001')
  })

  it('fills in the checkout address only when the demo shopper has none', async () => {
    await seed(catalogue, { fresh: true })
    const shopper = await User.findOne({ email: 'demo@shopsmart.dev' })
    assert.equal(shopper.address.city, 'Kochi')
    assert.equal(shopper.address.phone, '9876543210')

    await User.updateOne({ _id: shopper._id }, { $set: { 'address.city': 'Kozhikode', 'address.address': '3 Beach Road' } })
    await seed(catalogue)
    assert.equal((await User.findById(shopper._id)).address.city, 'Kozhikode')
  })

  it('lets the demo shopper review a delivered product as a verified purchase', async () => {
    await seed(catalogue, { fresh: true })
    const token = await shopperToken()
    const review = { rating: 5, comment: 'Heats evenly and cleans up easily.' }

    // Product 52 is in a delivered demo order, product 83 only in a shipped one.
    const delivered = await api().post('/api/products/52/reviews').set(bearer(token)).send(review).expect(201)
    assert.equal(delivered.body.review.verifiedPurchase, true)
    const shipped = await api().post('/api/products/83/reviews').set(bearer(token)).send(review).expect(201)
    assert.equal(shipped.body.review.verifiedPurchase, false)
  })

  it('fills the admin dashboard', async () => {
    await seed(catalogue, { fresh: true })
    const admin = await User.findOne({ email: 'admin@shopsmart.dev' })
    const res = await api().get('/api/admin/summary').set(bearer(generateToken(admin))).expect(200)

    const orders = await demoOrders()
    const kept = orders.filter((order) => order.status !== 'cancelled')
    const revenue = Math.round(kept.reduce((total, order) => total + order.total, 0) * 100) / 100

    assert.equal(res.body.totals.orders, 16)
    assert.equal(res.body.totals.revenue, revenue)
    assert.deepEqual(res.body.ordersByStatus, { processing: 2, shipped: 3, delivered: 8, cancelled: 3 })
    assert.equal(res.body.recentOrders[0].number, 'SS100016')
    assert.deepEqual(
      res.body.topProducts.slice(0, 2).map(({ product, soldCount }) => [product.id, soldCount]),
      [[30, 7], [34, 7]]
    )

    // Every kept order falls inside the fourteen days of the sales chart, which has sales
    // on at least nine of them whatever the time of day the seed ran.
    const days = res.body.salesByDay
    assert.equal(days.reduce((total, day) => total + day.orders, 0), kept.length)
    assert.equal(Math.round(days.reduce((total, day) => total + day.revenue, 0) * 100) / 100, revenue)
    assert.ok(days.filter((day) => day.orders > 0).length >= 9)
  })
})
