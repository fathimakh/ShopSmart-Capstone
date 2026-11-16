import { describe, expect, it } from 'vitest'
import { buildPriceChart, toPolyline } from './priceChart'

const canvas = { width: 100, height: 50, padding: 0 }

const weekly = [
  { price: 12, at: '2026-11-02T00:00:00.000Z' },
  { price: 11, at: '2026-11-09T00:00:00.000Z' },
  { price: 10, at: '2026-11-16T00:00:00.000Z' }
]

describe('price chart', () => {
  it('places prices by date and adds the forecast as a dashed last step', () => {
    const prediction = { hasEnoughData: true, forecast: 8, forecastAt: '2026-11-30T00:00:00.000Z' }
    const chart = buildPriceChart(weekly, prediction, canvas)

    // Four weeks from first price to forecast, so each week is a quarter of the width.
    expect(chart.history).toEqual([
      [0, 0],
      [25, 12.5],
      [50, 25]
    ])
    expect(chart.forecast).toEqual([
      [50, 25],
      [100, 50]
    ])
    expect(chart).toMatchObject({ lowest: 10, highest: 12 })
    expect(chart.from).toBe(Date.parse(weekly[0].at))
    expect(chart.to).toBe(Date.parse(weekly[2].at))
  })

  it('leaves the forecast out when the server says there is not enough data', () => {
    const chart = buildPriceChart(weekly, { hasEnoughData: false, forecast: 10, forecastAt: '2026-11-30T00:00:00.000Z' }, canvas)
    expect(chart.forecast).toBeNull()
    expect(chart.history[2]).toEqual([100, 50])
  })

  it('draws nothing from fewer than two usable prices', () => {
    expect(buildPriceChart([], null, canvas)).toBeNull()
    expect(buildPriceChart([weekly[0]], null, canvas)).toBeNull()
    expect(buildPriceChart([weekly[0], { price: 'n/a', at: 'never' }], null, canvas)).toBeNull()
    expect(buildPriceChart(undefined, null, canvas)).toBeNull()
  })

  it('keeps a flat price and a single date on the canvas instead of dividing by zero', () => {
    const flat = buildPriceChart(
      [
        { price: 5, at: '2026-11-16T00:00:00.000Z' },
        { price: 5, at: '2026-11-16T00:00:00.000Z' }
      ],
      null,
      { width: 100, height: 50, padding: 8 }
    )
    flat.history.flat().forEach((value) => expect(Number.isFinite(value)).toBe(true))
    expect(flat.history[0]).toEqual([8, 42])
  })

  it('writes the coordinates as an SVG points list', () => {
    expect(toPolyline([[0, 1.5], [10, 2]])).toBe('0,1.5 10,2')
  })
})
