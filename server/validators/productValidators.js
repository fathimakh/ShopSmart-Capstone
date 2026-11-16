import { SLUG_PATTERN, URL_PATTERN, number, stringList, text } from './rules.js'

export const productRules = {
  title: text({ label: 'Title', min: 3, max: 120 }),
  description: text({ label: 'Description', min: 10, max: 2000 }),
  brand: text({ label: 'Brand', max: 60, required: false }),
  category: text({
    label: 'Category',
    max: 40,
    pattern: SLUG_PATTERN,
    patternMessage: 'Category must be a lowercase slug such as home-decoration'
  }),
  price: number({ label: 'Price', min: 0.01, max: 100000 }),
  discountPercentage: number({ label: 'Discount', min: 0, max: 90, required: false }),
  stock: number({ label: 'Stock', min: 0, max: 100000, integer: true }),
  thumbnail: text({ label: 'Image URL', max: 500, pattern: URL_PATTERN, patternMessage: 'Image URL must start with http:// or https://' }),
  images: stringList({ label: 'Gallery images', maxItems: 10, itemPattern: URL_PATTERN, itemMessage: 'must be a web address' }),
  tags: stringList({ label: 'Tags', maxItems: 12, itemMax: 30 }),
  warrantyInformation: text({ label: 'Warranty', max: 80, required: false }),
  shippingInformation: text({ label: 'Shipping', max: 80, required: false }),
  returnPolicy: text({ label: 'Return policy', max: 80, required: false }),
  minimumOrderQuantity: number({ label: 'Minimum order', min: 1, max: 1000, integer: true, required: false })
}
