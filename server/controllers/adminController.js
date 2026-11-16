import Order, { ORDER_STATUSES } from '../models/order.js'
import Product, { LOW_STOCK_LIMIT } from '../models/product.js'
import User from '../models/user.js'

const DASHBOARD_LIST_SIZE = 5
const SALES_DAYS = 14
const DAY = 24 * 60 * 60 * 1000

function roundCurrency(value) {
  return Math.round(value * 100) / 100
}

// Days are counted in UTC, the same calendar the dates in the API responses use.
function dayKey(time) {
  return new Date(time).toISOString().slice(0, 10)
}

/**
 * Every day of the last two weeks, oldest first, including the days without a sale, so
 * the dashboard chart has no gaps.
 */
function fillSalesDays(rows, today) {
  const byDay = new Map(rows.map((row) => [row._id, row]))
  return Array.from({ length: SALES_DAYS }, (_, index) => {
    const date = dayKey(today - (SALES_DAYS - 1 - index) * DAY)
    const row = byDay.get(date)
    return { date, orders: row?.orders ?? 0, revenue: roundCurrency(row?.revenue ?? 0) }
  })
}

/**
 * GET /api/admin/summary - the numbers on the admin dashboard. Revenue (in totals and
 * per day) leaves cancelled orders out, because that money was never kept.
 */
export async function getSummary(req, res) {
  const now = Date.now()
  const firstDay = new Date(`${dayKey(now - (SALES_DAYS - 1) * DAY)}T00:00:00.000Z`)
  const kept = { status: { $ne: 'cancelled' } }

  const [users, products, orders, [revenue], statusCounts, lowStock, bestSellers, recentOrders, dailySales] =
    await Promise.all([
      User.countDocuments(),
      Product.countDocuments(),
      Order.countDocuments(),
      Order.aggregate([{ $match: kept }, { $group: { _id: null, total: { $sum: '$total' } } }]),
      Order.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
      Product.find({ stock: { $lt: LOW_STOCK_LIMIT } }).sort({ stock: 1, id: 1 }).limit(DASHBOARD_LIST_SIZE),
      Product.find({ soldCount: { $gt: 0 } }).sort({ soldCount: -1, id: 1 }).limit(DASHBOARD_LIST_SIZE),
      Order.find().sort({ createdAt: -1, _id: -1 }).limit(DASHBOARD_LIST_SIZE).populate('user', 'name email'),
      Order.aggregate([
        { $match: { ...kept, createdAt: { $gte: firstDay } } },
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
            orders: { $sum: 1 },
            revenue: { $sum: '$total' }
          }
        }
      ])
    ])

  const ordersByStatus = Object.fromEntries(ORDER_STATUSES.map((status) => [status, 0]))
  statusCounts.forEach(({ _id, count }) => {
    ordersByStatus[_id] = count
  })

  res.json({
    success: true,
    totals: { users, products, orders, revenue: roundCurrency(revenue?.total ?? 0) },
    ordersByStatus,
    lowStock,
    topProducts: bestSellers.map((product) => ({ product, soldCount: product.soldCount })),
    recentOrders,
    salesByDay: fillSalesDays(dailySales, now)
  })
}
