/**
 * Shared setup for the API tests (node:test + supertest).
 *
 * Import this file FIRST in every test file. config/env.js reads the environment once,
 * the first time it is imported, so the values below must be in place before the app
 * loads; that is why the app and the models are imported dynamically here.
 *
 * Each test file calls useTestDatabase('<name>') and gets its own throw-away database,
 * shopsmart_test_<name>, which is dropped before and after the file runs. The database
 * the app uses in development is never touched.
 *
 * The tests expect MongoDB on the standard port. A MongoDB elsewhere can be named with
 * TEST_MONGO_BASE_URI, in the shell or in .env. It is deliberately not taken from
 * MONGO_URI, which may point at a real (Atlas) database, because each file drops its own.
 */
import { after, before } from 'node:test'
import dotenv from 'dotenv'

// Read now so TEST_MONGO_BASE_URI can come from .env. The values set below still win.
dotenv.config({ quiet: true })

process.env.NODE_ENV = 'test'
process.env.JWT_SECRET = 'test-only-secret-for-the-shopsmart-api'
process.env.JWT_EXPIRES_IN = '1h'
process.env.CLIENT_URL = 'http://localhost:3000'
// The suite signs in and asks the assistant far more often than a person would.
process.env.AUTH_RATE_LIMIT_MAX = '10000'
process.env.AI_RATE_LIMIT_MAX = '10000'
// Never the key from .env. The AI tests switch a fake key on and stub fetch themselves.
process.env.GEMINI_API_KEY = ''
process.env.GEMINI_MODEL = 'gemini-3.5-flash-lite'
process.env.GEMINI_TIMEOUT_MS = '2000'
process.env.STORE_TIMEZONE = 'UTC'
// The shared demo accounts, whatever SEED_ADMIN_EMAIL or DEMO_ACCOUNT_EMAILS say in .env.
process.env.DEMO_ACCOUNT_EMAILS = 'admin@shopsmart.dev,demo@shopsmart.dev'

const MONGO_BASE_URI = process.env.TEST_MONGO_BASE_URI || 'mongodb://127.0.0.1:27017'

// A test that forgets to stub Gemini fails loudly instead of calling the real API.
globalThis.fetch = async (url) => {
  throw new Error(`Unexpected network request during a test: ${url}`)
}

const { default: mongoose } = await import('mongoose')
const { default: request } = await import('supertest')
const { default: app } = await import('../../app.js')
const { default: env } = await import('../../config/env.js')
const { nextSequence } = await import('../../models/counter.js')
const { default: Product } = await import('../../models/product.js')
const { default: User } = await import('../../models/user.js')
const { default: generateToken } = await import('../../utils/generateToken.js')

export { app, env, mongoose }

/** A fresh supertest agent for the app. */
export function api() {
  return request(app)
}

export function bearer(token) {
  return { Authorization: `Bearer ${token}` }
}

/** Connects to shopsmart_test_<name>, starting from (and leaving behind) an empty database. */
export function useTestDatabase(name) {
  before(async () => {
    await mongoose.connect(`${MONGO_BASE_URI}/shopsmart_test_${name}`, { serverSelectionTimeoutMS: 5000 })
    await mongoose.connection.dropDatabase()
    // Dropping the database drops the unique indexes too (email, product id, order number).
    await Promise.all(Object.values(mongoose.models).map((model) => model.createIndexes()))
  })

  after(async () => {
    await mongoose.connection.dropDatabase()
    await mongoose.disconnect()
  })
}

let sequence = 0
function nextNumber() {
  sequence += 1
  return sequence
}

export const DEFAULT_PASSWORD = 'Passw0rd1'

/** Creates an account straight in the database and returns it with a valid token. */
export async function createUser({ role = 'customer', password = DEFAULT_PASSWORD, ...overrides } = {}) {
  const number = nextNumber()
  const user = await User.create({
    name: `Test Shopper ${number}`,
    email: `shopper${number}@test.dev`,
    password,
    role,
    ...overrides
  })
  return { user, token: generateToken(user), password }
}

export function createAdmin(overrides = {}) {
  return createUser({ role: 'admin', name: `Test Admin ${nextNumber()}`, ...overrides })
}

/** Creates a product with the next id from the same counter the admin API uses. */
export async function createProduct(overrides = {}) {
  const id = await nextSequence('product')
  const thumbnail = `https://cdn.example.com/products/${id}.webp`
  return Product.create({
    id,
    title: `Test Product ${id}`,
    description: 'A product made by the automated tests.',
    brand: 'Testco',
    category: 'test-gear',
    price: 100,
    discountPercentage: 0,
    rating: 4,
    reviewCount: 0,
    stock: 10,
    thumbnail,
    images: [thumbnail],
    ...overrides
  })
}

export function validDelivery(overrides = {}) {
  return {
    name: 'Asha Nair',
    email: 'asha@example.com',
    phone: '98765 43210',
    address: '12 MG Road, Indiranagar',
    city: 'Bengaluru',
    state: 'Karnataka',
    pincode: '560001',
    ...overrides
  }
}
