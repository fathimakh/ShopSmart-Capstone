import { api, bearer, createProduct, createUser, env, useTestDatabase } from './helpers/testApp.js'
import assert from 'node:assert/strict'
import { after, before, beforeEach, describe, it } from 'node:test'
import Product from '../models/product.js'
import Review from '../models/review.js'

useTestDatabase('ai')

const FAKE_KEY = 'test-gemini-key'

/** A Gemini generateContent response whose text is the given answer. */
function geminiReply(answer, { status = 200 } = {}) {
  const text = typeof answer === 'string' ? answer : JSON.stringify(answer)
  return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text }] }, finishReason: 'STOP' }] }), {
    status,
    headers: { 'Content-Type': 'application/json' }
  })
}

/** Replaces fetch for one test; node:test puts the original back afterwards. */
function stubGemini(t, respond) {
  return t.mock.method(globalThis, 'fetch', async (url, options) => respond(url, options))
}

function requestBody(fetchMock, call = 0) {
  return JSON.parse(fetchMock.mock.calls[call].arguments[1].body)
}

const searchAnswer = (overrides = {}) => ({
  categories: ['smartphones'],
  brands: ['Apple'],
  minPrice: null,
  maxPrice: 1000,
  minRating: 4,
  onSale: false,
  sortBy: 'rating',
  keywords: ['camera'],
  summary: 'Well rated Apple phones under $1000.',
  ...overrides
})

before(async () => {
  await createProduct({ category: 'smartphones', brand: 'Apple' })
  await createProduct({ category: 'smartphones', brand: 'Samsung' })
  await createProduct({ category: 'laptops', brand: 'Apple' })
  await createProduct({ category: 'mens-shoes', brand: 'Nike' })
  // A blank brand, as an admin edit can leave, is never offered to the model.
  await createProduct({ category: 'mens-shoes', brand: '' })
})

beforeEach(() => {
  env.geminiApiKey = FAKE_KEY
  env.geminiTimeoutMs = 2000
})

after(() => {
  env.geminiApiKey = ''
})

describe('GET /api/ai/status', () => {
  it('says whether a Gemini key is configured', async () => {
    const on = await api().get('/api/ai/status').expect(200)
    assert.deepEqual(on.body, { success: true, enabled: true, model: 'gemini-3.5-flash-lite' })

    env.geminiApiKey = ''
    const off = await api().get('/api/ai/status').expect(200)
    assert.equal(off.body.enabled, false)
  })
})

describe('POST /api/ai/search', () => {
  it('turns a message into filters checked against the real catalogue', async (t) => {
    const fetchMock = stubGemini(t, () =>
      geminiReply(
        searchAnswer({
          categories: ['smartphones', 'teleporters', 'SMARTPHONES'],
          brands: ['apple', 'Nokia'],
          minPrice: 900.456,
          maxPrice: 300,
          minRating: 7,
          onSale: true,
          sortBy: 'cheapest',
          keywords: ['Wireless Charging', 'ok', '"camera"', 'camera'],
          summary: '  Here are   Apple phones. '
        })
      )
    )

    const res = await api().post('/api/ai/search').send({ query: 'apple phone with wireless charging' }).expect(200)
    assert.deepEqual(res.body, {
      success: true,
      source: 'gemini',
      result: {
        categories: ['smartphones'],
        brands: ['Apple'],
        minPrice: 300,
        maxPrice: 900.46,
        minRating: null,
        onSale: true,
        sortBy: 'relevance',
        keywords: ['wireless', 'charging', 'camera'],
        summary: 'Here are Apple phones.'
      }
    })

    assert.equal(fetchMock.mock.callCount(), 1)
    const [url, options] = fetchMock.mock.calls[0].arguments
    assert.equal(url, 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent')
    assert.equal(options.headers['x-goog-api-key'], FAKE_KEY)
    assert.equal(url.includes(FAKE_KEY), false, 'the key never goes in the URL')

    const body = requestBody(fetchMock)
    const prompt = body.contents[0].parts[0].text
    assert.match(prompt, /^Categories: laptops, mens-shoes, smartphones$/m)
    assert.match(prompt, /^Brands: Apple, Nike, Samsung$/m)
    assert.match(prompt, /^Shopper message: apple phone with wireless charging$/m)
    assert.equal(body.generationConfig.responseMimeType, 'application/json')
    assert.deepEqual(body.generationConfig.responseSchema.properties.categories.items.enum, ['laptops', 'mens-shoes', 'smartphones'])
    assert.deepEqual(body.generationConfig.thinkingConfig, { thinkingLevel: 'minimal' })
    assert.equal('temperature' in body.generationConfig, false, 'Gemini 3 models ignore temperature')
  })

  it('sends each model only the thinking and temperature settings it accepts', async (t) => {
    const model = env.geminiModel
    t.after(() => {
      env.geminiModel = model
    })
    const fetchMock = stubGemini(t, () => geminiReply(searchAnswer()))
    const configFor = async (name) => {
      env.geminiModel = name
      await api().post('/api/ai/search').send({ query: 'apple phones' }).expect(200)
      const { temperature, thinkingConfig } = requestBody(fetchMock, fetchMock.mock.callCount() - 1).generationConfig
      return { temperature, thinkingConfig }
    }

    assert.deepEqual(await configFor('gemini-2.5-flash-lite'), { temperature: 0.1, thinkingConfig: { thinkingBudget: 0 } })
    assert.deepEqual(await configFor('gemini-3.6-flash'), { temperature: undefined, thinkingConfig: { thinkingLevel: 'minimal' } })
    // No minimal level on this model, so it keeps its own default.
    assert.deepEqual(await configFor('gemini-3.8-flash'), { temperature: undefined, thinkingConfig: undefined })
  })

  it('sends the earlier request so a follow up refines it', async (t) => {
    const fetchMock = stubGemini(t, () => geminiReply(searchAnswer({ brands: ['Samsung'] })))
    const previous = { query: 'phones under 1000', filters: { categories: ['smartphones'], maxPrice: 1000 } }

    const res = await api().post('/api/ai/search').send({ query: 'only samsung', previous }).expect(200)
    assert.deepEqual(res.body.result.brands, ['Samsung'])

    const prompt = requestBody(fetchMock).contents[0].parts[0].text
    assert.match(prompt, /^Earlier request: phones under 1000$/m)
    assert.match(prompt, /^Filters used for it: \{"categories":\["smartphones"\],"maxPrice":1000\}$/m)
  })

  it('drops filler words a filter already covers from the keywords', async (t) => {
    stubGemini(t, () => geminiReply(searchAnswer({ minRating: 4, keywords: ['good reviews', 'Cheap', 'camera', 'best'] })))
    const res = await api().post('/api/ai/search').send({ query: 'a cheap phone with a camera and good reviews' }).expect(200)
    assert.deepEqual(res.body.result.keywords, ['camera'])
    assert.equal(res.body.result.minRating, 4)
  })

  it('asks Gemini to lower the price cap when the shopper wants cheaper options', async (t) => {
    const fetchMock = stubGemini(t, () => geminiReply(searchAnswer()))
    await api().post('/api/ai/search').send({ query: 'show cheaper options' }).expect(200)
    assert.match(requestBody(fetchMock).systemInstruction.parts[0].text, /cheaper options must lower maxPrice/)
  })

  it('answers 502 AI_FAILED when the answer is not usable', async (t) => {
    const answers = [
      () => geminiReply('this is not json'),
      () => geminiReply({ summary: 'Missing every other field' }),
      () => geminiReply(searchAnswer({ categories: 'smartphones' })),
      () => new Response(JSON.stringify({ candidates: [{ finishReason: 'SAFETY' }] }), { status: 200 }),
      () => new Response('{"error":{"message":"API key not valid"}}', { status: 400 })
    ]
    for (const respond of answers) {
      stubGemini(t, respond)
      const res = await api().post('/api/ai/search').send({ query: 'running shoes' }).expect(502)
      assert.equal(res.body.code, 'AI_FAILED')
      t.mock.restoreAll()
    }
  })

  it('answers 503 AI_UNAVAILABLE when Gemini is over its quota, without retrying', async (t) => {
    const fetchMock = stubGemini(t, () => new Response('{}', { status: 429 }))
    const res = await api().post('/api/ai/search').send({ query: 'running shoes' }).expect(503)
    assert.equal(res.body.code, 'AI_UNAVAILABLE')
    assert.equal(fetchMock.mock.callCount(), 1)
  })

  it('retries once when Gemini is busy, and answers when the retry works', async (t) => {
    let calls = 0
    const fetchMock = stubGemini(t, () => (++calls === 1 ? new Response('{}', { status: 503 }) : geminiReply(searchAnswer())))
    const res = await api().post('/api/ai/search').send({ query: 'running shoes' }).expect(200)
    assert.deepEqual(res.body.result.categories, ['smartphones'])
    assert.equal(fetchMock.mock.callCount(), 2)
  })

  it('retries once after a dropped connection', async (t) => {
    let calls = 0
    const fetchMock = stubGemini(t, () => {
      if (++calls === 1) throw new TypeError('fetch failed')
      return geminiReply(searchAnswer())
    })
    await api().post('/api/ai/search').send({ query: 'running shoes' }).expect(200)
    assert.equal(fetchMock.mock.callCount(), 2)
  })

  it('answers 503 AI_UNAVAILABLE when Gemini is still busy after the retry', async (t) => {
    const fetchMock = stubGemini(t, () => new Response('{}', { status: 503 }))
    const res = await api().post('/api/ai/search').send({ query: 'running shoes' }).expect(503)
    assert.equal(res.body.code, 'AI_UNAVAILABLE')
    assert.equal(fetchMock.mock.callCount(), 2)
  })

  it('skips the retry when too little of the time limit is left', async (t) => {
    const fetchMock = stubGemini(t, async () => {
      // The first try uses up more than 60% of the 2 s limit.
      await new Promise((resolve) => setTimeout(resolve, 1300))
      return new Response('{}', { status: 503 })
    })
    const res = await api().post('/api/ai/search').send({ query: 'running shoes' }).expect(503)
    assert.equal(res.body.code, 'AI_UNAVAILABLE')
    assert.equal(fetchMock.mock.callCount(), 1)
  })

  it('never retries a reply that arrived but is not JSON', async (t) => {
    const fetchMock = stubGemini(t, () => new Response('<html>not json</html>', { status: 200 }))
    const res = await api().post('/api/ai/search').send({ query: 'running shoes' }).expect(502)
    assert.equal(res.body.code, 'AI_FAILED')
    assert.equal(fetchMock.mock.callCount(), 1)
  })

  it('never retries an answer Gemini rejected outright', async (t) => {
    const fetchMock = stubGemini(t, () => new Response('{"error":{"message":"API key not valid"}}', { status: 400 }))
    await api().post('/api/ai/search').send({ query: 'running shoes' }).expect(502)
    assert.equal(fetchMock.mock.callCount(), 1)
  })

  it('answers 504 AI_TIMEOUT when Gemini is too slow', async (t) => {
    env.geminiTimeoutMs = 50
    stubGemini(
      t,
      (url, { signal }) =>
        new Promise((resolve, reject) => {
          signal.addEventListener('abort', () => reject(new DOMException('The operation was aborted.', 'AbortError')))
        })
    )
    const res = await api().post('/api/ai/search').send({ query: 'running shoes' }).expect(504)
    assert.equal(res.body.code, 'AI_TIMEOUT')
  })

  it('answers 503 AI_UNAVAILABLE without a key, and never calls Gemini', async (t) => {
    env.geminiApiKey = ''
    const fetchMock = stubGemini(t, () => geminiReply(searchAnswer()))
    const res = await api().post('/api/ai/search').send({ query: 'running shoes' }).expect(503)
    assert.equal(res.body.code, 'AI_UNAVAILABLE')
    assert.equal(fetchMock.mock.callCount(), 0)
  })

  it('validates the message and the earlier request', async () => {
    const empty = await api().post('/api/ai/search').send({}).expect(400)
    assert.equal(empty.body.errors[0].field, 'query')

    const huge = await api()
      .post('/api/ai/search')
      .send({ query: 'cheaper', previous: { query: 'phones', filters: { keywords: ['x'.repeat(2100)] } } })
      .expect(400)
    assert.equal(huge.body.errors[0].field, 'previous.filters')
  })
})

describe('GET /api/products/:id/review-summary', () => {
  const summaryAnswer = {
    verdict: 'Shoppers like the sound but not the battery.',
    pros: ['Clear sound', 'clear sound', '  Comfortable fit  '],
    cons: ['Short battery life']
  }

  async function reviewedProduct(count = 3) {
    const product = await createProduct()
    await Review.insertMany(
      Array.from({ length: count }, (_, index) => {
        const writtenAt = new Date(Date.now() - (count - index) * 60000)
        return {
          product: product.id,
          reviewerName: `Reviewer ${index + 1}`,
          rating: 4,
          comment: `Review number ${index + 1}`,
          createdAt: writtenAt,
          updatedAt: writtenAt
        }
      }),
      { timestamps: false }
    )
    return product
  }

  it('has nothing to summarise without reviews', async (t) => {
    const fetchMock = stubGemini(t, () => geminiReply(summaryAnswer))
    const product = await createProduct()
    const res = await api().get(`/api/products/${product.id}/review-summary`).expect(200)
    assert.deepEqual(res.body, { success: true, summary: null, cached: false })
    assert.equal(fetchMock.mock.callCount(), 0)
  })

  it('writes a summary once and serves it from the cache until the reviews change', async (t) => {
    const fetchMock = stubGemini(t, () => geminiReply(summaryAnswer))
    const product = await reviewedProduct(3)

    const first = await api().get(`/api/products/${product.id}/review-summary`).expect(200)
    assert.equal(first.body.cached, false)
    assert.deepEqual(
      { ...first.body.summary, generatedAt: undefined },
      {
        verdict: 'Shoppers like the sound but not the battery.',
        pros: ['Clear sound', 'Comfortable fit'],
        cons: ['Short battery life'],
        basedOn: 3,
        generatedAt: undefined
      }
    )
    assert.ok(Date.parse(first.body.summary.generatedAt))

    const prompt = requestBody(fetchMock).contents[0].parts[0].text
    assert.ok(prompt.indexOf('Review number 3') < prompt.indexOf('Review number 1'), 'newest reviews come first')

    const second = await api().get(`/api/products/${product.id}/review-summary`).expect(200)
    assert.equal(second.body.cached, true)
    assert.deepEqual(second.body.summary, first.body.summary)
    assert.equal(fetchMock.mock.callCount(), 1)

    const { token } = await createUser()
    await api()
      .post(`/api/products/${product.id}/reviews`)
      .set(bearer(token))
      .send({ rating: 2, comment: 'The battery died in a week' })
      .expect(201)

    const third = await api().get(`/api/products/${product.id}/review-summary`).expect(200)
    assert.equal(third.body.cached, false)
    assert.equal(third.body.summary.basedOn, 4)
    assert.equal(fetchMock.mock.callCount(), 2)
  })

  it('reads at most the newest 50 reviews', async (t) => {
    const fetchMock = stubGemini(t, () => geminiReply(summaryAnswer))
    const product = await reviewedProduct(52)
    const res = await api().get(`/api/products/${product.id}/review-summary`).expect(200)
    assert.equal(res.body.summary.basedOn, 50)
    assert.doesNotMatch(requestBody(fetchMock).contents[0].parts[0].text, /"Review number 1"/)
  })

  it('still serves a cached summary when the key is removed', async (t) => {
    stubGemini(t, () => geminiReply(summaryAnswer))
    const product = await reviewedProduct()
    await api().get(`/api/products/${product.id}/review-summary`).expect(200)

    env.geminiApiKey = ''
    const res = await api().get(`/api/products/${product.id}/review-summary`).expect(200)
    assert.equal(res.body.cached, true)

    const fresh = await reviewedProduct()
    const missing = await api().get(`/api/products/${fresh.id}/review-summary`).expect(503)
    assert.equal(missing.body.code, 'AI_UNAVAILABLE')
  })

  it('caches nothing when the answer is unusable', async (t) => {
    stubGemini(t, () => geminiReply({ verdict: '   ', pros: [], cons: [] }))
    const product = await reviewedProduct()
    const res = await api().get(`/api/products/${product.id}/review-summary`).expect(502)
    assert.equal(res.body.code, 'AI_FAILED')

    const stored = await Product.findOne({ id: product.id }).select('+reviewSummary')
    assert.equal(stored.reviewSummary, null)
  })

  it('answers 404 for an unknown product', async () => {
    const res = await api().get('/api/products/999999/review-summary').expect(404)
    assert.equal(res.body.code, 'PRODUCT_NOT_FOUND')
  })

  it('writes one summary for shoppers who open the product at the same moment', async (t) => {
    const fetchMock = stubGemini(t, async () => {
      await new Promise((resolve) => setTimeout(resolve, 50))
      return geminiReply(summaryAnswer)
    })
    const product = await reviewedProduct()

    const answers = await Promise.all(
      Array.from({ length: 3 }, () => api().get(`/api/products/${product.id}/review-summary`))
    )
    assert.deepEqual(answers.map((res) => res.status), [200, 200, 200])
    assert.ok(answers.every((res) => res.body.summary.generatedAt === answers[0].body.summary.generatedAt))
    assert.equal(fetchMock.mock.callCount(), 1)
  })

  it('stops writing new summaries once the daily budget is spent, but still serves cached ones', async (t) => {
    const fetchMock = stubGemini(t, () => geminiReply(summaryAnswer))
    const cachedProduct = await reviewedProduct()
    await api().get(`/api/products/${cachedProduct.id}/review-summary`).expect(200)

    const dailyMax = env.aiSummaryDailyMax
    t.after(() => {
      env.aiSummaryDailyMax = dailyMax
    })
    env.aiSummaryDailyMax = 0

    const fresh = await reviewedProduct()
    const spent = await api().get(`/api/products/${fresh.id}/review-summary`).expect(503)
    assert.equal(spent.body.code, 'AI_UNAVAILABLE')
    const cached = await api().get(`/api/products/${cachedProduct.id}/review-summary`).expect(200)
    assert.equal(cached.body.cached, true)
    assert.equal(fetchMock.mock.callCount(), 1)
  })

  it('counts fresh summaries apart from the AI search allowance', async (t) => {
    stubGemini(t, (url, options) =>
      geminiReply(options.body.includes('Reviews, newest first') ? summaryAnswer : searchAnswer())
    )
    const remaining = (res) => Number(/\br=(\d+)/.exec(res.headers.ratelimit)[1])
    const search = () => api().post('/api/ai/search').send({ query: 'apple phones with a good camera' }).expect(200)

    const earlier = await search()
    const product = await reviewedProduct()
    await api().get(`/api/products/${product.id}/review-summary`).expect(200)
    const later = await search()
    assert.equal(remaining(earlier) - remaining(later), 1, 'only the second search is counted')
  })
})
