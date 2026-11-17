import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import ReviewSummary from './ReviewSummary'
import { resetAiStatus } from '../../services/ai'
import { fakeApi } from '../../test/fakeApi'

describe('ReviewSummary', () => {
  afterEach(() => resetAiStatus())

  it('does not ask for a summary the server cannot write without a Gemini key', async () => {
    const api = fakeApi({
      'GET /ai/status': () => [200, { success: true, enabled: false, model: 'gemini-2.5-flash' }],
      'GET /products/1/review-summary': () => [
        503,
        { success: false, message: 'The AI assistant is not set up on this server.', code: 'AI_UNAVAILABLE' }
      ]
    })
    render(<ReviewSummary productId={1} />)

    expect(await screen.findByText(/The AI summary of these reviews is not available right now/)).toBeInTheDocument()
    expect(api.callsTo('GET /products/1/review-summary')).toHaveLength(0)
  })

  it('asks for the summary when Gemini is set up', async () => {
    const api = fakeApi({
      'GET /ai/status': () => [200, { success: true, enabled: true, model: 'gemini-2.5-flash' }],
      'GET /products/1/review-summary': () => [
        200,
        {
          success: true,
          summary: { verdict: 'Shoppers like it.', pros: [], cons: [], basedOn: 3, generatedAt: '2026-11-16T21:50:02.114Z' },
          cached: true
        }
      ]
    })
    render(<ReviewSummary productId={1} />)

    expect(await screen.findByText('Shoppers like it.')).toBeInTheDocument()
    expect(api.callsTo('GET /products/1/review-summary')).toHaveLength(1)
  })
})
