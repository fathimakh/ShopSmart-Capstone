/**
 * Loads the catalogue from data/catalogue.json and creates the demo accounts.
 *
 *   npm run seed            replaces products and reviews, keeps shoppers and orders
 *   npm run seed -- --fresh also removes every account and order
 */
import { readFile } from 'node:fs/promises'
import env from '../config/env.js'
import { connectDB, disconnectDB } from '../config/db.js'
import Counter, { syncSequence } from '../models/counter.js'
import Order from '../models/order.js'
import Product from '../models/product.js'
import Review from '../models/review.js'
import User from '../models/user.js'
import { buildSeedHistory } from '../services/pricePredict.js'

const fresh = process.argv.includes('--fresh')

export const demoAccounts = [
  { name: 'ShopSmart Admin', email: env.seedAdminEmail, password: env.seedAdminPassword, role: 'admin' },
  { name: 'Demo Shopper', email: env.seedShopperEmail, password: 'Demo@1234', role: 'customer' }
]

function toProduct(entry, now) {
  const createdAt = entry.createdAt ? new Date(entry.createdAt) : new Date(now)
  return {
    id: entry.id,
    title: entry.title,
    description: entry.description,
    brand: entry.brand || 'Generic',
    category: entry.category,
    price: entry.price,
    discountPercentage: entry.discountPercentage || 0,
    rating: entry.rating,
    catalogueRating: entry.rating,
    reviewCount: entry.reviews.length,
    stock: entry.stock,
    tags: entry.tags || [],
    sku: entry.sku || '',
    weight: entry.weight || 0,
    dimensions: entry.dimensions || {},
    warrantyInformation: entry.warrantyInformation,
    shippingInformation: entry.shippingInformation,
    returnPolicy: entry.returnPolicy,
    minimumOrderQuantity: entry.minimumOrderQuantity || 1,
    thumbnail: entry.thumbnail,
    images: entry.images?.length ? entry.images : [entry.thumbnail],
    priceHistory: buildSeedHistory(entry, now),
    createdAt,
    updatedAt: createdAt
  }
}

function toReviews(entry) {
  return entry.reviews.map((review) => ({
    product: entry.id,
    reviewerName: review.reviewerName,
    rating: review.rating,
    comment: review.comment,
    createdAt: new Date(review.date),
    updatedAt: new Date(review.date)
  }))
}

export async function seedCatalogue(catalogue, now = Date.now()) {
  await Promise.all([Product.deleteMany({}), Review.deleteMany({}), Counter.deleteMany({ _id: 'product' })])

  // timestamps: false keeps the catalogue's own dates, so "newest" sorts as it did before.
  await Product.insertMany(
    catalogue.map((entry) => toProduct(entry, now)),
    { timestamps: false }
  )
  await Review.insertMany(catalogue.flatMap(toReviews), { timestamps: false })
  await syncSequence('product', Math.max(...catalogue.map((entry) => entry.id)))
}

export async function seedAccounts() {
  for (const account of demoAccounts) {
    const existing = await User.findOne({ email: account.email }).select('+password')
    if (existing) {
      existing.name = account.name
      existing.role = account.role
      existing.password = account.password
      await existing.save()
    } else {
      await User.create(account)
    }
  }
}

async function run() {
  const catalogue = JSON.parse(await readFile(new URL('../data/catalogue.json', import.meta.url), 'utf8'))

  await connectDB()

  if (fresh) {
    await Promise.all([User.deleteMany({}), Order.deleteMany({})])
    console.log('Removed every account and order')
  }

  await seedCatalogue(catalogue)
  await seedAccounts()
  await Promise.all([Product, Review, User, Order].map((model) => model.syncIndexes()))

  console.log(`Seeded ${catalogue.length} products and ${await Review.countDocuments()} reviews`)
  demoAccounts.forEach((account) => {
    console.log(`  ${account.role.padEnd(8)} ${account.email} / ${account.password}`)
  })

  await disconnectDB()
}

// Only runs from the command line; the tests import seedCatalogue on its own.
if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  run().catch(async (error) => {
    console.error('Seeding failed:', error.message)
    await disconnectDB()
    process.exit(1)
  })
}
