import { useEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'

// Pages are lazy loaded, so the new heading can take a moment to appear.
const MAX_FRAMES = 60

/**
 * Moves keyboard and screen reader focus to the new page's h1 after client side
 * navigation, the way a full page load would start at the top. Pages that already put
 * focus inside the main area themselves (a form field, say) are left alone.
 */
export default function useRouteFocus(mainId = 'main-content') {
  const { pathname } = useLocation()
  // Compared with the path rather than counting renders, because StrictMode runs the
  // effect twice on the first load, where focus must stay at the top of the document.
  const lastPathname = useRef(pathname)

  useEffect(() => {
    if (lastPathname.current === pathname) return undefined
    lastPathname.current = pathname

    let frame = 0
    let handle

    const focusHeading = () => {
      const main = document.getElementById(mainId)
      if (!main || main.contains(document.activeElement)) return
      const heading = main.querySelector('h1')

      if (!heading) {
        frame += 1
        if (frame < MAX_FRAMES) handle = window.requestAnimationFrame(focusHeading)
        else main.focus({ preventScroll: true })
        return
      }

      if (!heading.hasAttribute('tabindex')) heading.setAttribute('tabindex', '-1')
      heading.focus({ preventScroll: true })
    }

    handle = window.requestAnimationFrame(focusHeading)
    return () => window.cancelAnimationFrame(handle)
  }, [pathname, mainId])
}
