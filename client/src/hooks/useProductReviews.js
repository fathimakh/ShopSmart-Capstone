import { useCallback, useEffect, useRef, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { useCatalog } from '../context/CatalogContext'
import { deleteReview, fetchReviews, saveReview } from '../services/reviews'
import { isAbortError } from '../services/http'
import { appendReviews, withSavedReview } from '../utils/reviews'

export const REVIEWS_PAGE_SIZE = 5

const emptyReviews = {
  status: 'loading',
  error: null,
  reviews: [],
  total: 0,
  stats: null,
  myReview: null
}

/**
 * The reviews of one product: the list (paged with "show more"), the star breakdown and
 * the signed in shopper's own review, with saving and deleting it. Every answer carries
 * the product's new rating, which is copied into the catalogue so the rest of the page
 * (and the product cards elsewhere) show it at once.
 */
export default function useProductReviews(productId) {
  const { user, status: authStatus } = useAuth()
  const { updateProduct } = useCatalog()
  const userId = user ? user._id : null
  // The answer depends on who asks (myReview), so wait for a stored session to be checked.
  const authSettled = authStatus !== 'checking'

  const [state, setState] = useState(emptyReviews)
  const [attempt, setAttempt] = useState(0)
  const [more, setMore] = useState({ loading: false, error: null })
  // Goes up with every change the shopper makes, so the AI summary knows to look again.
  const [revision, setRevision] = useState(0)
  const moreRequest = useRef(null)

  const applyStats = useCallback(
    (stats) => {
      if (stats) updateProduct(productId, { rating: stats.rating, reviewCount: stats.reviewCount })
    },
    [productId, updateProduct]
  )

  useEffect(() => {
    if (!authSettled) return undefined
    const controller = new AbortController()
    if (moreRequest.current) moreRequest.current.abort()
    setState(emptyReviews)
    setMore({ loading: false, error: null })

    fetchReviews(productId, { limit: REVIEWS_PAGE_SIZE, signal: controller.signal })
      .then((data) => {
        setState({
          status: 'ready',
          error: null,
          reviews: data.reviews,
          total: data.pagination.total,
          stats: data.stats,
          myReview: data.myReview
        })
        // Someone else may have reviewed it since the catalogue loaded.
        applyStats(data.stats)
      })
      .catch((error) => {
        if (isAbortError(error)) return
        setState({ ...emptyReviews, status: 'error', error })
      })

    return () => controller.abort()
  }, [productId, userId, authSettled, attempt, applyStats])

  // A "show more" still on its way is dropped when the page goes.
  useEffect(() => () => moreRequest.current?.abort(), [])

  const retry = useCallback(() => setAttempt((count) => count + 1), [])

  const loadMore = useCallback(async () => {
    if (moreRequest.current) return
    const controller = new AbortController()
    moreRequest.current = controller
    setMore({ loading: true, error: null })

    // Counted from what is shown, so a review added or removed here does not skip one.
    const page = Math.floor(state.reviews.length / REVIEWS_PAGE_SIZE) + 1
    try {
      const data = await fetchReviews(productId, { page, limit: REVIEWS_PAGE_SIZE, signal: controller.signal })
      setState((current) => ({
        ...current,
        reviews: appendReviews(current.reviews, data.reviews),
        total: data.pagination.total,
        stats: data.stats
      }))
      setMore({ loading: false, error: null })
    } catch (error) {
      if (!isAbortError(error)) setMore({ loading: false, error })
    } finally {
      if (moreRequest.current === controller) moreRequest.current = null
    }
  }, [productId, state.reviews.length])

  const save = useCallback(
    async (values) => {
      const { review, stats } = await saveReview(productId, values)
      setState((current) => ({
        ...current,
        reviews: withSavedReview(current.reviews, review),
        total: current.myReview ? current.total : current.total + 1,
        stats,
        myReview: review
      }))
      applyStats(stats)
      setRevision((count) => count + 1)
      return review
    },
    [productId, applyStats]
  )

  const remove = useCallback(
    async (reviewId) => {
      const { stats } = await deleteReview(productId, reviewId)
      setState((current) => ({
        ...current,
        reviews: current.reviews.filter((review) => review._id !== reviewId),
        total: Math.max(current.total - 1, 0),
        stats,
        myReview: current.myReview && current.myReview._id === reviewId ? null : current.myReview
      }))
      applyStats(stats)
      setRevision((count) => count + 1)
    },
    [productId, applyStats]
  )

  return {
    ...state,
    hasMore: state.status === 'ready' && state.reviews.length < state.total,
    loadingMore: more.loading,
    moreError: more.error,
    revision,
    retry,
    loadMore,
    save,
    remove
  }
}
