import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { CatalogProvider, useCatalog } from './CatalogContext'
import { normalizeProduct } from '../services/api'
import { fakeApi } from '../test/fakeApi'
import { apiProduct } from '../test/renderShopPage'

function CatalogueProbe() {
  const { products, categories, putProduct, removeProduct } = useCatalog()
  return (
    <div>
      <output data-testid="titles">{products.map((product) => `${product.id}:${product.title}`).join(',')}</output>
      <output data-testid="categories">{categories.join(',')}</output>
      <button type="button" onClick={() => putProduct(normalizeProduct(apiProduct(3, { category: 'lighting' })))}>
        Add
      </button>
      <button type="button" onClick={() => putProduct(normalizeProduct(apiProduct(1, { title: 'Renamed' })))}>
        Edit
      </button>
      <button type="button" onClick={() => removeProduct(2)}>
        Delete
      </button>
    </div>
  )
}

describe('CatalogContext', () => {
  it('takes in what an admin adds, edits and deletes without loading the catalogue again', async () => {
    const { callsTo } = fakeApi({
      'GET /products': () => [200, { success: true, products: [apiProduct(1), apiProduct(2)] }]
    })
    render(
      <CatalogProvider>
        <CatalogueProbe />
      </CatalogProvider>
    )
    expect(await screen.findByText('1:Product 1,2:Product 2')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Add' }))
    expect(screen.getByTestId('titles')).toHaveTextContent('1:Product 1,2:Product 2,3:Product 3')
    expect(screen.getByTestId('categories')).toHaveTextContent('beauty,lighting')

    fireEvent.click(screen.getByRole('button', { name: 'Edit' }))
    expect(screen.getByTestId('titles')).toHaveTextContent('1:Renamed,2:Product 2,3:Product 3')

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
    expect(screen.getByTestId('titles')).toHaveTextContent('1:Renamed,3:Product 3')
    expect(callsTo('GET /products')).toHaveLength(1)
  })
})
