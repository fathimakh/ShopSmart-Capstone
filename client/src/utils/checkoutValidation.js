const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/
const EXPIRY_PATTERN = /^(0[1-9]|1[0-2])\/\d{2}$/
const UPI_PATTERN = /^[\w.-]{3,}@[a-zA-Z]{3,}$/

export function digitsOnly(value) {
  return value.replace(/\D/g, '')
}

// Card numbers are grouped in fours while typing, the way a real form behaves.
export function formatCardNumber(value) {
  return digitsOnly(value).slice(0, 16).replace(/(.{4})/g, '$1 ').trim()
}

export function formatExpiry(value) {
  const digits = digitsOnly(value).slice(0, 4)
  return digits.length > 2 ? `${digits.slice(0, 2)}/${digits.slice(2)}` : digits
}

// Mirrors server/validators/orderValidators.js, so most mistakes show before a round trip.
export function validateDelivery(values) {
  const errors = {}

  const name = values.name.trim()
  if (name.length < 2) errors.name = 'Enter the name for this delivery'
  else if (name.length > 60) errors.name = 'Keep the name under 60 characters'
  if (!EMAIL_PATTERN.test(values.email.trim())) errors.email = 'Enter a valid email address'
  if (digitsOnly(values.phone).length !== 10) errors.phone = 'Enter a 10 digit phone number'
  const street = values.address.trim()
  if (street.length < 8) errors.address = 'Enter the full street address'
  else if (street.length > 160) errors.address = 'Keep the address under 160 characters'
  if (!values.city.trim()) errors.city = 'Enter the city'
  else if (values.city.trim().length > 60) errors.city = 'Keep the city under 60 characters'
  if (!values.state.trim()) errors.state = 'Enter the state'
  else if (values.state.trim().length > 60) errors.state = 'Keep the state under 60 characters'
  if (digitsOnly(values.pincode).length !== 6) errors.pincode = 'Enter a 6 digit PIN code'

  return errors
}

export function validatePayment(values) {
  const errors = {}

  if (values.method === 'card') {
    if (!values.cardName.trim()) errors.cardName = 'Enter the name printed on the card'
    if (digitsOnly(values.cardNumber).length !== 16) {
      errors.cardNumber = 'Enter the 16 digit card number'
    }
    if (!EXPIRY_PATTERN.test(values.expiry)) errors.expiry = 'Use the MM/YY format'
    if (digitsOnly(values.cvv).length !== 3) errors.cvv = 'Enter the 3 digit CVV'
  }

  if (values.method === 'upi' && !UPI_PATTERN.test(values.upiId.trim())) {
    errors.upiId = 'Enter a UPI ID such as name@bank'
  }

  return errors
}

/**
 * The delivery form filled in from the account: the saved address (every order updates
 * it on the server) and the account's own name and email where the address has none.
 */
export function deliveryFromAccount(user) {
  const address = (user && user.address) || {}
  return {
    name: address.name || (user && user.name) || '',
    email: (user && user.email) || '',
    phone: address.phone || '',
    address: address.address || '',
    city: address.city || '',
    state: address.state || '',
    pincode: address.pincode || ''
  }
}
