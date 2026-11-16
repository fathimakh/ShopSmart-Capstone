import { Link } from 'react-router-dom'
import './StatCard.css'

// One headline number on the dashboard. With `to` the whole card links to the page that
// lists what it counts, so the link text reads as "Orders 12 ...".
function StatCard({ icon: Icon, label, value, hint, to, tone = 'primary' }) {
  const content = (
    <>
      <span className={`stat-card-icon is-${tone}`} aria-hidden="true">
        <Icon />
      </span>
      <span className="stat-card-text">
        <span className="stat-card-label">{label}</span>
        <span className="stat-card-value">{value}</span>
        {hint ? <span className="stat-card-hint">{hint}</span> : null}
      </span>
    </>
  )

  return to ? (
    <Link className="stat-card card is-link" to={to}>
      {content}
    </Link>
  ) : (
    <div className="stat-card card">{content}</div>
  )
}

export default StatCard
