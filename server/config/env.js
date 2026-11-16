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

const nodeEnv = process.env.NODE_ENV || 'development'

const env = {
  nodeEnv,
  isProduction: nodeEnv === 'production',
  isTest: nodeEnv === 'test',
  port: toInt(process.env.PORT, 5050),
  mongoUri: process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/shopsmart',
  jwtSecret: process.env.JWT_SECRET,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  clientUrls: toOriginList(process.env.CLIENT_URL || 'http://localhost:3000'),
  authRateLimitMax: toInt(process.env.AUTH_RATE_LIMIT_MAX, 50),
  aiRateLimitMax: toInt(process.env.AI_RATE_LIMIT_MAX, 60),
  geminiApiKey: (process.env.GEMINI_API_KEY || '').trim(),
  geminiModel: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
  geminiTimeoutMs: toInt(process.env.GEMINI_TIMEOUT_MS, 9000),
  storeTimezone: process.env.STORE_TIMEZONE || 'Asia/Kolkata',
  seedAdminEmail: process.env.SEED_ADMIN_EMAIL || 'admin@shopsmart.dev',
  seedAdminPassword: process.env.SEED_ADMIN_PASSWORD || 'Admin@1234'
}

if (!env.jwtSecret) {
  throw new Error('JWT_SECRET is not set. Copy .env.example to .env and fill it in.')
}

// A misspelt zone would otherwise only fail later, on the first dashboard request.
try {
  new Intl.DateTimeFormat('en-CA', { timeZone: env.storeTimezone })
} catch {
  throw new Error(`STORE_TIMEZONE "${env.storeTimezone}" is not a time zone name such as Asia/Kolkata.`)
}

export default env
