import { useCallback, useMemo, useRef, useState } from 'react'
import { useCatalog } from '../context/CatalogContext'
import useLocalStorage from './useLocalStorage'
import { getAiStatus, searchWithAi } from '../services/ai'
import { mergeWithPrevious, parseQuery, rankByRelevance } from '../utils/nlpSearch'
import { buildTextIndex } from '../utils/textIndex'
import { applyFilters, countActiveFilters, sortProducts } from '../utils/filters'
import { pluralize } from '../utils/format'
import { buildAiRequest, fallbackReason, fromAiResult } from '../utils/aiSearch'

const CHAT_KEY = 'shopsmart:conversation'
const RESULTS_PER_ANSWER = 6

function createId(role) {
  return `${role}-${Date.now()}-${Math.round(Math.random() * 1000)}`
}

function fallbackReply(count) {
  if (!count) {
    return 'I could not find anything for that. Try a wider price range or a different category.'
  }
  return count === 1
    ? 'Here is 1 product that matches.'
    : `Here are ${pluralize(count, 'product')} that match.`
}

/**
 * Asks Gemini on the server to read the message. Resolves with the parsed answer, or with
 * { reason } saying why the on-device parser has to answer instead. It never throws: a
 * search box must answer even when the AI cannot.
 */
async function readWithGemini(query, previous, catalogue) {
  const body = buildAiRequest(query, previous)
  if (!body) return { reason: fallbackReason({ code: 'SHORT_QUERY' }) }

  // Asking first spares a request (and the AI rate limit) when no key is configured.
  const enabled = await getAiStatus()
  if (enabled === false) return { reason: fallbackReason(null, false) }

  try {
    const answer = fromAiResult(await searchWithAi(body), catalogue)
    if (countActiveFilters(answer.filters) || answer.keywords.length) return { answer }
    return { reason: fallbackReason(null) }
  } catch (error) {
    return { reason: fallbackReason(error) }
  }
}

/**
 * Owns the assistant conversation: reads each message, turns it into filters, and
 * answers with the products that match. Gemini reads the message through the ShopSmart
 * server; when it cannot (no key, busy, too slow, offline) the on-device parser answers,
 * and the reply says which of the two it was.
 */
export default function useShoppingAssistant() {
  const { products, categories, brands } = useCatalog()
  const [messages, setMessages] = useLocalStorage(CHAT_KEY, [])
  const [isThinking, setIsThinking] = useState(false)
  // Set at once, unlike state, so a second call in the same tick (StrictMode running an
  // effect twice, a double click) is ignored and one question makes one server call.
  const busy = useRef(false)

  const textIndex = useMemo(() => buildTextIndex(products), [products])

  const lastAnswer = useMemo(
    () => [...messages].reverse().find((message) => message.role === 'assistant' && message.filters),
    [messages]
  )

  const ask = useCallback(
    async (rawQuery) => {
      const query = rawQuery.trim()
      if (!query || busy.current) return
      busy.current = true

      setMessages((current) => [...current, { id: createId('you'), role: 'user', text: query }])
      setIsThinking(true)

      const previous = lastAnswer ? { query: lastAnswer.query, filters: lastAnswer.filters } : null
      const { answer, reason } = await readWithGemini(query, previous, { categories, brands })

      const parsed =
        answer ||
        mergeWithPrevious(
          parseQuery(query, { categories, brands }),
          previous ? previous.filters : null
        )

      const filtered = applyFilters(products, parsed.filters)
      const ranked = rankByRelevance(filtered, textIndex, parsed.keywords)
      const matches = parsed.sortBy ? sortProducts(ranked, parsed.sortBy) : ranked

      setMessages((current) => [
        ...current,
        {
          id: createId('assistant'),
          role: 'assistant',
          query,
          text: parsed.summary || fallbackReply(matches.length),
          chips: parsed.chips,
          filters: parsed.filters,
          sortBy: parsed.sortBy,
          keywords: parsed.keywords,
          source: parsed.source,
          fallbackReason: answer ? null : reason,
          total: matches.length,
          productIds: matches.slice(0, RESULTS_PER_ANSWER).map((product) => product.id)
        }
      ])
      setIsThinking(false)
      busy.current = false
    },
    [lastAnswer, categories, brands, products, textIndex, setMessages]
  )

  const clear = useCallback(() => setMessages([]), [setMessages])

  const resolveProducts = useCallback(
    (ids) => ids.map((id) => products.find((product) => product.id === id)).filter(Boolean),
    [products]
  )

  return { messages, isThinking, ask, clear, resolveProducts }
}
