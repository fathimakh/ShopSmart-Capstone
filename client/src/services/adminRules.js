/**
 * Rules the admin screens share with the API, kept apart from the components so they can
 * be tested on their own. They mirror server/validators and docs/API.md; the server still
 * checks everything, and its field errors are shown when the two ever disagree.
 */

export const ORDER_STATUSES = ['processing', 'shipped', 'delivered', 'cancelled']

export const ORDER_STATUS_LABELS = {
  processing: 'Processing',
  shipped: 'Shipped',
  delivered: 'Delivered',
  cancelled: 'Cancelled'
}

// The table under PATCH /api/orders/:ref/status: one step forward at a time, or a cancel
// before delivery. Delivered and cancelled orders are final.
const NEXT_STATUSES = {
  processing: ['shipped', 'cancelled'],
  shipped: ['delivered', 'cancelled'],
  delivered: [],
  cancelled: []
}

export const STATUS_ACTIONS = {
  shipped: {
    label: 'Mark as shipped',
    hint: 'The parcel is with the courier.',
    done: 'marked as shipped',
    placeholder: 'For example: sent with BlueDart, AWB 1234'
  },
  delivered: {
    label: 'Mark as delivered',
    hint: 'The shopper has the parcel. This is final.',
    done: 'marked as delivered',
    placeholder: 'For example: left with the security desk'
  },
  cancelled: {
    label: 'Cancel order',
    hint: 'Stops the order and puts every item back in stock. This is final.',
    done: 'cancelled',
    placeholder: 'For example: the shopper asked to cancel by phone'
  }
}

export const STATUS_NOTE_LIMIT = 200

export function nextStatuses(status) {
  return NEXT_STATUSES[status] || []
}

export const paymentLabels = {
  card: 'Card',
  upi: 'UPI',
  cod: 'Cash on delivery'
}

export function describePayment(payment) {
  if (!payment) return 'Not recorded'
  const label = paymentLabels[payment.method] || payment.method
  if (payment.method === 'card' && payment.cardLast4) return `${label} ending ${payment.cardLast4}`
  if (payment.method === 'upi' && payment.upiId) return `${label} (${payment.upiId})`
  return label
}

export function orderItemCount(order) {
  return (order.items || []).reduce((total, item) => total + item.quantity, 0)
}

// Products below this many units are "Low Stock" on the server (models/product.js).
export const LOW_STOCK_LIMIT = 10

const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/
const URL_PATTERN = /^https?:\/\/\S+$/i
const PRICE_PATTERN = /^\d+(\.\d{1,2})?$/
const WHOLE_PATTERN = /^\d+$/

// Text limits from server/validators/productValidators.js.
export const PRODUCT_LIMITS = {
  title: { min: 3, max: 120 },
  description: { min: 10, max: 2000 },
  brand: { max: 60 },
  category: { max: 40 },
  thumbnail: { max: 500 },
  images: { maxItems: 10 },
  tags: { maxItems: 12, itemMax: 30 },
  warrantyInformation: { max: 80 },
  shippingInformation: { max: 80 },
  returnPolicy: { max: 80 }
}

const TEXT_FIELDS = [
  'title',
  'description',
  'brand',
  'category',
  'thumbnail',
  'warrantyInformation',
  'shippingInformation',
  'returnPolicy'
]

// Every input of the product form, all held as text the way inputs give them.
export const emptyProductValues = {
  title: '',
  brand: '',
  category: '',
  description: '',
  price: '',
  discountPercentage: '',
  stock: '',
  minimumOrderQuantity: '',
  thumbnail: '',
  images: '',
  tags: '',
  warrantyInformation: '',
  shippingInformation: '',
  returnPolicy: ''
}

/** Fills the form from a product as GET /api/products/:id returns it. */
export function productToValues(product) {
  return {
    title: product.title || '',
    brand: product.brand || '',
    category: product.category || '',
    description: product.description || '',
    price: product.price === undefined ? '' : String(product.price),
    discountPercentage: product.discountPercentage ? String(product.discountPercentage) : '',
    stock: product.stock === undefined ? '' : String(product.stock),
    minimumOrderQuantity: product.minimumOrderQuantity ? String(product.minimumOrderQuantity) : '',
    thumbnail: product.thumbnail || '',
    images: (product.images || []).join('\n'),
    tags: (product.tags || []).join(', '),
    warrantyInformation: product.warrantyInformation || '',
    shippingInformation: product.shippingInformation || '',
    returnPolicy: product.returnPolicy || ''
  }
}

/** "Home Decoration " becomes "home-decoration", the slug shape the API stores. */
export function toSlug(value) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
}

export function splitTags(value) {
  return value
    .split(',')
    .map((tag) => tag.trim().toLowerCase())
    .filter(Boolean)
}

export function splitUrls(value) {
  return value
    .split(/\s+/)
    .map((url) => url.trim())
    .filter(Boolean)
}

function checkLength(errors, field, value, label) {
  const { min = 0, max } = PRODUCT_LIMITS[field]
  const length = value.trim().length
  if (min && length < min) errors[field] = `${label} must be at least ${min} characters`
  else if (max && length > max) errors[field] = `${label} must be at most ${max} characters`
}

function checkNumber(errors, field, value, { label, min, max, whole = false, required = false }) {
  const text = value.trim()
  if (!text) {
    if (required) errors[field] = `${label} is required`
    return
  }
  const pattern = whole ? WHOLE_PATTERN : PRICE_PATTERN
  if (!pattern.test(text)) {
    errors[field] = whole
      ? `${label} must be a whole number`
      : `${label} must be a number with at most two decimal places`
    return
  }
  const number = Number(text)
  if (number < min) errors[field] = `${label} must be at least ${min}`
  else if (number > max) errors[field] = `${label} must be at most ${max}`
}

/**
 * Checks the product form the way POST /api/products would, and returns messages keyed by
 * input name. An empty object means the form can be sent.
 */
export function validateProductValues(values) {
  const errors = {}

  if (!values.title.trim()) errors.title = 'Title is required'
  else checkLength(errors, 'title', values.title, 'Title')

  if (!values.description.trim()) errors.description = 'Description is required'
  else checkLength(errors, 'description', values.description, 'Description')

  checkLength(errors, 'brand', values.brand, 'Brand')

  const category = values.category.trim()
  if (!category) errors.category = 'Category is required'
  else if (category.length > PRODUCT_LIMITS.category.max) {
    errors.category = `Category must be at most ${PRODUCT_LIMITS.category.max} characters`
  } else if (!SLUG_PATTERN.test(category)) {
    errors.category = 'Use lowercase letters, numbers and dashes, such as home-decoration'
  }

  checkNumber(errors, 'price', values.price, { label: 'Price', min: 0.01, max: 100000, required: true })
  checkNumber(errors, 'discountPercentage', values.discountPercentage, {
    label: 'Discount',
    min: 0,
    max: 90
  })
  checkNumber(errors, 'stock', values.stock, {
    label: 'Stock',
    min: 0,
    max: 100000,
    whole: true,
    required: true
  })
  checkNumber(errors, 'minimumOrderQuantity', values.minimumOrderQuantity, {
    label: 'Minimum order',
    min: 1,
    max: 1000,
    whole: true
  })

  const thumbnail = values.thumbnail.trim()
  if (!thumbnail) errors.thumbnail = 'Image URL is required'
  else if (!URL_PATTERN.test(thumbnail)) errors.thumbnail = 'Image URL must start with http:// or https://'
  else checkLength(errors, 'thumbnail', thumbnail, 'Image URL')

  const images = splitUrls(values.images)
  const badImage = images.findIndex((url) => !URL_PATTERN.test(url) || url.length > 500)
  if (images.length > PRODUCT_LIMITS.images.maxItems) {
    errors.images = `Use at most ${PRODUCT_LIMITS.images.maxItems} gallery images`
  } else if (badImage !== -1) {
    errors.images = `Image ${badImage + 1} must be a web address starting with http:// or https://`
  }

  const tags = splitTags(values.tags)
  const longTag = tags.find((tag) => tag.length > PRODUCT_LIMITS.tags.itemMax)
  if (tags.length > PRODUCT_LIMITS.tags.maxItems) {
    errors.tags = `Use at most ${PRODUCT_LIMITS.tags.maxItems} tags`
  } else if (longTag) {
    errors.tags = `Each tag must be at most ${PRODUCT_LIMITS.tags.itemMax} characters ("${longTag.slice(0, 12)}..." is longer)`
  }

  checkLength(errors, 'warrantyInformation', values.warrantyInformation, 'Warranty')
  checkLength(errors, 'shippingInformation', values.shippingInformation, 'Shipping')
  checkLength(errors, 'returnPolicy', values.returnPolicy, 'Return policy')

  return errors
}

/**
 * The request body for POST /api/products. Optional fields left empty are not sent, so
 * the server fills in its own defaults (brand "Generic", minimum order 1 and so on).
 */
export function productPayload(values) {
  const body = {}
  TEXT_FIELDS.forEach((field) => {
    const text = values[field].trim()
    if (text) body[field] = text
  })
  body.category = toSlug(values.category)
  body.price = Number(values.price)
  body.stock = Number(values.stock)
  if (values.discountPercentage.trim()) body.discountPercentage = Number(values.discountPercentage)
  if (values.minimumOrderQuantity.trim()) {
    body.minimumOrderQuantity = Number(values.minimumOrderQuantity)
  }

  // Without a gallery the server shows the thumbnail on its own.
  const gallery = splitUrls(values.images)
  if (gallery.length) body.images = gallery
  const tags = splitTags(values.tags)
  if (tags.length) body.tags = tags
  return body
}

function sameList(first = [], second = []) {
  return first.length === second.length && first.every((item, index) => item === second[index])
}

/**
 * Only what changed, for PUT /api/products/:id. Sending the whole form would also add a
 * price history point when nothing but the stock was edited, if a rounding difference
 * crept into the price. An emptied optional field gets the value a new product would
 * start with rather than a blank, so the shop never shows an empty brand.
 */
export function changedProductFields(values, product) {
  const next = productPayload(values)
  const changes = {}

  TEXT_FIELDS.forEach((field) => {
    const value = next[field] ?? ''
    if (value !== (product[field] ?? '')) changes[field] = value
  })
  if (changes.brand === '') changes.brand = 'Generic'

  if (next.price !== product.price) changes.price = next.price
  if (next.stock !== product.stock) changes.stock = next.stock
  const discount = next.discountPercentage ?? 0
  if (discount !== (product.discountPercentage || 0)) changes.discountPercentage = discount
  const minimum = next.minimumOrderQuantity ?? 1
  if (minimum !== (product.minimumOrderQuantity || 1)) changes.minimumOrderQuantity = minimum
  // An emptied gallery falls back to the thumbnail, as it does for a new product.
  const images = next.images || [next.thumbnail]
  if (!sameList(images, product.images)) changes.images = images
  const tags = next.tags || []
  if (!sameList(tags, product.tags)) changes.tags = tags

  return changes
}
