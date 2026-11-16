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
import Counter from '../models/counter.js'
import Order from '../models/order.js'
import Product from '../models/product.js'
import User from '../models/user.js'

useTestDatabase('orders')

const DAY = 24 * 60 * 60 * 1000

function placeOrder(token, items, payment = { method: 'cod' }, delivery = validDelivery()) {
  return api().post('/api/orders').set(bearer(token)).send({ items, delivery, payment })
}

async function stockOf(product) {
  const stored = await Product.findOne({ id: product.id })
  return { stock: stored.stock, soldCount: stored.soldCount }
}

async function placedOrder(token, product, quantity = 1) {
  return (await placeOrder(token, [{ id: product.id, quantity }]).expect(201)).body.order
}

describe('POST /api/orders', () => {
  it('prices the order on the server and reserves the stock', async () => {
    const shirt = await createProduct({ price: 40, discountPercentage: 20, stock: 5, brand: 'Weave' })
    const mug = await createProduct({ price: 25, stock: 3 })
    const other = await createProduct()
    const { user, token } = await createUser({
      cart: [{ id: shirt.id, quantity: 2 }, { id: other.id, quantity: 1 }]
    })

    const before = Date.now()
    const res = await placeOrder(
      token,
      [
        { id: shirt.id, quantity: 1, price: 0.01 },
        { id: shirt.id, quantity: 1 },
        { id: mug.id, quantity: '1', title: 'Free mug' }
      ],
      { method: 'card', cardLast4: '4242', cardNumber: '4242424242424242', cvv: '123' }
    ).expect(201)

    const { order } = res.body
    assert.match(order.number, /^SS\d{6}$/)
    assert.equal(order.status, 'processing')
    assert.deepEqual(order.items, [
      { id: shirt.id, title: shirt.title, brand: 'Weave', thumbnail: shirt.thumbnail, price: 40, originalPrice: 50, quantity: 2 },
      { id: mug.id, title: mug.title, brand: 'Testco', thumbnail: mug.thumbnail, price: 25, originalPrice: 25, quantity: 1 }
    ])
    assert.equal(order.subtotal, 105)
    assert.equal(order.savings, 20)
    assert.equal(order.deliveryFee, 4.99)
    assert.equal(order.total, 109.99)
    assert.deepEqual(order.payment, { method: 'card', cardLast4: '4242', upiId: null })
    assert.deepEqual(order.user, { _id: user._id.toString(), name: user.name, email: user.email })
    assert.equal(order.delivery.phone, '9876543210', 'spaces are stripped from the phone number')
    assert.deepEqual(
      order.statusHistory.map(({ status, note }) => ({ status, note })),
      [{ status: 'processing', note: 'Order placed' }]
    )
    const arrivesIn = new Date(order.arrivesOn).getTime() - before
    assert.ok(arrivesIn >= 4 * DAY && arrivesIn < 4 * DAY + 60000, 'arrives four days after the order')

    assert.deepEqual(await stockOf(shirt), { stock: 3, soldCount: 2 })
    assert.deepEqual(await stockOf(mug), { stock: 2, soldCount: 1 })

    const stored = await Order.findById(order._id).lean()
    assert.equal(JSON.stringify(stored).includes('4242424242424242'), false, 'no card number is stored')

    const account = await User.findById(user._id)
    assert.deepEqual(account.cart.map((line) => line.id), [other.id], 'only ordered lines leave the saved cart')
    assert.equal(account.address.phone, '9876543210')
    assert.equal(account.address.city, 'Bengaluru', 'the delivery address is remembered')
  })

  it('delivers free from $150 and keeps the UPI ID for UPI payments', async () => {
    const watch = await createProduct({ price: 150 })
    const { token } = await createUser()
    const res = await placeOrder(token, [{ id: watch.id, quantity: 1 }], { method: 'upi', upiId: 'asha@okbank' }).expect(201)
    assert.equal(res.body.order.deliveryFee, 0)
    assert.equal(res.body.order.total, 150)
    assert.deepEqual(res.body.order.payment, { method: 'upi', cardLast4: null, upiId: 'asha@okbank' })
  })

  it('answers 409 OUT_OF_STOCK listing every problem line and reserves nothing', async () => {
    const plenty = await createProduct({ stock: 10 })
    const few = await createProduct({ stock: 2, title: 'Rare Vase' })
    const none = await createProduct({ stock: 0, title: 'Sold Out Lamp' })
    const { token } = await createUser()

    const res = await placeOrder(token, [
      { id: plenty.id, quantity: 1 },
      { id: few.id, quantity: 3 },
      { id: none.id, quantity: 1 },
      { id: 999999, quantity: 1 }
    ]).expect(409)

    assert.equal(res.body.code, 'OUT_OF_STOCK')
    assert.deepEqual(res.body.details.items, [
      { id: few.id, title: 'Rare Vase', requested: 3, available: 2 },
      { id: none.id, title: 'Sold Out Lamp', requested: 1, available: 0 },
      { id: 999999, title: null, requested: 1, available: 0 }
    ])
    assert.equal((await stockOf(plenty)).stock, 10)
    assert.equal(await Order.countDocuments({ 'items.id': plenty.id }), 0)
  })

  it('names the product in the message when one line is short', async () => {
    const few = await createProduct({ stock: 2, title: 'Rare Vase' })
    const { token } = await createUser()
    const res = await placeOrder(token, [{ id: few.id, quantity: 5 }]).expect(409)
    assert.equal(res.body.message, 'Only 2 left of Rare Vase.')
  })

  it('puts reserved stock back when a later line sells out mid-checkout', async (t) => {
    const first = await createProduct({ stock: 5 })
    const second = await createProduct({ stock: 1 })
    const { token } = await createUser()

    // The availability check sees an old copy of the catalogue with plenty of stock,
    // as if another shopper bought the last units in between.
    const find = t.mock.method(Product, 'find')
    find.mock.mockImplementationOnce(async () => [
      { ...first.toObject(), stock: 5 },
      { ...second.toObject(), stock: 10 }
    ])

    const res = await placeOrder(token, [
      { id: first.id, quantity: 2 },
      { id: second.id, quantity: 3 }
    ]).expect(409)

    assert.equal(res.body.code, 'OUT_OF_STOCK')
    assert.deepEqual(res.body.details.items, [{ id: second.id, title: second.title, requested: 3, available: 1 }])
    assert.deepEqual(await stockOf(first), { stock: 5, soldCount: 0 })
    assert.deepEqual(await stockOf(second), { stock: 1, soldCount: 0 })
  })

  it('puts reserved stock back when the order cannot be saved', async (t) => {
    const product = await createProduct({ stock: 4 })
    const { token } = await createUser()
    t.mock.method(Order, 'create', async () => {
      throw new Error('disk full')
    })
    // The 500 is expected here, so its log line is kept out of the test output.
    t.mock.method(console, 'error', () => {})

    await placeOrder(token, [{ id: product.id, quantity: 3 }]).expect(500)
    assert.deepEqual(await stockOf(product), { stock: 4, soldCount: 0 })
  })

  it('moves the order counter past numbers already in use', async () => {
    const product = await createProduct({ stock: 20 })
    const { token } = await createUser()
    const first = await placedOrder(token, product)

    // As if the counter had been reset or restored from an older backup.
    await Counter.updateOne({ _id: 'order' }, { value: 0 })
    const second = await placedOrder(token, product)

    assert.notEqual(second.number, first.number)
    assert.equal(await Order.countDocuments({ number: second.number }), 1)
  })

  it('reports invalid fields with their full paths', async () => {
    const { token } = await createUser()
    const res = await api()
      .post('/api/orders')
      .set(bearer(token))
      .send({
        items: [{ id: 1, quantity: 0 }],
        delivery: validDelivery({ phone: '12345', pincode: 'abc', email: 'nope' }),
        payment: { method: 'card' }
      })
      .expect(400)

    assert.deepEqual(res.body.errors.map((error) => error.field), [
      'items[0].quantity',
      'delivery.email',
      'delivery.phone',
      'delivery.pincode',
      'payment.cardLast4'
    ])
  })

  it('rejects unknown payment methods, a full card number and an empty cart', async () => {
    const { token } = await createUser()
    const bad = await placeOrder(token, [], { method: 'paypal' }).expect(400)
    assert.deepEqual(bad.body.errors.map((error) => error.field), ['items', 'payment.method'])

    const card = await placeOrder(token, [{ id: 1, quantity: 1 }], { method: 'card', cardLast4: '4242424242424242' }).expect(400)
    assert.equal(card.body.errors[0].field, 'payment.cardLast4')

    const upi = await placeOrder(token, [{ id: 1, quantity: 1 }], { method: 'upi' }).expect(400)
    assert.equal(upi.body.errors[0].field, 'payment.upiId')
  })

  it('needs a signed in shopper', async () => {
    const res = await api().post('/api/orders').send({}).expect(401)
    assert.equal(res.body.code, 'NO_TOKEN')
  })
})

describe('Reading orders', () => {
  it('lists the shopper\'s own orders, newest first', async () => {
    const product = await createProduct({ stock: 50 })
    const { token } = await createUser()
    const { token: otherToken } = await createUser()
    const older = await placedOrder(token, product)
    const newer = await placedOrder(token, product)
    await placedOrder(otherToken, product)

    const res = await api().get('/api/orders/mine').set(bearer(token)).expect(200)
    assert.deepEqual(res.body.orders.map((order) => order.number), [newer.number, older.number])
  })

  it('opens an order by number (any case) or by id', async () => {
    const product = await createProduct()
    const { token } = await createUser()
    const order = await placedOrder(token, product)

    const byNumber = await api().get(`/api/orders/${order.number.toLowerCase()}`).set(bearer(token)).expect(200)
    assert.equal(byNumber.body.order._id, order._id)
    const byId = await api().get(`/api/orders/${order._id}`).set(bearer(token)).expect(200)
    assert.equal(byId.body.order.number, order.number)
  })

  it('hides other shoppers\' orders but shows every order to admins', async () => {
    const product = await createProduct()
    const { token } = await createUser()
    const { token: otherToken } = await createUser()
    const { token: adminToken } = await createAdmin()
    const order = await placedOrder(token, product)

    const hidden = await api().get(`/api/orders/${order.number}`).set(bearer(otherToken)).expect(404)
    assert.equal(hidden.body.code, 'ORDER_NOT_FOUND')
    await api().get(`/api/orders/${order.number}`).set(bearer(adminToken)).expect(200)
  })

  it('answers 400 INVALID_ID for a malformed reference and 404 for an unknown one', async () => {
    const { token } = await createUser()
    assert.equal((await api().get('/api/orders/not-an-order').set(bearer(token)).expect(400)).body.code, 'INVALID_ID')
    assert.equal((await api().get('/api/orders/SS999999').set(bearer(token)).expect(404)).body.code, 'ORDER_NOT_FOUND')
    await api().get('/api/orders/0123456789abcdef01234567').set(bearer(token)).expect(404)
  })
})

describe('PATCH /api/orders/:ref/cancel', () => {
  it('cancels a processing order once and puts the stock back once', async () => {
    const product = await createProduct({ stock: 6 })
    const { token } = await createUser()
    const order = await placedOrder(token, product, 2)
    assert.equal((await stockOf(product)).stock, 4)

    const res = await api()
      .patch(`/api/orders/${order.number}/cancel`)
      .set(bearer(token))
      .send({ reason: 'Ordered the wrong size' })
      .expect(200)

    assert.equal(res.body.order.status, 'cancelled')
    assert.deepEqual(res.body.order.statusHistory.map((event) => event.status), ['processing', 'cancelled'])
    assert.equal(res.body.order.statusHistory[1].note, 'Cancelled by the shopper: Ordered the wrong size')
    assert.deepEqual(await stockOf(product), { stock: 6, soldCount: 0 })

    const again = await api().patch(`/api/orders/${order.number}/cancel`).set(bearer(token)).expect(409)
    assert.equal(again.body.code, 'ORDER_NOT_CANCELLABLE')
    assert.equal((await stockOf(product)).stock, 6, 'a second cancel does not restock again')
  })

  it('restocks only once when two cancels arrive together', async () => {
    const product = await createProduct({ stock: 5 })
    const { token } = await createUser()
    const order = await placedOrder(token, product, 3)

    const results = await Promise.all([
      api().patch(`/api/orders/${order.number}/cancel`).set(bearer(token)),
      api().patch(`/api/orders/${order.number}/cancel`).set(bearer(token))
    ])
    assert.deepEqual(results.map((res) => res.status).sort(), [200, 409])
    assert.equal((await stockOf(product)).stock, 5)
  })

  it('answers 409 ORDER_CHANGED when the order moved on after it was read', async (t) => {
    const product = await createProduct({ stock: 5 })
    const { token } = await createUser()
    const order = await placedOrder(token, product)

    // The order is read while still processing, then an admin ships it before the cancel lands.
    const findOne = Order.findOne.bind(Order)
    t.mock.method(Order, 'findOne', (...args) => {
      const query = findOne(...args)
      const exec = query.exec.bind(query)
      query.exec = async () => {
        const found = await exec()
        await Order.updateOne({ _id: found._id }, { status: 'shipped' })
        return found
      }
      return query
    })

    const res = await api().patch(`/api/orders/${order.number}/cancel`).set(bearer(token)).expect(409)
    assert.equal(res.body.code, 'ORDER_CHANGED')
    assert.equal((await stockOf(product)).stock, 4, 'nothing is restocked')
  })

  it('cannot cancel once the order has shipped', async () => {
    const product = await createProduct()
    const { token } = await createUser()
    const order = await placedOrder(token, product)
    await Order.updateOne({ _id: order._id }, { status: 'shipped' })

    const res = await api().patch(`/api/orders/${order.number}/cancel`).set(bearer(token)).expect(409)
    assert.equal(res.body.code, 'ORDER_NOT_CANCELLABLE')
  })

  it('only lets the owner cancel here', async () => {
    const product = await createProduct()
    const { token } = await createUser()
    const { token: otherToken } = await createUser()
    const { token: adminToken } = await createAdmin()
    const order = await placedOrder(token, product)

    await api().patch(`/api/orders/${order.number}/cancel`).set(bearer(otherToken)).expect(404)
    const admin = await api().patch(`/api/orders/${order.number}/cancel`).set(bearer(adminToken)).expect(403)
    assert.equal(admin.body.code, 'FORBIDDEN')
  })
})

describe('Admin order management', () => {
  it('lists every order with a status filter, a search and pages', async () => {
    const product = await createProduct({ stock: 50 })
    const { token: adminToken } = await createAdmin()
    const { token } = await createUser({ name: 'Zainab Q', email: 'zainab@example.com' })
    const first = await placedOrder(token, product)
    const second = await placedOrder(token, product)
    await api().patch(`/api/orders/${first.number}/status`).set(bearer(adminToken)).send({ status: 'shipped' }).expect(200)

    const shipped = await api().get('/api/orders?status=shipped').set(bearer(adminToken)).expect(200)
    assert.ok(shipped.body.orders.length >= 1)
    assert.ok(shipped.body.orders.every((order) => order.status === 'shipped'))

    const byNumber = await api().get(`/api/orders?q=${second.number}`).set(bearer(adminToken)).expect(200)
    assert.deepEqual(byNumber.body.orders.map((order) => order.number), [second.number])

    const byAccount = await api().get('/api/orders?q=zainab@example').set(bearer(adminToken)).expect(200)
    assert.deepEqual(byAccount.body.orders.map((order) => order.number), [second.number, first.number])
    assert.deepEqual(Object.keys(byAccount.body.orders[0].user).sort(), ['_id', 'email', 'name'])

    const paged = await api().get('/api/orders?limit=1&page=2').set(bearer(adminToken)).expect(200)
    assert.equal(paged.body.orders.length, 1)
    assert.equal(paged.body.pagination.page, 2)
    assert.equal(paged.body.pagination.limit, 1)
    assert.equal(paged.body.pagination.pages, paged.body.pagination.total)
  })

  it('rejects an unknown status filter and shoppers', async () => {
    const { token: adminToken } = await createAdmin()
    const { token } = await createUser()
    assert.equal((await api().get('/api/orders?status=lost').set(bearer(adminToken)).expect(400)).body.code, 'VALIDATION_ERROR')
    assert.equal((await api().get('/api/orders').set(bearer(token)).expect(403)).body.code, 'FORBIDDEN')
    await api().patch('/api/orders/SS100001/status').set(bearer(token)).send({ status: 'shipped' }).expect(403)
  })

  it('moves an order forward one step at a time', async () => {
    const product = await createProduct()
    const { token: adminToken } = await createAdmin()
    const { token } = await createUser()
    const order = await placedOrder(token, product)
    const setStatus = (status, note) =>
      api().patch(`/api/orders/${order.number}/status`).set(bearer(adminToken)).send({ status, note })

    const skip = await setStatus('delivered').expect(409)
    assert.equal(skip.body.code, 'INVALID_STATUS_TRANSITION')

    await setStatus('shipped', 'Sent with BlueDart').expect(200)
    const same = await setStatus('shipped').expect(409)
    assert.equal(same.body.code, 'INVALID_STATUS_TRANSITION')

    const delivered = await setStatus('delivered').expect(200)
    assert.deepEqual(delivered.body.order.statusHistory.map((event) => event.status), ['processing', 'shipped', 'delivered'])
    assert.deepEqual(delivered.body.order.statusHistory.map((event) => event.note), ['Order placed', 'Sent with BlueDart', 'Delivered'])

    const late = await setStatus('cancelled').expect(409)
    assert.equal(late.body.code, 'INVALID_STATUS_TRANSITION')
    assert.equal((await setStatus('processing').expect(400)).body.code, 'VALIDATION_ERROR')
  })

  it('cancels a shipped order and puts the stock back', async () => {
    const product = await createProduct({ stock: 8 })
    const { token: adminToken } = await createAdmin()
    const { token } = await createUser()
    const order = await placedOrder(token, product, 3)
    await api().patch(`/api/orders/${order.number}/status`).set(bearer(adminToken)).send({ status: 'shipped' }).expect(200)

    const res = await api()
      .patch(`/api/orders/${order._id}/status`)
      .set(bearer(adminToken))
      .send({ status: 'cancelled' })
      .expect(200)
    assert.equal(res.body.order.statusHistory.at(-1).note, 'Cancelled by the store')
    assert.deepEqual(await stockOf(product), { stock: 8, soldCount: 0 })
  })
})
