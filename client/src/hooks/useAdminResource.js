import { useCallback, useEffect, useState } from 'react'
import { api, isAbortError } from '../services/http'
import { buildQuery } from '../services/adminApi'

/**
 * Loads one admin resource: GET path with params, again whenever either changes or
 * reload() is called.
 *
 * - A request that has been replaced is cancelled, and only the latest answer is kept,
 *   so a slow page 1 can never overwrite page 2.
 * - The last answer stays in data while a new one loads, so a table does not flash
 *   empty between pages. Detail views pass keepPreviousData: false, because showing
 *   order A while order B loads would be wrong rather than smooth.
 * - setData patches the stored answer after a change, without another request.
 *
 * Returns { data, status ('idle' | 'loading' | 'success' | 'error'), error, isRefreshing,
 * reload, setData }. isRefreshing means data is on screen while a newer answer loads.
 */
export default function useAdminResource(path, { params, enabled = true, keepPreviousData = true } = {}) {
  const [reloadCount, setReloadCount] = useState(0)
  const [result, setResult] = useState({ key: null, url: null, data: undefined, error: null })

  const url = enabled && path ? `${path}${buildQuery(params)}` : null
  const requestKey = url ? `${url}#${reloadCount}` : null

  useEffect(() => {
    if (!requestKey) return undefined
    const controller = new AbortController()

    api
      .get(url, { signal: controller.signal })
      .then((body) => {
        if (!controller.signal.aborted) setResult({ key: requestKey, url, data: body, error: null })
      })
      .catch((error) => {
        if (controller.signal.aborted || isAbortError(error)) return
        // A failed refresh keeps the last good answer for the same address on screen.
        setResult((previous) => ({
          key: requestKey,
          url: previous.url,
          data: previous.data,
          error
        }))
      })

    return () => controller.abort()
  }, [url, requestKey])

  // Worked out from the request key rather than stored, so a new key reads as loading on
  // the very render that asks for it.
  let status = 'idle'
  if (requestKey) {
    if (result.key !== requestKey) status = 'loading'
    else status = result.error ? 'error' : 'success'
  }

  const data = keepPreviousData || result.url === url ? result.data : undefined

  const reload = useCallback(() => setReloadCount((count) => count + 1), [])

  const setData = useCallback((updater) => {
    setResult((previous) => ({
      ...previous,
      data: typeof updater === 'function' ? updater(previous.data) : updater
    }))
  }, [])

  return {
    data,
    status,
    error: status === 'error' ? result.error : null,
    isRefreshing: status === 'loading' && data !== undefined,
    reload,
    setData
  }
}
