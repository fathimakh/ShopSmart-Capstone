import { useEffect } from 'react'
import { FiAlertTriangle, FiRefreshCw } from 'react-icons/fi'
import { useAuth } from '../../../context/AuthContext'
import { getErrorMessage } from '../../../services/http'
import './AdminLoadError.css'

/**
 * What an admin page shows when its data could not be loaded, with a way to try again.
 * compact is a one line banner for a failed refresh while older data stays on screen.
 */
function AdminLoadError({ title = 'We could not load this', error, onRetry, compact = false }) {
  const { refreshUser } = useAuth()
  const code = error ? error.code : null

  // FORBIDDEN here means another admin has just made this account a shopper. Reading the
  // account again lets the route guard explain that, instead of every page failing.
  useEffect(() => {
    if (code === 'FORBIDDEN') refreshUser().catch(() => {})
  }, [code, refreshUser])

  const message = getErrorMessage(error)

  if (compact) {
    return (
      <div className="admin-load-error is-compact" role="alert">
        <FiAlertTriangle aria-hidden="true" />
        <p>
          <strong>{title}.</strong> {message}
        </p>
        {onRetry ? (
          <button type="button" className="btn btn-outline" onClick={onRetry}>
            <FiRefreshCw aria-hidden="true" />
            Try again
          </button>
        ) : null}
      </div>
    )
  }

  return (
    <div className="admin-load-error card" role="alert">
      <span className="admin-load-error-icon" aria-hidden="true">
        <FiAlertTriangle />
      </span>
      <h2>{title}</h2>
      <p>{message}</p>
      {onRetry ? (
        <button type="button" className="btn btn-primary" onClick={onRetry}>
          <FiRefreshCw aria-hidden="true" />
          Try again
        </button>
      ) : null}
    </div>
  )
}

export default AdminLoadError
