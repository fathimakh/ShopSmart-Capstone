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
import Product from '../models/product.js'
import Review from '../models/review.js'

useTestDatabase('reviews')

const DAY = 24 * 60 * 60 * 1000

/** A catalogue product: its own rating plus three imported reviews that disagree with it. */
async function catalogueProduct(rating = 4.8) {
  const product = await createProduct({ rating, reviewCount: 3 })
  await Review.insertMany(
    [2, 3, 2].map((stars, index) => ({
      product: product.id,
      reviewerName: `Imported ${index + 1}`,
      rating: stars,
      comment: 'Imported with the catalogue',
      createdAt: new Date(Date.now() - (10 - index) * DAY)
    })),
    { timestamps: false }
  )
  return product
}

function review(token, product, rating, comment = 'Does what it says') {
  return api().post(`/api/products/${product.id}/reviews`).set(bearer(token)).send({ rating, comment })
}

async function ratingOf(product) {
  const stored = await Product.findOne({ id: product.id })
  return { rating: stored.rating, reviewCount: stored.reviewCount }
}

describe('GET /api/products/:id/reviews', () => {
  it('pages through reviews newest first with a star breakdown', async () => {
    const product = await catalogueProduct()
    const { token } = await createUser()
    await review(token, product, 5, 'Better than expected').expect(201)

    const res = await api().get(`/api/products/${product.id}/reviews?limit=2`).expect(200)
    assert.deepEqual(res.body.reviews.map((item) => item.comment), ['Better than expected', 'Imported with the catalogue'])
    assert.deepEqual(res.body.pagination, { page: 1, limit: 2, total: 4, pages: 2 })
    assert.deepEqual(res.body.stats.breakdown, { 1: 0, 2: 2, 3: 1, 4: 0, 5: 1 })
    assert.equal(res.body.stats.reviewCount, 4)
    assert.equal(res.body.myReview, null, 'guests have no review of their own')

    const [latest] = res.body.reviews
    assert.ok(latest._id)
    assert.equal(latest.date, latest.createdAt)
    assert.equal(latest.verifiedPurchase, false)
  })

  it('gives a signed in shopper their own review', async () => {
    const product = await catalogueProduct()
    const { user, token } = await createUser()
    await review(token, product, 4).expect(201)

    const res = await api().get(`/api/products/${product.id}/reviews`).set(bearer(token)).expect(200)
    assert.equal(res.body.myReview.user, user._id.toString())
    assert.equal(res.body.myReview.rating, 4)
  })

  it('answers 404 for an unknown product', async () => {
    const res = await api().get('/api/products/999999/reviews').expect(404)
    assert.equal(res.body.code, 'PRODUCT_NOT_FOUND')
  })
})

describe('POST /api/products/:id/reviews', () => {
  it('blends new reviews with the catalogue rating instead of jumping', async () => {
    const product = await catalogueProduct(4.8)
    const { token: first } = await createUser()
    const { token: second } = await createUser()

    // The three imported reviews average 2.33, but the rating stays near 4.8.
    const res = await review(first, product, 4).expect(201)
    assert.deepEqual(res.body.stats, { rating: 4.6, reviewCount: 4, breakdown: { 1: 0, 2: 2, 3: 1, 4: 1, 5: 0 } })
    assert.deepEqual(await ratingOf(product), { rating: 4.6, reviewCount: 4 })

    await review(second, product, 2).expect(201)
    assert.deepEqual(await ratingOf(product), { rating: 4.08, reviewCount: 5 })

    const stored = await Product.findOne({ id: product.id }).select('+catalogueRating')
    assert.equal(stored.catalogueRating, 4.8, 'the catalogue rating is kept as the starting point')
  })

  it('updates the shopper\'s earlier review instead of adding a second one', async () => {
    const product = await catalogueProduct(4.8)
    const { user, token } = await createUser()

    const created = await review(token, product, 4, 'Good').expect(201)
    const updated = await review(token, product, 5, 'Even better after a month').expect(200)

    assert.equal(updated.body.review._id, created.body.review._id)
    assert.equal(updated.body.review.comment, 'Even better after a month')
    assert.equal(updated.body.review.reviewerName, user.name)
    assert.equal(await Review.countDocuments({ product: product.id, user: user._id }), 1)
    assert.deepEqual(await ratingOf(product), { rating: 4.85, reviewCount: 4 })
  })

  it('never answers with a duplicate error when two saves arrive together', async () => {
    const product = await catalogueProduct()
    const { user, token } = await createUser()
    const results = await Promise.all([review(token, product, 3), review(token, product, 4)])

    assert.deepEqual(results.map((res) => res.status).sort(), [200, 201])
    assert.equal(await Review.countDocuments({ product: product.id, user: user._id }), 1)
    assert.equal((await ratingOf(product)).reviewCount, 4)
  })

  it('marks a review as a verified purchase after a delivered order', async () => {
    const product = await catalogueProduct()
    const { token } = await createUser()
    const placed = await api()
      .post('/api/orders')
      .set(bearer(token))
      .send({ items: [{ id: product.id, quantity: 1 }], delivery: validDelivery(), payment: { method: 'cod' } })
      .expect(201)

    const early = await review(token, product, 5).expect(201)
    assert.equal(early.body.review.verifiedPurchase, false, 'an order on its way is not enough')

    await Order.updateOne({ _id: placed.body.order._id }, { status: 'delivered' })
    const later = await review(token, product, 5).expect(200)
    assert.equal(later.body.review.verifiedPurchase, true)
  })

  it('rates a product without catalogue reviews from its own reviews alone', async () => {
    const product = await createProduct({ rating: 0, reviewCount: 0 })
    const { token } = await createUser()
    await review(token, product, 5).expect(201)
    assert.deepEqual(await ratingOf(product), { rating: 5, reviewCount: 1 })
  })

  it('clears the cached AI summary', async () => {
    const product = await catalogueProduct()
    await Product.updateOne(
      { id: product.id },
      { reviewSummary: { verdict: 'Old summary', pros: [], cons: [], basedOn: 3, generatedAt: new Date() } }
    )
    const { token } = await createUser()
    await review(token, product, 4).expect(201)

    const stored = await Product.findOne({ id: product.id }).select('+reviewSummary')
    assert.equal(stored.reviewSummary, null)
  })

  it('validates the review and needs a signed in shopper', async () => {
    const product = await catalogueProduct()
    const { token } = await createUser()

    const invalid = await api()
      .post(`/api/products/${product.id}/reviews`)
      .set(bearer(token))
      .send({ rating: 6, comment: 'ok' })
      .expect(400)
    assert.deepEqual(invalid.body.errors.map((error) => error.field), ['rating', 'comment'])

    await api().post(`/api/products/${product.id}/reviews`).send({ rating: 4, comment: 'Nice one' }).expect(401)
    await review(token, { id: 999999 }, 4).expect(404)
  })
})

describe('DELETE /api/products/:id/reviews/:reviewId', () => {
  it('lets the author delete their review and restores the rating', async () => {
    const product = await catalogueProduct(4.8)
    const { token } = await createUser()
    const { review: written } = (await review(token, product, 1).expect(201)).body

    const res = await api().delete(`/api/products/${product.id}/reviews/${written._id}`).set(bearer(token)).expect(200)
    assert.equal(res.body.message, 'Review deleted')
    assert.deepEqual(await ratingOf(product), { rating: 4.8, reviewCount: 3 })
  })

  it('lets admins delete any review but not other shoppers', async () => {
    const product = await catalogueProduct()
    const { token } = await createUser()
    const { token: otherToken } = await createUser()
    const { token: adminToken } = await createAdmin()
    const { review: written } = (await review(token, product, 4).expect(201)).body
    const imported = await Review.findOne({ product: product.id, user: null })

    const denied = await api().delete(`/api/products/${product.id}/reviews/${written._id}`).set(bearer(otherToken)).expect(403)
    assert.equal(denied.body.code, 'FORBIDDEN')

    await api().delete(`/api/products/${product.id}/reviews/${written._id}`).set(bearer(adminToken)).expect(200)
    await api().delete(`/api/products/${product.id}/reviews/${imported._id}`).set(bearer(adminToken)).expect(200)
    assert.equal((await ratingOf(product)).reviewCount, 2)
  })

  it('answers 404 for a review of another product and 400 for a bad id', async () => {
    const product = await catalogueProduct()
    const other = await catalogueProduct()
    const { token: adminToken } = await createAdmin()
    const imported = await Review.findOne({ product: other.id })

    const missing = await api()
      .delete(`/api/products/${product.id}/reviews/${imported._id}`)
      .set(bearer(adminToken))
      .expect(404)
    assert.equal(missing.body.code, 'REVIEW_NOT_FOUND')

    const invalid = await api().delete(`/api/products/${product.id}/reviews/nope`).set(bearer(adminToken)).expect(400)
    assert.equal(invalid.body.code, 'INVALID_ID')
  })
})
