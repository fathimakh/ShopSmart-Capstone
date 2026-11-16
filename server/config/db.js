import mongoose from 'mongoose'
import env from './env.js'

// Only fields declared in a schema can be used in a query filter.
mongoose.set('strictQuery', true)

/**
 * Opens the shared connection. It rejects after ten seconds instead of hanging, so the
 * server can stop with a clear message when MongoDB is not reachable.
 */
export async function connectDB(uri = env.mongoUri) {
  const connection = await mongoose.connect(uri, { serverSelectionTimeoutMS: 10000 })
  if (!env.isTest) {
    const { host, port, name } = connection.connection
    console.log(`MongoDB connected: ${host}:${port}/${name}`)
  }
  return connection
}

export function disconnectDB() {
  return mongoose.disconnect()
}

export function isDBConnected() {
  return mongoose.connection.readyState === 1
}
