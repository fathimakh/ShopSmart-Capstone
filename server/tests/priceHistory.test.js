import { api, bearer, createAdmin, createProduct, useTestDatabase } from './helpers/testApp.js'
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { buildSeedHistory, predictPrice } from '../services/pricePredict.js'

useTestDatabase('price_history')

const WEEK = 7 * 24 * 60 * 60 * 1000

function weeklyPrices(prices, now = Date.now()) {
  return prices.map((price, index) => ({ price, at: new Date(now - (prices.length - 1 - index) * WEEK) }))
}

const FALLING = [120, 117, 114, 111, 108, 105, 102, 99, 96, 93, 90, 87]

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

  it('has no forecast yet for a new product whose price an admin changed twice', async () => {
    const { token } = await createAdmin()
    const product = await createProduct({ price: 19.99, priceHistory: [{ price: 19.99, at: new Date() }] })
    await api().put(`/api/products/${product.id}`).set(bearer(token)).send({ price: 18.99 }).expect(200)
    await api().put(`/api/products/${product.id}`).set(bearer(token)).send({ price: 17.99 }).expect(200)

    const res = await api().get(`/api/products/${product.id}/price-history`).expect(200)
    assert.equal(res.body.points.length, 3)
    const { prediction } = res.body
    assert.deepEqual(
      [prediction.hasEnoughData, prediction.verdict, prediction.forecast, prediction.confidence, prediction.weeks],
      [false, 'steady', 17.99, 0, 0]
    )
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
    const steep = weeklyPrices([10, 70, 130, 200])
    const { forecast } = predictPrice(steep, 50)
    assert.equal(forecast, 70)
  })

  it('needs three weeks of history, however many points there are', () => {
    const now = Date.now()
    const minutesApart = [100, 95, 90].map((price, index) => ({ price, at: new Date(now - (2 - index) * 60000) }))
    assert.deepEqual(
      predictPrice(minutesApart, 90, now),
      { history: [100, 95, 90], forecast: 90, changePercent: 0, confidence: 0, verdict: 'steady', weeks: 0, enoughData: false }
    )
    assert.equal(predictPrice(weeklyPrices([100, 95, 90], now), 90, now).enoughData, false)
    assert.equal(predictPrice(weeklyPrices([100, 95, 90, 85], now), 85, now).enoughData, true)
  })

  it('lets a forecast fade while the price stays the same', () => {
    const recordedAt = Date.now()
    const history = weeklyPrices(FALLING, recordedAt)
    const after = (weeks) => predictPrice(history, 87, recordedAt + weeks * WEEK)

    assert.deepEqual([after(0).verdict, after(0).changePercent], ['drop', -6.9])
    // Quiet weeks count as weeks at the same price. The old slope still shows for a few
    // weeks, but it fades instead of being carried further each week (-34% by week 8).
    const changes = [1, 2, 3, 4, 6, 8].map((weeks) => after(weeks).changePercent)
    assert.ok(changes.every((change) => change > -12), changes.join(', '))
    assert.ok(Math.abs(after(8).changePercent) < Math.abs(after(4).changePercent))
    assert.deepEqual([after(12).verdict, after(12).changePercent, after(12).weeks], ['steady', 0, 12])
  })

  it('reads a price that held for weeks before a cut as a flat stretch', () => {
    const now = Date.now()
    // Steady at 50 for ten weeks, recorded only when it was set and when it was cut today.
    const history = [
      { price: 50, at: new Date(now - 10 * WEEK) },
      { price: 50, at: new Date(now - 10 * WEEK + 60000) },
      { price: 45, at: new Date(now) }
    ]
    const prediction = predictPrice(history, 45, now)
    assert.equal(prediction.weeks, 10)
    // Without the quiet weeks the line would run from 50 straight down to 45 and on.
    assert.ok(prediction.confidence < 35, `confidence ${prediction.confidence}`)
    assert.equal(prediction.verdict, 'steady')
  })
})
