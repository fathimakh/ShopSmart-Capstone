/**
 * Price drop prediction. A least squares line is fitted through the last twelve weeks of
 * prices and carried two weeks forward. R squared, how much of the movement the line
 * explains, becomes the confidence, so a noisy history never produces a confident call.
 *
 * In the mini project the history was rebuilt in the browser. Prices are now stored in
 * MongoDB, every admin price change adds a point, and the forecast moves with them.
 */

const DAY = 24 * 60 * 60 * 1000
export const WEEK = 7 * DAY
export const SEED_WEEKS = 12
export const FORECAST_WEEKS = 2
// A line through one or two points says nothing about a trend.
export const MIN_POINTS = 3
// Nor do prices recorded minutes apart, however many there are: carried two weeks ahead,
// a slope measured over an afternoon becomes a 40% swing. The history has to reach back
// at least this far before there is a forecast.
export const MIN_WEEKS = 3

// Small deterministic generator so a product always gets the same starting history.
function seededRandom(seed) {
  let state = seed >>> 0
  return () => {
    state += 0x6d2b79f5
    let value = Math.imul(state ^ (state >>> 15), 1 | state)
    value ^= value + Math.imul(value ^ (value >>> 7), 61 | value)
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * The catalogue has no past prices, so the seed starts each product with twelve weekly
 * points that begin near the pre-discount price and end on today's price.
 */
export function buildSeedHistory(product, now = Date.now()) {
  const random = seededRandom(product.id * 7919 + Math.round(product.price * 100))
  const originalPrice = product.discountPercentage
    ? product.price / (1 - product.discountPercentage / 100)
    : product.price
  const start =
    product.discountPercentage >= 8 ? originalPrice : product.price * (0.82 + random() * 0.34)
  const drift = (random() - 0.45) * 0.06

  const points = []
  for (let week = 0; week < SEED_WEEKS; week += 1) {
    const progress = week / (SEED_WEEKS - 1)
    const trend = start + (product.price - start) * progress
    const noise = (random() - 0.5) * product.price * 0.05
    const wobble = product.price * drift * Math.sin(week * 1.1)
    points.push({
      price: Math.max(0.5, Number((trend + noise + wobble).toFixed(2))),
      at: new Date(now - (SEED_WEEKS - 1 - week) * WEEK)
    })
  }

  points[SEED_WEEKS - 1].price = product.price
  return points
}

/**
 * Fits price against time in weeks rather than against the point number, because admin
 * changes do not land on a weekly beat and two edits in one afternoon are not two weeks.
 */
export function linearRegression(points) {
  const n = points.length
  const meanX = points.reduce((total, point) => total + point.x, 0) / n
  const meanY = points.reduce((total, point) => total + point.y, 0) / n

  let covariance = 0
  let varianceX = 0
  points.forEach(({ x, y }) => {
    covariance += (x - meanX) * (y - meanY)
    varianceX += (x - meanX) ** 2
  })

  const slope = varianceX ? covariance / varianceX : 0
  const intercept = meanY - slope * meanX

  let residual = 0
  let total = 0
  points.forEach(({ x, y }) => {
    residual += (y - (intercept + slope * x)) ** 2
    total += (y - meanY) ** 2
  })

  return { slope, intercept, rSquared: total ? 1 - residual / total : 0 }
}

/**
 * A price holds until the next change, so every week without one is a week at the same
 * price. Adding a weekly point across each quiet stretch, up to now, makes a price that
 * has not moved for a month count as a flat month instead of being skipped over, which
 * would otherwise carry an old slope further and further as time passes.
 */
function fillQuietWeeks(points, now) {
  const filled = []
  points.forEach((point, index) => {
    filled.push(point)
    const next = points[index + 1]
    // Up to the next change, or for the current price up to and including this week.
    for (let time = point.time + WEEK; next ? time < next.time : time <= now; time += WEEK) {
      filled.push({ time, price: point.price })
    }
  })
  return filled
}

export function predictPrice(history, currentPrice, now = Date.now()) {
  const sorted = [...history]
    .map((point) => ({ time: new Date(point.at).getTime(), price: point.price }))
    .sort((a, b) => a.time - b.time)
  const prices = sorted.map((point) => point.price)

  if (sorted.length < MIN_POINTS || (now - sorted[0].time) / WEEK < MIN_WEEKS) {
    return {
      history: prices,
      forecast: currentPrice,
      changePercent: 0,
      confidence: 0,
      verdict: 'steady',
      weeks: 0,
      enoughData: false
    }
  }

  // Only the recent trend says where the price is heading.
  const recent = fillQuietWeeks(sorted, now).filter((point) => point.time >= now - SEED_WEEKS * WEEK)
  const first = recent[0].time
  const points = recent.map((point) => ({ x: (point.time - first) / WEEK, y: point.price }))
  const { slope, intercept, rSquared } = linearRegression(points)

  const target = (now - first) / WEEK + FORECAST_WEEKS
  const rawForecast = intercept + slope * target
  // A straight line can run away on a short history, so the forecast stays within 40%.
  const forecast = Number(Math.min(Math.max(rawForecast, currentPrice * 0.6), currentPrice * 1.4).toFixed(2))

  const changePercent = ((forecast - currentPrice) / currentPrice) * 100
  const confidence = Math.round(Math.min(Math.max(rSquared, 0), 1) * 100)

  let verdict = 'steady'
  if (confidence >= 35 && changePercent <= -2) verdict = 'drop'
  if (confidence >= 35 && changePercent >= 2) verdict = 'rise'

  return {
    history: prices,
    forecast,
    changePercent: Number(changePercent.toFixed(1)),
    confidence,
    verdict,
    weeks: Math.round((now - first) / WEEK),
    enoughData: true
  }
}
