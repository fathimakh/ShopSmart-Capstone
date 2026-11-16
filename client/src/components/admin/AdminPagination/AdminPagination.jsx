import { FiChevronLeft, FiChevronRight } from 'react-icons/fi'
import './AdminPagination.css'

/**
 * Previous and next for a paged admin list, using the API's pagination object
 * ({ page, limit, total, pages }). The range line is a live region, so moving to another
 * page is confirmed to screen reader users as well.
 */
function AdminPagination({ pagination, onPageChange, noun = 'results', disabled = false }) {
  if (!pagination || !pagination.total) return null
  const { page, limit, total, pages } = pagination
  const first = (page - 1) * limit + 1
  const last = Math.min(page * limit, total)

  return (
    <nav className="admin-pagination" aria-label={`Pages of ${noun}`}>
      <p className="admin-pagination-range" role="status">
        {first > total
          ? `Page ${page} is past the end of the ${total} ${noun}`
          : `Showing ${first} to ${last} of ${total} ${noun}`}
      </p>
      {pages > 1 || page > pages ? (
        <div className="admin-pagination-buttons">
          <button
            type="button"
            className="btn btn-outline"
            onClick={() => onPageChange(Math.min(page - 1, pages))}
            disabled={disabled || page <= 1}
          >
            <FiChevronLeft aria-hidden="true" />
            Previous
          </button>
          <span className="admin-pagination-page">
            Page {page} of {pages}
          </span>
          <button
            type="button"
            className="btn btn-outline"
            onClick={() => onPageChange(page + 1)}
            disabled={disabled || page >= pages}
          >
            Next
            <FiChevronRight aria-hidden="true" />
          </button>
        </div>
      ) : null}
    </nav>
  )
}

export default AdminPagination
