import { useState } from 'react'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import AdminSearch from './AdminSearch'

// Holds the applied search the way an admin list keeps it in the address. applyAfter
// delays it, as a router update can be.
function Harness({ onSearch, applyAfter = 0 }) {
  const [value, setValue] = useState('')
  return (
    <>
      <AdminSearch
        id="search"
        label="Search orders"
        value={value}
        onSearch={(words) => {
          onSearch(words)
          if (applyAfter) setTimeout(() => setValue(words), applyAfter)
          else setValue(words)
        }}
      />
      <button type="button" onClick={() => setValue('')}>
        Reset
      </button>
    </>
  )
}

describe('AdminSearch', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('searches once typing pauses, without the spaces around the words', () => {
    const onSearch = vi.fn()
    render(<Harness onSearch={onSearch} />)

    fireEvent.change(screen.getByLabelText('Search orders'), { target: { value: ' meera ' } })
    expect(onSearch).not.toHaveBeenCalled()
    act(() => vi.advanceTimersByTime(400))
    expect(onSearch).toHaveBeenCalledWith('meera')
    expect(onSearch).toHaveBeenCalledTimes(1)
  })

  it('searches straight away on Enter', () => {
    const onSearch = vi.fn()
    render(<Harness onSearch={onSearch} />)

    fireEvent.change(screen.getByLabelText('Search orders'), { target: { value: 'SS100001' } })
    fireEvent.keyDown(screen.getByLabelText('Search orders'), { key: 'Enter' })
    expect(onSearch).toHaveBeenCalledWith('SS100001')
  })

  it('keeps letters typed while its own search is being applied', () => {
    const onSearch = vi.fn()
    render(<Harness onSearch={onSearch} applyAfter={50} />)
    const input = screen.getByLabelText('Search orders')

    fireEvent.change(input, { target: { value: 'mee' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    fireEvent.change(input, { target: { value: 'meera' } })
    act(() => vi.advanceTimersByTime(50))
    expect(input).toHaveValue('meera')

    act(() => vi.advanceTimersByTime(400))
    expect(onSearch).toHaveBeenLastCalledWith('meera')
  })

  it('follows a reset from outside without searching again', () => {
    const onSearch = vi.fn()
    render(<Harness onSearch={onSearch} />)
    const input = screen.getByLabelText('Search orders')

    fireEvent.change(input, { target: { value: 'meera' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    fireEvent.click(screen.getByRole('button', { name: 'Reset' }))
    expect(input).toHaveValue('')

    act(() => vi.advanceTimersByTime(400))
    expect(onSearch).toHaveBeenCalledTimes(1)
  })
})
