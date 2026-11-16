import { Link, Navigate, useLocation } from 'react-router-dom'
import { FiLock, FiWifiOff } from 'react-icons/fi'
import { useAuth } from '../../context/AuthContext'
import EmptyState from '../EmptyState/EmptyState'
import './ProtectedRoute.css'

const roleNames = { admin: 'store admins', customer: 'shoppers' }

/**
 * Shows its children only to a signed in account, and with requiredRole only to that
 * role. Guests go to sign in and come back afterwards; a signed in account without the
 * role gets an explanation on the page instead of a redirect loop.
 */
function ProtectedRoute({ children, requiredRole }) {
  const { user, status, restoreError, retrySession } = useAuth()
  const location = useLocation()

  if (status === 'checking') {
    return (
      <div className="container protected-checking" role="status">
        <span className="protected-spinner" aria-hidden="true" />
        Checking your sign in
      </div>
    )
  }

  if (status === 'error') {
    return (
      <div className="container">
        <EmptyState
          icon={FiWifiOff}
          headingLevel={1}
          title="We could not check your sign in"
          message={restoreError ? restoreError.message : undefined}
          action={
            <button type="button" className="btn btn-primary" onClick={retrySession}>
              Try again
            </button>
          }
        />
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location }} />
  }

  if (requiredRole && user.role !== requiredRole) {
    return (
      <div className="container">
        <EmptyState
          icon={FiLock}
          headingLevel={1}
          title={`This page is for ${roleNames[requiredRole] || requiredRole} only`}
          message={`You are signed in as ${user.email}, which does not have access to it. Sign in with a different account if you look after the store.`}
          action={
            <div className="protected-actions">
              <Link className="btn btn-primary" to="/">
                Back to the shop
              </Link>
              <Link className="btn btn-outline" to="/account">
                Your account
              </Link>
            </div>
          }
        />
      </div>
    )
  }

  return children
}

export default ProtectedRoute
