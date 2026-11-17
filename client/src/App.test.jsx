import { act, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { AuthProvider } from './context/AuthContext'
import { CatalogProvider } from './context/CatalogContext'
import { ShopProvider } from './context/ShopContext'
import { fakeApi } from './test/fakeApi'
import { apiProduct, routerFuture } from './test/renderShopPage'

function renderApp(url) {
  return render(
    <MemoryRouter initialEntries={[url]} future={routerFuture}>
      <AuthProvider>
        <CatalogProvider>
          <ShopProvider>
            <App />
          </ShopProvider>
        </CatalogProvider>
      </AuthProvider>
    </MemoryRouter>
  )
}

describe('App', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('says the server is waking up on whichever page a slow first visit starts', async () => {
    let answerCatalogue
    fakeApi({
      'GET /products': () =>
        new Promise((resolve) => {
          answerCatalogue = resolve
        })
    })
    renderApp('/login')
    const notice = /Waking up the server/

    await act(() => vi.advanceTimersByTime(4900))
    expect(screen.queryByText(notice)).not.toBeInTheDocument()

    await act(() => vi.advanceTimersByTime(100))
    expect(screen.getByRole('status')).toHaveTextContent(notice)

    await act(async () => {
      answerCatalogue([200, { success: true, products: [apiProduct(1)] }])
    })
    expect(screen.queryByText(notice)).not.toBeInTheDocument()
  })
})
