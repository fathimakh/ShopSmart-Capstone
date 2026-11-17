import { useEffect, useId, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { FiAlertCircle, FiInfo, FiTrendingUp } from 'react-icons/fi'
import FormField from '../../FormField/FormField'
import { PRODUCT_LIMITS, toSlug, validateProductValues } from '../../../services/adminRules'
import { formatPrice } from '../../../utils/format'
import './ProductForm.css'

// The order the inputs appear in, so focus goes to the first problem on the page.
const FIELD_ORDER = [
  'title',
  'brand',
  'category',
  'description',
  'price',
  'discountPercentage',
  'stock',
  'minimumOrderQuantity',
  'thumbnail',
  'images',
  'tags',
  'warrantyInformation',
  'shippingInformation',
  'returnPolicy'
]

const URL_START = /^https?:\/\/\S+$/i

function describedBy(id, error, hint) {
  return [error ? `${id}-error` : null, hint ? `${id}-hint` : null].filter(Boolean).join(' ') || undefined
}

/**
 * The add and edit form for a product. It checks every field the way the API does before
 * sending, so most mistakes are caught without a round trip, and it shows the server's
 * own field errors on the matching inputs when the API still says no.
 *
 * onSubmit(values) must resolve to { ok, error, values, notice }: error is the ApiError
 * of a failed save, values replaces what the form shows after a save (the server tidies
 * tags and the category), and notice is a message such as "Nothing to save".
 */
function ProductForm({
  initialValues,
  mode = 'create',
  originalPrice,
  categories = [],
  submitting = false,
  onSubmit
}) {
  const formId = useId()
  const [values, setValues] = useState(initialValues)
  const [errors, setErrors] = useState({})
  const [formError, setFormError] = useState('')
  const [notice, setNotice] = useState('')
  const [previewFailed, setPreviewFailed] = useState(false)
  const formErrorRef = useRef(null)
  const focusMessage = useRef(false)

  const fieldId = (name) => `${formId}-${name}`

  const focusFirst = (fieldErrors) => {
    const first = FIELD_ORDER.find((name) => fieldErrors[name])
    const input = first ? document.getElementById(fieldId(first)) : null
    if (input) input.focus()
    return Boolean(input)
  }

  // The message only exists after the next render, so it is focused from an effect.
  useEffect(() => {
    if (formError && focusMessage.current) {
      focusMessage.current = false
      if (formErrorRef.current) formErrorRef.current.focus()
    }
  }, [formError])

  const update = (name) => (event) => {
    const { value } = event.target
    setValues((current) => ({ ...current, [name]: value }))
    setNotice('')
    if (name === 'thumbnail') setPreviewFailed(false)
    // A corrected field stops showing its old message straight away.
    if (errors[name]) {
      setErrors((current) => {
        const next = { ...current }
        delete next[name]
        return next
      })
    }
  }

  const submit = async (event) => {
    event.preventDefault()
    if (submitting) return
    setFormError('')
    setNotice('')

    const clientErrors = validateProductValues(values)
    setErrors(clientErrors)
    if (Object.keys(clientErrors).length) {
      focusFirst(clientErrors)
      return
    }

    const result = await onSubmit(values)
    if (!result) return
    if (result.ok) {
      setErrors({})
      if (result.values) setValues(result.values)
      if (result.notice) setNotice(result.notice)
      return
    }
    if (result.notice) {
      setNotice(result.notice)
      return
    }

    const serverErrors = (result.error && result.error.fieldErrors) || {}
    setErrors(serverErrors)
    const message = result.error ? result.error.message : 'The product could not be saved.'
    // The API's "Please check the highlighted fields" has no full stop of its own.
    setFormError(/[.!?]$/.test(message) ? message : `${message}.`)
    // With highlighted fields the first one takes focus; otherwise the message does.
    if (!focusFirst(serverErrors)) focusMessage.current = true
  }

  const priceNumber = Number(values.price)
  const priceChanged =
    mode === 'edit' &&
    values.price.trim() !== '' &&
    Number.isFinite(priceNumber) &&
    priceNumber > 0 &&
    priceNumber !== originalPrice
  const showPreview = URL_START.test(values.thumbnail.trim()) && !previewFailed
  const errorCount = Object.keys(errors).length

  const textArea = (name, label, { rows = 4, hint } = {}) => {
    const id = fieldId(name)
    return (
      <FormField id={id} label={label} error={errors[name]} hint={hint}>
        <textarea
          id={id}
          rows={rows}
          value={values[name]}
          onChange={update(name)}
          aria-invalid={Boolean(errors[name])}
          aria-describedby={describedBy(id, errors[name], hint)}
        />
      </FormField>
    )
  }

  const textInput = (name, label, props = {}) => (
    <FormField
      id={fieldId(name)}
      label={label}
      value={values[name]}
      onChange={update(name)}
      error={errors[name]}
      {...props}
    />
  )

  return (
    <form className="product-form" onSubmit={submit} noValidate>
      <fieldset className="product-form-section card">
        <legend>About the product</legend>
        <div className="product-form-grid">
          <div className="product-form-wide">
            {textInput('title', 'Title', { hint: '3 to 120 characters, as shoppers see it.' })}
          </div>
          {textInput('brand', 'Brand (optional)', { hint: 'Left empty, the shop shows "Generic".' })}
          <FormField
            id={fieldId('category')}
            label="Category"
            error={errors.category}
            hint="A lowercase slug such as home-decoration. A new one starts a new category."
          >
            <input
              id={fieldId('category')}
              list={`${formId}-categories`}
              autoComplete="off"
              value={values.category}
              onChange={update('category')}
              onBlur={() =>
                setValues((current) => ({ ...current, category: toSlug(current.category) }))
              }
              aria-invalid={Boolean(errors.category)}
              aria-describedby={describedBy(fieldId('category'), errors.category, true)}
            />
          </FormField>
          <datalist id={`${formId}-categories`}>
            {categories.map((slug) => (
              <option key={slug} value={slug} />
            ))}
          </datalist>
          <div className="product-form-wide">
            {textArea('description', 'Description', {
              rows: 5,
              hint: `${PRODUCT_LIMITS.description.min} to ${PRODUCT_LIMITS.description.max} characters (${values.description.trim().length} so far).`
            })}
          </div>
        </div>
      </fieldset>

      <fieldset className="product-form-section card">
        <legend>Price and stock</legend>
        <div className="product-form-grid">
          {textInput('price', 'Price in US dollars', {
            inputMode: 'decimal',
            hint: priceChanged
              ? `Was ${formatPrice(originalPrice)}. Saving adds the new price to the price history.`
              : 'What the shopper pays, after any discount. From 0.01 to 100000.'
          })}
          {textInput('discountPercentage', 'Discount percent (optional)', {
            inputMode: 'decimal',
            hint: 'From 0 to 90. Shown as the saving against a struck-through price.'
          })}
          {textInput('stock', 'Units in stock', {
            inputMode: 'numeric',
            hint: 'Below 10 shows as low stock; 0 is sold out.'
          })}
          {textInput('minimumOrderQuantity', 'Minimum order (optional)', {
            inputMode: 'numeric',
            hint: 'Kept with the product only: the shop does not show it or apply it at checkout. Defaults to 1.'
          })}
        </div>
        {mode === 'edit' ? (
          <p className={priceChanged ? 'product-form-note is-active' : 'product-form-note'}>
            {priceChanged ? <FiTrendingUp aria-hidden="true" /> : <FiInfo aria-hidden="true" />}
            {priceChanged
              ? `The price changes from ${formatPrice(originalPrice)} to ${formatPrice(priceNumber)}. Saving adds a point to the price history, which moves the price forecast on the product page.`
              : 'Changing the price adds a point to the price history, which moves the price forecast on the product page.'}
          </p>
        ) : null}
      </fieldset>

      <fieldset className="product-form-section card">
        <legend>Images</legend>
        <div className="product-form-images">
          <div className="product-form-image-fields">
            {textInput('thumbnail', 'Main image URL', {
              type: 'url',
              inputMode: 'url',
              hint: 'Starts with https://. Used on the product card.'
            })}
            {textArea('images', 'Gallery image URLs (optional)', {
              rows: 3,
              hint: `One per line, up to ${PRODUCT_LIMITS.images.maxItems}. Left empty, the gallery shows the main image.`
            })}
          </div>
          <div className="product-form-preview" aria-live="polite">
            {showPreview ? (
              <img
                src={values.thumbnail.trim()}
                alt="Preview of the main image"
                width="160"
                height="160"
                onError={() => setPreviewFailed(true)}
              />
            ) : (
              <span>
                {previewFailed
                  ? 'This image could not be loaded. Check the address.'
                  : 'A preview appears here once the main image URL is filled in.'}
              </span>
            )}
          </div>
        </div>
      </fieldset>

      <fieldset className="product-form-section card">
        <legend>Details (optional)</legend>
        <div className="product-form-grid">
          <div className="product-form-wide">
            {textInput('tags', 'Tags', {
              hint: `Separated by commas, up to ${PRODUCT_LIMITS.tags.maxItems}. They help search find the product.`
            })}
          </div>
          {textInput('warrantyInformation', 'Warranty', { hint: 'For example: 1 year warranty' })}
          {textInput('shippingInformation', 'Shipping', { hint: 'For example: Ships in 3-5 business days' })}
          {textInput('returnPolicy', 'Return policy', { hint: 'For example: 30 days return policy' })}
        </div>
      </fieldset>

      <div className="product-form-actions">
        <button type="submit" className="btn btn-primary" aria-disabled={submitting}>
          {submitting ? 'Saving' : mode === 'edit' ? 'Save changes' : 'Add product'}
        </button>
        <Link className="btn btn-outline" to="/admin/products">
          {mode === 'edit' ? 'Back to products' : 'Cancel'}
        </Link>
      </div>

      <div className="product-form-messages">
        {formError ? (
          <p className="product-form-error" role="alert" tabIndex={-1} ref={formErrorRef}>
            <FiAlertCircle aria-hidden="true" />
            {errorCount
              ? `${formError} ${errorCount === 1 ? 'One field needs' : `${errorCount} fields need`} a change.`
              : formError}
          </p>
        ) : null}
        <p className="product-form-notice" role="status">
          {notice}
        </p>
      </div>
    </form>
  )
}

export default ProductForm
