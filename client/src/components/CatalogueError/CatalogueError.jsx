import { FiRefreshCw, FiWifiOff } from 'react-icons/fi'
import { useCatalog } from '../../context/CatalogContext'
import EmptyState from '../EmptyState/EmptyState'

// Stands in for every page that needs the catalogue when it could not be loaded, so a
// failed request never shows up as an empty cart or "product not found".
function CatalogueError() {
  const { error, reload } = useCatalog()

  return (
    <div className="container" role="alert">
      <EmptyState
        icon={FiWifiOff}
        headingLevel={1}
        title="We could not load the shop"
        message={
          error ? error.message : 'The product catalogue did not load. Please try again.'
        }
        action={
          <button type="button" className="btn btn-primary" onClick={reload}>
            <FiRefreshCw aria-hidden="true" />
            Try again
          </button>
        }
      />
    </div>
  )
}

export default CatalogueError
