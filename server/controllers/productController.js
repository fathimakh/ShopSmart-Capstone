import { nextSequence } from '../models/counter.js'
import Product, { pushPricePoint } from '../models/product.js'
import Review from '../models/review.js'
import User from '../models/user.js'
import { FORECAST_WEEKS, MIN_POINTS, WEEK, predictPrice } from '../services/pricePredict.js'
import ApiError from '../utils/ApiError.js'
import { buildPagination, createQueryReader, escapeRegex } from '../utils/queryReader.js'
import { productRules } from '../validators/productValidators.js'

export const SORT_OPTIONS = {
  featured: { id: 1 },
  relevance: { id: 1 },
  'price-asc': { price: 1, id: 1 },
  'price-desc': { price: -1, id: 1 },
  rating: { rating: -1, id: 1 },
  popularity: { reviewCount: -1, rating: -1, id: 1 },
  newest: { createdAt: -1, id: 1 },
  discount: { discountPercentage: -1, id: 1 }
}

/** Turns the query string into a Mongo filter. Shared with the admin product table. */
export function buildProductFilter(read) {
  const filter = {}

  const q = read.string('q', { maxLength: 100 })
  if (q) {
    // Every word has to appear somewhere, the same rule the storefront search box uses.
    filter.$and = q
      .split(/\s+/)
      .slice(0, 8)
      .map((word) => {
        const pattern = new RegExp(escapeRegex(word), 'i')
        return { $or: [{ title: pattern }, { brand: pattern }, { category: pattern }, { tags: pattern }, { description: pattern }] }
      })
  }

  const categories = read.list('category').map((value) => value.toLowerCase())
  if (categories.length) filter.category = { $in: categories }

  const brands = read.list('brand')
  if (brands.length) filter.brand = { $in: brands }

  const minPrice = read.number('minPrice', { min: 0 })
  const maxPrice = read.number('maxPrice', { min: 0 })
  if (minPrice !== undefined || maxPrice !== undefined) {
    filter.price = {}
    if (minPrice !== undefined) filter.price.$gte = minPrice
    if (maxPrice !== undefined) filter.price.$lte = maxPrice
  }

  const minRating = read.number('minRating', { min: 0, max: 5 })
  if (minRating) filter.rating = { $gte: minRating }

  const minDiscount = read.number('minDiscount', { min: 0, max: 90 })
  if (minDiscount) filter.discountPercentage = { $gte: minDiscount }

  if (read.boolean('inStock')) filter.stock = { $gt: 0 }

  const stockBelow = read.number('stockBelow', { min: 1, integer: true })
  if (stockBelow) filter.stock = { $lt: stockBelow }

  return filter
}

/** GET /api/products - search, filter, sort and paginate. limit=0 returns everything. */
export async function listProducts(req, res) {
  const read = createQueryReader(req.query)
  const filter = buildProductFilter(read)
  const sort = read.oneOf('sort', Object.keys(SORT_OPTIONS), 'featured')
  const { page, limit, skip } = read.pagination({ defaultLimit: 24, maxLimit: 100, allowAll: true })
  read.assertValid()

  const query = Product.find(filter).sort(SORT_OPTIONS[sort]).skip(skip)
  if (limit) query.limit(limit)

  const [products, total] = await Promise.all([query, Product.countDocuments(filter)])
  res.json({ success: true, products, pagination: buildPagination(page, limit || total, total) })
}

/** GET /api/products/categories - each category with how many products it has. */
export async function listCategories(req, res) {
  const categories = await Product.aggregate([
    { $group: { _id: '$category', count: { $sum: 1 } } },
    { $sort: { _id: 1 } },
    { $project: { _id: 0, slug: '$_id', count: 1 } }
  ])
  res.json({ success: true, categories })
}

export async function findProductOr404(id, projection) {
  const product = await Product.findOne({ id }).select(projection)
  if (!product) throw ApiError.notFound('We could not find that product.', 'PRODUCT_NOT_FOUND')
  return product
}

/** GET /api/products/:id */
export async function getProduct(req, res) {
  const product = await findProductOr404(req.productId)
  res.json({ success: true, product })
}

/**
 * GET /api/products/:id/price-history - the recorded prices with their dates (weekly from
 * the seed, plus a point for every admin price change) and the forecast fitted through
 * them. With fewer than three points there is no trend yet, so the forecast is today's
 * price with zero confidence.
 */
export async function getPriceHistory(req, res) {
  const product = await findProductOr404(req.productId, '+priceHistory')
  const points = product.priceHistory
    .map(({ price, at }) => ({ price, at }))
    .sort((first, second) => first.at - second.at)
  const prediction = predictPrice(points, product.price)

  res.json({
    success: true,
    productId: product.id,
    currentPrice: product.price,
    points,
    prediction: {
      forecast: prediction.forecast,
      forecastAt: new Date(Date.now() + FORECAST_WEEKS * WEEK),
      changePercent: prediction.changePercent,
      confidence: prediction.confidence,
      verdict: prediction.verdict,
      weeks: prediction.weeks,
      hasEnoughData: points.length >= MIN_POINTS
    }
  })
}

function pickProductFields(body) {
  const fields = {}
  Object.keys(productRules).forEach((key) => {
    if (body[key] === undefined) return
    fields[key] = typeof body[key] === 'string' ? body[key].trim() : body[key]
  })
  if (fields.category) fields.category = fields.category.toLowerCase()
  if (fields.tags) fields.tags = fields.tags.map((tag) => tag.trim().toLowerCase())
  ;['price', 'discountPercentage', 'stock', 'minimumOrderQuantity'].forEach((key) => {
    if (fields[key] !== undefined) fields[key] = Number(fields[key])
  })
  return fields
}

/** POST /api/products (admin) */
export async function createProduct(req, res) {
  const fields = pickProductFields(req.body)
  if (!fields.images?.length) fields.images = [fields.thumbnail]

  const product = await Product.create({
    ...fields,
    id: await nextSequence('product'),
    priceHistory: [{ price: fields.price, at: new Date() }]
  })
  res.status(201).json({ success: true, product })
}

/**
 * PUT /api/products/:id (admin). A new price is also appended to the price history,
 * which is what moves the forecast on the product page.
 */
export async function updateProduct(req, res) {
  const existing = await findProductOr404(req.productId)
  const fields = pickProductFields(req.body)

  const update = { $set: fields }
  if (fields.price !== undefined && fields.price !== existing.price) {
    Object.assign(update, pushPricePoint(fields.price))
  }

  const product = await Product.findOneAndUpdate({ id: req.productId }, update, {
    returnDocument: 'after',
    runValidators: true
  })
  res.json({ success: true, product })
}

/** DELETE /api/products/:id (admin). Orders keep their own copy, so history is unaffected. */
export async function deleteProduct(req, res) {
  await findProductOr404(req.productId)

  await Promise.all([
    Product.deleteOne({ id: req.productId }),
    Review.deleteMany({ product: req.productId }),
    User.updateMany(
      {},
      {
        $pull: {
          cart: { id: req.productId },
          wishlist: req.productId,
          recentlyViewed: req.productId
        }
      }
    )
  ])
  res.json({ success: true, message: 'Product deleted' })
}
