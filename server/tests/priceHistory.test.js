import { api, bearer, createAdmin, createProduct, useTestDatabase } from './helpers/testApp.js'
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { buildSeedHistory, predictPrice } from '../services/pricePredict.js'

useTestDatabase('price_history')

const WEEK = 7 * 24 * 60 * 60 * 1000

function weeklyPrices(prices) {
  const now = Date.now()
  return prices.map((price, index) => ({ price, at: new Date(now - (prices.length - 1 - index) * WEEK) }))
}

describe('GET /api/products/:id/price-history', () => {
  it('returns the dated points and a falling forecast', async () => {
    const prices = [120, 117, 114, 111, 108, 105, 102, 99, 96, 93, 90, 87]
    const product = await createProduct({ price: 87, priceHistory: weeklyPrices(prices).reverse() })

    const res = await api().get(`/api/products/${product.id}/price-history`).expect(200)
    assert.equal(res.body.productId, product.id)
    assert.equal(res.body.currentPrice, 87)
    assert.deepEqual(res.body.points.map((point) => point.price), prices, 'points are sorted oldest first')
    assert.ok(res.body.points.every((point) => !Number.isNaN(Date.parse(point.at))))

    const { prediction } = res.body
    assert.equal(prediction.verdict, 'drop')
    assert.equal(prediction.forecast, 81)
    assert.equal(prediction.changePercent, -6.9)
    assert.equal(prediction.confidence, 100)
    assert.equal(prediction.weeks, 11)
    assert.equal(prediction.hasEnoughData, true)
    const ahead = Date.parse(prediction.forecastAt) - Date.now()
    assert.ok(ahead > 2 * WEEK - 60000 && ahead <= 2 * WEEK, 'the forecast is two weeks ahead')
  })

  it('says steady with no confidence when there are fewer than three points', async () => {
    const product = await createProduct({ price: 40, priceHistory: weeklyPrices([45, 40]) })
    const { prediction } = (await api().get(`/api/products/${product.id}/price-history`).expect(200)).body
    assert.deepEqual(
      { ...prediction, forecastAt: undefined },
      { forecast: 40, forecastAt: undefined, changePercent: 0, confidence: 0, verdict: 'steady', weeks: 0, hasEnoughData: false }
    )
  })

  it('records a new point when an admin changes the price', async () => {
    const { token } = await createAdmin()
    const product = await createProduct({ price: 60, priceHistory: weeklyPrices([60, 60, 60]) })
    await api().put(`/api/products/${product.id}`).set(bearer(token)).send({ price: 48 }).expect(200)

    const res = await api().get(`/api/products/${product.id}/price-history`).expect(200)
    assert.deepEqual(res.body.points.map((point) => point.price), [60, 60, 60, 48])
    assert.equal(res.body.currentPrice, 48)
  })

  it('answers 404 and 400 like the product itself', async () => {
    await api().get('/api/products/999999/price-history').expect(404)
    await api().get('/api/products/abc/price-history').expect(400)
  })
})

describe('services/pricePredict', () => {
  it('builds twelve weekly seed points that end on today\'s price', () => {
    const now = Date.now()
    const points = buildSeedHistory({ id: 7, price: 19.99, discountPercentage: 12 }, now)
    assert.equal(points.length, 12)
    assert.equal(points.at(-1).price, 19.99)
    assert.equal(points.at(-1).at.getTime(), now)
    assert.equal(points[0].at.getTime(), now - 11 * WEEK)
    assert.deepEqual(buildSeedHistory({ id: 7, price: 19.99, discountPercentage: 12 }, now), points, 'the same product always gets the same history')
  })

  it('keeps the forecast within 40% of today\'s price', () => {
    const steep = weeklyPrices([10, 100, 200])
    const { forecast } = predictPrice(steep, 50)
    assert.equal(forecast, 70)
  })
})
