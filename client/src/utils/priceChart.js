// Turns the recorded prices of a product (GET /api/products/:id/price-history) into
// coordinates for the small SVG chart on the product page. Pure, so it can be tested.

function toEntry(price, at) {
  const time = Date.parse(at)
  if (typeof price !== 'number' || !Number.isFinite(price) || Number.isNaN(time)) return null
  return { price, time }
}

const round = (value) => Number(value.toFixed(2))

/**
 * Places every recorded price by its date, and the forecast at its own date, so a gap
 * between recordings shows as a longer stretch of line rather than being squeezed into
 * even steps. The y axis is flipped (SVG measures from the top, a price chart reads from
 * the bottom), and a flat series or a single date would divide by zero, so a zero span
 * counts as 1.
 *
 * Returns null when there are fewer than two prices to draw a line through. Otherwise
 * { history: [[x, y], ...], forecast: [[x, y], [x, y]] | null, lowest, highest, from, to }.
 */
export function buildPriceChart(points, prediction, { width, height, padding }) {
  const series = (points || []).map((point) => toEntry(point.price, point.at)).filter(Boolean)
  if (series.length < 2) return null

  const forecast =
    prediction && prediction.hasEnoughData ? toEntry(prediction.forecast, prediction.forecastAt) : null
  const all = forecast ? [...series, forecast] : series

  const times = all.map((entry) => entry.time)
  const prices = all.map((entry) => entry.price)
  const earliest = Math.min(...times)
  const timeSpan = Math.max(...times) - earliest || 1
  const bottom = Math.min(...prices)
  const priceSpan = Math.max(...prices) - bottom || 1

  const place = (entry) => [
    round(padding + ((entry.time - earliest) / timeSpan) * (width - padding * 2)),
    round(padding + (1 - (entry.price - bottom) / priceSpan) * (height - padding * 2))
  ]

  const history = series.map(place)
  const recorded = series.map((entry) => entry.price)
  return {
    history,
    forecast: forecast ? [history[history.length - 1], place(forecast)] : null,
    // The range of the recorded prices only, for describing the chart in words.
    lowest: Math.min(...recorded),
    highest: Math.max(...recorded),
    from: series[0].time,
    to: series[series.length - 1].time
  }
}

/** The points as an SVG polyline "points" attribute. */
export function toPolyline(coordinates) {
  return coordinates.map(([x, y]) => `${x},${y}`).join(' ')
}
