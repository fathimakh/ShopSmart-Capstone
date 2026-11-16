import { useEffect, useRef, useState } from 'react'
import { FiSearch } from 'react-icons/fi'
import useDebounce from '../../../hooks/useDebounce'
import './AdminSearch.css'

/**
 * The search box above an admin list. It searches once typing pauses, or straight away
 * on Enter, so the list is not asked for again on every key press. value is the search
 * the list is showing (read from the address bar), and the box follows it when it
 * changes elsewhere, for example when the filters are reset or the back button is used.
 */
function AdminSearch({ id, label, value, onSearch, placeholder, hint, maxLength = 100 }) {
  const [text, setText] = useState(value)
  const debounced = useDebounce(text, 400)
  const latestSearch = useRef(onSearch)
  latestSearch.current = onSearch
  const latestValue = useRef(value)
  latestValue.current = value

  useEffect(() => {
    setText(value)
  }, [value])

  // Only a pause in typing searches; a change of value from outside never does, or a
  // reset would bring the old words straight back.
  useEffect(() => {
    const words = debounced.trim()
    if (words !== latestValue.current) latestSearch.current(words)
  }, [debounced])

  return (
    <div className="admin-filter admin-search">
      <label htmlFor={id}>{label}</label>
      <div className="admin-search-box">
        <FiSearch aria-hidden="true" />
        <input
          id={id}
          type="search"
          value={text}
          placeholder={placeholder}
          maxLength={maxLength}
          autoComplete="off"
          aria-describedby={hint ? `${id}-hint` : undefined}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== 'Enter') return
            event.preventDefault()
            const words = text.trim()
            if (words !== value) onSearch(words)
          }}
        />
      </div>
      {hint ? (
        <p id={`${id}-hint`} className="visually-hidden">
          {hint}
        </p>
      ) : null}
    </div>
  )
}

export default AdminSearch
