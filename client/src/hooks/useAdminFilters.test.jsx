import { act, renderHook } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import useAdminFilters from './useAdminFilters'
import { routerFuture } from '../test/renderShopPage'

const DEFAULTS = { q: '', status: '' }

function renderFilters(entry) {
  const wrapper = ({ children }) => (
    <MemoryRouter initialEntries={[entry]} future={routerFuture}>
      {children}
    </MemoryRouter>
  )
  return renderHook(
    () => {
      const [filters, setFilters, resetFilters] = useAdminFilters(DEFAULTS)
      return { filters, setFilters, resetFilters, search: useLocation().search }
    },
    { wrapper }
  )
}

describe('useAdminFilters', () => {
  it('reads the filters from the address, with defaults and a safe page number', () => {
    const { result } = renderFilters('/admin/orders?status=shipped&page=abc')
    expect(result.current.filters).toEqual({ q: '', status: 'shipped', page: 1 })
  })

  it('goes back to page 1 when a filter changes, and drops default values', () => {
    const { result } = renderFilters('/admin/orders?status=shipped&page=3')

    act(() => result.current.setFilters({ q: 'meera' }))
    expect(result.current.search).toBe('?status=shipped&q=meera')

    act(() => result.current.setFilters({ status: '' }))
    expect(result.current.search).toBe('?q=meera')
  })

  it('keeps the other filters when only the page changes, and resets everything', () => {
    const { result } = renderFilters('/admin/orders?q=meera')

    act(() => result.current.setFilters({ page: 2 }))
    expect(result.current.filters).toEqual({ q: 'meera', status: '', page: 2 })

    act(() => result.current.setFilters({ page: 1 }))
    expect(result.current.search).toBe('?q=meera')

    act(() => result.current.resetFilters())
    expect(result.current.search).toBe('')
  })
})
