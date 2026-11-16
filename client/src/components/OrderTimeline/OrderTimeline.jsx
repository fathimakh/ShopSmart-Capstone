import { FiCheck, FiPackage, FiTruck, FiX } from 'react-icons/fi'
import { orderTimeline } from '../../utils/orders'
import { formatDateTime } from '../../utils/format'
import './OrderTimeline.css'

const stepIcons = {
  processing: FiPackage,
  shipped: FiTruck,
  delivered: FiCheck,
  cancelled: FiX
}

const stateNames = {
  done: 'Done',
  current: 'Current step',
  upcoming: 'Still to come'
}

/** The order's journey, read from its status history. */
function OrderTimeline({ order }) {
  const steps = orderTimeline(order)

  return (
    <ol className={order.status === 'cancelled' ? 'order-timeline is-cancelled' : 'order-timeline'}>
      {steps.map((step) => {
        const Icon = stepIcons[step.status] || FiPackage
        return (
          <li
            key={step.status}
            className={`order-timeline-step is-${step.state} is-${step.status}`}
            aria-current={step.state === 'current' ? 'step' : undefined}
          >
            <span className="order-timeline-marker" aria-hidden="true">
              <Icon />
            </span>
            <div className="order-timeline-text">
              <p className="order-timeline-label">
                {step.label}
                <span className="visually-hidden">, {stateNames[step.state]}</span>
              </p>
              {step.at ? (
                <p className="order-timeline-meta">
                  <time dateTime={step.at}>{formatDateTime(step.at)}</time>
                  {step.note && step.note !== step.label ? ` - ${step.note}` : ''}
                </p>
              ) : (
                <p className="order-timeline-meta">Not yet</p>
              )}
            </div>
          </li>
        )
      })}
    </ol>
  )
}

export default OrderTimeline
