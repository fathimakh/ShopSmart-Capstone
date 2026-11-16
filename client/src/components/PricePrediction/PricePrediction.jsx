import { useEffect, useState } from 'react'
import { FiActivity, FiClock, FiTrendingDown, FiTrendingUp } from 'react-icons/fi'
import RetryNotice from '../RetryNotice/RetryNotice'
import { fetchPriceHistory } from '../../services/api'
import { isAbortError } from '../../services/http'
import { buildPriceChart, toPolyline } from '../../utils/priceChart'
import { formatDate, formatPrice, formatShortDate, pluralize } from '../../utils/format'
import './PricePrediction.css'

const CHART_WIDTH = 320
const CHART_HEIGHT = 90
const PADDING = 8

const verdicts = {
  drop: {
    icon: FiTrendingDown,
    label: 'Likely to drop',
    tone: 'is-drop',
    advice: (difference) => `Waiting a couple of weeks could save about ${formatPrice(difference)}.`
  },
  rise: {
    icon: FiTrendingUp,
    label: 'Likely to rise',
    tone: 'is-rise',
    advice: (difference) => `Buying now could save about ${formatPrice(difference)} against the forecast.`
  },
  steady: {
    icon: FiActivity,
    label: 'Holding steady',
    tone: 'is-steady',
    advice: () => 'The price has barely moved recently, so there is little to gain by waiting.'
  }
}

/**
 * The price outlook on a product page: the prices the store has recorded for the product,
 * week by week, and the server's straight line forecast two weeks ahead with how well the
 * line fits as its confidence.
 */
function PricePrediction({ product }) {
  const productId = product.id
  const [state, setState] = useState({ status: 'loading', data: null, error: null })
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    setState({ status: 'loading', data: null, error: null })

    fetchPriceHistory(productId, { signal: controller.signal })
      .then((data) => setState({ status: 'ready', data, error: null }))
      .catch((error) => {
        if (isAbortError(error)) return
        setState({ status: 'error', data: null, error })
      })

    return () => controller.abort()
  }, [productId, attempt])

  const heading = <h2 id="forecast-heading">Price outlook</h2>

  if (state.status === 'loading') {
    return (
      <section className="price-prediction card is-loading" aria-labelledby="forecast-heading">
        <div className="price-prediction-head">{heading}</div>
        <div className="skeleton price-prediction-skeleton" role="status">
          <span className="visually-hidden">Loading the price history</span>
        </div>
      </section>
    )
  }

  if (state.status === 'error') {
    return (
      <section className="price-prediction card" aria-labelledby="forecast-heading">
        <div className="price-prediction-head">{heading}</div>
        <RetryNotice
          title="We could not load the price history."
          message={state.error.message}
          onRetry={() => setAttempt((count) => count + 1)}
        />
      </section>
    )
  }

  const { currentPrice, points, prediction } = state.data

  if (!prediction || !prediction.hasEnoughData) {
    return (
      <section className="price-prediction card is-steady" aria-labelledby="forecast-heading">
        <div className="price-prediction-head">{heading}</div>
        <p className="price-prediction-short">
          <FiClock aria-hidden="true" />
          Not enough price history yet. The outlook appears once the store has recorded this
          price for a few weeks.
        </p>
      </section>
    )
  }

  const chart = buildPriceChart(points, prediction, {
    width: CHART_WIDTH,
    height: CHART_HEIGHT,
    padding: PADDING
  })
  const verdict = verdicts[prediction.verdict] || verdicts.steady
  const Icon = verdict.icon
  const difference = Math.abs(prediction.forecast - currentPrice)
  const last = chart ? chart.forecast?.[1] || chart.history[chart.history.length - 1] : null

  return (
    <section className={`price-prediction card ${verdict.tone}`} aria-labelledby="forecast-heading">
      <div className="price-prediction-head">
        {heading}
        <span className="price-prediction-badge">
          <Icon aria-hidden="true" />
          {verdict.label}
        </span>
      </div>

      {chart ? (
        <figure className="price-prediction-figure">
          <svg
            className="price-prediction-chart"
            viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
            role="img"
            aria-label={`${pluralize(points.length, 'recorded price')} from ${formatDate(chart.from)} to ${formatDate(chart.to)}, between ${formatPrice(chart.lowest)} and ${formatPrice(chart.highest)}, then a forecast of ${formatPrice(prediction.forecast)} for ${formatDate(prediction.forecastAt)}`}
          >
            <polyline className="price-prediction-line" points={toPolyline(chart.history)} />
            {chart.forecast ? (
              <polyline className="price-prediction-forecast" points={toPolyline(chart.forecast)} />
            ) : null}
            <circle className="price-prediction-dot" cx={last[0]} cy={last[1]} r="4" />
          </svg>
          <figcaption className="price-prediction-axis" aria-hidden="true">
            <span>{formatShortDate(chart.from)}</span>
            <span>Forecast {formatShortDate(prediction.forecastAt)}</span>
          </figcaption>
        </figure>
      ) : null}

      <p className="price-prediction-summary">
        A trend fitted over {pluralize(prediction.weeks, 'week')} of recorded prices points to{' '}
        <strong>{formatPrice(prediction.forecast)}</strong> in two weeks
        {prediction.changePercent !== 0 ? ` (${prediction.changePercent > 0 ? '+' : ''}${prediction.changePercent}%)` : ''}, with{' '}
        {prediction.confidence}% confidence.
      </p>
      <p className="price-prediction-advice">{verdict.advice(difference)}</p>
    </section>
  )
}

export default PricePrediction
