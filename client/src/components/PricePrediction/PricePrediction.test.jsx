import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import PricePrediction from './PricePrediction'
import { fakeApi } from '../../test/fakeApi'

const product = { id: 7, price: 10 }

const points = [
  { price: 12, at: '2026-10-26T00:00:00.000Z' },
  { price: 11.5, at: '2026-11-02T00:00:00.000Z' },
  { price: 11, at: '2026-11-09T00:00:00.000Z' },
  { price: 10, at: '2026-11-16T00:00:00.000Z' }
]

function history(prediction, extra = {}) {
  return () => [200, { success: true, productId: 7, currentPrice: 10, points, prediction, ...extra }]
}

describe('PricePrediction', () => {
  it('draws the recorded prices with the server forecast and its verdict', async () => {
    const api = fakeApi({
      'GET /products/7/price-history': history({
        forecast: 9.2,
        forecastAt: '2026-11-30T00:00:00.000Z',
        changePercent: -8,
        confidence: 92,
        verdict: 'drop',
        weeks: 3,
        hasEnoughData: true
      })
    })
    render(<PricePrediction product={product} />)

    expect(await screen.findByText('Likely to drop')).toBeInTheDocument()
    expect(screen.getByRole('img')).toHaveAccessibleName(
      '4 recorded prices from 26 Oct 2026 to 16 Nov 2026, between $10.00 and $12.00, then a forecast of $9.20 for 30 Nov 2026'
    )
    expect(screen.getByText(/fitted over 3 weeks of recorded prices/)).toHaveTextContent('(-8%), with 92% confidence')
    expect(screen.getByText('Waiting a couple of weeks could save about $0.80.')).toBeInTheDocument()
    expect(api.calls).toHaveLength(1)
  })

  it('says there is not enough history instead of drawing a chart', async () => {
    fakeApi({
      'GET /products/7/price-history': history(
        { forecast: 10, forecastAt: '2026-11-30T00:00:00.000Z', changePercent: 0, confidence: 0, verdict: 'steady', weeks: 0, hasEnoughData: false },
        { points: [{ price: 10, at: '2026-11-16T00:00:00.000Z' }] }
      )
    })
    render(<PricePrediction product={product} />)

    expect(await screen.findByText(/Not enough price history yet/)).toBeInTheDocument()
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
  })

  it('offers a retry when the history cannot be loaded', async () => {
    let fail = true
    fakeApi({
      'GET /products/7/price-history': () =>
        fail
          ? [500, { success: false, message: 'Something went wrong on our side.', code: 'SERVER_ERROR' }]
          : history({ forecast: 10, forecastAt: '2026-11-30T00:00:00.000Z', changePercent: 0, confidence: 40, verdict: 'steady', weeks: 3, hasEnoughData: true })()
    })
    render(<PricePrediction product={product} />)

    expect(await screen.findByRole('alert')).toHaveTextContent('We could not load the price history.')
    fail = false
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByText('Holding steady')).toBeInTheDocument()
  })
})
