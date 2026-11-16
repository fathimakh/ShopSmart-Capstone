import Order from '../models/order.js'
import Product from '../models/product.js'
import Review from '../models/review.js'
import ApiError from '../utils/ApiError.js'
import { buildPagination, createQueryReader } from '../utils/queryReader.js'
import { findProductOr404 } from './productController.js'

function roundRating(value) {
  return Math.round(value * 100) / 100
}

/**
 * Works out a product's rating again after a review is added, changed or removed.
 *
 * The catalogue came with a rating of its own that does not match the three reviews
 * imported with it (it was based on many more). Averaging only the stored reviews would
 * make a rating jump by a star or more on the first new review, so the catalogue rating
 * stands in for the imported reviews instead, weighted by how many of them there are,
 * and every review written here moves the rating from there.
 *
 * Writing a review also clears the cached AI summary, which no longer matches.
 */
async function refreshRating(productId) {
  // The first time, the product's current rating is kept as its catalogue rating. One
  // pipeline update copies it, so two first reviews at once cannot both overwrite it.
  await Product.updateOne(
    { id: productId, catalogueRating: null },
    [{ $set: { catalogueRating: '$rating' } }],
    { updatePipeline: true }
  )

  const [product, summary] = await Promise.all([
    Product.findOne({ id: productId }).select('+catalogueRating'),
    Review.summarize(productId)
  ])
  if (!product) return null

  const { imported, written, breakdown } = summary
  const reviewCount = imported.count + written.count
  const rating = reviewCount
    ? roundRating((product.catalogueRating * imported.count + written.total) / reviewCount)
    : product.catalogueRating

  await Product.updateOne({ id: productId }, { $set: { rating, reviewCount, reviewSummary: null } })
  return { rating, reviewCount, breakdown }
}

/**
 * Inserts the shopper's review for a product, or updates the one they already wrote.
 * Two saves at the same moment can both try to insert; the unique index stops the
 * second, which then updates the first instead of failing with a duplicate error.
 */
async function upsertReview(filter, fields, retry = true) {
  try {
    return await Review.findOneAndUpdate(
      filter,
      { $set: fields },
      { upsert: true, returnDocument: 'after', runValidators: true, includeResultMetadata: true }
    )
  } catch (error) {
    if (error?.code === 11000 && retry) return upsertReview(filter, fields, false)
    throw error
  }
}

/**
 * GET /api/products/:id/reviews - newest first, with the star breakdown and, for a
 * signed in shopper, the review they wrote (so the form can offer to edit it).
 */
export async function listReviews(req, res) {
  const read = createQueryReader(req.query)
  const { page, limit, skip } = read.pagination({ defaultLimit: 10, maxLimit: 50 })
  read.assertValid()

  const product = await findProductOr404(req.productId)
  const filter = { product: req.productId }
  const [reviews, total, summary, myReview] = await Promise.all([
    Review.find(filter).sort({ createdAt: -1, _id: -1 }).skip(skip).limit(limit),
    Review.countDocuments(filter),
    Review.summarize(req.productId),
    req.user ? Review.findOne({ product: req.productId, user: req.user._id }) : null
  ])

  res.json({
    success: true,
    reviews,
    pagination: buildPagination(page, limit, total),
    stats: { rating: product.rating, reviewCount: product.reviewCount, breakdown: summary.breakdown },
    myReview
  })
}

/**
 * POST /api/products/:id/reviews - one review per shopper per product. Sending it again
 * edits the earlier review rather than adding a second one. The review is marked as a
 * verified purchase when the shopper has a delivered order with this product in it.
 */
export async function saveReview(req, res) {
  await findProductOr404(req.productId)

  const purchased = await Order.exists({ user: req.user._id, status: 'delivered', 'items.id': req.productId })
  const result = await upsertReview(
    { product: req.productId, user: req.user._id },
    {
      reviewerName: req.user.name,
      rating: Number(req.body.rating),
      comment: req.body.comment.trim(),
      verifiedPurchase: Boolean(purchased)
    }
  )

  const stats = await refreshRating(req.productId)
  const created = !result.lastErrorObject?.updatedExisting
  res.status(created ? 201 : 200).json({ success: true, review: result.value, stats })
}

/** DELETE /api/products/:id/reviews/:reviewId - the review's author or an admin. */
export async function deleteReview(req, res) {
  await findProductOr404(req.productId)

  const review = await Review.findOne({ _id: req.params.reviewId, product: req.productId })
  if (!review) throw ApiError.notFound('We could not find that review.', 'REVIEW_NOT_FOUND')

  const isAuthor = Boolean(review.user) && req.user._id.equals(review.user)
  if (!isAuthor && req.user.role !== 'admin') {
    throw ApiError.forbidden('You can only delete your own reviews.')
  }

  await review.deleteOne()
  const stats = await refreshRating(req.productId)
  res.json({ success: true, message: 'Review deleted', stats })
}
