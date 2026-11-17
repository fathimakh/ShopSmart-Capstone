import { useCatalog } from '../../context/CatalogContext'
import './WakeUpNotice.css'

// The catalogue is the first request of every visit, whichever page the visit starts on,
// so when it is slow the free API server is usually waking up. It sits above every page:
// a visitor who opens a shared product link waits just as long as one on the home page.
// The status region stays in the page, so screen readers announce the text when it appears.
function WakeUpNotice() {
  const { isSlow } = useCatalog()

  return (
    <div role="status">
      {isSlow ? (
        <div className="container">
          <p className="wake-up-notice">
            Waking up the server. The first visit after a quiet spell can take up to a minute.
          </p>
        </div>
      ) : null}
    </div>
  )
}

export default WakeUpNotice
