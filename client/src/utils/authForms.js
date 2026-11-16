// Checks for the sign in, sign up and account forms. They mirror the server's rules
// (server/validators/authValidators.js) so most mistakes are caught before a round trip;
// the server still has the final say.

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/
const PASSWORD_PATTERN = /^(?=.*[A-Za-z])(?=.*\d).{8,128}$/

function passwordProblem(value, label = 'Password') {
  if (value.length < 8) return `${label} must be at least 8 characters`
  if (value.length > 128) return `${label} must be at most 128 characters`
  if (!PASSWORD_PATTERN.test(value)) return `${label} needs at least one letter and one number`
  return null
}

/** Spaces and dashes are fine to type in a phone number or PIN code; the API wants digits. */
export function compactDigits(value) {
  return value.replace(/[\s-]/g, '')
}

export function validateLogin(values) {
  const errors = {}
  if (!EMAIL_PATTERN.test(values.email.trim())) errors.email = 'Enter a valid email address'
  if (!values.password) errors.password = 'Enter your password'
  return errors
}

export function validateRegister(values) {
  const errors = {}
  const name = values.name.trim()
  if (name.length < 2) errors.name = 'Enter your name (at least 2 characters)'
  else if (name.length > 50) errors.name = 'Name must be at most 50 characters'
  if (!EMAIL_PATTERN.test(values.email.trim())) errors.email = 'Enter a valid email address'
  const password = passwordProblem(values.password)
  if (password) errors.password = password
  return errors
}

/** values: name plus the six saved address fields, each of which may be left empty. */
export function validateProfile(values) {
  const errors = {}
  const name = values.name.trim()
  if (name.length < 2) errors.name = 'Enter your name (at least 2 characters)'
  else if (name.length > 50) errors.name = 'Name must be at most 50 characters'
  if (values.recipient.trim().length > 60) errors.recipient = 'Keep the name under 60 characters'

  const phone = compactDigits(values.phone)
  if (phone && !/^\d{10}$/.test(phone)) errors.phone = 'Enter a 10 digit phone number'

  if (values.street.trim().length > 160) errors.street = 'Keep the address under 160 characters'
  if (values.city.trim().length > 60) errors.city = 'Keep the city under 60 characters'
  if (values.state.trim().length > 60) errors.state = 'Keep the state under 60 characters'

  const pincode = compactDigits(values.pincode)
  if (pincode && !/^\d{6}$/.test(pincode)) errors.pincode = 'Enter a 6 digit PIN code'
  return errors
}

export function validatePasswordChange(values) {
  const errors = {}
  if (!values.currentPassword) errors.currentPassword = 'Enter your current password'
  const problem = passwordProblem(values.newPassword, 'New password')
  if (problem) errors.newPassword = problem
  else if (values.newPassword === values.currentPassword) {
    errors.newPassword = 'Choose a password you have not used here'
  }
  if (values.confirmPassword !== values.newPassword) {
    errors.confirmPassword = 'The passwords do not match'
  }
  return errors
}

/**
 * Where to go after signing in: the page that asked for it (passed by ProtectedRoute in
 * router state), or the shop. The sign in pages themselves are never a destination.
 */
export function returnPath(state) {
  const from = state && state.from
  if (!from || typeof from.pathname !== 'string') return '/'
  if (from.pathname === '/login' || from.pathname === '/register') return '/'
  return `${from.pathname}${from.search || ''}${from.hash || ''}`
}
