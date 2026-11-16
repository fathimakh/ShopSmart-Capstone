import mongoose from 'mongoose'

export const LOW_STOCK_LIMIT = 10
// The price chart shows weekly points, so history older than this is trimmed away.
export const PRICE_HISTORY_LIMIT = 26

export function availabilityStatus(stock) {
  if (stock <= 0) return 'Out of Stock'
  if (stock < LOW_STOCK_LIMIT) return 'Low Stock'
  return 'In Stock'
}

const pricePointSchema = new mongoose.Schema(
  {
    price: { type: Number, required: true, min: 0 },
    at: { type: Date, required: true }
  },
  { _id: false }
)

// Gemini's summary of the reviews, kept until a new review makes it stale.
const reviewSummarySchema = new mongoose.Schema(
  {
    text: { type: String, default: '' },
    pros: { type: [String], default: [] },
    cons: { type: [String], default: [] },
    basedOn: { type: Number, default: 0 },
    generatedAt: { type: Date, default: null }
  },
  { _id: false }
)

const productSchema = new mongoose.Schema(
  {
    id: { type: Number, required: true, unique: true, min: 1 },
    title: { type: String, required: [true, 'Title is required'], trim: true, maxlength: 120 },
    description: { type: String, required: [true, 'Description is required'], trim: true, maxlength: 2000 },
    brand: { type: String, trim: true, maxlength: 60, default: 'Generic' },
    category: { type: String, required: [true, 'Category is required'], trim: true, lowercase: true, index: true },
    price: { type: Number, required: [true, 'Price is required'], min: [0.01, 'Price must be above zero'] },
    discountPercentage: { type: Number, min: 0, max: 90, default: 0 },
    rating: { type: Number, min: 0, max: 5, default: 0 },
    // The rating the product came with from the catalogue. Reviews written here are
    // blended with it (see controllers/reviewController.js), so it is kept apart from
    // the live rating. Null until the first review is written for an older product.
    catalogueRating: { type: Number, min: 0, max: 5, default: null, select: false },
    reviewCount: { type: Number, min: 0, default: 0 },
    stock: { type: Number, required: true, min: [0, 'Stock cannot be negative'], default: 0 },
    tags: { type: [String], default: [] },
    sku: { type: String, trim: true, default: '' },
    weight: { type: Number, min: 0, default: 0 },
    dimensions: {
      width: { type: Number, min: 0, default: 0 },
      height: { type: Number, min: 0, default: 0 },
      depth: { type: Number, min: 0, default: 0 }
    },
    warrantyInformation: { type: String, trim: true, default: 'No warranty' },
    shippingInformation: { type: String, trim: true, default: 'Ships in 3-5 business days' },
    returnPolicy: { type: String, trim: true, default: '30 days return policy' },
    minimumOrderQuantity: { type: Number, min: 1, default: 1 },
    // Units sold, moved in the same atomic update that reserves stock at checkout and
    // taken back when an order is cancelled, so the bestseller list needs no order scan.
    soldCount: { type: Number, min: 0, default: 0 },
    thumbnail: { type: String, required: [true, 'An image is required'], trim: true },
    images: { type: [String], default: [] },
    priceHistory: { type: [pricePointSchema], default: [], select: false },
    reviewSummary: { type: reviewSummarySchema, default: null, select: false }
  },
  {
    timestamps: true,
    toJSON: {
      // The same shape the DummyJSON catalogue used, so the storefront reads it unchanged.
      transform(doc, ret) {
        ret.availabilityStatus = availabilityStatus(ret.stock)
        ret.meta = { createdAt: ret.createdAt, updatedAt: ret.updatedAt }
        // Price history and the AI summary have their own endpoints.
        delete ret.priceHistory
        delete ret.reviewSummary
        delete ret.catalogueRating
        delete ret._id
        delete ret.__v
        delete ret.createdAt
        delete ret.updatedAt
        return ret
      }
    }
  }
)

productSchema.index({ title: 'text', description: 'text', brand: 'text', tags: 'text' })
productSchema.index({ price: 1 })
productSchema.index({ createdAt: -1 })

/**
 * Update fragment that appends a price to the history and keeps only the latest points.
 * It is applied with updateOne rather than a save hook, because the history is not
 * selected by default and saving a document loaded without it would wipe it out.
 */
export function pushPricePoint(price, at = new Date()) {
  return {
    $push: { priceHistory: { $each: [{ price, at }], $slice: -PRICE_HISTORY_LIMIT } }
  }
}

const Product = mongoose.model('Product', productSchema)
export default Product
