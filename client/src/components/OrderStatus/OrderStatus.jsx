import { orderStatus } from '../../utils/orders'
import './OrderStatus.css'

// The status pill brings its own styles, so it looks right on whichever order page the
// shopper lands on first (each page's CSS arrives with that page).
function OrderStatus({ order }) {
  const status = orderStatus(order)
  return <span className={`order-status ${status.tone}`}>{status.label}</span>
}

export default OrderStatus
