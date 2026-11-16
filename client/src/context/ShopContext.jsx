import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import useLocalStorage from '../hooks/useLocalStorage'
import { useCatalog } from './CatalogContext'
import { useAuth } from './AuthContext'
import { api, isAbortError } from '../services/http'
import {
  CART_LINE_LIMIT,
  COMPARE_LIMIT,
  MAX_QUANTITY,
  VIEWED_LIMIT,
  WISHLIST_LIMIT,
  clampQuantity,
  sameList,
  sanitizeCart,
  sanitizeIds
} from '../utils/lists'

const ShopContext = createContext(null)

const CART_KEY = 'shopsmart:cart'
const WISHLIST_KEY = 'shopsmart:wishlist'
const COMPARE_KEY = 'shopsmart:compare'
const VIEWED_KEY = 'shopsmart:viewed'
// Whose lists the keys above hold: an account id, or nothing while they belong to a guest.
const OWNER_KEY = 'shopsmart:lists-owner'
// Lists changed on this device that the account has not saved yet. Kept in storage so a
// change made just before the tab closed is sent on the next visit instead of lost.
const PENDING_KEY = 'shopsmart:lists-pending'
// Quick changes (pressing + three times) go out as one save.
const SAVE_DELAY = 400

// The three lists the account keeps. Compare stays on the device only.
const SYNCED_LISTS = {
  cart: { path: '/lists/cart', toBody: (cart) => ({ items: cart }), read: (data) => data.cart },
  wishlist: { path: '/lists/wishlist', toBody: (ids) => ({ ids }), read: (data) => data.wishlist },
  recentlyViewed: {
    path: '/lists/viewed',
    toBody: (ids) => ({ ids }),
    read: (data) => data.recentlyViewed
  }
}
const SYNCED_NAMES = Object.keys(SYNCED_LISTS)

const cleaners = {
  cart: sanitizeCart,
  wishlist: (ids) => sanitizeIds(ids, WISHLIST_LIMIT),
  recentlyViewed: (ids) => sanitizeIds(ids, VIEWED_LIMIT),
  compare: (ids) => sanitizeIds(ids, COMPARE_LIMIT)
}

function readStored(key, fallback) {
  try {
    const stored = window.localStorage.getItem(key)
    return stored ? JSON.parse(stored) : fallback
  } catch (error) {
    return fallback
  }
}

function writeStored(key, value) {
  try {
    if (value === null) window.localStorage.removeItem(key)
    else window.localStorage.setItem(key, JSON.stringify(value))
  } catch (error) {
    // Blocked storage only means the marker does not survive a reload.
  }
}

const readOwner = () => readStored(OWNER_KEY, null)
const writeOwner = (userId) => writeStored(OWNER_KEY, userId)
const readPending = () => new Set(readStored(PENDING_KEY, []))
const writePending = (pending) => writeStored(PENDING_KEY, pending.size ? [...pending] : null)

function createSyncState() {
  // userId: the account the lists are being kept for. ready: its lists have been loaded
  // (or merged) from the server, so saves may go out.
  return { userId: null, ready: false, timers: {}, inFlight: {}, failed: new Map() }
}

export function ShopProvider({ children }) {
  const { products } = useCatalog()
  const { user, status: authStatus, registerSignOutTask } = useAuth()
  const userId = user ? user._id : null

  const [storedCart, setStoredCart] = useLocalStorage(CART_KEY, [])
  const [storedWishlist, setStoredWishlist] = useLocalStorage(WISHLIST_KEY, [])
  const [storedCompare, setStoredCompare] = useLocalStorage(COMPARE_KEY, [])
  const [storedViewed, setStoredViewed] = useLocalStorage(VIEWED_KEY, [])

  // Older visits may have left lists over today's limits, so whatever is read is cleaned.
  const cart = useMemo(() => cleaners.cart(storedCart), [storedCart])
  const wishlist = useMemo(() => cleaners.wishlist(storedWishlist), [storedWishlist])
  const compare = useMemo(() => cleaners.compare(storedCompare), [storedCompare])
  const recentlyViewed = useMemo(() => cleaners.recentlyViewed(storedViewed), [storedViewed])

  const [listsStatus, setListsStatus] = useState('local')
  const [listsError, setListsError] = useState(null)
  const [listsRevision, setListsRevision] = useState(0)

  // The newest value of every list, updated the moment it changes. Saves read from here
  // rather than from state, which may not have re-rendered yet.
  const listsRef = useRef(null)
  if (!listsRef.current) listsRef.current = { cart, wishlist, compare, recentlyViewed }

  const syncRef = useRef(null)
  if (!syncRef.current) syncRef.current = createSyncState()

  const storageSetters = useRef(null)
  storageSetters.current = {
    cart: setStoredCart,
    wishlist: setStoredWishlist,
    compare: setStoredCompare,
    recentlyViewed: setStoredViewed
  }

  /** Writes a list (value or updater) and returns the cleaned result. */
  const writeList = useCallback((name, next) => {
    const current = listsRef.current[name]
    const resolved = cleaners[name](typeof next === 'function' ? next(current) : next)
    if (sameList(resolved, current)) return current

    listsRef.current = { ...listsRef.current, [name]: resolved }
    storageSetters.current[name](resolved)
    return resolved
  }, [])

  const refreshSyncStatus = useCallback(() => {
    const { failed } = syncRef.current
    const firstFailure = failed.size ? failed.values().next().value : null
    setListsError(firstFailure)
    setListsStatus(firstFailure ? 'error' : 'synced')
  }, [])

  /** Sends one list to the account. Only one save per list is in flight at a time. */
  const flush = useCallback(
    (name, options = {}) => {
      const sync = syncRef.current
      clearTimeout(sync.timers[name])
      delete sync.timers[name]
      if (!sync.userId || !sync.ready) return Promise.resolve()

      if (sync.inFlight[name]) {
        // The newest value goes out once the save already on its way has finished.
        return sync.inFlight[name].then(() =>
          readPending().has(name) ? flush(name, options) : undefined
        )
      }

      const sent = listsRef.current[name]
      const list = SYNCED_LISTS[name]

      const saving = api
        .put(list.path, list.toBody(sent), { keepalive: Boolean(options.keepalive) })
        .then((data) => {
          // The shopper signed out (or in as someone else) while this was on its way.
          if (syncRef.current !== sync) return
          sync.failed.delete(name)
          // A newer change made while this one travelled is still waiting to be sent.
          if (!sameList(listsRef.current[name], sent)) return

          const pending = readPending()
          pending.delete(name)
          writePending(pending)
          // The server drops products that no longer exist; show what it kept.
          writeList(name, list.read(data))
        })
        .catch((error) => {
          if (syncRef.current !== sync || isAbortError(error)) return
          sync.failed.set(name, error)
        })
        .finally(() => {
          if (sync.inFlight[name] === saving) sync.inFlight[name] = null
          if (syncRef.current === sync) refreshSyncStatus()
        })

      sync.inFlight[name] = saving
      return saving
    },
    [writeList, refreshSyncStatus]
  )

  const queueSave = useCallback(
    (name) => {
      const sync = syncRef.current
      // A guest's lists live on this device only. Lists that belong to an account whose
      // session is still being checked are marked, so the change is not lost.
      if (!sync.userId && !readOwner()) return

      const pending = readPending()
      pending.add(name)
      writePending(pending)

      if (!sync.ready) return
      clearTimeout(sync.timers[name])
      sync.timers[name] = setTimeout(() => flush(name), SAVE_DELAY)
    },
    [flush]
  )

  /** Changes a list the shopper edited and queues it for the account when signed in. */
  const changeList = useCallback(
    (name, updater) => {
      const before = listsRef.current[name]
      const after = writeList(name, updater)
      if (after !== before && SYNCED_LISTS[name]) queueSave(name)
      return after
    },
    [writeList, queueSave]
  )

  const resetSync = useCallback(() => {
    const sync = syncRef.current
    Object.values(sync.timers).forEach(clearTimeout)
    syncRef.current = createSyncState()
  }, [])

  /**
   * Loads the account's lists after sign in or on a return visit.
   * - Lists this device already holds for the account: the server copy wins, except for
   *   lists changed here that were never saved, which are sent up instead.
   * - A guest's lists: merged into the account once, then replaced by the result.
   */
  const startSync = useCallback(
    async (accountId) => {
      const sync = syncRef.current
      const owner = readOwner()
      setListsStatus('syncing')
      setListsError(null)

      try {
        if (owner) {
          const data = await api.get('/lists')
          if (syncRef.current !== sync) return

          // Lists left by another account are never mixed into this one.
          const keepLocal = owner === accountId ? readPending() : new Set()
          SYNCED_NAMES.forEach((name) => {
            if (!keepLocal.has(name)) writeList(name, SYNCED_LISTS[name].read(data))
          })
          writePending(keepLocal)
          writeOwner(accountId)
        } else {
          // Claimed before the request, so another tab signing in at the same moment
          // loads the result instead of merging the same guest lists a second time.
          writeOwner(accountId)
          const guest = listsRef.current
          let data
          try {
            data = await api.post('/lists/merge', {
              cart: guest.cart,
              wishlist: guest.wishlist,
              recentlyViewed: guest.recentlyViewed
            })
          } catch (error) {
            if (syncRef.current === sync) writeOwner(null)
            throw error
          }
          if (syncRef.current !== sync) return

          SYNCED_NAMES.forEach((name) => writeList(name, SYNCED_LISTS[name].read(data)))
          writePending(new Set())
        }

        sync.ready = true
        sync.failed.clear()
        setListsStatus('synced')
        setListsRevision((revision) => revision + 1)
        readPending().forEach((name) => flush(name))
      } catch (error) {
        if (syncRef.current !== sync || isAbortError(error)) return
        setListsError(error)
        setListsStatus('error')
      }
    },
    [writeList, flush]
  )

  // Follows the account: load its lists on sign in, clear them from the device on sign out.
  useEffect(() => {
    // Wait until the stored session is confirmed; until then the cached lists show.
    if (authStatus === 'checking' || authStatus === 'error') return

    if (!userId) {
      if (syncRef.current.userId) resetSync()
      if (readOwner()) {
        // An account's lists must not stay behind on a shared device after sign out.
        SYNCED_NAMES.forEach((name) => writeList(name, []))
        writeOwner(null)
        writePending(new Set())
        setListsRevision((revision) => revision + 1)
      }
      setListsStatus('local')
      setListsError(null)
      return
    }

    // StrictMode runs this effect twice; the second run finds the sync already started.
    if (syncRef.current.userId === userId) return
    resetSync()
    syncRef.current.userId = userId
    startSync(userId)
  }, [authStatus, userId, resetSync, startSync, writeList])

  const retryListsSync = useCallback(() => {
    const sync = syncRef.current
    if (!sync.userId) return
    if (!sync.ready) {
      startSync(sync.userId)
      return
    }
    new Set([...readPending(), ...sync.failed.keys()]).forEach((name) => flush(name))
  }, [startSync, flush])

  /**
   * Reloads the account's lists, for example after an order took its products out of the
   * saved cart. Lists with unsaved changes on this device are left alone.
   */
  const reloadLists = useCallback(async () => {
    const sync = syncRef.current
    if (!sync.userId || !sync.ready) return
    const data = await api.get('/lists')
    if (syncRef.current !== sync) return
    const pending = readPending()
    SYNCED_NAMES.forEach((name) => {
      if (!pending.has(name)) writeList(name, SYNCED_LISTS[name].read(data))
    })
  }, [writeList])

  // Unsaved changes go out before sign out forgets the token.
  useEffect(
    () =>
      registerSignOutTask(() => {
        const sync = syncRef.current
        if (!sync.userId || !sync.ready) return Promise.resolve()
        const names = new Set([...readPending(), ...Object.keys(sync.timers)])
        return Promise.all([...names].map((name) => flush(name)))
      }),
    [registerSignOutTask, flush]
  )

  // A save that waits for its delay is sent at once when the tab is closed or hidden away.
  useEffect(() => {
    const saveNow = () => {
      Object.keys(syncRef.current.timers).forEach((name) => flush(name, { keepalive: true }))
    }
    window.addEventListener('pagehide', saveNow)
    return () => window.removeEventListener('pagehide', saveNow)
  }, [flush])

  // Coming back online retries whatever failed while the connection was down.
  useEffect(() => {
    const retry = () => {
      if (syncRef.current.userId && (syncRef.current.failed.size || !syncRef.current.ready)) {
        retryListsSync()
      }
    }
    window.addEventListener('online', retry)
    return () => window.removeEventListener('online', retry)
  }, [retryListsSync])

  // Only the timers stop here. StrictMode unmounts and remounts once in development, and
  // resetting the whole sync then would start a second merge of the same guest lists.
  useEffect(() => () => Object.values(syncRef.current.timers).forEach(clearTimeout), [])

  const addToCart = useCallback(
    (productId, quantity = 1) => {
      let added = true
      changeList('cart', (current) => {
        if (current.some((item) => item.id === productId)) {
          return current.map((item) =>
            item.id === productId
              ? { ...item, quantity: clampQuantity(item.quantity + quantity) }
              : item
          )
        }
        // The account keeps up to 50 lines; a fuller cart would be refused as a whole.
        if (current.length >= CART_LINE_LIMIT) {
          added = false
          return current
        }
        return [...current, { id: productId, quantity: clampQuantity(quantity) }]
      })
      return added
    },
    [changeList]
  )

  const updateQuantity = useCallback(
    (productId, quantity) => {
      if (quantity < 1) return
      changeList('cart', (current) =>
        current.map((item) =>
          item.id === productId ? { ...item, quantity: clampQuantity(quantity) } : item
        )
      )
    },
    [changeList]
  )

  const removeFromCart = useCallback(
    (productId) =>
      changeList('cart', (current) => current.filter((item) => item.id !== productId)),
    [changeList]
  )

  const clearCart = useCallback(() => changeList('cart', []), [changeList])

  const toggleWishlist = useCallback(
    (productId) => {
      const next = changeList('wishlist', (current) => {
        if (current.includes(productId)) return current.filter((id) => id !== productId)
        return current.length >= WISHLIST_LIMIT ? current : [...current, productId]
      })
      return next.includes(productId)
    },
    [changeList]
  )

  const clearWishlist = useCallback(() => changeList('wishlist', []), [changeList])

  const toggleCompare = useCallback(
    (productId) => {
      changeList('compare', (current) => {
        if (current.includes(productId)) {
          return current.filter((id) => id !== productId)
        }
        // Four columns is the most that stays readable on a laptop screen.
        return current.length >= COMPARE_LIMIT ? current : [...current, productId]
      })
    },
    [changeList]
  )

  const clearCompare = useCallback(() => changeList('compare', []), [changeList])

  const recordView = useCallback(
    (productId) => {
      changeList('recentlyViewed', (current) => {
        if (current[0] === productId) return current
        return [productId, ...current.filter((id) => id !== productId)].slice(0, VIEWED_LIMIT)
      })
    },
    [changeList]
  )

  const value = useMemo(() => {
    const cartItems = cart
      .map((item) => {
        const product = products.find((entry) => entry.id === item.id)
        return product ? { ...product, quantity: item.quantity } : null
      })
      .filter(Boolean)

    const subtotal = cartItems.reduce((total, item) => total + item.price * item.quantity, 0)
    const savings = cartItems.reduce(
      (total, item) => total + (item.originalPrice - item.price) * item.quantity,
      0
    )

    const compareItems = compare
      .map((id) => products.find((product) => product.id === id))
      .filter(Boolean)

    const wishlistItems = wishlist
      .map((id) => products.find((product) => product.id === id))
      .filter(Boolean)

    return {
      cart,
      cartItems,
      cartCount: cart.reduce((total, item) => total + item.quantity, 0),
      subtotal,
      savings,
      maxQuantity: MAX_QUANTITY,
      isCartFull: cart.length >= CART_LINE_LIMIT,
      isInCart: (productId) => cart.some((item) => item.id === productId),
      addToCart,
      updateQuantity,
      removeFromCart,
      clearCart,
      wishlist,
      wishlistItems,
      wishlistCount: wishlist.length,
      isWishlisted: (productId) => wishlist.includes(productId),
      toggleWishlist,
      clearWishlist,
      compare,
      compareItems,
      compareCount: compare.length,
      compareLimit: COMPARE_LIMIT,
      isCompared: (productId) => compare.includes(productId),
      isCompareFull: compare.length >= COMPARE_LIMIT,
      toggleCompare,
      clearCompare,
      recentlyViewed,
      recordView,
      listsStatus,
      listsError,
      listsRevision,
      retryListsSync,
      reloadLists
    }
  }, [
    cart,
    wishlist,
    compare,
    recentlyViewed,
    products,
    addToCart,
    updateQuantity,
    removeFromCart,
    clearCart,
    toggleWishlist,
    clearWishlist,
    toggleCompare,
    clearCompare,
    recordView,
    listsStatus,
    listsError,
    listsRevision,
    retryListsSync,
    reloadLists
  ])

  return <ShopContext.Provider value={value}>{children}</ShopContext.Provider>
}

export function useShop() {
  const context = useContext(ShopContext)
  if (!context) {
    throw new Error('useShop must be used inside a ShopProvider')
  }
  return context
}
