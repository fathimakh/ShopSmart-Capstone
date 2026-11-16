import { useId, useState } from 'react'
import { FiAlertCircle, FiInfo } from 'react-icons/fi'
import ConfirmDialog from '../ConfirmDialog/ConfirmDialog'
import FormField from '../../FormField/FormField'
import useAdminMutation from '../../../hooks/useAdminMutation'
import { updateOrderStatus } from '../../../services/adminApi'
import {
  ORDER_STATUS_LABELS,
  STATUS_ACTIONS,
  STATUS_NOTE_LIMIT,
  nextStatuses
} from '../../../services/adminRules'
import './OrderStatusForm.css'

// Answers that mean the order on screen is out of date, so the page loads it again.
const STALE_CODES = ['ORDER_CHANGED', 'INVALID_STATUS_TRANSITION']

const defaultNotes = {
  shipped: 'Handed to the courier',
  delivered: 'Delivered',
  cancelled: 'Cancelled by the store'
}

/**
 * Moves an order on. Only the next statuses the API allows are offered (docs/API.md,
 * PATCH /api/orders/:ref/status), so an admin can never pick a step the server would
 * refuse. Cancelling asks first, because it puts the stock back and cannot be undone.
 *
 * onUpdated(order) gets the saved order. onStale() is called when the server says the
 * order changed under us (another admin, or the shopper cancelling), so the page can
 * load the latest version.
 */
function OrderStatusForm({ order, onUpdated, onStale }) {
  const options = nextStatuses(order.status)
  const [picked, setPicked] = useState(null)
  const [note, setNote] = useState('')
  const [confirming, setConfirming] = useState(false)
  const [feedback, setFeedback] = useState(null)
  const { run, isPending, error, resetError } = useAdminMutation()
  const groupId = useId()

  // A choice made for an earlier status no longer applies once the order has moved on.
  const choice = options.includes(picked) ? picked : options[0]

  if (!options.length) {
    return (
      <p className="order-status-final">
        <FiInfo aria-hidden="true" />
        {order.status === 'delivered'
          ? 'This order has been delivered, which is final. Its status cannot change any more.'
          : 'This order was cancelled, which is final. Its stock is already back on the shelf.'}
      </p>
    )
  }

  const send = async () => {
    setFeedback(null)
    const result = await run(
      `status:${order.number}`,
      () => updateOrderStatus(order.number, { status: choice, note: note.trim() }),
      { successMessage: `Order ${order.number} ${STATUS_ACTIONS[choice].done}` }
    )

    if (result.ok) {
      // The toast confirms the change; the badge at the top of the page shows it.
      setConfirming(false)
      setNote('')
      setPicked(null)
      onUpdated(result.data.order)
      return
    }

    if (result.error && STALE_CODES.includes(result.error.code)) {
      setConfirming(false)
      resetError()
      setFeedback(
        `${result.error.message} The latest version of the order is shown now, so check it and choose again.`
      )
      onStale()
    }
    // Any other failure stays where it happened: in the dialog, or under the button.
  }

  const submit = (event) => {
    event.preventDefault()
    if (isPending) return
    if (choice === 'cancelled') {
      resetError()
      setConfirming(true)
    } else {
      send()
    }
  }

  const action = STATUS_ACTIONS[choice]

  return (
    <form className="order-status-form" onSubmit={submit} noValidate>
      <fieldset className="order-status-options" aria-describedby={`${groupId}-current`}>
        <legend>Move this order to</legend>
        <p id={`${groupId}-current`} className="visually-hidden">
          It is {ORDER_STATUS_LABELS[order.status].toLowerCase()} now.
        </p>
        {options.map((option) => (
          <label
            key={option}
            className={
              option === choice ? 'order-status-option is-selected' : 'order-status-option'
            }
          >
            <input
              type="radio"
              name={`${groupId}-status`}
              value={option}
              checked={option === choice}
              onChange={() => {
                setPicked(option)
                setFeedback(null)
              }}
            />
            <span>
              <strong>{ORDER_STATUS_LABELS[option]}</strong>
              <span>{STATUS_ACTIONS[option].hint}</span>
            </span>
          </label>
        ))}
      </fieldset>

      <FormField
        id={`${groupId}-note`}
        label="Note for the order history (optional)"
        hint={`Up to ${STATUS_NOTE_LIMIT} characters. Left empty, the note reads "${defaultNotes[choice]}".`}
        value={note}
        maxLength={STATUS_NOTE_LIMIT}
        placeholder={action.placeholder}
        onChange={(event) => setNote(event.target.value)}
      />

      <button
        type="submit"
        className={choice === 'cancelled' ? 'btn order-status-cancel' : 'btn btn-primary'}
        aria-disabled={isPending}
      >
        {isPending && !confirming ? 'Saving' : action.label}
      </button>

      {error && !confirming ? (
        <p className="order-status-message is-error" role="alert">
          <FiAlertCircle aria-hidden="true" />
          {error.message}
        </p>
      ) : null}
      <div role="status">
        {feedback ? (
          <p className="order-status-message is-info">
            <FiInfo aria-hidden="true" />
            {feedback}
          </p>
        ) : null}
      </div>

      <ConfirmDialog
        open={confirming}
        title={`Cancel order ${order.number}?`}
        confirmLabel="Cancel order"
        busyLabel="Cancelling"
        cancelLabel="Keep the order"
        busy={isPending}
        error={error}
        onConfirm={send}
        onCancel={() => {
          setConfirming(false)
          resetError()
        }}
      >
        <p>
          The order stops and every item goes back in stock. The shopper sees it as cancelled.
          This cannot be undone.
        </p>
      </ConfirmDialog>
    </form>
  )
}

export default OrderStatusForm
