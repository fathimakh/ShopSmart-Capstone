import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { FiCpu, FiSend, FiShoppingBag, FiTrash2, FiZap } from 'react-icons/fi'
import { useCatalog } from '../context/CatalogContext'
import useShoppingAssistant from '../hooks/useShoppingAssistant'
import usePageTitle from '../hooks/usePageTitle'
import ProductCard from '../components/ProductCard/ProductCard'
import { pluralize } from '../utils/format'
import { describeEngine } from '../utils/aiSearch'
import { ASSISTANT_FOLLOW_UPS, ASSISTANT_OPENERS } from '../utils/assistantPrompts'
import { getAiStatus } from '../services/ai'
import './Assistant.css'


function Assistant() {
  usePageTitle('Shopping assistant')
  const { status } = useCatalog()
  const { messages, isThinking, ask, clear, resolveProducts } = useShoppingAssistant()
  const [value, setValue] = useState('')
  const location = useLocation()
  const navigate = useNavigate()
  const thread = useRef(null)
  const pendingQuery = location.state?.query
  const handledHandoff = useRef(null)
  // true or false once the server has said whether Gemini is set up, null until then.
  const [aiEnabled, setAiEnabled] = useState(null)

  useEffect(() => {
    let active = true
    getAiStatus().then((enabled) => {
      if (active) setAiEnabled(enabled)
    })
    return () => {
      active = false
    }
  }, [])

  // A question typed on the shop page is carried over and asked once on arrival. The
  // location key guards against StrictMode running this twice for the same handoff.
  useEffect(() => {
    if (!pendingQuery || status === 'loading') return
    if (handledHandoff.current === location.key) return
    handledHandoff.current = location.key
    ask(pendingQuery)
    navigate('/assistant', { replace: true, state: null })
  }, [pendingQuery, status, ask, navigate, location.key])

  // Bring the latest question to the top of the screen so the answer reads downwards,
  // rather than dropping the shopper at the bottom of a long result list.
  useEffect(() => {
    const questions = thread.current?.querySelectorAll('.assistant-bubble.is-user')
    questions?.[questions.length - 1]?.scrollIntoView({ block: 'start' })
  }, [messages])

  // Send stays focusable while it cannot be used (aria-disabled), so focus is not lost
  // when the message box empties after sending; an early press is ignored here.
  const send = (event) => {
    event.preventDefault()
    if (!value.trim() || isThinking) return
    ask(value)
    setValue('')
  }

  const openInShop = (message) => {
    navigate('/', {
      state: {
        aiSearch: {
          filters: message.filters,
          sortBy: message.sortBy,
          keywords: message.keywords,
          chips: message.chips,
          summary: message.text,
          source: message.source,
          fallbackReason: message.fallbackReason || null
        }
      }
    })
  }

  return (
    <div className="container assistant">
      <header className="assistant-intro">
        <span className="assistant-intro-icon" aria-hidden="true">
          <FiZap />
        </span>
        <div>
          <h1>Shopping assistant</h1>
          <p>
            Describe what you need in your own words, then keep refining. Each answer
            remembers the one before it, so "show cheaper options" does what you expect.
          </p>
          {aiEnabled !== null ? (
            <p className="assistant-mode">
              <FiCpu aria-hidden="true" />
              {aiEnabled
                ? 'Google Gemini reads your messages on the ShopSmart server. If it cannot answer, a simpler reader on this device steps in.'
                : 'Gemini is not set up on this server right now, so a simpler reader on this device answers instead. It understands budgets, brands, categories and ratings.'}
            </p>
          ) : null}
        </div>
        {messages.length ? (
          <button type="button" className="btn btn-outline assistant-clear" onClick={clear}>
            <FiTrash2 aria-hidden="true" />
            Clear chat
          </button>
        ) : null}
      </header>

      <div
        className="assistant-thread"
        role="log"
        aria-live="polite"
        aria-label="Conversation"
        ref={thread}
      >
        {!messages.length ? (
          <div className="assistant-empty">
            <p>Ask me anything about the catalogue. For example:</p>
            <ul>
              {ASSISTANT_OPENERS.map((opener) => (
                <li key={opener}>
                  <button type="button" onClick={() => ask(opener)}>
                    {opener}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {messages.map((message) =>
          message.role === 'user' ? (
            <p key={message.id} className="assistant-bubble is-user">
              {message.text}
            </p>
          ) : (
            <article key={message.id} className="assistant-answer">
              <span className="assistant-avatar" aria-hidden="true">
                <FiZap />
              </span>

              <div className="assistant-answer-body">
                <p className="assistant-bubble">{message.text}</p>

                {message.chips.length ? (
                  <ul className="assistant-chips">
                    {message.chips.map((chip) => (
                      <li key={chip} className="badge badge-primary">
                        {chip}
                      </li>
                    ))}
                  </ul>
                ) : null}

                {message.productIds.length ? (
                  <div className="assistant-results-card">
                    <div className="assistant-results-head">
                      <p>
                        <FiShoppingBag aria-hidden="true" />
                        {message.total > message.productIds.length
                          ? `Showing ${message.productIds.length} of ${pluralize(message.total, 'match', 'matches')}`
                          : pluralize(message.total, 'match', 'matches')}
                      </p>
                      <button
                        type="button"
                        className="btn btn-outline"
                        onClick={() => openInShop(message)}
                      >
                        Open in shop
                      </button>
                    </div>

                    <ul className="assistant-results">
                      {resolveProducts(message.productIds).map((product) => (
                        <li key={product.id}>
                          <ProductCard product={product} />
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                <p className="assistant-engine">
                  <FiCpu aria-hidden="true" />
                  {describeEngine(message)}
                </p>
              </div>
            </article>
          )
        )}

        {isThinking ? (
          <div className="assistant-answer">
            <span className="assistant-avatar" aria-hidden="true">
              <FiZap />
            </span>
            <p className="assistant-bubble is-thinking">
              Looking through the catalogue
              <span className="assistant-dots" aria-hidden="true">
                <i />
                <i />
                <i />
              </span>
            </p>
          </div>
        ) : null}
      </div>

      {messages.length && !isThinking ? (
        <ul className="assistant-followups">
          {ASSISTANT_FOLLOW_UPS.map((followUp) => (
            <li key={followUp}>
              <button type="button" onClick={() => ask(followUp)}>
                {followUp}
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      <form className="assistant-form" onSubmit={send}>
        <label className="visually-hidden" htmlFor="assistant-input">
          Message the shopping assistant
        </label>
        <input
          id="assistant-input"
          type="text"
          value={value}
          placeholder="Ask for a product, a budget, a brand or a refinement"
          onChange={(event) => setValue(event.target.value)}
          disabled={status === 'loading'}
        />
        <button type="submit" className="btn btn-primary" aria-disabled={!value.trim() || isThinking}>
          <FiSend aria-hidden="true" />
          {isThinking ? 'Thinking' : 'Send'}
        </button>
      </form>
    </div>
  )
}

export default Assistant
