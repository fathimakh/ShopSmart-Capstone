import { describe, expect, it } from 'vitest'
import {
  deliveryFromAccount,
  digitsOnly,
  formatCardNumber,
  formatExpiry,
  validateDelivery,
  validatePayment
} from './checkoutValidation'

const delivery = {
  name: 'Demo Shopper',
  email: 'demo@shopsmart.dev',
  phone: '98765 43210',
  address: '12 MG Road, Indiranagar',
  city: 'Bengaluru',
  state: 'Karnataka',
  pincode: '560001'
}

describe('checkout validation', () => {
  it('formats card numbers and expiry dates while typing', () => {
    expect(digitsOnly('4242-4242')).toBe('42424242')
    expect(formatCardNumber('4242424242424242999')).toBe('4242 4242 4242 4242')
    expect(formatExpiry('1228')).toBe('12/28')
    expect(formatExpiry('1')).toBe('1')
  })

  it('accepts a complete delivery address and flags each missing part', () => {
    expect(validateDelivery(delivery)).toEqual({})
    expect(
      Object.keys(validateDelivery({ ...delivery, email: 'nope', phone: '123', pincode: '12', address: 'short' }))
    ).toEqual(['email', 'phone', 'address', 'pincode'])
  })

  it('checks card and UPI details only for the method chosen', () => {
    expect(validatePayment({ method: 'cod' })).toEqual({})
    expect(
      validatePayment({ method: 'card', cardName: '', cardNumber: '4242', expiry: '13/28', cvv: '1' })
    ).toEqual({
      cardName: 'Enter the name printed on the card',
      cardNumber: 'Enter the 16 digit card number',
      expiry: 'Use the MM/YY format',
      cvv: 'Enter the 3 digit CVV'
    })
    expect(validatePayment({ method: 'upi', upiId: 'name@bank' })).toEqual({})
    expect(validatePayment({ method: 'upi', upiId: 'nope' }).upiId).toBe('Enter a UPI ID such as name@bank')
  })

  it('fills the delivery form in from the account', () => {
    const user = {
      name: 'Asha Nair',
      email: 'asha@example.com',
      address: { name: '', phone: '9876543210', address: '4 Beach Road', city: 'Kochi', state: 'Kerala', pincode: '682001' }
    }
    expect(deliveryFromAccount(user)).toEqual({
      name: 'Asha Nair',
      email: 'asha@example.com',
      phone: '9876543210',
      address: '4 Beach Road',
      city: 'Kochi',
      state: 'Kerala',
      pincode: '682001'
    })
    expect(deliveryFromAccount({ name: 'New Shopper', email: 'new@example.com' }).address).toBe('')
  })
})
