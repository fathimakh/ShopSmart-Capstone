import env from '../config/env.js'
import Product from '../models/product.js'
import { parseShoppingQuery } from '../services/aiSearch.js'
import { isGeminiConfigured } from '../services/gemini.js'

/** GET /api/ai/status - lets the client decide whether to offer the AI features at all. */
export function getAiStatus(req, res) {
  res.json({ success: true, enabled: isGeminiConfigured(), model: env.geminiModel })
}

/**
 * POST /api/ai/search - reads a shopper's message into catalogue filters. The real
 * category and brand lists are sent with every request, so the answer always fits the
 * catalogue as it is now, including products an admin added today.
 */
export async function searchWithAi(req, res) {
  const { query, previous } = req.body
  const [categories, brands] = await Promise.all([Product.distinct('category'), Product.distinct('brand')])

  const result = await parseShoppingQuery(query, {
    categories: categories.sort(),
    brands: brands.sort((first, second) => first.localeCompare(second)),
    previous: previous ?? null
  })
  res.json({ success: true, result, source: 'gemini' })
}
