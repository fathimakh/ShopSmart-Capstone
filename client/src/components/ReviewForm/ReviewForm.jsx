import { useEffect, useRef, useState } from 'react'
import { FiStar } from 'react-icons/fi'
import FormField from '../FormField/FormField'
import { getFieldErrors } from '../../services/http'
import { COMMENT_MAX, ratingWords, validateReview } from '../../utils/reviews'
import { pluralize } from '../../utils/format'
import './ReviewForm.css'

const STARS = [1, 2, 3, 4, 5]

/**
 * Writes or edits the shopper's review. onSubmit({ rating, comment }) sends it and
 * throws the API error when the server refuses it, so its field messages can be shown
 * here. The heading takes focus when the form opens.
 */
function ReviewForm({ initial, onSubmit, onCancel }) {
  const editing = Boolean(initial)
  const [rating, setRating] = useState(initial ? initial.rating : 0)
  const [hovered, setHovered] = useState(0)
  const [comment, setComment] = useState(initial ? initial.comment : '')
  const [errors, setErrors] = useState({})
  const [formError, setFormError] = useState('')
  const [saving, setSaving] = useState(false)
  const heading = useRef(null)

  useEffect(() => {
    heading.current?.focus()
  }, [])

  const focusField = (name) => {
    const target = name === 'rating' ? document.querySelector('.review-stars input') : document.getElementById('review-comment')
    target?.focus()
  }

  const submit = async (event) => {
    event.preventDefault()
    if (saving) return
    const values = { rating, comment: comment.trim() }
    const found = validateReview(values)
    setErrors(found)
    setFormError('')
    if (Object.keys(found).length) {
      focusField(Object.keys(found)[0])
      return
    }

    setSaving(true)
    try {
      await onSubmit(values)
    } catch (error) {
      const fields = getFieldErrors(error)
      if (Object.keys(fields).length) {
        setErrors(fields)
        focusField(Object.keys(fields)[0])
      } else {
        setFormError(error.message)
      }
      setSaving(false)
    }
  }

  const shown = hovered || rating
  const remaining = COMMENT_MAX - comment.length
  const commentDescribedBy = ['review-comment-hint', errors.comment ? 'review-comment-error' : null]
    .filter(Boolean)
    .join(' ')

  return (
    <form className="review-form" onSubmit={submit} noValidate aria-labelledby="review-form-heading">
      <h3 id="review-form-heading" ref={heading} tabIndex={-1}>
        {editing ? 'Edit your review' : 'Write a review'}
      </h3>

      <fieldset
        className={errors.rating ? 'review-stars has-error' : 'review-stars'}
        aria-describedby={errors.rating ? 'review-rating-error' : undefined}
      >
        <legend>Your rating</legend>
        <div className="review-stars-row" onPointerLeave={() => setHovered(0)}>
          {STARS.map((star) => (
            <label
              key={star}
              className={star <= shown ? 'is-on' : ''}
              onPointerMove={(event) => {
                // Only a real mouse previews; a tap or a layout shift under a resting
                // pointer would otherwise override the choice made.
                if (event.pointerType === 'mouse' && hovered !== star) setHovered(star)
              }}
            >
              <input
                type="radio"
                name="review-rating"
                value={star}
                checked={rating === star}
                onChange={() => {
                  setRating(star)
                  // A choice made with the keyboard wins over where the pointer happens to rest.
                  setHovered(0)
                  setErrors((current) => ({ ...current, rating: undefined }))
                }}
              />
              <FiStar aria-hidden="true" />
              <span className="visually-hidden">
                {pluralize(star, 'star')}, {ratingWords[star]}
              </span>
            </label>
          ))}
          <span className="review-stars-word" aria-hidden="true">
            {shown ? ratingWords[shown] : 'Choose a rating'}
          </span>
        </div>
        {errors.rating ? (
          <p className="form-field-error" id="review-rating-error" role="alert">
            {errors.rating}
          </p>
        ) : null}
      </fieldset>

      <FormField id="review-comment" label="Your review" error={errors.comment} hint={`${remaining} characters left`}>
        <textarea
          id="review-comment"
          rows={4}
          maxLength={COMMENT_MAX}
          value={comment}
          placeholder="What did you like, and what could be better?"
          aria-invalid={Boolean(errors.comment)}
          aria-describedby={commentDescribedBy}
          onChange={(event) => {
            setComment(event.target.value)
            setErrors((current) => ({ ...current, comment: undefined }))
          }}
        />
      </FormField>

      {formError ? (
        <p className="review-form-error" role="alert">
          {formError}
        </p>
      ) : null}

      <div className="review-form-actions">
        {/* aria-disabled rather than disabled, so focus stays on the button while saving. */}
        <button type="submit" className="btn btn-primary" aria-disabled={saving}>
          {saving ? 'Saving' : editing ? 'Save changes' : 'Post review'}
        </button>
        <button
          type="button"
          className="btn btn-ghost"
          onClick={() => {
            if (!saving) onCancel()
          }}
          aria-disabled={saving}
        >
          Cancel
        </button>
      </div>
      <p className="review-form-note">
        Your account name is shown with the review. It is marked as a verified purchase once an
        order with this product has been delivered to you.
      </p>
    </form>
  )
}

export default ReviewForm
