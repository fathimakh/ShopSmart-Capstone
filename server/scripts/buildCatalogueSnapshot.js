/**
 * Downloads the DummyJSON catalogue once and saves the fields the shop uses to
 * data/catalogue.json. The seed reads that file, so seeding never depends on a third
 * party API being up. Run with: npm run snapshot
 */
import { writeFile } from 'node:fs/promises'

const SOURCE = 'https://dummyjson.com/products?limit=0'
const TARGET = new URL('../data/catalogue.json', import.meta.url)

const fields = [
  'id',
  'title',
  'description',
  'category',
  'price',
  'discountPercentage',
  'rating',
  'stock',
  'tags',
  'brand',
  'sku',
  'weight',
  'dimensions',
  'warrantyInformation',
  'shippingInformation',
  'returnPolicy',
  'minimumOrderQuantity',
  'thumbnail',
  'images'
]

function pick(product) {
  const entry = Object.fromEntries(fields.map((field) => [field, product[field]]))
  entry.createdAt = product.meta?.createdAt || null
  entry.reviews = (product.reviews || []).map((review) => ({
    rating: review.rating,
    comment: review.comment,
    reviewerName: review.reviewerName,
    date: review.date
  }))
  return entry
}

const response = await fetch(SOURCE)
if (!response.ok) {
  console.error(`DummyJSON answered with status ${response.status}`)
  process.exit(1)
}

const { products } = await response.json()
await writeFile(TARGET, `${JSON.stringify(products.map(pick), null, 2)}\n`)
console.log(`Saved ${products.length} products to data/catalogue.json`)
