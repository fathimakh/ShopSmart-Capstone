import {
  DEFAULT_PASSWORD,
  api,
  bearer,
  createAdmin,
  createProduct,
  createUser,
  env,
  useTestDatabase
} from './helpers/testApp.js'
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import jwt from 'jsonwebtoken'
import User from '../models/user.js'

useTestDatabase('security')

describe('NoSQL injection', () => {
  it('strips operators from a sign in body, which then fails validation', async () => {
    await createUser()
    const res = await api()
      .post('/api/auth/login')
      .send({ email: { $gt: '' }, password: { $gt: '' } })
      .expect(400)
    assert.equal(res.body.code, 'VALIDATION_ERROR')
    assert.deepEqual(res.body.errors.map((error) => error.field), ['email', 'password'])
  })

  it('strips operators and dotted keys anywhere in a body', async () => {
    const { user, token } = await createUser()
    const res = await api()
      .patch('/api/auth/me')
      .set(bearer(token))
      .send({ name: 'Still Me', role: 'admin', address: { city: 'Kochi', $where: 'sleep(1000)', 'pincode.$': '1' } })
      .expect(200)

    assert.equal(res.body.user.role, 'customer', 'the role cannot be set through the profile')
    const stored = await User.findById(user._id)
    assert.equal(stored.address.city, 'Kochi')
    assert.equal(stored.address.pincode, '')
  })

  it('turns an operator in an order line into a validation error', async () => {
    const { token } = await createUser()
    const res = await api()
      .post('/api/orders')
      .set(bearer(token))
      .send({ items: [{ id: { $gt: 0 }, quantity: 1 }], delivery: {}, payment: { method: 'cod' } })
      .expect(400)
    assert.equal(res.body.errors[0].field, 'items[0].id')
  })

  it('reads query strings as plain text', async () => {
    await createProduct({ brand: 'Apple' })
    await createProduct({ brand: 'Samsung' })
    const all = await api().get('/api/products?brand[$ne]=Apple').expect(200)
    assert.equal(all.body.products.length, 2, 'the bracketed key is ignored rather than run as an operator')

    const literal = await api().get('/api/products?q=.*').expect(200)
    assert.equal(literal.body.products.length, 0, 'search text is escaped before it becomes a pattern')
  })
})

describe('Malformed ids', () => {
  it('answers 400 INVALID_ID before touching the database', async () => {
    const { token } = await createUser()
    const { token: adminToken } = await createAdmin()
    const requests = [
      ['get', '/api/products/abc', token],
      ['get', '/api/products/1.5/reviews', token],
      ['get', '/api/orders/123', token],
      ['delete', '/api/products/1/reviews/not-an-id', token],
      ['patch', '/api/users/xyz', adminToken]
    ]
    for (const [method, path, as] of requests) {
      const res = await api()[method](path).set(bearer(as)).send({ role: 'admin' }).expect(400)
      assert.equal(res.body.code, 'INVALID_ID', `${method} ${path}`)
    }
  })
})

describe('Sessions', () => {
  const sign = (payload, options = {}) => jwt.sign(payload, env.jwtSecret, options)

  async function codeFor(authorization) {
    const res = await api().get('/api/auth/me').set('Authorization', authorization).expect(401)
    return res.body.code
  }

  it('names each way a token can fail', async () => {
    const { user } = await createUser()
    const id = user._id.toString()

    assert.equal(await codeFor(''), 'NO_TOKEN')
    assert.equal(await codeFor('Basic dXNlcjpwYXNz'), 'NO_TOKEN')
    assert.equal(await codeFor('Bearer not-a-jwt'), 'TOKEN_INVALID')
    assert.equal(await codeFor(`Bearer ${jwt.sign({ id, tv: 0 }, 'another-secret')}`), 'TOKEN_INVALID')
    assert.equal(await codeFor(`Bearer ${sign({ id, tv: 0 }, { expiresIn: -10 })}`), 'TOKEN_EXPIRED')
    assert.equal(await codeFor(`Bearer ${sign({ id })}`), 'TOKEN_INVALID')
    assert.equal(await codeFor(`Bearer ${sign({ id: 'admin', tv: 0 })}`), 'TOKEN_INVALID')
    assert.equal(await codeFor(`Bearer ${sign({ id: '0123456789abcdef01234567', tv: 0 })}`), 'USER_NOT_FOUND')
    assert.equal(await codeFor(`Bearer ${sign({ id, tv: 1 })}`), 'TOKEN_REVOKED')
  })

  it('refuses an unsigned token', async () => {
    const { user } = await createUser()
    const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url')
    const payload = Buffer.from(JSON.stringify({ id: user._id.toString(), role: 'admin', tv: 0 })).toString('base64url')
    assert.equal(await codeFor(`Bearer ${header}.${payload}.`), 'TOKEN_INVALID')
  })

  it('accepts the bearer scheme in any case', async () => {
    const { token } = await createUser()
    await api().get('/api/auth/me').set('Authorization', `bearer ${token}`).expect(200)
  })

  it('never sends a password hash', async () => {
    const { user } = await createUser()
    const res = await api().post('/api/auth/login').send({ email: user.email, password: DEFAULT_PASSWORD }).expect(200)
    assert.equal(JSON.stringify(res.body).includes('$2'), false)
  })
})

describe('Request bodies and unknown routes', () => {
  it('answers 400 INVALID_JSON to a broken body', async () => {
    const res = await api()
      .post('/api/auth/login')
      .set('Content-Type', 'application/json')
      .send('{"email": "a@b.co",')
      .expect(400)
    assert.equal(res.body.code, 'INVALID_JSON')
  })

  it('answers 400 INVALID_JSON to a body nested deeper than any real request', async () => {
    const depth = 200000
    const res = await api()
      .post('/api/auth/login')
      .set('Content-Type', 'application/json')
      .send(`{"email": ${'['.repeat(depth)}${']'.repeat(depth)}, "password": "x"}`)
      .expect(400)
    assert.equal(res.body.code, 'INVALID_JSON')
    assert.equal(res.body.message, 'The request body is nested too deeply')

    const nested = await api()
      .post('/api/auth/login')
      .send({ email: { a: { b: { c: [[['x']]] } } }, password: 'x' })
      .expect(400)
    assert.equal(nested.body.code, 'VALIDATION_ERROR', 'ordinary nesting still reaches validation')
  })

  it('answers 413 PAYLOAD_TOO_LARGE above 1 MB', async () => {
    const res = await api()
      .post('/api/auth/login')
      .send({ email: 'a@b.co', password: 'x'.repeat(1024 * 1024 + 10) })
      .expect(413)
    assert.equal(res.body.code, 'PAYLOAD_TOO_LARGE')
  })

  it('answers unknown routes with the standard error body', async () => {
    const res = await api().get('/api/nope').expect(404)
    assert.deepEqual(res.body, { success: false, message: 'Route not found: GET /api/nope', code: 'ROUTE_NOT_FOUND' })
  })
})

describe('CORS, headers and health', () => {
  it('allows the configured client and local dev servers, and no one else', async () => {
    const allowed = await api().get('/api/health').set('Origin', 'http://localhost:3000').expect(200)
    assert.equal(allowed.headers['access-control-allow-origin'], 'http://localhost:3000')

    const otherPort = await api().get('/api/health').set('Origin', 'http://127.0.0.1:4173').expect(200)
    assert.equal(otherPort.headers['access-control-allow-origin'], 'http://127.0.0.1:4173')

    const denied = await api().get('/api/health').set('Origin', 'https://evil.example').expect(403)
    assert.equal(denied.body.code, 'CORS_ORIGIN_DENIED')
    assert.equal(denied.headers['access-control-allow-origin'], undefined)
  })

  it('reports health with security headers and no framework banner', async () => {
    const res = await api().get('/api/health').expect(200)
    assert.equal(res.body.status, 'ok')
    assert.equal(res.body.db, 'connected')
    assert.equal(res.body.ai, false)
    assert.equal(res.headers['x-content-type-options'], 'nosniff')
    assert.equal(res.headers['x-powered-by'], undefined)
  })

  it('points to the documentation from the root', async () => {
    const res = await api().get('/').expect(200)
    assert.match(res.body.message, /docs\/API\.md/)
  })
})
