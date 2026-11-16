import { ORDER_STATUS_LABELS } from '../../../services/adminRules'
import './OrderStatusBadge.css'

// The colour repeats the word rather than replacing it, so the status reads the same
// without colour.
function OrderStatusBadge({ status }) {
  return (
    <span className={`order-status-badge is-${status}`}>
      {ORDER_STATUS_LABELS[status] || status}
    </span>
  )
}

export default OrderStatusBadge
