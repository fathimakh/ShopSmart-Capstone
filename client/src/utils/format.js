const priceFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 2
})

const dateFormatter = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  year: 'numeric'
})

const dateTimeFormatter = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit'
})

const shortDateFormatter = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' })

export function formatPrice(value) {
  return priceFormatter.format(value)
}

export function formatDate(value) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '' : dateFormatter.format(date)
}

/** A date with the time of day, for steps in an order's history. */
export function formatDateTime(value) {
  if (value === null || value === undefined) return ''
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '' : dateTimeFormatter.format(date)
}

/** Day and month only, for the labels under a chart. */
export function formatShortDate(value) {
  if (value === null || value === undefined) return ''
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '' : shortDateFormatter.format(date)
}

export function titleCase(slug) {
  return slug
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

export function pluralize(count, singular, plural = `${singular}s`) {
  return count === 1 ? `${count} ${singular}` : `${count} ${plural}`
}
