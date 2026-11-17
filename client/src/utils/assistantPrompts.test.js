import { describe, expect, it } from 'vitest'
import seed from '../../../server/data/catalogue.json'
import { normalizeProduct } from '../services/api'
import { applyFilters, sortProducts } from './filters'
import { mergeWithPrevious, parseQuery, rankByRelevance } from './nlpSearch'
import { buildTextIndex } from './textIndex'
import { ASSISTANT_FOLLOW_UPS, ASSISTANT_OPENERS, SEARCH_EXAMPLES } from './assistantPrompts'

// The catalogue the database is seeded with (server/data/catalogue.json), shaped the way
// the shop loads it.
const products = seed.map(normalizeProduct)
const catalogue = {
  categories: [...new Set(products.map((product) => product.category))],
  brands: [...new Set(products.map((product) => product.brand))]
}
const index = buildTextIndex(products)

// What the assistant does with a message when Gemini cannot read it (useShoppingAssistant).
function ask(query, previous = null) {
  const parsed = mergeWithPrevious(parseQuery(query, catalogue), previous ? previous.filters : null)
  const ranked = rankByRelevance(applyFilters(products, parsed.filters), index, parsed.keywords)
  return { ...parsed, results: parsed.sortBy ? sortProducts(ranked, parsed.sortBy) : ranked }
}

// Asks each question after the one before, as a shopper clicking down a list would.
function askInTurn(queries) {
  let previous = null
  return queries.map((query) => {
    previous = ask(query, previous)
    return [query, previous.results.length]
  })
}

describe('example prompts on the seeded catalogue, read on the device', () => {
  it('finds products for every opener and search example in a new conversation', () => {
    ;[...ASSISTANT_OPENERS, ...SEARCH_EXAMPLES].forEach((query) => {
      expect([query, ask(query).results.length > 0]).toEqual([query, true])
    })
  })

  it('finds products for every follow-up after every opener', () => {
    ASSISTANT_OPENERS.forEach((opener) => {
      const first = ask(opener)
      ASSISTANT_FOLLOW_UPS.forEach((followUp) => {
        expect([opener, followUp, ask(followUp, first).results.length > 0]).toEqual([opener, followUp, true])
      })
    })
  })

  it('finds products when the examples are asked one after another, in either order', () => {
    ;[ASSISTANT_OPENERS, SEARCH_EXAMPLES].forEach((list) => {
      ;[list, [...list].reverse()].forEach((queries) => {
        askInTurn(queries).forEach(([query, count]) => expect([query, count > 0]).toEqual([query, true]))
      })
    })
  })

  it('reads "top rated" as a rating, not as the shirts and tops category', () => {
    const laptops = ask('top rated laptops around $1200')
    expect(laptops.filters.categories).toEqual(['laptops'])
    expect(laptops.chips).toContain('4 stars and up')

    const followUp = ask('only the top rated ones', ask('my phone screen keeps cracking, what should I get'))
    expect(followUp.filters.categories).toEqual(['smartphones'])
    expect(followUp.results.every((product) => product.category === 'smartphones')).toBe(true)
  })

  it('reads the follow-ups as refinements, without leftover words to match', () => {
    const perfume = ask('gift for my wife who loves perfume, up to 150')
    const cheaper = ask('show cheaper options', perfume)
    expect(cheaper.sortBy).toBe('price-asc')
    expect(cheaper.chips).toEqual(['In Fragrances', 'Under $150'])
    expect(ask('only the top rated ones', perfume).chips).toEqual(['In Fragrances', 'Under $150', '4 stars and up'])
    expect(ask('what about newest arrivals', perfume).sortBy).toBe('newest')
  })

  it('does not carry a price or rating into a question about another category', () => {
    const phones = ask('cheapest samsung phone', ask('wireless headphones under $50 rated above 4'))
    expect(phones.filters.maxPrice).toBe('')
    expect(phones.filters.minRating).toBe(0)
    expect(phones.results[0].brand).toBe('Samsung')
  })
})
