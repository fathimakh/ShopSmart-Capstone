import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import CategoryTiles from './CategoryTiles'
import { routerFuture } from '../../test/renderShopPage'

describe('CategoryTiles', () => {
  it('counts the products in each category in words that agree', () => {
    render(
      <MemoryRouter future={routerFuture}>
        <CategoryTiles
          categories={[
            { category: 'lighting', count: 1, thumbnail: 'https://cdn.example/1.webp' },
            { category: 'beauty', count: 5, thumbnail: 'https://cdn.example/2.webp' }
          ]}
        />
      </MemoryRouter>
    )

    expect(screen.getByRole('link', { name: /Lighting/ })).toHaveTextContent('1 item')
    expect(screen.getByRole('link', { name: /Lighting/ })).not.toHaveTextContent('1 items')
    expect(screen.getByRole('link', { name: /Beauty/ })).toHaveTextContent('5 items')
  })
})
