import mongoose from 'mongoose'
import bcrypt from 'bcryptjs'
import { EMAIL_PATTERN } from '../validators/rules.js'

export const USER_ROLES = ['customer', 'admin']
export const VIEWED_LIMIT = 12
export const CART_LINE_LIMIT = 50
const SALT_ROUNDS = 10

// The delivery address from the last order, offered again at the next checkout.
const addressSchema = new mongoose.Schema(
  {
    name: { type: String, trim: true, maxlength: 60, default: '' },
    phone: { type: String, trim: true, maxlength: 15, default: '' },
    address: { type: String, trim: true, maxlength: 160, default: '' },
    city: { type: String, trim: true, maxlength: 60, default: '' },
    state: { type: String, trim: true, maxlength: 60, default: '' },
    pincode: { type: String, trim: true, maxlength: 6, default: '' }
  },
  { _id: false }
)

const cartLineSchema = new mongoose.Schema(
  {
    id: { type: Number, required: true },
    quantity: { type: Number, required: true, min: 1, max: 99 }
  },
  { _id: false }
)

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Name is required'],
      trim: true,
      minlength: [2, 'Name must be at least 2 characters'],
      maxlength: [50, 'Name must be at most 50 characters']
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      lowercase: true,
      trim: true,
      match: [EMAIL_PATTERN, 'Enter a valid email address']
    },
    // Never selected unless asked for, and stored only as a bcrypt hash.
    password: { type: String, required: [true, 'Password is required'], minlength: 8, select: false },
    role: { type: String, enum: USER_ROLES, default: 'customer' },
    address: { type: addressSchema, default: () => ({}) },
    // The shop lists follow the shopper from device to device once they sign in.
    cart: { type: [cartLineSchema], default: [] },
    wishlist: { type: [Number], default: [] },
    recentlyViewed: { type: [Number], default: [] },
    // Raised on a password change, which signs out every token issued before it.
    tokenVersion: { type: Number, default: 0, select: false }
  },
  {
    timestamps: true,
    // Each list is always replaced whole, never edited by position. Versioning them would
    // make a cart save and a wishlist save sent at the same moment (each list has its own
    // debounce in the client) fail with a VersionError instead of both being stored.
    skipVersioning: { cart: true, wishlist: true, recentlyViewed: true },
    toJSON: {
      transform(doc, ret) {
        delete ret.password
        delete ret.tokenVersion
        delete ret.cart
        delete ret.wishlist
        delete ret.recentlyViewed
        delete ret.__v
        return ret
      }
    }
  }
)

// Mongoose 9 middleware is promise based, so there is no next() to call.
userSchema.pre('save', async function hashPassword() {
  if (!this.isModified('password')) return
  this.password = await bcrypt.hash(this.password, SALT_ROUNDS)
})

userSchema.methods.comparePassword = function comparePassword(candidate) {
  return bcrypt.compare(String(candidate), this.password)
}

const User = mongoose.model('User', userSchema)
export default User
