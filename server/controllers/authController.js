import bcrypt from 'bcryptjs'
import User from '../models/user.js'
import ApiError from '../utils/ApiError.js'
import generateToken from '../utils/generateToken.js'

// Checked against when the email is unknown, so a failed sign in takes the same time
// whether or not the account exists and response timing cannot reveal who has one.
const DUMMY_HASH = bcrypt.hashSync('timing-safe-placeholder', 10)

function normalizeEmail(value) {
  return String(value).trim().toLowerCase()
}

/** POST /api/auth/register - creates a customer account (the role can never be chosen). */
export async function register(req, res) {
  const { name, email, password } = req.body
  const normalizedEmail = normalizeEmail(email)

  if (await User.exists({ email: normalizedEmail })) {
    throw ApiError.conflict('An account with this email already exists. Try signing in.', 'EMAIL_TAKEN')
  }

  const user = await User.create({ name: name.trim(), email: normalizedEmail, password })
  res.status(201).json({ success: true, token: generateToken(user), user })
}

/** POST /api/auth/login */
export async function login(req, res) {
  const { email, password } = req.body
  const user = await User.findOne({ email: normalizeEmail(email) }).select('+password +tokenVersion')

  const matches = user
    ? await user.comparePassword(password)
    : await bcrypt.compare(String(password), DUMMY_HASH)

  if (!user || !matches) {
    throw ApiError.unauthorized('The email or password is not right.', 'INVALID_CREDENTIALS')
  }

  res.json({ success: true, token: generateToken(user), user })
}

/** GET /api/auth/me - lets the client check that a stored session is still valid. */
export function getMe(req, res) {
  res.json({ success: true, user: req.user })
}

/** PATCH /api/auth/me - name and the saved delivery address. */
export async function updateMe(req, res) {
  const { name, address } = req.body

  if (name !== undefined) req.user.name = name.trim()
  if (address !== undefined) {
    Object.entries(address).forEach(([field, value]) => {
      req.user.address[field] = typeof value === 'string' ? value.trim() : ''
    })
  }

  await req.user.save()
  res.json({ success: true, user: req.user })
}

/**
 * PATCH /api/auth/password - raising the token version signs out every other device,
 * and the response carries a fresh token so this one stays signed in.
 */
export async function changePassword(req, res) {
  const { currentPassword, newPassword } = req.body
  const user = await User.findById(req.user._id).select('+password +tokenVersion')

  if (!(await user.comparePassword(currentPassword))) {
    throw ApiError.validation([{ field: 'currentPassword', message: 'The current password is not right' }])
  }
  if (currentPassword === newPassword) {
    throw ApiError.validation([{ field: 'newPassword', message: 'Choose a password you have not used here' }])
  }

  user.password = newPassword
  user.tokenVersion += 1
  await user.save()

  res.json({ success: true, message: 'Password changed', token: generateToken(user) })
}
