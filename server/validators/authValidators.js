import { boolean, email, object, password, text } from './rules.js'

export const registerRules = {
  name: text({ label: 'Name', min: 2, max: 50 }),
  email: email(),
  password: password()
}

// Strength is not checked again at sign in; a wrong password is simply a 401.
export const loginRules = {
  email: email(),
  password: text({ label: 'Password', max: 128 })
}

export const addressRules = {
  name: text({ label: 'Name', max: 60, required: false }),
  phone: text({ label: 'Phone', max: 15, required: false, pattern: /^\d{10}$/, patternMessage: 'Enter a 10 digit phone number' }),
  address: text({ label: 'Street address', max: 160, required: false }),
  city: text({ label: 'City', max: 60, required: false }),
  state: text({ label: 'State', max: 60, required: false }),
  pincode: text({ label: 'PIN code', max: 6, required: false, pattern: /^\d{6}$/, patternMessage: 'Enter a 6 digit PIN code' })
}

export const profileRules = {
  name: text({ label: 'Name', min: 2, max: 50 }),
  address: object({ label: 'Address', fields: addressRules, required: false, partial: true })
}

export const passwordChangeRules = {
  currentPassword: text({ label: 'Current password', max: 128 }),
  newPassword: password({ label: 'New password' })
}

export const logoutRules = {
  allDevices: boolean({ label: 'All devices' })
}
