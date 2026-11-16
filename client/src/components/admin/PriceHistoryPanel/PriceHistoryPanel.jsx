import { useEffect, useRef } from 'react'
import { FiActivity } from 'react-icons/fi'
import AdminLoadError from '../AdminLoadError/AdminLoadError'
import useAdminResource from '../../../hooks/useAdminResource'
import { formatDate, formatPrice, pluralize } from '../../../utils/format'
import './PriceHistoryPanel.css'

// Enough rows to see the trend without pushing the form off screen.
const SHOWN_POINTS = 8
const verdictText = {
  drop: 'likely to drop',
  rise: 'likely to rise',
  steady: 'likely to stay about the same'
}

function Sparkline({ points }) {
  if (points.length < 2) return null
  const prices = points.map((point) => point.price)
  const low = Math.min(...prices)
  const high = Math.max(...prices)
  const range = high - low || 1
  const step = 100 / (points.length - 1)
  const line = prices
    .map((price, index) => `${(index * step).toFixed(2)},${(36 - ((price - low) / range) * 32).toFixed(2)}`)
    .join(' ')

  return (
    <svg className="price-history-spark" viewBox="0 0 100 40" preserveAspectRatio="none" aria-hidden="true">
      <polyline points={line} fill="none" vectorEffect="non-scaling-stroke" />
    </svg>
  )
}

/**
 * The prices recorded for a product (GET /api/products/:id/price-history), shown next to
 * the edit form so an admin can see that saving a new price adds a point. version goes
 * up after every saved price change, which loads the history again; the newest row is
 * then marked as the one just added.
 */
function PriceHistoryPanel({ productId, version = 0 }) {
  const { data, status, error, reload } = useAdminResource(`/products/${productId}/price-history`)
  const firstVersion = useRef(version)

  useEffect(() => {
    if (version !== firstVersion.current) reload()
  }, [version, reload])

  const points = data ? data.points : []
  const newestFirst = points.slice(-SHOWN_POINTS).reverse()
  const prediction = data ? data.prediction : null
  const justAdded = version !== firstVersion.current && status === 'success'

  return (
    <section className="price-history card" aria-labelledby="price-history-title">
      <h2 id="price-history-title">
        <FiActivity aria-hidden="true" />
        Price history
      </h2>

      {!data && status === 'loading' ? (
        <div aria-hidden="true">
          <div className="skeleton price-history-skeleton" />
        </div>
      ) : null}

      {status === 'error' ? (
        <AdminLoadError compact title="The price history could not be loaded" error={error} onRetry={reload} />
      ) : null}

      {data ? (
        <>
          <p className="price-history-summary" role="status">
            {points.length
              ? `${pluralize(points.length, 'price')} recorded.`
              : 'No prices recorded yet.'}{' '}
            Every saved price change adds one, and the latest 26 are kept.
          </p>

          <Sparkline points={points} />

          {newestFirst.length ? (
            <table className="price-history-table">
              <caption className="visually-hidden">Recorded prices, newest first</caption>
              <thead>
                <tr>
                  <th scope="col">Date</th>
                  <th scope="col">Price</th>
                </tr>
              </thead>
              <tbody>
                {newestFirst.map((point, index) => (
                  <tr key={`${point.at}-${index}`} className={index === 0 && justAdded ? 'is-new' : undefined}>
                    <th scope="row">
                      {formatDate(point.at)}
                      {index === 0 && justAdded ? <span className="price-history-new">Just added</span> : null}
                    </th>
                    <td>{formatPrice(point.price)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : null}

          {prediction && prediction.hasEnoughData ? (
            <p className="price-history-forecast">
              The forecast for {formatDate(prediction.forecastAt)} is{' '}
              <strong>{formatPrice(prediction.forecast)}</strong> ({prediction.changePercent > 0 ? '+' : ''}
              {prediction.changePercent}%), {verdictText[prediction.verdict] || prediction.verdict}, with{' '}
              {prediction.confidence}% confidence.
            </p>
          ) : (
            <p className="price-history-forecast">
              There is not enough price history yet for a forecast. It needs at least 3 prices.
            </p>
          )}
        </>
      ) : null}
    </section>
  )
}

export default PriceHistoryPanel
