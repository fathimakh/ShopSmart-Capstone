import mongoose from 'mongoose'

const reviewSchema = new mongoose.Schema(
  {
    product: { type: Number, required: true, index: true },
    // Reviews imported with the catalogue have no account behind them, so user is optional.
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    reviewerName: { type: String, required: true, trim: true, maxlength: 60 },
    rating: {
      type: Number,
      required: [true, 'Rating is required'],
      min: [1, 'Rating must be between 1 and 5'],
      max: [5, 'Rating must be between 1 and 5']
    },
    comment: {
      type: String,
      required: [true, 'Comment is required'],
      trim: true,
      minlength: [3, 'Comment must be at least 3 characters'],
      maxlength: [1000, 'Comment must be at most 1000 characters']
    },
    verifiedPurchase: { type: Boolean, default: false }
  },
  {
    timestamps: true,
    toJSON: {
      transform(doc, ret) {
        ret.date = ret.createdAt
        delete ret.__v
        return ret
      }
    }
  }
)

// One review per shopper per product; a second attempt updates the first instead.
reviewSchema.index(
  { product: 1, user: 1 },
  { unique: true, partialFilterExpression: { user: { $type: 'objectId' } } }
)

/**
 * Counts a product's reviews by star, and splits them into the ones imported with the
 * catalogue (no account behind them) and the ones shoppers wrote here, which is what
 * the rating blend in controllers/reviewController.js needs.
 */
reviewSchema.statics.summarize = async function summarize(productId) {
  const groups = await this.aggregate([
    { $match: { product: productId } },
    {
      $group: {
        _id: { written: { $eq: [{ $type: '$user' }, 'objectId'] }, stars: { $round: ['$rating', 0] } },
        count: { $sum: 1 },
        total: { $sum: '$rating' }
      }
    }
  ])

  const summary = {
    imported: { count: 0, total: 0 },
    written: { count: 0, total: 0 },
    breakdown: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }
  }
  groups.forEach(({ _id, count, total }) => {
    const source = _id.written ? summary.written : summary.imported
    source.count += count
    source.total += total
    summary.breakdown[_id.stars] += count
  })
  return summary
}

const Review = mongoose.model('Review', reviewSchema)
export default Review
