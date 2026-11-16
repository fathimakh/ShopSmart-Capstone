import { render } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import AdminToasts from '../../components/admin/AdminToasts/AdminToasts'
import { routerFuture } from '../../test/renderShopPage'

export const adminUser = {
  _id: '6afb790454cff2253a63b0ad',
  name: 'ShopSmart Admin',
  email: 'admin@shopsmart.dev',
  role: 'admin'
}

function LocationProbe() {
  const location = useLocation()
  return (
    <output data-testid="location">
      {location.pathname}
      {location.search}
    </output>
  )
}

/**
 * Renders one admin page the way AdminApp does, inside the toast region and a router at
 * the given address, with a probe that shows where the page has navigated to. The page
 * tests mock useAuth, so no session or catalogue provider is needed.
 */
export function renderAdminPage(element, { path = '/admin', route = '*' } = {}) {
  return render(
    <MemoryRouter initialEntries={[path]} future={routerFuture}>
      <AdminToasts>
        <Routes>
          <Route path={route} element={element} />
        </Routes>
        <LocationProbe />
      </AdminToasts>
    </MemoryRouter>
  )
}
