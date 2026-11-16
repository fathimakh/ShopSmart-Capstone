import { formatPrice, pluralize } from '../../../utils/format'
import './SalesChart.css'

// The API sends store calendar days ("2026-11-17"). Reading them as UTC dates and
// formatting in UTC keeps each label on its own day in every browser time zone.
const dayLabel = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })
const longDayLabel = new Intl.DateTimeFormat('en-GB', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  timeZone: 'UTC'
})
const dayOfMonth = new Intl.DateTimeFormat('en-GB', { day: 'numeric', timeZone: 'UTC' })

function toDate(day) {
  const [year, month, date] = day.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, date))
}

/**
 * Revenue for each of the last fourteen days as plain CSS bars, without a chart library.
 * The bars are one image with a spoken summary; the exact figures are in a table under
 * "Show the daily figures", which works with a keyboard and a screen reader.
 */
function SalesChart({ days }) {
  if (!days || !days.length) return null
  const totalRevenue = days.reduce((sum, day) => sum + day.revenue, 0)
  const totalOrders = days.reduce((sum, day) => sum + day.orders, 0)
  const best = days.reduce((top, day) => (day.revenue > top.revenue ? day : top), days[0])
  const highest = best ? best.revenue : 0
  const first = days[0]
  const last = days[days.length - 1]

  const summary =
    totalOrders === 0
      ? `No sales from ${dayLabel.format(toDate(first.date))} to ${dayLabel.format(toDate(last.date))}.`
      : `${formatPrice(totalRevenue)} from ${pluralize(totalOrders, 'order')} between ${dayLabel.format(
          toDate(first.date)
        )} and ${dayLabel.format(toDate(last.date))}. The best day was ${longDayLabel.format(
          toDate(best.date)
        )} with ${formatPrice(best.revenue)}.`

  return (
    <figure className="sales-chart">
      <figcaption className="sales-chart-caption">
        <span className="sales-chart-total">{formatPrice(totalRevenue)}</span>
        <span>
          from {pluralize(totalOrders, 'order')} in the last {days.length} days, cancelled orders
          left out
        </span>
      </figcaption>

      <div className="sales-chart-plot" role="img" aria-label={summary}>
        <span className="sales-chart-max" aria-hidden="true">
          {highest ? formatPrice(highest) : '$0'}
        </span>
        <ol
          className="sales-chart-bars"
          style={{ gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))` }}
          aria-hidden="true"
        >
          {days.map((day, index) => {
            const height = highest ? Math.max((day.revenue / highest) * 100, day.revenue ? 3 : 0) : 0
            const isToday = index === days.length - 1
            return (
              <li
                key={day.date}
                className={isToday ? 'sales-chart-day is-today' : 'sales-chart-day'}
                title={`${longDayLabel.format(toDate(day.date))}: ${formatPrice(day.revenue)}, ${pluralize(
                  day.orders,
                  'order'
                )}`}
              >
                <span className="sales-chart-track">
                  <span className="sales-chart-bar" style={{ height: `${height}%` }} />
                </span>
                <span className="sales-chart-label">{dayOfMonth.format(toDate(day.date))}</span>
              </li>
            )
          })}
        </ol>
      </div>

      <details className="sales-chart-details">
        <summary>Show the daily figures</summary>
        <div className="sales-chart-table-wrap">
          <table className="sales-chart-table">
            <caption className="visually-hidden">Orders and revenue for each day</caption>
            <thead>
              <tr>
                <th scope="col">Day</th>
                <th scope="col">Orders</th>
                <th scope="col">Revenue</th>
              </tr>
            </thead>
            <tbody>
              {days.map((day) => (
                <tr key={day.date}>
                  <th scope="row">{longDayLabel.format(toDate(day.date))}</th>
                  <td>{day.orders}</td>
                  <td>{formatPrice(day.revenue)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  )
}

export default SalesChart
