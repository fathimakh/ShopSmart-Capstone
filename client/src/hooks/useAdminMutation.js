import { useCallback, useRef, useState } from 'react'
import useAdminToast from './useAdminToast'

/**
 * Runs admin changes (save, delete, change a status) and remembers which one is running.
 *
 *   const { run, pendingKey, error, resetError } = useAdminMutation()
 *   const { ok, data } = await run(`delete:${id}`, () => deleteProduct(id), {
 *     successMessage: 'Product deleted'
 *   })
 *
 * run never throws: it resolves to { ok, data, error }, so a page can branch on the
 * answer without a try block. The last failure stays in error together with errorKey,
 * the key of the action that failed, so the right dialog or row can show it. While one
 * change is running a second run is refused, which stops a double click sending twice.
 */
export default function useAdminMutation() {
  const notify = useAdminToast()
  const [pendingKey, setPendingKey] = useState(null)
  const [failure, setFailure] = useState({ key: null, error: null })
  const running = useRef(false)

  const run = useCallback(
    async (key, request, { successMessage } = {}) => {
      if (running.current) return { ok: false, data: null, error: null, skipped: true }
      running.current = true
      setPendingKey(key)
      setFailure({ key: null, error: null })

      try {
        const data = await request()
        if (successMessage) {
          notify(typeof successMessage === 'function' ? successMessage(data) : successMessage)
        }
        return { ok: true, data, error: null }
      } catch (error) {
        setFailure({ key, error })
        return { ok: false, data: null, error }
      } finally {
        running.current = false
        setPendingKey(null)
      }
    },
    [notify]
  )

  const resetError = useCallback(() => setFailure({ key: null, error: null }), [])

  return {
    run,
    pendingKey,
    isPending: pendingKey !== null,
    error: failure.error,
    errorKey: failure.key,
    resetError
  }
}
