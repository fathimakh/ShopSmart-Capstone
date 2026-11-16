import { useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { FiArrowLeft, FiExternalLink } from 'react-icons/fi'
import AdminLoadError from '../../components/admin/AdminLoadError/AdminLoadError'
import AdminPageHeader from '../../components/admin/AdminPageHeader/AdminPageHeader'
import PriceHistoryPanel from '../../components/admin/PriceHistoryPanel/PriceHistoryPanel'
import ProductForm from '../../components/admin/ProductForm/ProductForm'
import { useCatalog } from '../../context/CatalogContext'
import useAdminMutation from '../../hooks/useAdminMutation'
import useAdminResource from '../../hooks/useAdminResource'
import usePageTitle from '../../hooks/usePageTitle'
import { createProduct, updateProduct } from '../../services/adminApi'
import { normalizeProduct } from '../../services/api'
import {
  changedProductFields,
  emptyProductValues,
  productPayload,
  productToValues
} from '../../services/adminRules'
import { formatDate, formatPrice, pluralize } from '../../utils/format'
import './AdminProductEdit.css'

const backLink = (
  <Link to="/admin/products">
    <FiArrowLeft aria-hidden="true" />
    All products
  </Link>
)

/**
 * Adds a product (/admin/products/new) or edits one (/admin/products/:id/edit). Editing
 * sends only the fields that changed, and the price history beside the form shows the
 * point a new price adds.
 */
function AdminProductEdit() {
  const { id } = useParams()
  const isEdit = id !== undefined
  // A malformed id is answered here rather than sent, since the API would only say 400.
  const validId = !isEdit || /^[1-9]\d*$/.test(id)
  const navigate = useNavigate()
  const heading = useRef(null)
  const [historyVersion, setHistoryVersion] = useState(0)
  const { run, isPending } = useAdminMutation()
  const { putProduct } = useCatalog()

  const productResource = useAdminResource(isEdit && validId ? `/products/${id}` : null, {
    keepPreviousData: false
  })
  const categoryList = useAdminResource('/products/categories')
  const categories = categoryList.data ? categoryList.data.categories.map((item) => item.slug) : []
  const product = productResource.data ? productResource.data.product : null

  usePageTitle(isEdit ? (product ? `Edit ${product.title}` : 'Edit product') : 'Add a product')

  const create = async (values) => {
    const result = await run('create', () => createProduct(productPayload(values)), {
      successMessage: (body) => `${body.product.title} was added as product #${body.product.id}`
    })
    if (!result.ok) return { ok: false, error: result.error }
    // The shop already holds the catalogue in memory, so the new product is put there too
    // and is on sale in the storefront at once, not after the next full reload.
    putProduct(normalizeProduct(result.data.product))
    // Newest first, so the product just added is the first row of the table.
    navigate('/admin/products?sort=newest')
    return null
  }

  const save = async (values) => {
    const changes = changedProductFields(values, product)
    if (!Object.keys(changes).length) {
      return { ok: false, notice: 'Nothing has changed, so there was nothing to save.' }
    }

    const priceChanged = changes.price !== undefined
    const result = await run('save', () => updateProduct(product.id, changes), {
      successMessage: priceChanged
        ? `Saved. ${formatPrice(changes.price)} was added to the price history`
        : 'Changes saved'
    })
    if (!result.ok) {
      // Deleted in another tab or by another admin: show the not found page.
      if (result.error && result.error.code === 'PRODUCT_NOT_FOUND') productResource.reload()
      return { ok: false, error: result.error }
    }

    const saved = result.data.product
    putProduct(normalizeProduct(saved))
    productResource.setData((current) => ({ ...current, product: saved }))
    if (priceChanged) setHistoryVersion((version) => version + 1)
    return {
      ok: true,
      values: productToValues(saved),
      notice: `Saved ${pluralize(Object.keys(changes).length, 'change')}.`
    }
  }

  if (!isEdit) {
    return (
      <div className="admin-product-edit">
        <AdminPageHeader
          eyebrow={backLink}
          title="Add a product"
          description="It goes on sale as soon as it is added. Its price starts the price history."
        />
        <ProductForm
          mode="create"
          initialValues={emptyProductValues}
          categories={categories}
          submitting={isPending}
          onSubmit={create}
        />
      </div>
    )
  }

  const notFound =
    !validId || (productResource.error && productResource.error.code === 'PRODUCT_NOT_FOUND')

  if (notFound) {
    return (
      <div className="admin-product-edit">
        <AdminPageHeader
          eyebrow={backLink}
          title="Product not found"
          description={`There is no product #${id}. It may have been deleted, or the address is mistyped.`}
          actions={
            <Link className="btn btn-primary" to="/admin/products">
              Back to products
            </Link>
          }
        />
      </div>
    )
  }

  if (!product) {
    return (
      <div className="admin-product-edit">
        <AdminPageHeader headingRef={heading} eyebrow={backLink} title="Edit product" />
        {productResource.status === 'error' ? (
          <AdminLoadError
            title="This product could not be loaded"
            error={productResource.error}
            onRetry={() => {
              heading.current?.focus()
              productResource.reload()
            }}
          />
        ) : (
          <div className="admin-product-edit-loading" role="status">
            <span className="visually-hidden">Loading the product</span>
            <div className="skeleton admin-product-edit-skeleton" aria-hidden="true" />
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="admin-product-edit">
      <AdminPageHeader
        eyebrow={backLink}
        title={`Edit ${product.title}`}
        description={
          product.meta
            ? `Product #${product.id}, added ${formatDate(product.meta.createdAt)} and last changed ${formatDate(product.meta.updatedAt)}.`
            : `Product #${product.id}.`
        }
        actions={
          <Link className="btn btn-outline" to={`/product/${product.id}`}>
            <FiExternalLink aria-hidden="true" />
            Open in the shop
          </Link>
        }
      />

      <div className="admin-product-edit-layout">
        <ProductForm
          key={product.id}
          mode="edit"
          initialValues={productToValues(product)}
          originalPrice={product.price}
          categories={categories}
          submitting={isPending}
          onSubmit={save}
        />

        <aside className="admin-product-edit-side">
          <PriceHistoryPanel productId={product.id} version={historyVersion} />
          <section className="admin-product-facts card" aria-labelledby="admin-product-facts-title">
            <h2 id="admin-product-facts-title">In the shop</h2>
            <dl>
              <div>
                <dt>Rating</dt>
                <dd>
                  {product.rating.toFixed(1)} from {pluralize(product.reviewCount, 'review')}
                </dd>
              </div>
              <div>
                <dt>Sold</dt>
                <dd>{pluralize(product.soldCount, 'unit')}</dd>
              </div>
              <div>
                <dt>Availability</dt>
                <dd>{product.availabilityStatus}</dd>
              </div>
              <div>
                <dt>SKU</dt>
                <dd>{product.sku || 'None'}</dd>
              </div>
            </dl>
          </section>
        </aside>
      </div>
    </div>
  )
}

export default AdminProductEdit
