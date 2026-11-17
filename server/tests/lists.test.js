import { api, bearer, createProduct, createUser, useTestDatabase } from './helpers/testApp.js'
import assert from 'node:assert/strict'
import { before, describe, it } from 'node:test'

useTestDatabase('lists')

let products = []

before(async () => {
  products = []
  for (let index = 0; index < 14; index += 1) products.push(await createProduct())
})

const idOf = (index) => products[index].id

describe('/api/lists', () => {
  it('needs a signed in shopper', async () => {
    const res = await api().get('/api/lists').expect(401)
    assert.equal(res.body.code, 'NO_TOKEN')
  })

  it('starts empty', async () => {
    const { token } = await createUser()
    const res = await api().get('/api/lists').set(bearer(token)).expect(200)
    assert.deepEqual(res.body, { success: true, cart: [], wishlist: [], recentlyViewed: [] })
  })

  it('saves the cart, joining repeated lines and dropping unknown products', async () => {
    const { token } = await createUser()
    const res = await api()
      .put('/api/lists/cart')
      .set(bearer(token))
      .send({
        items: [
          { id: idOf(0), quantity: 60 },
          { id: idOf(1), quantity: '2' },
          { id: idOf(0), quantity: 60 },
          { id: 999999, quantity: 1 }
        ]
      })
      .expect(200)

    assert.deepEqual(res.body.cart, [
      { id: idOf(0), quantity: 99 },
      { id: idOf(1), quantity: 2 }
    ])
    const lists = await api().get('/api/lists').set(bearer(token)).expect(200)
    assert.deepEqual(lists.body.cart, res.body.cart)
  })

  it('validates cart lines', async () => {
    const { token } = await createUser()
    const res = await api()
      .put('/api/lists/cart')
      .set(bearer(token))
      .send({ items: [{ id: idOf(0), quantity: 100 }, { id: 'abc', quantity: 1 }] })
      .expect(400)
    assert.deepEqual(res.body.errors.map((error) => error.field), ['items[0].quantity', 'items[1].id'])
  })

  it('saves the wishlist without duplicates or unknown products', async () => {
    const { token } = await createUser()
    const res = await api()
      .put('/api/lists/wishlist')
      .set(bearer(token))
      .send({ ids: [idOf(2), idOf(3), idOf(2), 999999] })
      .expect(200)
    assert.deepEqual(res.body.wishlist, [idOf(2), idOf(3)])
  })

  it('keeps the twelve most recently viewed products', async () => {
    const { token } = await createUser()
    const ids = products.map((product) => product.id)
    const res = await api().put('/api/lists/viewed').set(bearer(token)).send({ ids }).expect(200)
    assert.deepEqual(res.body.recentlyViewed, ids.slice(0, 12))
  })

  it('merges a guest session into the account', async () => {
    const { token } = await createUser({
      cart: [{ id: idOf(0), quantity: 1 }],
      wishlist: [idOf(1)],
      recentlyViewed: [idOf(2), idOf(3)]
    })

    const res = await api()
      .post('/api/lists/merge')
      .set(bearer(token))
      .send({
        cart: [{ id: idOf(0), quantity: 2 }, { id: idOf(4), quantity: 1 }],
        wishlist: [idOf(1), idOf(5)],
        recentlyViewed: [idOf(3), idOf(6)]
      })
      .expect(200)

    assert.deepEqual(res.body.cart, [
      { id: idOf(0), quantity: 3 },
      { id: idOf(4), quantity: 1 }
    ])
    assert.deepEqual(res.body.wishlist, [idOf(1), idOf(5)])
    // This device's browsing is newer, so it goes first.
    assert.deepEqual(res.body.recentlyViewed, [idOf(3), idOf(6), idOf(2)])
  })

  it('accepts a merge with no body at all', async () => {
    const { token } = await createUser({ wishlist: [idOf(1)] })
    const res = await api().post('/api/lists/merge').set(bearer(token)).expect(200)
    assert.deepEqual(res.body.wishlist, [idOf(1)])
  })

  it('saves different lists sent at the same moment', async () => {
    // Each list has its own debounce in the client, and a sign out flushes them together.
    const { token } = await createUser()
    for (let round = 0; round < 3; round += 1) {
      const [cart, wishlist, viewed] = await Promise.all([
        api().put('/api/lists/cart').set(bearer(token)).send({ items: [{ id: idOf(round), quantity: 1 }] }),
        api().put('/api/lists/wishlist').set(bearer(token)).send({ ids: [idOf(round + 1)] }),
        api().put('/api/lists/viewed').set(bearer(token)).send({ ids: [idOf(round + 2)] })
      ])
      assert.deepEqual([cart.status, wishlist.status, viewed.status], [200, 200, 200])

      const lists = await api().get('/api/lists').set(bearer(token)).expect(200)
      assert.deepEqual(lists.body.cart, [{ id: idOf(round), quantity: 1 }])
      assert.deepEqual(lists.body.wishlist, [idOf(round + 1)])
      assert.deepEqual(lists.body.recentlyViewed, [idOf(round + 2)])
    }
  })
})
