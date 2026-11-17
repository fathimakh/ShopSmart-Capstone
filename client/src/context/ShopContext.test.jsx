import { StrictMode } from 'react'
import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { AuthProvider, useAuth } from './AuthContext'
import { CatalogProvider } from './CatalogContext'
import { ShopProvider, useShop } from './ShopContext'
import { setToken } from '../services/http'
import { fakeApi, fakeToken } from '../test/fakeApi'

const shopper = { _id: '6afb790454cff2253a63b03a', name: 'Demo Shopper', email: 'demo@shopsmart.dev', role: 'customer' }
const token = fakeToken(Math.floor(Date.now() / 1000) + 3600)
const product = (id) => ({
  id,
  title: `Product ${id}`,
  description: 'A product',
  category: 'beauty',
  price: 10,
  discountPercentage: 0,
  rating: 4,
  reviewCount: 1,
  stock: 50,
  thumbnail: 'https://cdn.example/thumb.webp',
  availabilityStatus: 'In Stock'
})

const stored = (key) => JSON.parse(window.localStorage.getItem(key) || 'null')
const store = (key, value) => window.localStorage.setItem(key, JSON.stringify(value))

/**
 * An API that keeps one account's lists in memory and behaves like the real endpoints:
 * merge joins lists, every write returns what was kept.
 */
function fakeServer({ lists = {}, failCart = false } = {}) {
  const account = { cart: [], wishlist: [], recentlyViewed: [], ...lists }
  const state = { failCart }
  const api = fakeApi({
    'GET /products': () => [200, { success: true, products: Array.from({ length: 60 }, (_, i) => product(i + 1)) }],
    'POST /auth/login': () => [200, { success: true, token, user: shopper }],
    'GET /auth/me': () => [200, { success: true, user: shopper }],
    'POST /auth/logout': () => [200, { success: true, message: 'Signed out' }],
    'GET /lists': () => [200, { success: true, ...account }],
    'POST /lists/merge': ({ body }) => {
      const cart = new Map(account.cart.map((line) => [line.id, line.quantity]))
      ;(body.cart || []).forEach(({ id, quantity }) => cart.set(id, Math.min((cart.get(id) || 0) + quantity, 99)))
      account.cart = [...cart].map(([id, quantity]) => ({ id, quantity }))
      account.wishlist = [...new Set([...account.wishlist, ...(body.wishlist || [])])]
      account.recentlyViewed = [...new Set([...(body.recentlyViewed || []), ...account.recentlyViewed])].slice(0, 12)
      return [200, { success: true, ...account }]
    },
    'PUT /lists/cart': ({ body }) => {
      if (state.failCart) return [503, { success: false, message: 'Try again soon', code: 'SERVER_ERROR' }]
      account.cart = body.items
      return [200, { success: true, cart: account.cart }]
    },
    'PUT /lists/wishlist': ({ body }) => {
      account.wishlist = body.ids
      return [200, { success: true, wishlist: account.wishlist }]
    },
    'PUT /lists/viewed': ({ body }) => {
      account.recentlyViewed = body.ids
      return [200, { success: true, recentlyViewed: account.recentlyViewed }]
    }
  })
  return { ...api, account, state }
}

// StrictMode is on, as in the app, so effects that run twice are covered.
function Providers({ children }) {
  return (
    <StrictMode>
      <AuthProvider>
        <CatalogProvider>
          <ShopProvider>{children}</ShopProvider>
        </CatalogProvider>
      </AuthProvider>
    </StrictMode>
  )
}

const renderShop = () => renderHook(() => ({ shop: useShop(), auth: useAuth() }), { wrapper: Providers })

describe('ShopContext list sync', () => {
  beforeEach(() => setToken(null))

  it('keeps the lists of a guest on the device only', async () => {
    const server = fakeServer()
    const { result } = renderShop()

    act(() => {
      result.current.shop.addToCart(3, 2)
      result.current.shop.toggleWishlist(4)
    })
    await new Promise((resolve) => setTimeout(resolve, 500))

    expect(stored('shopsmart:cart')).toEqual([{ id: 3, quantity: 2 }])
    expect(stored('shopsmart:wishlist')).toEqual([4])
    expect(server.calls.filter((call) => call.path.startsWith('/lists'))).toHaveLength(0)
  })

  it('merges the guest lists into the account once after sign in', async () => {
    store('shopsmart:cart', [{ id: 1, quantity: 2 }])
    store('shopsmart:wishlist', [5])
    store('shopsmart:viewed', [7, 8])
    const server = fakeServer({ lists: { cart: [{ id: 1, quantity: 1 }, { id: 2, quantity: 1 }], wishlist: [6] } })
    const { result } = renderShop()

    await act(() => result.current.auth.login({ email: 'demo@shopsmart.dev', password: 'Demo@1234' }))
    await waitFor(() => expect(result.current.shop.listsStatus).toBe('synced'))

    const merges = server.callsTo('POST /lists/merge')
    expect(merges).toHaveLength(1)
    expect(merges[0].body).toEqual({ cart: [{ id: 1, quantity: 2 }], wishlist: [5], recentlyViewed: [7, 8] })
    expect(result.current.shop.cart).toEqual([
      { id: 1, quantity: 3 },
      { id: 2, quantity: 1 }
    ])
    expect(result.current.shop.wishlist).toEqual([6, 5])
    expect(stored('shopsmart:lists-owner')).toBe(shopper._id)
    expect(result.current.shop.listsRevision).toBeGreaterThan(0)
  })

  it('saves quick changes as one request with the newest cart', async () => {
    setToken(token)
    store('shopsmart:lists-owner', shopper._id)
    const server = fakeServer({ lists: { cart: [{ id: 1, quantity: 1 }] } })
    const { result } = renderShop()
    await waitFor(() => expect(result.current.shop.listsStatus).toBe('synced'))

    act(() => {
      result.current.shop.updateQuantity(1, 2)
      result.current.shop.updateQuantity(1, 3)
      result.current.shop.addToCart(2)
    })
    expect(stored('shopsmart:lists-pending')).toEqual(['cart'])

    await waitFor(() => expect(server.callsTo('PUT /lists/cart')).toHaveLength(1))
    expect(server.callsTo('PUT /lists/cart')[0].body).toEqual({
      items: [
        { id: 1, quantity: 3 },
        { id: 2, quantity: 1 }
      ]
    })
    await waitFor(() => expect(stored('shopsmart:lists-pending')).toBeNull())
  })

  it('keeps quantities between 1 and 99 and the cart to 50 lines', async () => {
    fakeServer()
    const { result } = renderShop()

    act(() => {
      result.current.shop.addToCart(1, 60)
      result.current.shop.addToCart(1, 60)
      result.current.shop.updateQuantity(1, 0)
    })
    expect(result.current.shop.cart).toEqual([{ id: 1, quantity: 99 }])

    act(() => {
      for (let id = 2; id <= 50; id += 1) result.current.shop.addToCart(id)
    })
    let added
    act(() => {
      added = result.current.shop.addToCart(51)
    })
    expect(added).toBe(false)
    expect(result.current.shop.cart).toHaveLength(50)
    expect(result.current.shop.isCartFull).toBe(true)
  })

  it('takes the account copy on a return visit but sends changes that never reached it', async () => {
    setToken(token)
    store('shopsmart:lists-owner', shopper._id)
    store('shopsmart:cart', [{ id: 9, quantity: 4 }])
    store('shopsmart:wishlist', [1])
    store('shopsmart:lists-pending', ['cart'])
    const server = fakeServer({ lists: { cart: [{ id: 2, quantity: 1 }], wishlist: [3, 4] } })
    const { result } = renderShop()

    await waitFor(() => expect(result.current.shop.listsStatus).toBe('synced'))
    expect(server.callsTo('POST /lists/merge')).toHaveLength(0)
    expect(result.current.shop.wishlist).toEqual([3, 4])
    expect(result.current.shop.cart).toEqual([{ id: 9, quantity: 4 }])
    await waitFor(() => expect(server.account.cart).toEqual([{ id: 9, quantity: 4 }]))
  })

  it('clears the account lists from the device on sign out but keeps compare', async () => {
    setToken(token)
    store('shopsmart:lists-owner', shopper._id)
    store('shopsmart:compare', [1, 2])
    const server = fakeServer({ lists: { cart: [{ id: 2, quantity: 1 }], wishlist: [3], recentlyViewed: [4] } })
    const { result } = renderShop()
    await waitFor(() => expect(result.current.shop.cartCount).toBe(1))

    act(() => result.current.shop.toggleWishlist(5))
    await act(() => result.current.auth.logout())

    // The pending wishlist change went out before the token was forgotten.
    expect(server.account.wishlist).toEqual([3, 5])
    expect(result.current.shop.cart).toEqual([])
    expect(result.current.shop.wishlist).toEqual([])
    expect(result.current.shop.recentlyViewed).toEqual([])
    expect(result.current.shop.compare).toEqual([1, 2])
    expect(stored('shopsmart:lists-owner')).toBeNull()
    expect(result.current.shop.listsStatus).toBe('local')
  })

  it('reports a failed save and retries it', async () => {
    setToken(token)
    store('shopsmart:lists-owner', shopper._id)
    const server = fakeServer({ failCart: true })
    const { result } = renderShop()
    await waitFor(() => expect(result.current.shop.listsStatus).toBe('synced'))

    act(() => {
      result.current.shop.addToCart(7)
    })
    await waitFor(() => expect(result.current.shop.listsStatus).toBe('error'))
    expect(result.current.shop.listsError.message).toBe('Try again soon')
    expect(stored('shopsmart:lists-pending')).toEqual(['cart'])

    server.state.failCart = false
    act(() => result.current.shop.retryListsSync())
    await waitFor(() => expect(result.current.shop.listsStatus).toBe('synced'))
    expect(server.account.cart).toEqual([{ id: 7, quantity: 1 }])
  })

  it('takes in a list another tab changed, so the next save does not erase it', async () => {
    setToken(token)
    store('shopsmart:lists-owner', shopper._id)
    const server = fakeServer({ lists: { cart: [{ id: 1, quantity: 1 }] } })
    const { result } = renderShop()
    await waitFor(() => expect(result.current.shop.listsStatus).toBe('synced'))

    // Another tab adds product 2, stores its cart and saves it to the account itself.
    const otherTab = [{ id: 1, quantity: 1 }, { id: 2, quantity: 1 }]
    server.account.cart = otherTab
    store('shopsmart:cart', otherTab)
    act(() => {
      window.dispatchEvent(new StorageEvent('storage', { key: 'shopsmart:cart', newValue: JSON.stringify(otherTab) }))
    })
    expect(result.current.shop.cart).toEqual(otherTab)

    act(() => {
      result.current.shop.addToCart(3)
    })
    await waitFor(() => expect(server.callsTo('PUT /lists/cart')).toHaveLength(1))
    expect(server.callsTo('PUT /lists/cart')[0].body.items).toEqual([...otherTab, { id: 3, quantity: 1 }])
  })

  it('follows a guest list changed in another tab', () => {
    const server = fakeServer()
    const { result } = renderShop()

    act(() => {
      window.dispatchEvent(new StorageEvent('storage', { key: 'shopsmart:wishlist', newValue: '[4,5]' }))
    })
    expect(result.current.shop.wishlist).toEqual([4, 5])
    act(() => {
      result.current.shop.toggleWishlist(6)
    })
    expect(stored('shopsmart:wishlist')).toEqual([4, 5, 6])
    expect(server.calls.filter((call) => call.path.startsWith('/lists'))).toHaveLength(0)
  })

  it('reads the lists again when the shopper comes back to the tab', async () => {
    setToken(token)
    store('shopsmart:lists-owner', shopper._id)
    const server = fakeServer({ lists: { cart: [{ id: 1, quantity: 1 }], wishlist: [3] } })
    const { result } = renderShop()
    await waitFor(() => expect(result.current.shop.listsStatus).toBe('synced'))

    // The shopper added to the cart and wishlist on their phone meanwhile.
    server.account.cart = [{ id: 1, quantity: 1 }, { id: 2, quantity: 2 }]
    server.account.wishlist = [3, 4]
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'))
    })
    await waitFor(() => expect(result.current.shop.cart).toEqual(server.account.cart))
    expect(result.current.shop.wishlist).toEqual([3, 4])
    expect(server.callsTo('PUT /lists/cart')).toHaveLength(0)
  })

  it('keeps a change made here while the lists are read again', async () => {
    setToken(token)
    store('shopsmart:lists-owner', shopper._id)
    const server = fakeServer({ lists: { cart: [{ id: 1, quantity: 1 }] } })
    const { result } = renderShop()
    await waitFor(() => expect(result.current.shop.listsStatus).toBe('synced'))

    act(() => {
      window.dispatchEvent(new Event('focus'))
      result.current.shop.addToCart(5)
    })
    await waitFor(() => expect(server.callsTo('GET /lists')).toHaveLength(2))
    await waitFor(() => expect(server.account.cart).toEqual([{ id: 1, quantity: 1 }, { id: 5, quantity: 1 }]))
    expect(result.current.shop.cart).toEqual([{ id: 1, quantity: 1 }, { id: 5, quantity: 1 }])
  })

  it('drops a cached list left by another account instead of merging it', async () => {
    setToken(token)
    store('shopsmart:lists-owner', 'someone-else')
    store('shopsmart:cart', [{ id: 9, quantity: 9 }])
    const server = fakeServer({ lists: { cart: [{ id: 2, quantity: 1 }] } })
    const { result } = renderShop()

    await waitFor(() => expect(result.current.shop.listsStatus).toBe('synced'))
    expect(server.callsTo('POST /lists/merge')).toHaveLength(0)
    expect(result.current.shop.cart).toEqual([{ id: 2, quantity: 1 }])
    expect(stored('shopsmart:lists-owner')).toBe(shopper._id)
  })
})
