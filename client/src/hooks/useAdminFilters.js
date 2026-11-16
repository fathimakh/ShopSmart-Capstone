import { useCallback, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'

/**
 * The filters of an admin list, kept in the address bar so a filtered page can be
 * bookmarked, shared, reloaded and reached from a dashboard link such as
 * /admin/orders?status=processing.
 *
 *   const [filters, setFilters] = useAdminFilters({ q: '', status: '' })
 *   setFilters({ status: 'shipped' })
 *
 * defaults lists every filter with the value it has when missing from the address; a
 * filter set back to its default is removed from the address again. filters.page is
 * always a whole number from 1. Changing any other filter goes back to page 1, because
 * page 4 of the old results means nothing for the new ones.
 */
export default function useAdminFilters(defaults) {
  const [searchParams, setSearchParams] = useSearchParams()

  const filters = useMemo(() => {
    const values = {}
    Object.entries(defaults).forEach(([key, fallback]) => {
      values[key] = searchParams.get(key) ?? fallback
    })
    const page = Number.parseInt(searchParams.get('page'), 10)
    values.page = Number.isInteger(page) && page > 0 ? page : 1
    return values
  }, [searchParams, defaults])

  const setFilters = useCallback(
    (changes, { replace = false } = {}) => {
      setSearchParams(
        (current) => {
          const next = new URLSearchParams(current)
          Object.entries(changes).forEach(([key, value]) => {
            const text = value === undefined || value === null ? '' : String(value)
            const isDefault = key === 'page' ? text === '1' : text === String(defaults[key] ?? '')
            if (!text || isDefault) next.delete(key)
            else next.set(key, text)
          })
          if (Object.keys(changes).some((key) => key !== 'page')) next.delete('page')
          return next
        },
        { replace }
      )
    },
    [setSearchParams, defaults]
  )

  const resetFilters = useCallback(() => setSearchParams(new URLSearchParams()), [setSearchParams])

  return [filters, setFilters, resetFilters]
}
