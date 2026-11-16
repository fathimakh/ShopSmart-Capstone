import { arrayOf, idList, number } from './rules.js'

const cartLine = {
  id: number({ label: 'Product id', min: 1, integer: true }),
  quantity: number({ label: 'Quantity', min: 1, max: 99, integer: true })
}

export const cartRules = {
  items: arrayOf({ label: 'Cart', fields: cartLine, minItems: 0, maxItems: 50 })
}

export const idListRules = {
  ids: idList({ label: 'Products', maxItems: 100, required: true })
}

// Everything a guest collected before signing in, sent once to be merged into the account.
export const mergeRules = {
  cart: arrayOf({ label: 'Cart', fields: cartLine, minItems: 0, maxItems: 50, required: false }),
  wishlist: idList({ label: 'Wishlist', maxItems: 100 }),
  recentlyViewed: idList({ label: 'Recently viewed', maxItems: 100 })
}
