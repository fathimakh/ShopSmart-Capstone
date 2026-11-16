import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import OrderStatusForm from './OrderStatusForm'
import { fakeApi } from '../../../test/fakeApi'

function order(status) {
  return { number: 'SS100001', status }
}

function radioValues() {
  return screen.getAllByRole('radio').map((radio) => radio.value)
}

describe('OrderStatusForm', () => {
  it('offers only the next statuses the API allows', () => {
    const { rerender } = render(<OrderStatusForm order={order('processing')} onUpdated={vi.fn()} onStale={vi.fn()} />)
    expect(radioValues()).toEqual(['shipped', 'cancelled'])
    expect(screen.getByRole('radio', { name: /Shipped/ })).toBeChecked()

    rerender(<OrderStatusForm order={order('shipped')} onUpdated={vi.fn()} onStale={vi.fn()} />)
    expect(radioValues()).toEqual(['delivered', 'cancelled'])
    expect(screen.getByRole('button', { name: 'Mark as delivered' })).toBeInTheDocument()
  })

  it('offers nothing for a delivered or cancelled order', () => {
    const { rerender } = render(<OrderStatusForm order={order('delivered')} onUpdated={vi.fn()} onStale={vi.fn()} />)
    expect(screen.queryByRole('radio')).not.toBeInTheDocument()
    expect(screen.getByText(/delivered, which is final/)).toBeInTheDocument()

    rerender(<OrderStatusForm order={order('cancelled')} onUpdated={vi.fn()} onStale={vi.fn()} />)
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    expect(screen.getByText(/cancelled, which is final/)).toBeInTheDocument()
  })

  it('ships the order with the note for its history', async () => {
    const shipped = { ...order('shipped'), statusHistory: [] }
    const { calls } = fakeApi({
      'PATCH /orders/SS100001/status': () => [200, { success: true, order: shipped }]
    })
    const onUpdated = vi.fn()
    render(<OrderStatusForm order={order('processing')} onUpdated={onUpdated} onStale={vi.fn()} />)

    fireEvent.change(screen.getByLabelText('Note for the order history (optional)'), {
      target: { value: '  Sent with BlueDart  ' }
    })
    fireEvent.click(screen.getByRole('button', { name: 'Mark as shipped' }))

    await waitFor(() => expect(onUpdated).toHaveBeenCalledWith(shipped))
    expect(calls[0].body).toEqual({ status: 'shipped', note: 'Sent with BlueDart' })
  })

  it('asks before cancelling, and sends nothing if the admin backs out', async () => {
    const { calls } = fakeApi({
      'PATCH /orders/SS100001/status': ({ body }) => [200, { success: true, order: order(body.status) }]
    })
    const onUpdated = vi.fn()
    render(<OrderStatusForm order={order('shipped')} onUpdated={onUpdated} onStale={vi.fn()} />)

    fireEvent.click(screen.getByRole('radio', { name: /Cancelled/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Cancel order' }))
    const dialog = screen.getByRole('dialog', { name: 'Cancel order SS100001?' })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Keep the order' }))
    expect(calls).toHaveLength(0)

    fireEvent.click(screen.getByRole('button', { name: 'Cancel order' }))
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancel order' }))

    await waitFor(() => expect(onUpdated).toHaveBeenCalledWith(order('cancelled')))
    expect(calls[0].body).toEqual({ status: 'cancelled' })
  })

  it('loads the order again when it changed elsewhere, and says why', async () => {
    fakeApi({
      'PATCH /orders/SS100001/status': () => [
        409,
        { success: false, message: 'This order is already shipped.', code: 'INVALID_STATUS_TRANSITION' }
      ]
    })
    const onStale = vi.fn()
    const onUpdated = vi.fn()
    render(<OrderStatusForm order={order('processing')} onUpdated={onUpdated} onStale={onStale} />)

    fireEvent.click(screen.getByRole('button', { name: 'Mark as shipped' }))

    expect(await screen.findByText(/This order is already shipped\. The latest version of the order is shown now/)).toBeInTheDocument()
    expect(onStale).toHaveBeenCalledTimes(1)
    expect(onUpdated).not.toHaveBeenCalled()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('treats ORDER_CHANGED the same way', async () => {
    fakeApi({
      'PATCH /orders/SS100001/status': () => [
        409,
        { success: false, message: 'The order changed while you were looking at it. Reload it and try again.', code: 'ORDER_CHANGED' }
      ]
    })
    const onStale = vi.fn()
    render(<OrderStatusForm order={order('processing')} onUpdated={vi.fn()} onStale={onStale} />)

    fireEvent.click(screen.getByRole('button', { name: 'Mark as shipped' }))
    await waitFor(() => expect(onStale).toHaveBeenCalledTimes(1))
  })

  it('shows any other failure under the button and keeps the choice', async () => {
    fakeApi({
      'PATCH /orders/SS100001/status': () => [500, { success: false, message: 'Something went wrong on our side.', code: 'SERVER_ERROR' }]
    })
    const onStale = vi.fn()
    render(<OrderStatusForm order={order('processing')} onUpdated={vi.fn()} onStale={onStale} />)

    fireEvent.click(screen.getByRole('button', { name: 'Mark as shipped' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Something went wrong on our side.')
    expect(onStale).not.toHaveBeenCalled()
    expect(screen.getByRole('radio', { name: /Shipped/ })).toBeChecked()
  })
})
