import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import ProductForm from './ProductForm'
import { ApiError } from '../../../services/http'
import { emptyProductValues } from '../../../services/adminRules'
import { routerFuture } from '../../../test/renderShopPage'

function renderForm(props) {
  return render(
    <MemoryRouter future={routerFuture}>
      <ProductForm initialValues={emptyProductValues} onSubmit={vi.fn()} {...props} />
    </MemoryRouter>
  )
}

function fill(label, value) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } })
}

function fillValidProduct() {
  fill('Title', 'Teapot')
  fill('Category', 'kitchen-accessories')
  fill('Description', 'A teapot for testing the form.')
  fill('Price in US dollars', '15.50')
  fill('Units in stock', '7')
  fill('Main image URL', 'https://cdn.example/teapot.webp')
}

describe('ProductForm', () => {
  it('checks the form before sending and focuses the first problem', () => {
    const onSubmit = vi.fn()
    renderForm({ onSubmit })

    fireEvent.click(screen.getByRole('button', { name: 'Add product' }))

    expect(onSubmit).not.toHaveBeenCalled()
    expect(screen.getByLabelText('Title')).toHaveFocus()
    expect(screen.getByLabelText('Title')).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByText('Title is required')).toBeInTheDocument()
    expect(screen.getByText('Price is required')).toBeInTheDocument()
    expect(screen.getByText('Image URL is required')).toBeInTheDocument()
  })

  it('clears a field message as soon as the field is corrected', () => {
    renderForm()
    fireEvent.click(screen.getByRole('button', { name: 'Add product' }))
    expect(screen.getByText('Title is required')).toBeInTheDocument()

    fill('Title', 'Teapot')
    expect(screen.queryByText('Title is required')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Title')).toHaveAttribute('aria-invalid', 'false')
  })

  it('catches a bad number and a category that is not a slug', () => {
    renderForm()
    fillValidProduct()
    fill('Price in US dollars', '12.345')
    fill('Category', 'Home & Garden')

    fireEvent.click(screen.getByRole('button', { name: 'Add product' }))

    expect(screen.getByText('Use lowercase letters, numbers and dashes, such as home-decoration')).toBeInTheDocument()
    expect(screen.getByText('Price must be a number with at most two decimal places')).toBeInTheDocument()
    expect(screen.getByLabelText('Category')).toHaveFocus()
  })

  it('turns a typed category into a slug when the field is left', () => {
    renderForm()
    fill('Category', 'Home Decoration ')
    fireEvent.blur(screen.getByLabelText('Category'))
    expect(screen.getByLabelText('Category')).toHaveValue('home-decoration')
  })

  it('shows the server field errors on the matching inputs', async () => {
    const error = new ApiError({
      message: 'Please check the highlighted fields',
      status: 400,
      code: 'VALIDATION_ERROR',
      errors: [{ field: 'tags', message: 'Tags entry 2 is invalid' }]
    })
    const onSubmit = vi.fn(async () => ({ ok: false, error }))
    renderForm({ onSubmit })
    fillValidProduct()

    fireEvent.click(screen.getByRole('button', { name: 'Add product' }))

    expect(await screen.findByText('Tags entry 2 is invalid')).toBeInTheDocument()
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ title: 'Teapot', price: '15.50' }))
    expect(screen.getByLabelText('Tags')).toHaveFocus()
    expect(screen.getByText(/Please check the highlighted fields\. One field needs a change\./)).toBeInTheDocument()
  })

  it('focuses the form message when the server refuses without naming a field', async () => {
    const error = new ApiError({ message: 'Only store admins can do that.', status: 403, code: 'FORBIDDEN' })
    renderForm({ onSubmit: async () => ({ ok: false, error }) })
    fillValidProduct()

    fireEvent.click(screen.getByRole('button', { name: 'Add product' }))

    await waitFor(() => expect(screen.getByRole('alert')).toHaveFocus())
    expect(screen.getByRole('alert')).toHaveTextContent('Only store admins can do that.')
  })

  it('tells the admin that a new price adds a price history point', () => {
    renderForm({
      mode: 'edit',
      originalPrice: 15.5,
      initialValues: { ...emptyProductValues, price: '15.5' }
    })
    expect(screen.getByText(/Changing the price adds a point to the price history/)).toBeInTheDocument()

    fill('Price in US dollars', '14.25')
    expect(
      screen.getByText(/The price changes from \$15\.50 to \$14\.25\. Saving adds a point to the price history/)
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeInTheDocument()
  })
})
