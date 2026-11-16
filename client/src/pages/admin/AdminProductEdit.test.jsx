import { fireEvent, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import AdminProductEdit from './AdminProductEdit'
import { adminUser, renderAdminPage } from './adminTestUtils'
import { fakeApi } from '../../test/fakeApi'
import { apiProduct } from '../../test/renderShopPage'

vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ user: adminUser, refreshUser: () => Promise.resolve(adminUser) })
}))

const catalog = vi.hoisted(() => ({ putProduct: vi.fn() }))
vi.mock('../../context/CatalogContext', () => ({ useCatalog: () => catalog }))

const editRoute = { path: '/admin/products/5/edit', route: '/admin/products/:id/edit' }

function historyAnswer(prices) {
  return [
    200,
    {
      success: true,
      productId: 5,
      currentPrice: prices[prices.length - 1],
      points: prices.map((price, index) => ({ price, at: `2026-11-${String(10 + index).padStart(2, '0')}T10:00:00.000Z` })),
      prediction: { forecast: 10, forecastAt: '2026-12-01T10:00:00.000Z', changePercent: 0, confidence: 0, verdict: 'steady', weeks: 0, hasEnoughData: false }
    }
  ]
}

describe('AdminProductEdit', () => {
  it('sends only the changed price and shows the new price history point', async () => {
    let prices = [10]
    let product = apiProduct(5, { price: 10, meta: { createdAt: '2026-11-10T10:00:00.000Z', updatedAt: '2026-11-10T10:00:00.000Z' } })
    const { callsTo } = fakeApi({
      'GET /products/5': () => [200, { success: true, product }],
      'GET /products/categories': () => [200, { success: true, categories: [] }],
      'GET /products/5/price-history': () => historyAnswer(prices),
      'PUT /products/5': ({ body }) => {
        product = { ...product, ...body }
        prices = [...prices, body.price]
        return [200, { success: true, product }]
      }
    })
    renderAdminPage(<AdminProductEdit />, editRoute)

    expect(await screen.findByRole('heading', { level: 1, name: 'Edit Product 5' })).toBeInTheDocument()
    expect(await screen.findByText(/1 price recorded/)).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('Price in US dollars'), { target: { value: '8.5' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))

    expect(await screen.findByText('Saved. $8.50 was added to the price history')).toBeInTheDocument()
    expect(callsTo('PUT /products/5')[0].body).toEqual({ price: 8.5 })
    expect(catalog.putProduct).toHaveBeenCalledWith(expect.objectContaining({ id: 5, price: 8.5 }))
    expect(await screen.findByText(/2 prices recorded/)).toBeInTheDocument()
    expect(screen.getByText('Just added')).toBeInTheDocument()
    expect(screen.getByLabelText('Price in US dollars')).toHaveValue('8.5')
  })

  it('says when there is nothing to save, without calling the API', async () => {
    const { callsTo } = fakeApi({
      'GET /products/5': () => [200, { success: true, product: apiProduct(5) }],
      'GET /products/categories': () => [200, { success: true, categories: [] }],
      'GET /products/5/price-history': () => historyAnswer([10])
    })
    renderAdminPage(<AdminProductEdit />, editRoute)
    await screen.findByRole('heading', { level: 1, name: 'Edit Product 5' })

    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))
    expect(await screen.findByText('Nothing has changed, so there was nothing to save.')).toBeInTheDocument()
    expect(callsTo('PUT /products/5')).toHaveLength(0)
  })

  it('explains a product that does not exist', async () => {
    fakeApi({
      'GET /products/99': () => [404, { success: false, message: 'We could not find that product.', code: 'PRODUCT_NOT_FOUND' }],
      'GET /products/categories': () => [200, { success: true, categories: [] }]
    })
    renderAdminPage(<AdminProductEdit />, { path: '/admin/products/99/edit', route: '/admin/products/:id/edit' })

    expect(await screen.findByRole('heading', { level: 1, name: 'Product not found' })).toBeInTheDocument()
    expect(screen.getByText(/There is no product #99/)).toBeInTheDocument()
  })

  it('adds a product and opens the table with the newest first', async () => {
    const { callsTo } = fakeApi({
      'GET /products/categories': () => [200, { success: true, categories: [] }],
      'POST /products': ({ body }) => [201, { success: true, product: { ...apiProduct(195), ...body } }]
    })
    // Any path matches, so the table address the form opens afterwards is a known route.
    renderAdminPage(<AdminProductEdit />, { path: '/admin/products/new' })

    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Teapot' } })
    fireEvent.change(screen.getByLabelText('Category'), { target: { value: 'kitchen-accessories' } })
    fireEvent.change(screen.getByLabelText('Description'), { target: { value: 'A teapot for testing the form.' } })
    fireEvent.change(screen.getByLabelText('Price in US dollars'), { target: { value: '15.50' } })
    fireEvent.change(screen.getByLabelText('Units in stock'), { target: { value: '7' } })
    fireEvent.change(screen.getByLabelText('Main image URL'), { target: { value: 'https://cdn.example/t.webp' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add product' }))

    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/admin/products?sort=newest'))
    expect(screen.getByText('Teapot was added as product #195')).toBeInTheDocument()
    expect(catalog.putProduct).toHaveBeenCalledWith(expect.objectContaining({ id: 195, title: 'Teapot', stock: 7 }))
    expect(callsTo('POST /products')[0].body).toEqual({
      title: 'Teapot',
      category: 'kitchen-accessories',
      description: 'A teapot for testing the form.',
      price: 15.5,
      stock: 7,
      thumbnail: 'https://cdn.example/t.webp'
    })
  })
})
