import { StrictMode } from 'react'
import { render } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { AuthProvider } from '../context/AuthContext'
import { CatalogProvider } from '../context/CatalogContext'
import { ShopProvider } from '../context/ShopContext'

export const routerFuture = { v7_startTransition: true, v7_relativeSplatPath: true }

export const shopper = {
  _id: '6afb790454cff2253a63b03a',
  name: 'Demo Shopper',
  email: 'demo@shopsmart.dev',
  role: 'customer',
  address: {
    name: 'Demo Shopper',
    phone: '9876543210',
    address: '12 MG Road, Indiranagar',
    city: 'Bengaluru',
    state: 'Karnataka',
    pincode: '560001'
  }
}

/** A product the way GET /api/products returns it. */
export function apiProduct(id, overrides = {}) {
  return {
    id,
    title: `Product ${id}`,
    description: 'A product used in tests.',
    brand: 'Brand',
    category: 'beauty',
    price: 10,
    discountPercentage: 0,
    rating: 4,
    reviewCount: 3,
    stock: 50,
    thumbnail: 'https://cdn.example/thumb.webp',
    images: ['https://cdn.example/1.webp'],
    availabilityStatus: 'In Stock',
    ...overrides
  }
}

// Shows where a test ended up after the page navigated, and with what router state.
function LocationProbe() {
  const location = useLocation()
  return (
    <output data-testid="location" data-state={JSON.stringify(location.state || null)}>
      {location.pathname}
    </output>
  )
}

/**
 * Renders one page inside the real providers and a memory router, with StrictMode on as
 * in the app so effects that run twice are covered. path is the route pattern, url the
 * address to start at (with optional router state).
 */
export function renderShopPage(page, { path, url, state } = {}) {
  return render(
    <StrictMode>
      <MemoryRouter initialEntries={[{ pathname: url || path, state }]} future={routerFuture}>
        <AuthProvider>
          <CatalogProvider>
            <ShopProvider>
              <Routes>
                <Route path={path} element={page} />
                <Route path="*" element={null} />
              </Routes>
              <LocationProbe />
            </ShopProvider>
          </CatalogProvider>
        </AuthProvider>
      </MemoryRouter>
    </StrictMode>
  )
}
