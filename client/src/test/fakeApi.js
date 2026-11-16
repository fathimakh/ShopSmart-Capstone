import { vi } from 'vitest'

export function jsonResponse(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' }
  })
}

/**
 * Replaces fetch with a tiny in-memory API. routes maps 'METHOD /path' to a handler that
 * gets { body, headers, url } and returns [status, json]. Every call is recorded so a test
 * can check what the client sent.
 */
export function fakeApi(routes) {
  const calls = []
  const fetchMock = vi.fn(async (url, init = {}) => {
    const path = String(url).replace(/^\/api/, '').split('?')[0]
    const method = init.method || 'GET'
    const body = init.body ? JSON.parse(init.body) : undefined
    const call = { method, path, url: String(url), body, headers: init.headers || {} }
    calls.push(call)

    const handler = routes[`${method} ${path}`]
    if (!handler) return jsonResponse(404, { success: false, message: 'Route not found', code: 'ROUTE_NOT_FOUND' })
    const [status, json] = await handler(call)
    return jsonResponse(status, json)
  })
  vi.stubGlobal('fetch', fetchMock)
  return { calls, fetchMock, callsTo: (key) => calls.filter((call) => `${call.method} ${call.path}` === key) }
}

/** A token whose payload carries the given expiry (seconds since the epoch). */
export function fakeToken(exp, id = 'a'.repeat(24)) {
  const encode = (value) => window.btoa(JSON.stringify(value)).replace(/=+$/, '')
  return `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ id, role: 'customer', tv: 0, exp })}.signature`
}
