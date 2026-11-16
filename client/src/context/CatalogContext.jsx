import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { fetchProducts } from '../services/api'
import { isAbortError } from '../services/http'

const CatalogContext = createContext(null)

// After this long the shopper is told the server may be waking up.
const SLOW_AFTER_MS = 5000

export function CatalogProvider({ children }) {
  const [products, setProducts] = useState([])
  const [status, setStatus] = useState('loading')
  const [error, setError] = useState(null)
  const [isSlow, setIsSlow] = useState(false)
  const request = useRef(null)

  const loadCatalogue = useCallback(async () => {
    // A retry replaces any request still running, and StrictMode's second mount aborts the first.
    if (request.current) request.current.abort()
    const controller = new AbortController()
    request.current = controller

    setStatus('loading')
    setError(null)
    setIsSlow(false)
    const slowTimer = setTimeout(() => setIsSlow(true), SLOW_AFTER_MS)

    try {
      const data = await fetchProducts({ signal: controller.signal })
      setProducts(data)
      setStatus('ready')
    } catch (loadError) {
      if (isAbortError(loadError)) return
      setError(loadError)
      setStatus('error')
    } finally {
      clearTimeout(slowTimer)
      if (request.current === controller) {
        request.current = null
        setIsSlow(false)
      }
    }
  }, [])

  useEffect(() => {
    loadCatalogue()
    return () => {
      if (request.current) request.current.abort()
    }
  }, [loadCatalogue])

  /**
   * Applies a change the server has just confirmed (a new rating after a review, the
   * stock left after an order) to the product already loaded, so every page shows it
   * without reloading the whole catalogue. changes is an object or a function of the
   * product that returns one.
   */
  const updateProduct = useCallback((productId, changes) => {
    setProducts((current) =>
      current.map((product) => {
        if (product.id !== productId) return product
        const next = typeof changes === 'function' ? changes(product) : changes
        return { ...product, ...next }
      })
    )
  }, [])

  const value = useMemo(() => {
    const categories = [...new Set(products.map((product) => product.category))].sort()
    const brands = [...new Set(products.map((product) => product.brand))].sort()
    const prices = products.map((product) => product.price)

    return {
      products,
      status,
      error,
      isSlow,
      categories,
      brands,
      priceRange: {
        min: prices.length ? Math.floor(Math.min(...prices)) : 0,
        max: prices.length ? Math.ceil(Math.max(...prices)) : 0
      },
      reload: loadCatalogue,
      updateProduct
    }
  }, [products, status, error, isSlow, loadCatalogue, updateProduct])

  return <CatalogContext.Provider value={value}>{children}</CatalogContext.Provider>
}

export function useCatalog() {
  const context = useContext(CatalogContext)
  if (!context) {
    throw new Error('useCatalog must be used inside a CatalogProvider')
  }
  return context
}
