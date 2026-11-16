import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import ProductCard from './ProductCard'
import { normalizeProduct } from '../../services/api'
import { fakeApi } from '../../test/fakeApi'
import { apiProduct, renderShopPage } from '../../test/renderShopPage'

describe('ProductCard', () => {
  it('does not offer a sold out product for the cart', async () => {
    fakeApi({ 'GET /products': () => [200, { success: true, products: [] }] })
    renderShopPage(
      <>
        <ProductCard product={normalizeProduct(apiProduct(1, { title: 'Sold Vase', stock: 0 }))} />
        <ProductCard product={normalizeProduct(apiProduct(2, { title: 'Last Lamp', stock: 2 }))} />
      </>,
      { path: '/' }
    )

    expect(await screen.findByRole('button', { name: 'Sold out - Sold Vase' })).toBeDisabled()
    expect(screen.getByText('Sold out', { selector: '.product-card-stock' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add to cart - Last Lamp' })).toBeEnabled()
    expect(screen.getByText('Only 2 left')).toBeInTheDocument()
  })
})
