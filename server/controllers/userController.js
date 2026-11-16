import Order from '../models/order.js'
import User, { USER_ROLES } from '../models/user.js'
import ApiError from '../utils/ApiError.js'
import { buildPagination, createQueryReader, escapeRegex } from '../utils/queryReader.js'

async function findUserOr404(id) {
  const user = await User.findById(id)
  if (!user) throw ApiError.notFound('We could not find that account.', 'ACCOUNT_NOT_FOUND')
  return user
}

/** GET /api/users (admin) - accounts newest first, searched by name or email. */
export async function listUsers(req, res) {
  const read = createQueryReader(req.query)
  const q = read.string('q', { maxLength: 100 })
  const role = read.oneOf('role', USER_ROLES)
  const { page, limit, skip } = read.pagination({ defaultLimit: 20, maxLimit: 100 })
  read.assertValid()

  const filter = {}
  if (role) filter.role = role
  if (q) {
    const pattern = new RegExp(escapeRegex(q), 'i')
    filter.$or = [{ name: pattern }, { email: pattern }]
  }

  const [users, total] = await Promise.all([
    User.find(filter).sort({ createdAt: -1, _id: -1 }).skip(skip).limit(limit),
    User.countDocuments(filter)
  ])

  // How many orders each account on this page has placed, for the admin table.
  const counts = await Order.aggregate([
    { $match: { user: { $in: users.map((user) => user._id) } } },
    { $group: { _id: '$user', count: { $sum: 1 } } }
  ])
  const orderCounts = new Map(counts.map(({ _id, count }) => [_id.toString(), count]))

  res.json({
    success: true,
    users: users.map((user) => ({ ...user.toJSON(), orderCount: orderCounts.get(user._id.toString()) ?? 0 })),
    pagination: buildPagination(page, limit, total)
  })
}

/**
 * PATCH /api/users/:id (admin) - makes an account a customer or an admin. Roles are read
 * from the database on every request, so the change applies to the account's current
 * session straight away. Admins cannot change their own role, which also means the
 * store can never be left without an admin by accident.
 */
export async function updateUserRole(req, res) {
  const user = await findUserOr404(req.params.id)
  const { role } = req.body

  if (user._id.equals(req.user._id) && role !== user.role) {
    throw ApiError.conflict('You cannot change your own role.', 'SELF_ROLE_CHANGE')
  }

  user.role = role
  await user.save()
  res.json({ success: true, user })
}

/**
 * DELETE /api/users/:id (admin). Orders and reviews stay, as records of what happened;
 * orders then show no account, and the account's tokens stop working.
 */
export async function deleteUser(req, res) {
  if (req.user._id.equals(req.params.id)) {
    throw ApiError.conflict('You cannot delete your own account.', 'SELF_DELETE')
  }

  const user = await findUserOr404(req.params.id)
  await User.deleteOne({ _id: user._id })
  res.json({ success: true, message: `Account ${user.email} deleted` })
}
