import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import SalesChart from './SalesChart'

function days(revenues) {
  return revenues.map((revenue, index) => ({
    date: `2026-11-${String(4 + index).padStart(2, '0')}`,
    orders: revenue ? 1 : 0,
    revenue
  }))
}

describe('SalesChart', () => {
  it('describes the bars in words and lists every day in a table', () => {
    render(<SalesChart days={days([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 24.99, 74.96])} />)

    const chart = screen.getByRole('img')
    // Node and browsers differ on the comma after the weekday.
    expect(chart).toHaveAccessibleName(
      /^\$99\.95 from 2 orders between 4 Nov and 17 Nov\. The best day was Tue,? 17 Nov with \$74\.96\.$/
    )

    fireEvent.click(screen.getByText('Show the daily figures'))
    const rows = within(screen.getByRole('table')).getAllByRole('row')
    expect(rows).toHaveLength(15)
    expect(rows[14]).toHaveTextContent(/Tue,? 17 Nov1\$74\.96/)
  })

  it('says so plainly when nothing sold', () => {
    render(<SalesChart days={days(Array(14).fill(0))} />)
    expect(screen.getByRole('img')).toHaveAccessibleName('No sales from 4 Nov to 17 Nov.')
  })

  it('draws nothing without days', () => {
    const { container } = render(<SalesChart days={[]} />)
    expect(container).toBeEmptyDOMElement()
  })
})
