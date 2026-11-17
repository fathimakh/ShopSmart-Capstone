import dotenv from 'dotenv'

// Loaded once, before anything reads the configuration. Values already set by the host
// or the test runner win over the .env file.
dotenv.config({ quiet: true })

function toInt(value, fallback) {
  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) ? parsed : fallback
}

// "https://a.app/, https://b.app" becomes ["https://a.app", "https://b.app"]
function toOriginList(value) {
  return String(value || '')
    .split(',')
    .map((origin) => origin.trim().replace(/\/+$/, ''))
    .filter(Boolean)
}

// Browsers send a bare lower case origin, so an entry with a path, without https:// or
// with capitals would never match one.
function isOrigin(value) {
  try {
    return new URL(value).origin === value
  } catch {
    return false
  }
}

// "Admin@Shop.dev, demo@shop.dev" becomes ["admin@shop.dev", "demo@shop.dev"]
function toEmailList(value) {
  return String(value || '')
    .split(',')
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean)
}

const nodeEnv = process.env.NODE_ENV || 'development'
// The JWT_SECRET line in .env.example, which anyone reading the repository knows.
const EXAMPLE_JWT_SECRET = 'change-me-to-a-long-random-string'
const MIN_JWT_SECRET_LENGTH = 32
const seedAdminEmail = process.env.SEED_ADMIN_EMAIL || 'admin@shopsmart.dev'
const seedShopperEmail = 'demo@shopsmart.dev'

const env = {
  nodeEnv,
  isProduction: nodeEnv === 'production',
  isTest: nodeEnv === 'test',
  // Request logs and stack traces in error answers need an explicit NODE_ENV=development
  // (as in .env.example), so a host where NODE_ENV was left out never shows them.
  isDevelopment: process.env.NODE_ENV === 'development',
  port: toInt(process.env.PORT, 5050),
  mongoUri: process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/shopsmart',
  jwtSecret: process.env.JWT_SECRET,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  clientUrls: toOriginList(process.env.CLIENT_URL || 'http://localhost:3000'),
  authRateLimitMax: toInt(process.env.AUTH_RATE_LIMIT_MAX, 50),
  aiRateLimitMax: toInt(process.env.AI_RATE_LIMIT_MAX, 60),
  aiSummaryDailyMax: toInt(process.env.AI_SUMMARY_DAILY_MAX, 100),
  geminiApiKey: (process.env.GEMINI_API_KEY || '').trim(),
  geminiModel: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
  geminiTimeoutMs: toInt(process.env.GEMINI_TIMEOUT_MS, 9000),
  storeTimezone: process.env.STORE_TIMEZONE || 'Asia/Kolkata',
  seedAdminEmail,
  seedAdminPassword: process.env.SEED_ADMIN_PASSWORD || 'Admin@1234',
  seedShopperEmail,
  // The seeded accounts behind the one-click sign in buttons are shared by every visitor,
  // so the API refuses changes that would lock the next visitor out of them. Set
  // DEMO_ACCOUNT_EMAILS to an empty value to treat them like any other account.
  demoAccountEmails: toEmailList(process.env.DEMO_ACCOUNT_EMAILS ?? `${seedAdminEmail},${seedShopperEmail}`)
}

if (!env.jwtSecret) {
  throw new Error('JWT_SECRET is not set. Copy .env.example to .env and fill it in.')
}

// Anyone who knows or guesses the secret can sign a token for any account, the admin
// included, so a deployed server refuses a short one or the example value.
if (env.isProduction && (env.jwtSecret.length < MIN_JWT_SECRET_LENGTH || env.jwtSecret === EXAMPLE_JWT_SECRET)) {
  throw new Error(
    `JWT_SECRET must be a random string of at least ${MIN_JWT_SECRET_LENGTH} characters in production, not the ` +
      '.env.example value. The command above it in .env.example makes one.'
  )
}

// Without the site's origin every browser request fails CORS while the health check stays
// green, so a deployed server will not start without a usable CLIENT_URL.
if (env.isProduction) {
  if (!process.env.CLIENT_URL?.trim()) {
    throw new Error('CLIENT_URL is not set. In production it must list the site, such as https://shopsmart.onrender.com.')
  }
  const notAnOrigin = env.clientUrls.find((origin) => !isOrigin(origin))
  if (notAnOrigin) {
    throw new Error(`CLIENT_URL entry "${notAnOrigin}" is not an origin such as https://shopsmart.onrender.com (no path, lower case).`)
  }
}

// A misspelt zone would otherwise only fail later, on the first dashboard request.
try {
  new Intl.DateTimeFormat('en-CA', { timeZone: env.storeTimezone })
} catch {
  throw new Error(`STORE_TIMEZONE "${env.storeTimezone}" is not a time zone name such as Asia/Kolkata.`)
}

export default env
