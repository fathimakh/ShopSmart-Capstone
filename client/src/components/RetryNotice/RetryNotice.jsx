import { FiAlertTriangle, FiRefreshCw } from 'react-icons/fi'
import './RetryNotice.css'

/**
 * A failed load inside a page section: what went wrong and a way to try again. Pages
 * that fail as a whole use EmptyState with headingLevel 1 instead.
 */
function RetryNotice({ title, message, onRetry, retryLabel = 'Try again', busy = false }) {
  return (
    <div className="retry-notice" role="alert">
      <FiAlertTriangle aria-hidden="true" />
      <p>
        {title ? <strong>{title} </strong> : null}
        {message}
      </p>
      {onRetry ? (
        <button type="button" className="btn btn-outline" onClick={onRetry} disabled={busy}>
          <FiRefreshCw aria-hidden="true" />
          {busy ? 'Trying again' : retryLabel}
        </button>
      ) : null}
    </div>
  )
}

export default RetryNotice
