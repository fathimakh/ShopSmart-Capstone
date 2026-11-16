import { describe, expect, it } from 'vitest'
import {
  compactDigits,
  returnPath,
  validateLogin,
  validatePasswordChange,
  validateProfile,
  validateRegister
} from './authForms'
import { decodeJwt, getTokenExpiry } from './jwt'
import { fakeToken } from '../test/fakeApi'

const emptyProfile = {
  name: 'Asha N',
  recipient: '',
  phone: '',
  street: '',
  city: '',
  state: '',
  pincode: ''
}

describe('auth form checks', () => {
  it('needs an email and a password to sign in', () => {
    expect(validateLogin({ email: 'nope', password: '' })).toEqual({
      email: 'Enter a valid email address',
      password: 'Enter your password'
    })
    expect(validateLogin({ email: ' demo@shopsmart.dev ', password: 'x' })).toEqual({})
  })

  it('follows the server password rule on sign up', () => {
    expect(validateRegister({ name: 'A', email: 'a@b.co', password: 'short1' })).toEqual({
      name: 'Enter your name (at least 2 characters)',
      password: 'Password must be at least 8 characters'
    })
    expect(validateRegister({ name: 'Meera', email: 'a@b.co', password: 'lettersonly' }).password).toBe(
      'Password needs at least one letter and one number'
    )
    expect(validateRegister({ name: 'Meera', email: 'meera@example.com', password: 'Shopping1' })).toEqual({})
  })

  it('lets address fields stay empty but checks phone and PIN code shapes', () => {
    expect(validateProfile(emptyProfile)).toEqual({})
    expect(validateProfile({ ...emptyProfile, phone: '12345', pincode: '12' })).toEqual({
      phone: 'Enter a 10 digit phone number',
      pincode: 'Enter a 6 digit PIN code'
    })
    expect(validateProfile({ ...emptyProfile, phone: '98765 43210', pincode: '682 001' })).toEqual({})
    expect(compactDigits('98765-43210')).toBe('9876543210')
  })

  it('checks a password change before it is sent', () => {
    expect(
      validatePasswordChange({ currentPassword: '', newPassword: 'Shopping1', confirmPassword: 'Shopping2' })
    ).toEqual({
      currentPassword: 'Enter your current password',
      confirmPassword: 'The passwords do not match'
    })
    expect(
      validatePasswordChange({ currentPassword: 'Shopping1', newPassword: 'Shopping1', confirmPassword: 'Shopping1' })
        .newPassword
    ).toBe('Choose a password you have not used here')
  })

  it('returns to the page that asked for sign in, never to the sign in pages', () => {
    expect(returnPath(null)).toBe('/')
    expect(returnPath({ from: { pathname: '/checkout', search: '?step=2', hash: '' } })).toBe('/checkout?step=2')
    expect(returnPath({ from: { pathname: '/register' } })).toBe('/')
  })
})

describe('jwt helpers', () => {
  it('reads the expiry from a token', () => {
    const token = fakeToken(2000000000)
    expect(decodeJwt(token).tv).toBe(0)
    expect(getTokenExpiry(token)).toBe(2000000000 * 1000)
  })

  it('returns null for something that is not a token', () => {
    expect(decodeJwt('not-a-token')).toBeNull()
    expect(getTokenExpiry(null)).toBeNull()
  })
})
