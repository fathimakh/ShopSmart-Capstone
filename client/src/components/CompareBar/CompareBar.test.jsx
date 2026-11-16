import { fireEvent, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import CompareBar from './CompareBar'
import { fakeApi } from '../../test/fakeApi'
import { apiProduct, renderShopPage } from '../../test/renderShopPage'

const space = () => document.documentElement.style.getPropertyValue('--compare-bar-space')

describe('CompareBar', () => {
  beforeEach(() => {
    // jsdom does no layout, so the tray is given the height it has on a phone.
    vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockImplementation(function height() {
      return this.classList.contains('compare-bar') ? 126 : 0
    })
  })

  afterEach(() => {
    document.documentElement.style.removeProperty('--compare-bar-space')
  })

  it('shares its height while it is open, so the page and the assistant leave room for it', async () => {
    window.localStorage.setItem('shopsmart:compare', JSON.stringify([1, 2]))
    fakeApi({ 'GET /products': () => [200, { success: true, products: [apiProduct(1), apiProduct(2)] }] })
    renderShopPage(<CompareBar />, { path: '/assistant' })

    expect(await screen.findByRole('region', { name: 'Comparison tray' })).toBeInTheDocument()
    expect(space()).toBe('126px')

    fireEvent.click(screen.getByRole('button', { name: 'Clear' }))
    expect(screen.queryByRole('region', { name: 'Comparison tray' })).not.toBeInTheDocument()
    expect(space()).toBe('')
  })
})
