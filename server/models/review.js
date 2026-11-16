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

/** Recounts a product's rating from its reviews after one is added or removed. */
reviewSchema.statics.summarize = async function summarize(productId) {
  const [stats] = await this.aggregate([
    { $match: { product: productId } },
    { $group: { _id: null, average: { $avg: '$rating' }, count: { $sum: 1 } } }
  ])
  return stats
    ? { rating: Math.round(stats.average * 100) / 100, reviewCount: stats.count }
    : { rating: 0, reviewCount: 0 }
}

const Review = mongoose.model('Review', reviewSchema)
export default Review
