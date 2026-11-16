import { fireEvent, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import Assistant from './Assistant'
import { resetAiStatus } from '../services/ai'
import { fakeApi } from '../test/fakeApi'
import { apiProduct, renderShopPage } from '../test/renderShopPage'

const products = [
  apiProduct(1, { title: 'Galaxy Phone', brand: 'Samsung', category: 'smartphones', price: 300 }),
  apiProduct(2, { title: 'iPhone', brand: 'Apple', category: 'smartphones', price: 900 }),
  apiProduct(3, { title: 'Laptop Pro', brand: 'Apple', category: 'laptops', price: 1500 })
]

function aiRoutes(extra) {
  return {
    'GET /products': () => [200, { success: true, products }],
    'GET /ai/status': () => [200, { success: true, enabled: true, model: 'gemini-2.5-flash' }],
    ...extra
  }
}

function geminiResult(overrides) {
  return {
    categories: [],
    brands: [],
    minPrice: null,
    maxPrice: null,
    minRating: null,
    onSale: false,
    sortBy: 'relevance',
    keywords: [],
    summary: '',
    ...overrides
  }
}

async function send(text) {
  const input = await screen.findByLabelText('Message the shopping assistant')
  await waitFor(() => expect(input).toBeEnabled())
  fireEvent.change(input, { target: { value: text } })
  fireEvent.click(screen.getByRole('button', { name: 'Send' }))
}

describe('Shopping assistant', () => {
  beforeEach(() => {
    resetAiStatus()
    // The page scrolls the newest question into view, which jsdom does not implement.
    window.HTMLElement.prototype.scrollIntoView = vi.fn()
  })

  it('asks Gemini on the server and sends the earlier turn with a follow-up', async () => {
    const api = fakeApi(
      aiRoutes({
        'POST /ai/search': ({ body }) =>
          body.previous
            ? [200, { success: true, source: 'gemini', result: geminiResult({ categories: ['smartphones'], brands: ['Samsung'], summary: 'Only Samsung phones now.' }) }]
            : [200, { success: true, source: 'gemini', result: geminiResult({ categories: ['smartphones'], maxPrice: 1000, summary: 'Here are phones under $1000.' }) }]
      })
    )
    renderShopPage(<Assistant />, { path: '/assistant' })

    await send('phones under 1000')
    expect(await screen.findByText('Here are phones under $1000.')).toBeInTheDocument()
    expect(screen.getAllByText('Read by Gemini on the ShopSmart server')).toHaveLength(1)
    expect(screen.getByText(/Google Gemini reads your messages/)).toBeInTheDocument()

    await send('only samsung')
    expect(await screen.findByText('Only Samsung phones now.')).toBeInTheDocument()
    const calls = api.callsTo('POST /ai/search')
    expect(calls).toHaveLength(2)
    expect(calls[1].body).toEqual({
      query: 'only samsung',
      previous: {
        query: 'phones under 1000',
        filters: { categories: ['smartphones'], brands: [], minPrice: '', maxPrice: '1000', minRating: 0, minDiscount: 0 }
      }
    })
    // The search never carries the shopper's token, and no Gemini key is in the browser.
    expect(calls[0].headers.Authorization).toBeUndefined()
    expect(calls[0].url).toBe('/api/ai/search')
  })

  it('answers on the device and says why when Gemini is unavailable', async () => {
    fakeApi(
      aiRoutes({
        'POST /ai/search': () => [503, { success: false, message: 'The AI assistant is busy.', code: 'AI_UNAVAILABLE' }]
      })
    )
    renderShopPage(<Assistant />, { path: '/assistant' })

    await send('apple laptops')
    expect(await screen.findByText('Read on this device, because Gemini is not available on the server right now')).toBeInTheDocument()
    expect(screen.getByText('Laptop Pro')).toBeInTheDocument()
    expect(screen.getByText('Brand: Apple')).toBeInTheDocument()
  })

  it('does not call the search at all when the server has no Gemini key', async () => {
    const api = fakeApi(aiRoutes({ 'GET /ai/status': () => [200, { success: true, enabled: false, model: 'gemini-2.5-flash' }] }))
    renderShopPage(<Assistant />, { path: '/assistant' })

    expect(await screen.findByText(/Gemini is not set up on this server right now/)).toBeInTheDocument()
    await send('samsung phones under 500')
    expect(await screen.findByText('Read on this device, because Gemini is not set up on this server')).toBeInTheDocument()
    expect(screen.getByText('Galaxy Phone')).toBeInTheDocument()
    expect(api.callsTo('POST /ai/search')).toHaveLength(0)
    expect(api.callsTo('GET /ai/status')).toHaveLength(1)
  })

  it('falls back when the server cannot be reached', async () => {
    const api = fakeApi(aiRoutes())
    api.fetchMock.mockImplementation(async (url, init = {}) => {
      if (String(url).includes('/ai/search')) throw new TypeError('Failed to fetch')
      if (String(url).includes('/ai/status')) {
        return new Response(JSON.stringify({ success: true, enabled: true }), { status: 200, headers: { 'Content-Type': 'application/json' } })
      }
      return new Response(JSON.stringify({ success: true, products }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    })
    renderShopPage(<Assistant />, { path: '/assistant' })

    await send('phones')
    expect(await screen.findByText('Read on this device, because the ShopSmart server could not be reached')).toBeInTheDocument()
  })

  it('asks a question handed over from the shop page once, even in StrictMode', async () => {
    const api = fakeApi(
      aiRoutes({
        'POST /ai/search': () => [200, { success: true, source: 'gemini', result: geminiResult({ categories: ['laptops'], summary: 'Laptops it is.' }) }]
      })
    )
    renderShopPage(<Assistant />, { path: '/assistant', state: { query: 'a laptop for college' } })

    expect(await screen.findByText('Laptops it is.')).toBeInTheDocument()
    expect(api.callsTo('POST /ai/search')).toHaveLength(1)
    expect(screen.getAllByText('a laptop for college')).toHaveLength(1)
  })
})
