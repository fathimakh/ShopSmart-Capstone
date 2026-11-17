/**
 * Loads the catalogue from data/catalogue.json, creates the demo accounts and gives the
 * demo shopper an order history (scripts/demoOrders.js).
 *
 *   npm run seed            replaces products and reviews, refreshes the demo orders,
 *                           keeps every other account and order
 *   npm run seed -- --fresh also removes every account and order first
 *
 * Kept orders still count after a reseed: sold counts and reserved stock follow them, and
 * product ids are never handed out twice, so an old order never points at a new product.
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
import { seedDemoOrders } from './demoOrders.js'

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

/**
 * The fresh catalogue starts every product at its catalogue stock with nothing sold, so
 * the orders kept from before are applied to it: soldCount counts every unit not
 * cancelled, and units in orders still on their way stay reserved. Cancelling one of
 * those later then brings the stock back to the catalogue amount, not above it, and
 * never leaves a negative soldCount.
 */
async function applyKeptOrders() {
  const totals = await Order.aggregate([
    { $match: { status: { $ne: 'cancelled' } } },
    { $unwind: '$items' },
    {
      $group: {
        _id: '$items.id',
        sold: { $sum: '$items.quantity' },
        reserved: { $sum: { $cond: [{ $in: ['$status', ['processing', 'shipped']] }, '$items.quantity', 0] } }
      }
    }
  ])
  if (!totals.length) return

  await Product.bulkWrite(
    totals.map(({ _id, sold, reserved }) => ({
      updateOne: {
        filter: { id: _id },
        update: [{ $set: { soldCount: sold, stock: { $max: [0, { $subtract: ['$stock', reserved] }] } } }]
      }
    }))
  )
}

export async function seedCatalogue(catalogue, now = Date.now()) {
  // The product id counter is kept: an id an admin product had before stays used, because
  // kept orders, carts and verified purchase checks still refer to it.
  await Promise.all([Product.deleteMany({}), Review.deleteMany({})])

  // timestamps: false keeps the catalogue's own dates, so "newest" sorts as it did before.
  await Product.insertMany(
    catalogue.map((entry) => toProduct(entry, now)),
    { timestamps: false }
  )
  await Review.insertMany(catalogue.flatMap(toReviews), { timestamps: false })
  await syncSequence('product', Math.max(...catalogue.map((entry) => entry.id)))
  await applyKeptOrders()
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

export function readCatalogue() {
  return readFile(new URL('../data/catalogue.json', import.meta.url), 'utf8').then(JSON.parse)
}

/**
 * The whole seed. The demo orders are written before the catalogue is loaded, so that
 * applyKeptOrders counts them along with every other kept order.
 */
export async function seed(catalogue, { fresh = false, now = Date.now() } = {}) {
  if (fresh) {
    // With no order left, the numbers can start again from SS100001.
    await Promise.all([User.deleteMany({}), Order.deleteMany({}), Counter.deleteOne({ _id: 'order' })])
  }

  await seedAccounts()
  const shopper = await User.findOne({ email: env.seedShopperEmail })
  const demoOrders = await seedDemoOrders(catalogue, shopper, now)
  await seedCatalogue(catalogue, now)
  return { demoOrders }
}

async function run() {
  const catalogue = await readCatalogue()

  await connectDB()
  const { demoOrders } = await seed(catalogue, { fresh })
  await Promise.all([Product, Review, User, Order].map((model) => model.syncIndexes()))

  if (fresh) console.log('Removed every account and order first')
  console.log(`Seeded ${catalogue.length} products and ${await Review.countDocuments()} reviews`)
  console.log(`Wrote ${demoOrders.length} demo orders for ${env.seedShopperEmail}, placed over the last two weeks`)
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
