import { useEffect, useId, useRef } from 'react'
import { getErrorMessage } from '../../../services/http'
import './ConfirmDialog.css'

/**
 * Asks before a change that cannot be undone, such as deleting a product.
 *
 * Built on the native <dialog> opened with showModal(), which keeps keyboard focus inside
 * it and makes the rest of the page inert. Focus starts on the safe choice, Escape
 * cancels, and focus goes back to the button that opened it. While the change is being
 * sent the dialog cannot be closed, so a half finished request is never hidden. A failure
 * is shown inside the dialog, so the admin can retry or back out.
 */
function ConfirmDialog({
  open,
  title,
  children,
  confirmLabel = 'Confirm',
  busyLabel = 'Working',
  cancelLabel = 'Keep it',
  tone = 'danger',
  busy = false,
  error = null,
  onConfirm,
  onCancel
}) {
  const dialogRef = useRef(null)
  const cancelRef = useRef(null)
  const returnFocusTo = useRef(null)
  const titleId = useId()
  const bodyId = useId()

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return undefined

    if (open && !dialog.open) {
      returnFocusTo.current = document.activeElement
      // jsdom has no showModal, so tests fall back to a plain open dialog.
      if (typeof dialog.showModal === 'function') dialog.showModal()
      else dialog.setAttribute('open', '')
      if (cancelRef.current) cancelRef.current.focus()
    }

    if (!open && dialog.open) {
      if (typeof dialog.close === 'function') dialog.close()
      else dialog.removeAttribute('open')
      const opener = returnFocusTo.current
      if (opener && opener.isConnected) opener.focus()
    }
    return undefined
  }, [open])

  const requestClose = () => {
    if (!busy) onCancel()
  }

  return (
    <dialog
      ref={dialogRef}
      className="confirm-dialog"
      aria-labelledby={titleId}
      aria-describedby={bodyId}
      onCancel={(event) => {
        // Escape asks the page to close it, so React state stays the one source of truth.
        event.preventDefault()
        requestClose()
      }}
    >
      {open ? (
        <div className="confirm-dialog-inner">
          <h2 id={titleId}>{title}</h2>
          <div id={bodyId} className="confirm-dialog-body">
            {children}
          </div>
          {error ? (
            <p className="confirm-dialog-error" role="alert">
              {getErrorMessage(error)}
            </p>
          ) : null}
          <div className="confirm-dialog-actions">
            <button
              ref={cancelRef}
              type="button"
              className="btn btn-outline"
              onClick={requestClose}
              disabled={busy}
            >
              {cancelLabel}
            </button>
            {/* aria-disabled rather than disabled, so focus stays on the button while the
                change is sent and the admin can press it again after a failure. */}
            <button
              type="button"
              className={tone === 'danger' ? 'btn confirm-dialog-danger' : 'btn btn-primary'}
              onClick={() => {
                if (!busy) onConfirm()
              }}
              aria-disabled={busy}
            >
              {busy ? busyLabel : confirmLabel}
            </button>
          </div>
        </div>
      ) : null}
    </dialog>
  )
}

export default ConfirmDialog
