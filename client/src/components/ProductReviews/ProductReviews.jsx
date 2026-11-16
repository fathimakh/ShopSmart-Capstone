import { useEffect, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { FiCheckCircle, FiEdit2, FiMessageSquare, FiTrash2 } from 'react-icons/fi'
import { useAuth } from '../../context/AuthContext'
import useProductReviews from '../../hooks/useProductReviews'
import StarRating from '../StarRating/StarRating'
import RetryNotice from '../RetryNotice/RetryNotice'
import ReviewForm from '../ReviewForm/ReviewForm'
import ReviewSummary from '../ReviewSummary/ReviewSummary'
import { formatDate, pluralize } from '../../utils/format'
import { breakdownRows, isOwnReview } from '../../utils/reviews'
import './ProductReviews.css'

function VerifiedBadge() {
  return (
    <span className="product-review-verified">
      <FiCheckCircle aria-hidden="true" />
      Verified purchase
    </span>
  )
}

/**
 * The reviews section of a product page: the rating and star breakdown, the AI summary,
 * the shopper's own review (write, edit, delete) and the reviews of everyone else.
 */
function ProductReviews({ product }) {
  const { user } = useAuth()
  const location = useLocation()
  const reviews = useProductReviews(product.id)
  const { status, myReview } = reviews

  // 'view' shows the shopper's review (or the button to write one), 'form' the form and
  // 'confirm-delete' the question before deleting.
  const [mode, setMode] = useState('view')
  const [message, setMessage] = useState('')
  const [deleteError, setDeleteError] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [focusTarget, setFocusTarget] = useState(null)
  const section = useRef(null)

  // Another product, or another account, starts from a clean slate.
  const userId = user ? user._id : null
  useEffect(() => {
    setMode('view')
    setMessage('')
    setDeleteError('')
  }, [product.id, userId])

  useEffect(() => {
    if (!focusTarget || !section.current) return
    section.current.querySelector(`[data-focus="${focusTarget}"]`)?.focus()
    setFocusTarget(null)
  }, [focusTarget])

  const openForm = () => {
    setMessage('')
    setMode('form')
  }

  const closeForm = () => {
    setMode('view')
    setFocusTarget(myReview ? 'edit' : 'write')
  }

  const submitReview = async (values) => {
    const isEdit = Boolean(myReview)
    await reviews.save(values)
    setMode('view')
    setMessage(isEdit ? 'Your review is updated.' : 'Thanks, your review is posted.')
    setFocusTarget('mine')
  }

  const askToDelete = () => {
    setMessage('')
    setDeleteError('')
    setMode('confirm-delete')
    setFocusTarget('confirm')
  }

  const keepReview = () => {
    setMode('view')
    setDeleteError('')
    setFocusTarget('delete')
  }

  const confirmDelete = async () => {
    setDeleting(true)
    setDeleteError('')
    try {
      await reviews.remove(myReview._id)
      setMode('view')
      setMessage('Your review is deleted.')
      setFocusTarget('write')
    } catch (error) {
      if (error.code === 'REVIEW_NOT_FOUND') {
        // Already gone (deleted in another tab, or by the store): show the list as it is.
        setMode('view')
        setMessage('That review was already deleted.')
        reviews.retry()
      } else {
        setDeleteError(error.message)
      }
    } finally {
      setDeleting(false)
    }
  }

  const rows = breakdownRows(reviews.stats)
  const rating = reviews.stats ? reviews.stats.rating : product.rating
  const reviewCount = reviews.stats ? reviews.stats.reviewCount : product.reviewCount

  let mine = null
  if (status === 'ready') {
    if (!user) {
      mine = (
        <p className="product-reviews-cta">
          <FiMessageSquare aria-hidden="true" />
          <span>
            Tried this product?{' '}
            <Link to="/login" state={{ from: location }}>
              Sign in to write a review
            </Link>
          </span>
        </p>
      )
    } else if (mode === 'form') {
      mine = <ReviewForm initial={myReview} onSubmit={submitReview} onCancel={closeForm} />
    } else if (myReview) {
      mine = (
        <div className="product-review-mine">
          <h3 data-focus="mine" tabIndex={-1}>
            Your review
          </h3>
          <StarRating value={myReview.rating} showValue={false} />
          <p className="product-review-comment">{myReview.comment}</p>
          {myReview.verifiedPurchase ? <VerifiedBadge /> : null}

          {mode === 'confirm-delete' ? (
            <div className="product-review-confirm" role="group" aria-labelledby="review-delete-question">
              <p id="review-delete-question" data-focus="confirm" tabIndex={-1}>
                Delete your review? This cannot be undone.
              </p>
              {deleteError ? (
                <p className="product-review-error" role="alert">
                  {deleteError}
                </p>
              ) : null}
              <div className="product-review-actions">
                <button type="button" className="btn btn-primary product-review-delete" onClick={confirmDelete} disabled={deleting}>
                  {deleting ? 'Deleting' : 'Yes, delete it'}
                </button>
                <button type="button" className="btn btn-outline" onClick={keepReview} disabled={deleting}>
                  Keep it
                </button>
              </div>
            </div>
          ) : (
            <div className="product-review-actions">
              <button type="button" className="btn btn-outline" data-focus="edit" onClick={openForm}>
                <FiEdit2 aria-hidden="true" />
                Edit<span className="visually-hidden"> your review</span>
              </button>
              <button type="button" className="btn btn-ghost" data-focus="delete" onClick={askToDelete}>
                <FiTrash2 aria-hidden="true" />
                Delete<span className="visually-hidden"> your review</span>
              </button>
            </div>
          )}
        </div>
      )
    } else {
      mine = (
        <div className="product-reviews-cta">
          <FiMessageSquare aria-hidden="true" />
          <span>Tried this product? Tell other shoppers what you think.</span>
          <button type="button" className="btn btn-primary" data-focus="write" onClick={openForm}>
            Write a review
          </button>
        </div>
      )
    }
  }

  return (
    <section className="product-section product-reviews-section" aria-labelledby="reviews-heading" id="reviews" ref={section}>
      <h2 id="reviews-heading">Customer reviews</h2>

      {status === 'loading' ? (
        <div className="product-reviews-loading" role="status">
          <div className="skeleton product-reviews-loading-side" />
          <div className="skeleton product-reviews-loading-main" />
          <span className="visually-hidden">Loading the reviews</span>
        </div>
      ) : null}

      {status === 'error' ? (
        <RetryNotice
          title="We could not load the reviews."
          message={reviews.error ? reviews.error.message : ''}
          onRetry={reviews.retry}
        />
      ) : null}

      {status === 'ready' ? (
        <div className="product-reviews-layout">
          <div className="product-reviews-side">
            <div className="product-reviews-overview card">
              <p className="product-reviews-average">
                <strong>{rating.toFixed(1)}</strong>
                <span>out of 5</span>
              </p>
              <StarRating value={rating} showValue={false} size="lg" />
              <p className="product-reviews-count">{pluralize(reviewCount, 'review')}</p>

              <ul className="product-reviews-breakdown" aria-label="Reviews by star rating">
                {rows.map((row) => (
                  <li key={row.star}>
                    <span aria-hidden="true">{row.star}</span>
                    <span className="product-reviews-bar" aria-hidden="true">
                      <span style={{ width: `${row.percent}%` }} />
                    </span>
                    <span aria-hidden="true">{row.count}</span>
                    <span className="visually-hidden">
                      {pluralize(row.star, 'star')}: {pluralize(row.count, 'review')}
                    </span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="product-reviews-mine card">
              {mine}
              <p className="product-reviews-message" role="status">
                {message}
              </p>
            </div>
          </div>

          <div className="product-reviews-main">
            {reviewCount ? <ReviewSummary productId={product.id} revision={reviews.revision} /> : null}

            {reviews.reviews.length ? (
              <ul className="product-reviews-list">
                {reviews.reviews.map((review) => (
                  <li key={review._id} className="product-review card">
                    <div className="product-review-head">
                      <div>
                        <p className="product-review-name">
                          {review.reviewerName}
                          {isOwnReview(review, user) ? <span className="badge badge-primary">You</span> : null}
                        </p>
                        <p className="product-review-date">{formatDate(review.createdAt)}</p>
                      </div>
                      <StarRating value={review.rating} showValue={false} size="sm" />
                    </div>
                    <p className="product-review-comment">{review.comment}</p>
                    {review.verifiedPurchase ? <VerifiedBadge /> : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="product-reviews-empty">
                No reviews yet. {user ? 'Yours could be the first.' : 'Sign in and be the first to write one.'}
              </p>
            )}

            {reviews.moreError ? (
              <RetryNotice
                title="We could not load more reviews."
                message={reviews.moreError.message}
                onRetry={reviews.loadMore}
                busy={reviews.loadingMore}
              />
            ) : null}

            {reviews.hasMore && !reviews.moreError ? (
              <button
                type="button"
                className="btn btn-outline product-reviews-more"
                onClick={reviews.loadMore}
                disabled={reviews.loadingMore}
              >
                {reviews.loadingMore ? 'Loading reviews' : 'Show more reviews'}
              </button>
            ) : null}

            {reviews.reviews.length ? (
              <p className="product-reviews-shown" role="status">
                Showing {reviews.reviews.length} of {pluralize(reviews.total, 'review')}
              </p>
            ) : null}
          </div>
        </div>
      ) : null}
    </section>
  )
}

export default ProductReviews
