// The client only reads the token to know when it runs out. The server checks the
// signature on every request, so nothing here is trusted for access decisions.

/** The payload of a JWT, or null when the token is malformed. */
export function decodeJwt(token) {
  if (typeof token !== 'string') return null
  const [, payload] = token.split('.')
  if (!payload) return null

  try {
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/')
    const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=')
    return JSON.parse(window.atob(padded))
  } catch (error) {
    return null
  }
}

/** When the token expires, in epoch milliseconds, or null when it carries no expiry. */
export function getTokenExpiry(token) {
  const payload = decodeJwt(token)
  return payload && typeof payload.exp === 'number' ? payload.exp * 1000 : null
}
