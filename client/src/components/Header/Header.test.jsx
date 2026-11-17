import { screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import Header from './Header'
import { fakeApi } from '../../test/fakeApi'
import { renderShopPage } from '../../test/renderShopPage'

const space = () => document.documentElement.style.getPropertyValue('--header-space')

describe('Header', () => {
  beforeEach(() => {
    // jsdom does no layout, so the header is given the height it has on a phone.
    vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockImplementation(function height() {
      return this.classList.contains('header') ? 99 : 0
    })
  })

  afterEach(() => {
    document.documentElement.style.removeProperty('--header-space')
  })

  it('shares its height, so focused controls and link targets scroll clear of it', async () => {
    fakeApi({ 'GET /products': () => [200, { success: true, products: [] }] })
    const { unmount } = renderShopPage(<Header />, { path: '/' })

    expect(await screen.findByRole('navigation', { name: 'Primary' })).toBeInTheDocument()
    expect(space()).toBe('99px')
    unmount()
    expect(space()).toBe('')
  })
})
