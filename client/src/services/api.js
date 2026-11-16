import { titleCase } from '../utils/format'
import { api } from './http'

// The first request of a visit can wake a sleeping free-tier server, which takes up to a
// minute, so the catalogue waits longer than an ordinary request before giving up.
const CATALOGUE_TIMEOUT = 60000

// The API returns the already discounted price, so the pre-discount figure has to be
// rebuilt to show a struck-through original price on the card. The server uses the same
// rule for order lines (docs/API.md, Product).
function originalPrice(price, discountPercentage) {
  if (!discountPercentage) return price
  return Math.round((price / (1 - discountPercentage / 100)) * 100) / 100
}

/** The stock label the server gives a product (docs/API.md, Product), for local updates. */
export function availabilityFor(stock) {
  if (stock < 1) return 'Out of Stock'
  return stock < 10 ? 'Low Stock' : 'In Stock'
}

/**
 * Shapes a product from GET /api/products for the components. Reviews are not embedded
 * in the product any more; reviewCount comes from the server and the reviews themselves
 * from the reviews endpoint.
 */
export function normalizeProduct(raw) {
  return {
    id: raw.id,
    title: raw.title,
    description: raw.description,
    brand: raw.brand || 'Generic',
    category: raw.category,
    categoryLabel: titleCase(raw.category),
    price: raw.price,
    originalPrice: originalPrice(raw.price, raw.discountPercentage),
    discount: Math.round(raw.discountPercentage || 0),
    rating: raw.rating || 0,
    reviewCount: raw.reviewCount || 0,
    soldCount: raw.soldCount || 0,
    stock: raw.stock,
    availability: raw.availabilityStatus,
    tags: raw.tags || [],
    thumbnail: raw.thumbnail,
    images: raw.images && raw.images.length ? raw.images : [raw.thumbnail],
    createdAt: raw.meta ? raw.meta.createdAt : null,
    specs: {
      SKU: raw.sku || 'Not specified',
      Weight: raw.weight ? `${raw.weight} g` : 'Not specified',
      Dimensions: raw.dimensions
        ? `${raw.dimensions.width} x ${raw.dimensions.height} x ${raw.dimensions.depth} cm`
        : 'Not specified',
      Warranty: raw.warrantyInformation || 'Not specified',
      Shipping: raw.shippingInformation || 'Not specified',
      Returns: raw.returnPolicy || 'Not specified',
      'Minimum order': `${raw.minimumOrderQuantity || 1} unit(s)`
    }
  }
}

/** The whole catalogue in one request, the way the storefront filters it on the device. */
export async function fetchProducts({ signal } = {}) {
  const data = await api.get('/products?limit=0', { signal, timeout: CATALOGUE_TIMEOUT })
  return data.products.map(normalizeProduct)
}

/**
 * The prices recorded for a product, oldest first, and the server's forecast two weeks
 * ahead (docs/API.md, Price history).
 */
export async function fetchPriceHistory(productId, { signal } = {}) {
  const data = await api.get(`/products/${encodeURIComponent(productId)}/price-history`, { signal })
  return { currentPrice: data.currentPrice, points: data.points || [], prediction: data.prediction }
}
