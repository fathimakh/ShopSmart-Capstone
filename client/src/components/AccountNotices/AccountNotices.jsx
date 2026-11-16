import { Link, useLocation } from 'react-router-dom'
import { FiAlertTriangle, FiClock, FiX } from 'react-icons/fi'
import { useAuth } from '../../context/AuthContext'
import { useShop } from '../../context/ShopContext'
import './AccountNotices.css'

/**
 * Notes about the account that can appear on any page: a session that ended without the
 * shopper asking, a session that could not be checked, and lists that failed to save.
 * The live region is always rendered so screen readers announce notes as they arrive.
 */
function AccountNotices() {
  const { status, sessionNotice, clearSessionNotice, retrySession } = useAuth()
  const { listsStatus, listsError, retryListsSync } = useShop()
  const location = useLocation()

  // The sign in page shows the session note inside its own form.
  const showSessionNotice = Boolean(sessionNotice) && location.pathname !== '/login'

  return (
    <div className="container account-notices" aria-live="polite">
      {showSessionNotice ? (
        <div className="account-notice">
          <FiClock aria-hidden="true" />
          <p>
            <strong>Session ended. </strong>
            {sessionNotice}
          </p>
          <div className="account-notice-actions">
            <Link className="btn btn-outline" to="/login" state={{ from: location }}>
              Sign in
            </Link>
            <button type="button" className="account-notice-close" onClick={clearSessionNotice}>
              <FiX aria-hidden="true" />
              <span className="visually-hidden">Dismiss notice</span>
            </button>
          </div>
        </div>
      ) : null}

      {status === 'error' ? (
        <div className="account-notice">
          <FiAlertTriangle aria-hidden="true" />
          <p>
            <strong>We could not check your sign in. </strong>
            Your account features will be back once the server answers.
          </p>
          <div className="account-notice-actions">
            <button type="button" className="btn btn-outline" onClick={retrySession}>
              Try again
            </button>
          </div>
        </div>
      ) : null}

      {listsStatus === 'error' ? (
        <div className="account-notice">
          <FiAlertTriangle aria-hidden="true" />
          <p>
            <strong>Your cart and wishlist are not saved to your account yet. </strong>
            {listsError ? `${listsError.message} ` : ''}
            Changes stay on this device until it works.
          </p>
          <div className="account-notice-actions">
            <button type="button" className="btn btn-outline" onClick={retryListsSync}>
              Try again
            </button>
          </div>
        </div>
      ) : null}
    </div>
  )
}

export default AccountNotices
