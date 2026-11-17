import { DEFAULT_PASSWORD, api, bearer, createUser, useTestDatabase } from './helpers/testApp.js'
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import User from '../models/user.js'

useTestDatabase('auth')

describe('POST /api/auth/register', () => {
  it('creates a customer account and signs it in', async () => {
    const res = await api()
      .post('/api/auth/register')
      .send({ name: '  Meera Das ', email: ' Meera@Example.COM ', password: 'Shopping1' })
      .expect(201)

    assert.equal(res.body.success, true)
    assert.ok(res.body.token)
    assert.equal(res.body.user.name, 'Meera Das')
    assert.equal(res.body.user.email, 'meera@example.com')
    assert.equal(res.body.user.role, 'customer')
    assert.ok(res.body.user._id)
    for (const hidden of ['password', 'tokenVersion', 'cart', 'wishlist', 'recentlyViewed', '__v']) {
      assert.equal(hidden in res.body.user, false, `${hidden} must not be sent`)
    }

    const stored = await User.findOne({ email: 'meera@example.com' }).select('+password')
    assert.notEqual(stored.password, 'Shopping1', 'the password is stored as a hash')
  })

  it('never lets a sign up choose the admin role', async () => {
    const res = await api()
      .post('/api/auth/register')
      .send({ name: 'Sneaky', email: 'sneaky@example.com', password: 'Shopping1', role: 'admin' })
      .expect(201)
    assert.equal(res.body.user.role, 'customer')
  })

  it('reports every invalid field at once', async () => {
    const res = await api()
      .post('/api/auth/register')
      .send({ name: 'A', email: 'not-an-email', password: 'short' })
      .expect(400)

    assert.equal(res.body.code, 'VALIDATION_ERROR')
    assert.deepEqual(res.body.errors.map((error) => error.field).sort(), ['email', 'name', 'password'])
  })

  it('asks for a letter and a number in the password', async () => {
    const res = await api()
      .post('/api/auth/register')
      .send({ name: 'Ravi', email: 'ravi@example.com', password: 'onlyletters' })
      .expect(400)
    assert.match(res.body.errors[0].message, /letter and one number/)
  })

  it('answers 409 EMAIL_TAKEN for an email that already has an account', async () => {
    const { user } = await createUser()
    const res = await api()
      .post('/api/auth/register')
      .send({ name: 'Again', email: user.email.toUpperCase(), password: 'Shopping1' })
      .expect(409)
    assert.equal(res.body.code, 'EMAIL_TAKEN')
  })
})

describe('POST /api/auth/login', () => {
  it('signs in with the right password, whatever the email case', async () => {
    const { user } = await createUser()
    const res = await api()
      .post('/api/auth/login')
      .send({ email: user.email.toUpperCase(), password: DEFAULT_PASSWORD })
      .expect(200)
    assert.ok(res.body.token)
    assert.equal(res.body.user.email, user.email)
  })

  it('gives the same 401 for a wrong password and an unknown email', async () => {
    const { user } = await createUser()
    const wrong = await api().post('/api/auth/login').send({ email: user.email, password: 'Wrong1234' }).expect(401)
    const unknown = await api()
      .post('/api/auth/login')
      .send({ email: 'nobody@example.com', password: 'Wrong1234' })
      .expect(401)

    assert.equal(wrong.body.code, 'INVALID_CREDENTIALS')
    assert.deepEqual(wrong.body, unknown.body)
  })
})

describe('GET and PATCH /api/auth/me', () => {
  it('returns the signed in account', async () => {
    const { user, token } = await createUser()
    const res = await api().get('/api/auth/me').set(bearer(token)).expect(200)
    assert.equal(res.body.user._id, user._id.toString())
  })

  it('updates the name and the saved address', async () => {
    const { token } = await createUser()
    const res = await api()
      .patch('/api/auth/me')
      .set(bearer(token))
      .send({ name: ' Asha N ', address: { city: ' Kochi ', pincode: '682001' } })
      .expect(200)

    assert.equal(res.body.user.name, 'Asha N')
    assert.equal(res.body.user.address.city, 'Kochi')
    assert.equal(res.body.user.address.pincode, '682001')
  })

  it('names the address field that is wrong', async () => {
    const { token } = await createUser()
    const res = await api()
      .patch('/api/auth/me')
      .set(bearer(token))
      .send({ address: { phone: '12345' } })
      .expect(400)
    assert.deepEqual(res.body.errors, [{ field: 'address.phone', message: 'Enter a 10 digit phone number' }])
  })

  it('answers 400 NOTHING_TO_UPDATE to an empty update', async () => {
    const { token } = await createUser()
    const res = await api().patch('/api/auth/me').set(bearer(token)).send({}).expect(400)
    assert.equal(res.body.code, 'NOTHING_TO_UPDATE')
  })
})

describe('PATCH /api/auth/password', () => {
  it('changes the password, signs out older tokens and returns a fresh one', async () => {
    const { user, token } = await createUser()
    const res = await api()
      .patch('/api/auth/password')
      .set(bearer(token))
      .send({ currentPassword: DEFAULT_PASSWORD, newPassword: 'NewPassw0rd' })
      .expect(200)

    const old = await api().get('/api/auth/me').set(bearer(token)).expect(401)
    assert.equal(old.body.code, 'TOKEN_REVOKED')
    await api().get('/api/auth/me').set(bearer(res.body.token)).expect(200)
    await api().post('/api/auth/login').send({ email: user.email, password: 'NewPassw0rd' }).expect(200)
  })

  it('checks the current password', async () => {
    const { token } = await createUser()
    const res = await api()
      .patch('/api/auth/password')
      .set(bearer(token))
      .send({ currentPassword: 'Wrong1234', newPassword: 'NewPassw0rd' })
      .expect(400)
    assert.equal(res.body.errors[0].field, 'currentPassword')
  })

  it('refuses the same password again', async () => {
    const { token } = await createUser()
    const res = await api()
      .patch('/api/auth/password')
      .set(bearer(token))
      .send({ currentPassword: DEFAULT_PASSWORD, newPassword: DEFAULT_PASSWORD })
      .expect(400)
    assert.equal(res.body.errors[0].field, 'newPassword')
  })
})

describe('POST /api/auth/logout', () => {
  it('signs out this device only by default', async () => {
    const { token } = await createUser()
    const res = await api().post('/api/auth/logout').set(bearer(token)).expect(200)
    assert.deepEqual(res.body, { success: true, message: 'Signed out' })
    // The client forgets its token; nothing on the server changes.
    await api().get('/api/auth/me').set(bearer(token)).expect(200)
  })

  it('signs out every device with allDevices', async () => {
    const { user, token } = await createUser()
    const { token: otherShopper } = await createUser()
    const login = await api().post('/api/auth/login').send({ email: user.email, password: DEFAULT_PASSWORD }).expect(200)

    const res = await api().post('/api/auth/logout').set(bearer(token)).send({ allDevices: true }).expect(200)
    assert.equal(res.body.message, 'Signed out on every device')

    for (const stale of [token, login.body.token]) {
      const me = await api().get('/api/auth/me').set(bearer(stale)).expect(401)
      assert.equal(me.body.code, 'TOKEN_REVOKED')
    }
    await api().get('/api/auth/me').set(bearer(otherShopper)).expect(200)
    await api().post('/api/auth/login').send({ email: user.email, password: DEFAULT_PASSWORD }).expect(200)
  })

  it('needs a token and a real boolean', async () => {
    const { token } = await createUser()
    assert.equal((await api().post('/api/auth/logout').expect(401)).body.code, 'NO_TOKEN')
    const res = await api().post('/api/auth/logout').set(bearer(token)).send({ allDevices: 'yes' }).expect(400)
    assert.equal(res.body.errors[0].field, 'allDevices')
  })
})

describe('Shared demo accounts', () => {
  it('keep their password and their other sessions', async () => {
    // Every visitor of the live demo signs in to these with the same one-click button.
    const { user, token } = await createUser({ email: 'Demo@ShopSmart.dev' })
    const password = await api()
      .patch('/api/auth/password')
      .set(bearer(token))
      .send({ currentPassword: DEFAULT_PASSWORD, newPassword: 'NewPassw0rd' })
      .expect(403)
    assert.equal(password.body.code, 'DEMO_ACCOUNT_LOCKED')
    assert.match(password.body.message, /shared demo account/)

    const everywhere = await api().post('/api/auth/logout').set(bearer(token)).send({ allDevices: true }).expect(403)
    assert.equal(everywhere.body.code, 'DEMO_ACCOUNT_LOCKED')

    await api().get('/api/auth/me').set(bearer(token)).expect(200)
    await api().post('/api/auth/login').send({ email: user.email, password: DEFAULT_PASSWORD }).expect(200)
    await api().post('/api/auth/logout').set(bearer(token)).send({ allDevices: false }).expect(200)
  })
})
