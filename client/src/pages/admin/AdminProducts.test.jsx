import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import AdminProducts from './AdminProducts'
import { adminUser, renderAdminPage } from './adminTestUtils'
import { fakeApi } from '../../test/fakeApi'
import { apiProduct } from '../../test/renderShopPage'

vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ user: adminUser, refreshUser: () => Promise.resolve(adminUser) })
}))

const catalog = vi.hoisted(() => ({ removeProduct: vi.fn() }))
vi.mock('../../context/CatalogContext', () => ({ useCatalog: () => catalog }))

function productRoutes(products, extra = {}) {
  let list = products
  return {
    'GET /products': () => [
      200,
      { success: true, products: list, pagination: { page: 1, limit: 20, total: list.length, pages: 1 } }
    ],
    'GET /products/categories': () => [200, { success: true, categories: [{ slug: 'beauty', count: 5 }] }],
    'DELETE /products/2': () => {
      list = list.filter((product) => product.id !== 2)
      return [200, { success: true, message: 'Product deleted' }]
    },
    ...extra
  }
}

describe('AdminProducts', () => {
  it('asks the API for the filters in the address', async () => {
    const { callsTo } = fakeApi(productRoutes([apiProduct(1, { stock: 3 })]))
    renderAdminPage(<AdminProducts />, { path: '/admin/products?q=lamp&stock=low&sort=price-desc&page=2' })

    expect(await screen.findByRole('link', { name: 'Product 1' })).toHaveAttribute('href', '/admin/products/1/edit')
    expect(callsTo('GET /products')[0].url).toBe('/api/products?q=lamp&stockBelow=10&sort=price-desc&page=2&limit=20')
    expect(screen.getByLabelText('Search products')).toHaveValue('lamp')
    expect(screen.getByLabelText('Stock')).toHaveValue('low')
    expect(screen.getByRole('columnheader', { name: /Price/ })).toHaveAttribute('aria-sort', 'descending')
    expect(screen.getByText('Low')).toBeInTheDocument()
  })

  it('goes back to the first page when a filter changes', async () => {
    fakeApi(productRoutes([apiProduct(1)]))
    renderAdminPage(<AdminProducts />, { path: '/admin/products?page=3' })
    await screen.findByRole('link', { name: 'Product 1' })

    fireEvent.change(screen.getByLabelText('Category'), { target: { value: 'beauty' } })
    expect(screen.getByTestId('location')).toHaveTextContent('/admin/products?category=beauty')
  })

  it('deletes a product only after asking, then moves focus to the list', async () => {
    const { callsTo } = fakeApi(productRoutes([apiProduct(1), apiProduct(2)]))
    renderAdminPage(<AdminProducts />, { path: '/admin/products' })
    await screen.findByRole('link', { name: 'Product 2' })

    fireEvent.click(screen.getByRole('button', { name: 'Delete Product 2' }))
    const dialog = screen.getByRole('dialog', { name: 'Delete Product 2?' })
    expect(within(dialog).getByRole('button', { name: 'Keep it' })).toHaveFocus()

    fireEvent.click(within(dialog).getByRole('button', { name: 'Keep it' }))
    expect(callsTo('DELETE /products/2')).toHaveLength(0)

    fireEvent.click(screen.getByRole('button', { name: 'Delete Product 2' }))
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete product' }))

    expect(await screen.findByText('Product 2 was deleted')).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByRole('link', { name: 'Product 2' })).not.toBeInTheDocument())
    expect(callsTo('DELETE /products/2')).toHaveLength(1)
    expect(catalog.removeProduct).toHaveBeenCalledWith(2)
    await waitFor(() => expect(screen.getByRole('heading', { level: 2, name: /1 product in the catalogue/ })).toHaveFocus())
  })

  it('shows the API message inside the dialog when a delete fails', async () => {
    fakeApi(
      productRoutes([apiProduct(2)], {
        'DELETE /products/2': () => [500, { success: false, message: 'Something went wrong on our side.', code: 'SERVER_ERROR' }]
      })
    )
    renderAdminPage(<AdminProducts />, { path: '/admin/products' })
    await screen.findByRole('link', { name: 'Product 2' })

    fireEvent.click(screen.getByRole('button', { name: 'Delete Product 2' }))
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete product' }))

    expect(await within(screen.getByRole('dialog')).findByRole('alert')).toHaveTextContent(
      'Something went wrong on our side.'
    )
    expect(screen.getByRole('link', { name: 'Product 2' })).toBeInTheDocument()
  })

  it('offers to clear the filters when nothing matches', async () => {
    fakeApi(productRoutes([]))
    renderAdminPage(<AdminProducts />, { path: '/admin/products?q=nothing' })

    expect(await screen.findByRole('heading', { name: 'No products match these filters' })).toBeInTheDocument()
    fireEvent.click(screen.getAllByRole('button', { name: 'Clear filters' })[1])
    expect(screen.getByTestId('location')).toHaveTextContent(/^\/admin\/products$/)
  })
})
