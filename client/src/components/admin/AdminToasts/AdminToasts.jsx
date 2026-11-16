import { useCallback, useEffect, useRef, useState } from 'react'
import { FiAlertCircle, FiCheckCircle, FiX } from 'react-icons/fi'
import { AdminToastContext } from '../../../hooks/useAdminToast'
import './AdminToasts.css'

// Long enough to read a sentence twice. Hovering or focusing a message keeps it open.
const SHOW_FOR_MS = 7000
const MAX_TOASTS = 3

let nextId = 0

/**
 * Gives the admin pages notify(message, { tone }) and shows the messages in one corner.
 * The list is a polite live region that is always in the page, so screen readers
 * announce each result as it arrives, even when a save is followed by navigation.
 */
function AdminToasts({ children }) {
  const [toasts, setToasts] = useState([])
  const [paused, setPaused] = useState(false)
  const timers = useRef(new Map())

  const dismiss = useCallback((id) => {
    setToasts((current) => current.filter((toast) => toast.id !== id))
    clearTimeout(timers.current.get(id))
    timers.current.delete(id)
  }, [])

  const notify = useCallback((message, { tone = 'success' } = {}) => {
    nextId += 1
    const id = nextId
    setToasts((current) => [...current.slice(1 - MAX_TOASTS), { id, message, tone }])
  }, [])

  // Each message gets its own timer, and every timer stops while one is being read.
  useEffect(() => {
    if (paused) {
      timers.current.forEach((timer) => clearTimeout(timer))
      timers.current.clear()
      return undefined
    }
    toasts.forEach((toast) => {
      if (!timers.current.has(toast.id)) {
        timers.current.set(
          toast.id,
          setTimeout(() => dismiss(toast.id), SHOW_FOR_MS)
        )
      }
    })
    return undefined
  }, [toasts, paused, dismiss])

  useEffect(() => {
    const pending = timers.current
    return () => {
      pending.forEach((timer) => clearTimeout(timer))
      pending.clear()
    }
  }, [])

  return (
    <AdminToastContext.Provider value={notify}>
      {children}
      <div
        className="admin-toasts"
        role="status"
        aria-live="polite"
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
        onFocus={() => setPaused(true)}
        onBlur={() => setPaused(false)}
      >
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={toast.tone === 'error' ? 'admin-toast is-error' : 'admin-toast'}
          >
            {toast.tone === 'error' ? (
              <FiAlertCircle aria-hidden="true" />
            ) : (
              <FiCheckCircle aria-hidden="true" />
            )}
            <p>{toast.message}</p>
            <button
              type="button"
              className="admin-toast-close"
              onClick={() => dismiss(toast.id)}
            >
              <FiX aria-hidden="true" />
              <span className="visually-hidden">Dismiss message</span>
            </button>
          </div>
        ))}
      </div>
    </AdminToastContext.Provider>
  )
}

export default AdminToasts
