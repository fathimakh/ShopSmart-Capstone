import { useEffect, useRef } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { FiX } from 'react-icons/fi'
import { useShop } from '../../context/ShopContext'
import './CompareBar.css'

// The tray floats over the bottom of the page. Its height is shared as a CSS variable so
// the page can leave room for it, and the assistant's message box can sit above it
// instead of under it.
const SPACE_VARIABLE = '--compare-bar-space'

function CompareBar() {
  const { compareItems, compareLimit, toggleCompare, clearCompare } = useShop()
  const location = useLocation()
  const bar = useRef(null)
  const isShown = compareItems.length > 0 && location.pathname !== '/compare'

  useEffect(() => {
    const element = bar.current
    if (!isShown || !element) return undefined
    const root = document.documentElement
    const measure = () => root.style.setProperty(SPACE_VARIABLE, `${element.offsetHeight}px`)
    measure()
    // The tray grows when its buttons wrap onto a second line on narrow screens.
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure)
    if (observer) observer.observe(element)
    return () => {
      if (observer) observer.disconnect()
      root.style.removeProperty(SPACE_VARIABLE)
    }
  }, [isShown])

  if (!isShown) return null

  return (
    <div className="compare-bar" role="region" aria-label="Comparison tray" ref={bar}>
      <div className="container compare-bar-inner">
        <ul className="compare-bar-items">
          {compareItems.map((item) => (
            <li key={item.id}>
              <img src={item.thumbnail} alt={item.title} width="44" height="44" />
              <button type="button" onClick={() => toggleCompare(item.id)}>
                <FiX aria-hidden="true" />
                <span className="visually-hidden">Remove {item.title} from comparison</span>
              </button>
            </li>
          ))}
        </ul>

        <p className="compare-bar-count">
          {compareItems.length} of {compareLimit} selected
        </p>

        <div className="compare-bar-actions">
          <button type="button" className="btn btn-ghost" onClick={clearCompare}>
            Clear
          </button>
          <Link className="btn btn-primary" to="/compare">
            Compare now
          </Link>
        </div>
      </div>
    </div>
  )
}

export default CompareBar
