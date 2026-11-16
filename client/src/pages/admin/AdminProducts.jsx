import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { FiArrowDown, FiArrowUp, FiEdit2, FiExternalLink, FiPlus, FiTrash2 } from 'react-icons/fi'
import AdminLoadError from '../../components/admin/AdminLoadError/AdminLoadError'
import AdminPageHeader from '../../components/admin/AdminPageHeader/AdminPageHeader'
import AdminPagination from '../../components/admin/AdminPagination/AdminPagination'
import AdminSearch from '../../components/admin/AdminSearch/AdminSearch'
import ConfirmDialog from '../../components/admin/ConfirmDialog/ConfirmDialog'
import { useCatalog } from '../../context/CatalogContext'
import useAdminFilters from '../../hooks/useAdminFilters'
import useAdminMutation from '../../hooks/useAdminMutation'
import useAdminResource from '../../hooks/useAdminResource'
import useAdminToast from '../../hooks/useAdminToast'
import usePageTitle from '../../hooks/usePageTitle'
import { deleteProduct } from '../../services/adminApi'
import { LOW_STOCK_LIMIT } from '../../services/adminRules'
import { formatPrice, pluralize, titleCase } from '../../utils/format'
import './AdminProducts.css'

const PAGE_SIZE = 20
const SKELETON_ROWS = 6

// Kept at module level: useAdminFilters compares it by identity.
const DEFAULT_FILTERS = { q: '', category: '', stock: '', sort: 'featured' }

// The sorts GET /api/products accepts, in the words the table uses.
const SORTS = [
  { value: 'featured', label: 'Product id' },
  { value: 'newest', label: 'Newest first' },
  { value: 'price-asc', label: 'Price, low to high' },
  { value: 'price-desc', label: 'Price, high to low' },
  { value: 'rating', label: 'Highest rated' },
  { value: 'popularity', label: 'Most reviewed' },
  { value: 'discount', label: 'Biggest discount' }
]

// stockBelow is "fewer units than", so sold out is below 1 and low stock below 10.
const STOCK_FILTERS = {
  low: { label: `Low stock (under ${LOW_STOCK_LIMIT})`, stockBelow: LOW_STOCK_LIMIT },
  out: { label: 'Sold out', stockBelow: 1 }
}

function stockTone(stock) {
  if (stock === 0) return { label: 'Sold out', className: 'admin-stock is-out' }
  if (stock < LOW_STOCK_LIMIT) return { label: 'Low', className: 'admin-stock is-low' }
  return null
}

/**
 * The product table: search, filter, sort and page through GET /api/products, then
 * edit or delete a product. Every filter lives in the address, so a dashboard link such
 * as /admin/products?stock=low opens the table already filtered.
 */
function AdminProducts() {
  usePageTitle('Products')
  const heading = useRef(null)
  const listHeading = useRef(null)
  const focusListAfterDelete = useRef(false)
  const notify = useAdminToast()
  const [filters, setFilters, resetFilters] = useAdminFilters(DEFAULT_FILTERS)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const { run, isPending, error: deleteError, resetError } = useAdminMutation()
  const { removeProduct } = useCatalog()

  const sort = SORTS.some((option) => option.value === filters.sort) ? filters.sort : 'featured'
  const stockFilter = STOCK_FILTERS[filters.stock] || null

  const { data, status, error, isRefreshing, reload, setData } = useAdminResource('/products', {
    params: {
      q: filters.q,
      category: filters.category,
      stockBelow: stockFilter ? stockFilter.stockBelow : '',
      sort,
      page: filters.page,
      limit: PAGE_SIZE
    }
  })
  const categoryList = useAdminResource('/products/categories')
  const categories = categoryList.data ? categoryList.data.categories : []

  const products = data ? data.products : []
  const pagination = data ? data.pagination : null
  const isFiltered = Boolean(filters.q || filters.category || stockFilter)

  // After a delete the row that held focus is gone, so focus moves to the list heading
  // once the dialog has closed (child effects, the dialog's included, run first).
  useEffect(() => {
    if (!deleteTarget && focusListAfterDelete.current) {
      focusListAfterDelete.current = false
      listHeading.current?.focus()
    }
  }, [deleteTarget])

  const retry = () => {
    heading.current?.focus()
    reload()
  }

  const togglePriceSort = () => {
    setFilters({ sort: sort === 'price-asc' ? 'price-desc' : 'price-asc' })
  }

  const confirmDelete = async () => {
    const product = deleteTarget
    const result = await run(`delete:${product.id}`, () => deleteProduct(product.id), {
      successMessage: `${product.title} was deleted`
    })

    const alreadyGone = !result.ok && result.error && result.error.code === 'PRODUCT_NOT_FOUND'
    if (!result.ok && !alreadyGone) return
    if (alreadyGone) {
      resetError()
      notify(`${product.title} had already been deleted`, { tone: 'error' })
    }

    // Gone from the shop as well, so a shopper on this device cannot open or buy it.
    removeProduct(product.id)
    focusListAfterDelete.current = true
    setData((current) =>
      current
        ? {
            ...current,
            products: current.products.filter((item) => item.id !== product.id),
            pagination: { ...current.pagination, total: Math.max(0, current.pagination.total - 1) }
          }
        : current
    )
    setDeleteTarget(null)
    // The last row of a later page leaves that page empty, so step back one.
    if (products.length === 1 && filters.page > 1) setFilters({ page: filters.page - 1 })
    else reload()
  }

  let countText = 'Loading products'
  if (pagination) {
    countText = isFiltered
      ? `${pluralize(pagination.total, 'product')} match`
      : `${pluralize(pagination.total, 'product')} in the catalogue`
  } else if (status === 'error') {
    countText = 'Products could not be loaded'
  }

  const priceSort = sort === 'price-asc' ? 'ascending' : sort === 'price-desc' ? 'descending' : 'none'

  return (
    <div className="admin-list admin-products">
      <AdminPageHeader
        headingRef={heading}
        title="Products"
        description="Search the catalogue, keep prices and stock up to date, and add new products."
        actions={
          <Link className="btn btn-primary" to="/admin/products/new">
            <FiPlus aria-hidden="true" />
            Add product
          </Link>
        }
      />

      <div className="admin-filters card" role="group" aria-label="Filter products">
        <AdminSearch
          id="admin-products-search"
          label="Search products"
          placeholder="Title, brand, category or tag"
          value={filters.q}
          onSearch={(q) => setFilters({ q }, { replace: true })}
        />
        <div className="admin-filter">
          <label htmlFor="admin-products-category">Category</label>
          <select
            id="admin-products-category"
            value={filters.category}
            onChange={(event) => setFilters({ category: event.target.value })}
          >
            <option value="">All categories</option>
            {filters.category && !categories.some((item) => item.slug === filters.category) ? (
              <option value={filters.category}>{titleCase(filters.category)}</option>
            ) : null}
            {categories.map((item) => (
              <option key={item.slug} value={item.slug}>
                {titleCase(item.slug)} ({item.count})
              </option>
            ))}
          </select>
        </div>
        <div className="admin-filter">
          <label htmlFor="admin-products-stock">Stock</label>
          <select
            id="admin-products-stock"
            value={stockFilter ? filters.stock : ''}
            onChange={(event) => setFilters({ stock: event.target.value })}
          >
            <option value="">Any stock</option>
            {Object.entries(STOCK_FILTERS).map(([value, option]) => (
              <option key={value} value={value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
        <div className="admin-filter">
          <label htmlFor="admin-products-sort">Sort by</label>
          <select
            id="admin-products-sort"
            value={sort}
            onChange={(event) => setFilters({ sort: event.target.value })}
          >
            {SORTS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
        {isFiltered || sort !== 'featured' ? (
          <button type="button" className="btn btn-ghost admin-filters-reset" onClick={resetFilters}>
            Clear filters
          </button>
        ) : null}
      </div>

      {status === 'error' && data ? (
        <AdminLoadError compact title="The list could not be refreshed" error={error} onRetry={reload} />
      ) : null}

      {!data && status === 'error' ? (
        <AdminLoadError title="Products could not be loaded" error={error} onRetry={retry} />
      ) : null}

      {data || status === 'loading' ? (
        <section className="admin-panel card" aria-labelledby="admin-products-count">
          <div className="admin-panel-head">
            <h2 id="admin-products-count" ref={listHeading} tabIndex={-1} className="admin-list-count">
              {countText}
            </h2>
            {isRefreshing ? (
              <span className="admin-muted" role="status">
                Updating
              </span>
            ) : null}
          </div>

          {!data ? (
            <div aria-hidden="true">
              {Array.from({ length: SKELETON_ROWS }, (_, index) => (
                <div key={index} className="skeleton admin-skeleton-row" />
              ))}
            </div>
          ) : null}

          {data && !products.length && !isRefreshing ? (
            <div className="admin-empty">
              {pagination && pagination.total > 0 ? (
                <>
                  <h3>This page is past the end of the list</h3>
                  <p>The products have moved up to earlier pages.</p>
                  <button type="button" className="btn btn-outline" onClick={() => setFilters({ page: 1 })}>
                    Go to the first page
                  </button>
                </>
              ) : isFiltered ? (
                <>
                  <h3>No products match these filters</h3>
                  <p>Try fewer words, or another category or stock level.</p>
                  <button type="button" className="btn btn-outline" onClick={resetFilters}>
                    Clear filters
                  </button>
                </>
              ) : (
                <>
                  <h3>The catalogue is empty</h3>
                  <p>Products you add appear here and in the shop.</p>
                  <Link className="btn btn-primary" to="/admin/products/new">
                    Add product
                  </Link>
                </>
              )}
            </div>
          ) : null}

          {products.length ? (
            <div className="admin-table-wrap" aria-busy={isRefreshing}>
              <table className="admin-table">
                <caption className="visually-hidden">
                  Products, {SORTS.find((option) => option.value === sort).label.toLowerCase()}
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Product</th>
                    <th scope="col">Category</th>
                    <th scope="col" className="is-number" aria-sort={priceSort}>
                      <button type="button" className="admin-sort-button" onClick={togglePriceSort}>
                        Price
                        {priceSort === 'ascending' ? <FiArrowUp aria-hidden="true" /> : null}
                        {priceSort === 'descending' ? <FiArrowDown aria-hidden="true" /> : null}
                        <span className="visually-hidden">
                          {priceSort === 'ascending'
                            ? ', sorted low to high. Sort high to low'
                            : priceSort === 'descending'
                              ? ', sorted high to low. Sort low to high'
                              : ', sort low to high'}
                        </span>
                      </button>
                    </th>
                    <th scope="col" className="is-number">
                      Stock
                    </th>
                    <th scope="col" className="is-number is-optional">
                      Sold
                    </th>
                    <th scope="col" className="is-number is-optional">
                      Rating
                    </th>
                    <th scope="col" className="is-actions">
                      <span className="visually-hidden">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {products.map((product) => {
                    const tone = stockTone(product.stock)
                    return (
                      <tr key={product.id}>
                        <td className="is-primary">
                          <span className="admin-cell-main">
                            <img
                              className="admin-thumb"
                              src={product.thumbnail}
                              alt=""
                              width="44"
                              height="44"
                              loading="lazy"
                            />
                            <span className="admin-cell-text">
                              <Link className="admin-cell-title admin-text-link" to={`/admin/products/${product.id}/edit`}>
                                {product.title}
                              </Link>
                              <span className="admin-cell-sub">
                                #{product.id} - {product.brand}
                              </span>
                            </span>
                          </span>
                        </td>
                        <td data-label="Category">{titleCase(product.category)}</td>
                        <td data-label="Price" className="is-number">
                          <span className="admin-price">
                            {formatPrice(product.price)}
                            {product.discountPercentage ? (
                              <span className="admin-cell-sub">{Math.round(product.discountPercentage)}% off</span>
                            ) : null}
                          </span>
                        </td>
                        <td data-label="Stock" className="is-number">
                          <span>
                            {product.stock}
                            {tone ? <span className={tone.className}>{tone.label}</span> : null}
                          </span>
                        </td>
                        <td data-label="Sold" className="is-number is-optional">
                          {product.soldCount}
                        </td>
                        <td data-label="Rating" className="is-number is-optional">
                          <span>
                            {product.rating.toFixed(1)}
                            <span className="admin-cell-sub">
                              {' '}
                              ({pluralize(product.reviewCount, 'review')})
                            </span>
                          </span>
                        </td>
                        <td className="is-actions">
                          <span className="admin-row-actions">
                            <Link className="btn btn-outline" to={`/admin/products/${product.id}/edit`}>
                              <FiEdit2 aria-hidden="true" />
                              Edit<span className="visually-hidden"> {product.title}</span>
                            </Link>
                            <Link
                              className="btn btn-ghost"
                              to={`/product/${product.id}`}
                              title="Open in the shop"
                            >
                              <FiExternalLink aria-hidden="true" />
                              <span className="visually-hidden">Open {product.title} in the shop</span>
                            </Link>
                            <button
                              type="button"
                              className="btn btn-ghost admin-danger-button"
                              onClick={() => {
                                resetError()
                                setDeleteTarget(product)
                              }}
                            >
                              <FiTrash2 aria-hidden="true" />
                              <span className="visually-hidden">Delete {product.title}</span>
                            </button>
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          ) : null}

          <AdminPagination
            pagination={pagination}
            noun="products"
            disabled={status === 'loading'}
            onPageChange={(page) => setFilters({ page })}
          />
        </section>
      ) : null}

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title={deleteTarget ? `Delete ${deleteTarget.title}?` : ''}
        confirmLabel="Delete product"
        busyLabel="Deleting"
        cancelLabel="Keep it"
        busy={isPending}
        error={deleteError}
        onConfirm={confirmDelete}
        onCancel={() => {
          setDeleteTarget(null)
          resetError()
        }}
      >
        <p>
          It leaves the shop straight away, together with its reviews, and is taken out of every
          shopper's cart and wishlist. Orders that already include it keep their own copy.
        </p>
        {deleteTarget ? (
          <p>
            <strong>Product #{deleteTarget.id}</strong> has {pluralize(deleteTarget.stock, 'unit')} in
            stock. This cannot be undone.
          </p>
        ) : null}
      </ConfirmDialog>
    </div>
  )
}

export default AdminProducts
