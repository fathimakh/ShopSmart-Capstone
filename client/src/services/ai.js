import { api } from './http'

// The AI endpoints (docs/API.md, AI assistant). The Gemini key lives only on the server.

// Gemini gets 9 seconds on the server; this leaves room for the trip there and back.
const SEARCH_TIMEOUT = 15000
// How long a "Gemini is (not) set up" answer is trusted before asking again, so a key
// added on the server is picked up without a reload.
const STATUS_TTL = 5 * 60 * 1000

let status = null

/**
 * Whether the server has Gemini configured: true, false, or null when the server could
 * not be asked (then the search is simply tried). One request serves every caller for a
 * few minutes.
 */
export function getAiStatus() {
  const now = Date.now()
  if (status && now - status.at < STATUS_TTL) return status.promise

  const promise = api
    .get('/ai/status', { auth: false })
    .then((data) => Boolean(data.enabled))
    .catch(() => {
      status = null
      return null
    })
  status = { at: now, promise }
  return promise
}

/** Forgets the cached status (used by the tests). */
export function resetAiStatus() {
  status = null
}

/** Asks Gemini, through the server, to read a shopper's message. Resolves with `result`. */
export async function searchWithAi(body, { signal } = {}) {
  const data = await api.post('/ai/search', body, { signal, auth: false, timeout: SEARCH_TIMEOUT })
  return data.result
}
