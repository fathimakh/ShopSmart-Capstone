import app from './app.js'
import env from './config/env.js'
import { connectDB, disconnectDB } from './config/db.js'

// Hides the username and password in a connection string before it is printed.
function redactUri(uri) {
  return uri.replace(/\/\/[^@/]+@/, '//***:***@')
}

async function start() {
  try {
    await connectDB()
  } catch (error) {
    console.error(`Could not connect to MongoDB at ${redactUri(env.mongoUri)}: ${error.message}`)
    console.error('Check that MongoDB is running and that MONGO_URI in .env is correct.')
    process.exit(1)
  }

  const server = app.listen(env.port, (error) => {
    if (error) {
      const reason = error.code === 'EADDRINUSE' ? `port ${env.port} is already in use` : error.message
      console.error(`Could not start the API: ${reason}`)
      process.exit(1)
    }
    console.log(`ShopSmart API (${env.nodeEnv}) listening on http://localhost:${env.port}`)
  })

  function shutdown(signal) {
    console.log(`${signal} received, closing the server and the database connection`)
    // Give open requests ten seconds to finish before forcing the exit.
    setTimeout(() => process.exit(1), 10000).unref()
    server.close(async () => {
      await disconnectDB()
      process.exit(0)
    })
  }

  process.once('SIGINT', () => shutdown('SIGINT'))
  process.once('SIGTERM', () => shutdown('SIGTERM'))
}

start()
