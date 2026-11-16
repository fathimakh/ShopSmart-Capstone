import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  // Read without the VITE_ prefix filter: the proxy target is a dev setting and must not
  // end up in the browser bundle.
  const env = loadEnv(mode, process.cwd(), '')
  const apiProxy = {
    '/api': {
      target: env.API_PROXY_TARGET || 'http://localhost:5050',
      changeOrigin: true
    }
  }

  return {
    plugins: [react()],
    // In development the client calls /api on its own origin and Vite passes it on to
    // the Express server, so no CORS setup is needed while working locally.
    server: {
      port: 3000,
      open: true,
      proxy: apiProxy
    },
    preview: {
      port: 4173,
      proxy: apiProxy
    },
    test: {
      environment: 'jsdom',
      setupFiles: './src/test/setup.js',
      css: false,
      restoreMocks: true,
      unstubGlobals: true
    }
  }
})
