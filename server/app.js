import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import morgan from 'morgan'
import env from './config/env.js'
import { isDBConnected } from './config/db.js'
import { errorHandler, notFound } from './middleware/errorHandler.js'
import sanitizeBody from './middleware/sanitize.js'
import ApiError from './utils/ApiError.js'
import authRoutes from './routes/authRoutes.js'
import productRoutes from './routes/productRoutes.js'

// During development the client may run on any localhost port (Vite moves to the next
// free one when 3000 is taken), so every local origin is allowed there.
const LOCAL_ORIGIN = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/

function isAllowedOrigin(origin) {
  return env.clientUrls.includes(origin) || (!env.isProduction && LOCAL_ORIGIN.test(origin))
}

const corsOptions = {
  // Requests without an Origin header (curl, Postman, health checks) are not CORS requests.
  origin(origin, callback) {
    if (!origin || isAllowedOrigin(origin)) return callback(null, true)
    return callback(new ApiError(403, `Origin ${origin} is not allowed`, { code: 'CORS_ORIGIN_DENIED' }))
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  maxAge: 600
}

const app = express()

// Render and most hosts end TLS one proxy in front of the app; the rate limiter needs
// this to see the visitor's address instead of the proxy's.
app.set('trust proxy', 1)

app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }))
app.use(cors(corsOptions))
if (env.nodeEnv === 'development') app.use(morgan('dev'))
app.use(express.json({ limit: '1mb' }))
app.use(sanitizeBody)

app.get('/', (req, res) => {
  res.json({
    success: true,
    name: 'ShopSmart API',
    message: 'Every endpoint lives under /api. See docs/API.md in the repository.',
    links: {
      health: '/api/health',
      products: '/api/products'
    }
  })
})

app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    status: 'ok',
    db: isDBConnected() ? 'connected' : 'disconnected',
    ai: Boolean(env.geminiApiKey),
    uptime: Math.round(process.uptime())
  })
})

app.use('/api/auth', authRoutes)
app.use('/api/products', productRoutes)

app.use(notFound)
app.use(errorHandler)

export default app
