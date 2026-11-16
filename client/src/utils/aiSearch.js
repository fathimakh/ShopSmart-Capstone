// Helpers for the AI shopping search (docs/API.md, AI assistant). The server asks Gemini
// and checks its answer against the catalogue; these turn that answer into the filter
// object the shop page uses, and decide what to say when the on-device parser answers
// instead. Pure, so they can be tested without a server.

import { describeFilters } from './nlpSearch'
import { sortOptions } from './filters'

export const QUERY_MIN = 2
export const QUERY_MAX = 300
// The server refuses a previous turn whose filters are longer than this once serialised.
const PREVIOUS_FILTERS_MAX = 2000

function toPrice(value) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? String(value) : ''
}

/**
 * The body for POST /api/ai/search. The earlier answer of the conversation goes along as
 * `previous`, so "only Samsung" or "cheaper" refines it instead of starting over. Returns
 * null for a message the server would refuse as too short.
 */
export function buildAiRequest(query, previous) {
  const text = query.trim()
  if (text.length < QUERY_MIN) return null

  const body = { query: text.slice(0, QUERY_MAX) }
  if (previous && previous.query) {
    body.previous = { query: previous.query.trim().slice(0, QUERY_MAX) }
    if (previous.filters && JSON.stringify(previous.filters).length <= PREVIOUS_FILTERS_MAX) {
      body.previous.filters = previous.filters
    }
  }
  return body
}

/**
 * Turns the server's `result` into what the assistant and the shop page work with:
 * { filters, sortBy, keywords, chips, summary, source: 'gemini' }. The server has already
 * checked categories and brands against the database; they are matched once more against
 * the catalogue loaded here, so a filter can never point at something this page lacks.
 */
export function fromAiResult(result, { categories = [], brands = [] } = {}) {
  const answer = result || {}
  const knownBrands = new Map(brands.map((brand) => [brand.toLowerCase(), brand]))

  let minPrice = toPrice(answer.minPrice)
  let maxPrice = toPrice(answer.maxPrice)
  if (minPrice && maxPrice && Number(minPrice) > Number(maxPrice)) {
    ;[minPrice, maxPrice] = [maxPrice, minPrice]
  }

  const rating = Number(answer.minRating)
  const filters = {
    categories: (answer.categories || []).filter((category) => categories.includes(category)),
    brands: (answer.brands || [])
      .map((brand) => knownBrands.get(String(brand).toLowerCase()))
      .filter(Boolean),
    minPrice,
    maxPrice,
    minRating: Number.isFinite(rating) && rating > 0 && rating <= 5 ? rating : 0,
    minDiscount: answer.onSale ? 10 : 0
  }

  const keywords = (answer.keywords || []).filter((keyword) => typeof keyword === 'string').slice(0, 8)
  const validSort = sortOptions.some((option) => option.value === answer.sortBy)

  return {
    filters,
    // "relevance" means the shopper did not ask for an order: keep the keyword ranking.
    sortBy: validSort && answer.sortBy !== 'relevance' ? answer.sortBy : null,
    keywords,
    chips: describeFilters(filters, keywords),
    summary: typeof answer.summary === 'string' ? answer.summary : '',
    source: 'gemini'
  }
}

/**
 * Why the on-device parser answered instead of Gemini, as the end of the sentence
 * "Read on this device, because ...". aiEnabled is false when GET /api/ai/status said no
 * key is configured.
 */
export function fallbackReason(error, aiEnabled) {
  if (aiEnabled === false) return 'Gemini is not set up on this server'
  if (!error) return 'Gemini could not pick out anything to search for'

  switch (error.code) {
    case 'AI_UNAVAILABLE':
      return 'Gemini is not available on the server right now'
    case 'RATE_LIMITED':
      return 'the AI search has had a lot of questions from here, so it is taking a short break'
    case 'AI_TIMEOUT':
    case 'TIMEOUT':
      return 'Gemini took too long to answer'
    case 'AI_FAILED':
      return 'Gemini sent an answer that could not be used'
    case 'NETWORK_ERROR':
      return 'the ShopSmart server could not be reached'
    case 'SHORT_QUERY':
      return 'the message is too short to send to Gemini'
    default:
      return 'Gemini could not answer this time'
  }
}

/** The line under an answer that says who read the message. */
export function describeEngine({ source, fallbackReason: reason } = {}) {
  if (source === 'gemini') return 'Read by Gemini on the ShopSmart server'
  return reason ? `Read on this device, because ${reason}` : 'Read on this device'
}
