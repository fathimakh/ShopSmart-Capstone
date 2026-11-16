import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { TOKEN_KEY, api, getToken, isAbortError, onSessionEnd, setToken } from '../services/http'
import { getTokenExpiry } from '../utils/jwt'

const AuthContext = createContext(null)

const EXPIRED_MESSAGE = 'Your session has expired. Please sign in again.'
const OTHER_TAB_MESSAGE = 'You were signed out in another tab.'
// setTimeout cannot wait longer than about 24.8 days. A token that lives longer is
// checked again on the next visit instead.
const MAX_TIMER_MS = 2 ** 31 - 1
// Sign out waits this long at most for unsaved list changes before going ahead.
const SIGN_OUT_TASK_TIMEOUT = 4000

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * The signed in account. status is 'checking' while a stored token is being confirmed
 * with the server, 'signed-in', 'signed-out', or 'error' when the server could not be
 * reached to confirm it (the token is kept so a retry can still succeed).
 */
export function AuthProvider({ children }) {
  const [token, setTokenState] = useState(getToken)
  const [user, setUser] = useState(null)
  const [status, setStatus] = useState(() => (getToken() ? 'checking' : 'signed-out'))
  const [restoreError, setRestoreError] = useState(null)
  const [sessionNotice, setSessionNotice] = useState(null)
  const signOutTasks = useRef(new Set())
  const changingPassword = useRef(false)

  const startSession = useCallback((nextToken, nextUser) => {
    setToken(nextToken)
    setTokenState(nextToken)
    setUser(nextUser)
    setStatus('signed-in')
    setRestoreError(null)
    setSessionNotice(null)
  }, [])

  // Forgets the session on this device. A notice explains why when the shopper did not
  // ask for it (expired, revoked, or signed out in another tab).
  const endSession = useCallback((notice = null) => {
    setToken(null)
    setTokenState(null)
    setUser(null)
    setStatus('signed-out')
    setRestoreError(null)
    setSessionNotice(notice)
  }, [])

  // Confirms a stored token on load, and again after a token arrives from another tab.
  useEffect(() => {
    if (status !== 'checking') return undefined
    const controller = new AbortController()

    api
      .get('/auth/me', { signal: controller.signal })
      .then((data) => {
        setUser(data.user)
        setStatus('signed-in')
      })
      .catch((error) => {
        if (isAbortError(error)) return
        if (error.status === 401) {
          endSession(error.message)
          return
        }
        setRestoreError(error)
        setStatus('error')
      })

    return () => controller.abort()
  }, [status, endSession])

  // Any request that proves the token is dead ends the session, wherever it was made.
  useEffect(
    () =>
      onSessionEnd(({ code, message }) => {
        // The password change itself revokes the old token a moment before the new one
        // arrives, so a request caught in between must not sign the shopper out.
        if (changingPassword.current && code === 'TOKEN_REVOKED') return
        endSession(message)
      }),
    [endSession]
  )

  // Signs out at the moment the token expires rather than on the next failed request.
  useEffect(() => {
    const expiresAt = getTokenExpiry(token)
    if (!token || expiresAt === null) return undefined
    const delay = expiresAt - Date.now()
    if (delay > MAX_TIMER_MS) return undefined

    const timer = setTimeout(() => endSession(EXPIRED_MESSAGE), Math.max(delay, 0))
    return () => clearTimeout(timer)
  }, [token, endSession])

  // Follows sign ins, sign outs and password changes made in other tabs.
  useEffect(() => {
    const followOtherTab = (event) => {
      // key is null when another tab cleared the whole of local storage.
      if (event.key !== TOKEN_KEY && event.key !== null) return
      const stored = event.key === null ? null : event.newValue
      if (stored === getToken()) return

      if (!stored) {
        endSession(OTHER_TAB_MESSAGE)
        return
      }

      setToken(stored)
      setTokenState(stored)
      setSessionNotice(null)
      if (!user) {
        setStatus('checking')
        return
      }
      // Already signed in here: refresh quietly so open forms are not thrown away.
      api
        .get('/auth/me')
        .then((data) => setUser(data.user))
        .catch(() => {})
    }

    window.addEventListener('storage', followOtherTab)
    return () => window.removeEventListener('storage', followOtherTab)
  }, [user, endSession])

  const login = useCallback(
    async ({ email, password }) => {
      const data = await api.post('/auth/login', { email, password }, { auth: false })
      startSession(data.token, data.user)
      return data.user
    },
    [startSession]
  )

  const register = useCallback(
    async ({ name, email, password }) => {
      const data = await api.post('/auth/register', { name, email, password }, { auth: false })
      startSession(data.token, data.user)
      return data.user
    },
    [startSession]
  )

  /**
   * Lets another part of the app finish work that needs the token (saving the cart)
   * before sign out forgets it. Returns a function that removes the task.
   */
  const registerSignOutTask = useCallback((task) => {
    signOutTasks.current.add(task)
    return () => {
      signOutTasks.current.delete(task)
    }
  }, [])

  const logout = useCallback(
    async ({ allDevices = false } = {}) => {
      await Promise.race([
        Promise.allSettled([...signOutTasks.current].map((task) => task())),
        wait(SIGN_OUT_TASK_TIMEOUT)
      ])

      if (allDevices) {
        // Signing out everywhere has to reach the server, so a failure keeps this session
        // and is passed back for the page to show.
        await api.post('/auth/logout', { allDevices: true })
      } else {
        // A JWT stays valid until it expires, so the call is a courtesy and the token is
        // forgotten here whatever the answer. The request has already read the token.
        api.post('/auth/logout').catch(() => {})
      }
      endSession(null)
    },
    [endSession]
  )

  const refreshUser = useCallback(async () => {
    const data = await api.get('/auth/me')
    setUser(data.user)
    return data.user
  }, [])

  const updateProfile = useCallback(async (changes) => {
    const data = await api.patch('/auth/me', changes)
    setUser(data.user)
    return data.user
  }, [])

  const changePassword = useCallback(async ({ currentPassword, newPassword }) => {
    changingPassword.current = true
    try {
      const data = await api.patch('/auth/password', { currentPassword, newPassword })
      // The old token stops working the moment the password changes.
      setToken(data.token)
      setTokenState(data.token)
      return data.message
    } finally {
      changingPassword.current = false
    }
  }, [])

  const retrySession = useCallback(() => {
    if (getToken()) setStatus('checking')
  }, [])

  const clearSessionNotice = useCallback(() => setSessionNotice(null), [])

  const value = useMemo(
    () => ({
      user,
      token,
      status,
      initialized: status !== 'checking',
      isAuthenticated: Boolean(user),
      isAdmin: Boolean(user) && user.role === 'admin',
      restoreError,
      sessionNotice,
      clearSessionNotice,
      retrySession,
      login,
      register,
      logout,
      refreshUser,
      updateProfile,
      changePassword,
      registerSignOutTask
    }),
    [
      user,
      token,
      status,
      restoreError,
      sessionNotice,
      clearSessionNotice,
      retrySession,
      login,
      register,
      logout,
      refreshUser,
      updateProfile,
      changePassword,
      registerSignOutTask
    ]
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used inside an AuthProvider')
  }
  return context
}
