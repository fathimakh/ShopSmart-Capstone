import { describe, expect, it } from 'vitest'
import { buildAiRequest, describeEngine, fallbackReason, fromAiResult } from './aiSearch'

const catalogue = { categories: ['smartphones', 'laptops'], brands: ['Apple', 'Samsung'] }

describe('AI search helpers', () => {
  it('sends the message with the earlier turn so a follow-up refines it', () => {
    const previous = { query: 'phones under 1000', filters: { categories: ['smartphones'], maxPrice: '1000' } }
    expect(buildAiRequest('  only samsung ', previous)).toEqual({
      query: 'only samsung',
      previous: { query: 'phones under 1000', filters: previous.filters }
    })
    expect(buildAiRequest('laptops', null)).toEqual({ query: 'laptops' })
    expect(buildAiRequest('x'.repeat(400), null).query).toHaveLength(300)
    // Too short for the server, which would refuse it.
    expect(buildAiRequest(' a ', null)).toBeNull()
  })

  it('leaves out earlier filters too long for the server', () => {
    const previous = { query: 'phones', filters: { keywords: ['x'.repeat(2100)] } }
    expect(buildAiRequest('cheaper', previous)).toEqual({ query: 'cheaper', previous: { query: 'phones' } })
  })

  it('turns the server result into the shop filters', () => {
    const parsed = fromAiResult(
      {
        categories: ['smartphones', 'tablets'],
        brands: ['samsung', 'Nokia'],
        minPrice: 1200.5,
        maxPrice: 300,
        minRating: 4.2,
        onSale: true,
        sortBy: 'price-asc',
        keywords: ['wireless', 'charging'],
        summary: 'Here are Samsung phones.'
      },
      catalogue
    )
    expect(parsed.filters).toEqual({
      categories: ['smartphones'],
      brands: ['Samsung'],
      minPrice: '300',
      maxPrice: '1200.5',
      minRating: 4.2,
      minDiscount: 10
    })
    expect(parsed).toMatchObject({ sortBy: 'price-asc', keywords: ['wireless', 'charging'], summary: 'Here are Samsung phones.', source: 'gemini' })
    expect(parsed.chips).toContain('Brand: Samsung')
  })

  it('keeps the keyword ranking when Gemini asks for the best match', () => {
    const parsed = fromAiResult({ categories: [], brands: [], minPrice: null, maxPrice: null, minRating: null, onSale: false, sortBy: 'relevance', keywords: [], summary: '' }, catalogue)
    expect(parsed.sortBy).toBeNull()
    expect(parsed.filters).toMatchObject({ minPrice: '', maxPrice: '', minRating: 0, minDiscount: 0 })
  })

  it('says why the device answered', () => {
    expect(fallbackReason(null, false)).toBe('Gemini is not set up on this server')
    expect(fallbackReason({ code: 'AI_TIMEOUT' })).toBe('Gemini took too long to answer')
    expect(fallbackReason({ code: 'NETWORK_ERROR' })).toBe('the ShopSmart server could not be reached')
    expect(describeEngine({ source: 'gemini' })).toBe('Read by Gemini on the ShopSmart server')
    expect(describeEngine({ source: 'device', fallbackReason: 'Gemini took too long to answer' })).toBe(
      'Read on this device, because Gemini took too long to answer'
    )
    expect(describeEngine({ source: 'device' })).toBe('Read on this device')
  })
})
