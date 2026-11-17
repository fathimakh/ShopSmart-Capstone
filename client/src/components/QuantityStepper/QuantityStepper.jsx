import { FiMinus, FiPlus } from 'react-icons/fi'
import './QuantityStepper.css'

function QuantityStepper({ value, onChange, min = 1, max = 99, label = 'Quantity' }) {
  // Only the first letter is lowered, so a product name in the label keeps its capitals
  // ("Increase quantity of iPhone 5s").
  const action = `${label.charAt(0).toLowerCase()}${label.slice(1)}`

  return (
    <div className="quantity-stepper">
      <button
        type="button"
        onClick={() => onChange(value - 1)}
        disabled={value <= min}
        aria-label={`Decrease ${action}`}
      >
        <FiMinus aria-hidden="true" />
      </button>
      <span aria-live="polite">
        <span className="visually-hidden">{label}: </span>
        {value}
      </span>
      <button
        type="button"
        onClick={() => onChange(value + 1)}
        disabled={value >= max}
        aria-label={`Increase ${action}`}
      >
        <FiPlus aria-hidden="true" />
      </button>
    </div>
  )
}

export default QuantityStepper
