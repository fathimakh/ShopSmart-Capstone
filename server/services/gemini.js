/**
 * Google Gemini over its REST API (generateContent). The key stays on the server, so
 * the browser never sees it; the client only ever calls this API.
 *
 * Every answer is requested as JSON that follows a response schema. The callers still
 * check that JSON field by field, because a schema guides the model but does not bind it.
 *
 * Failures are turned into the API's own errors:
 *   503 AI_UNAVAILABLE  no key is configured, Gemini is over its quota, or it was busy (after
 *                       one retry, when enough time was left for one)
 *   504 AI_TIMEOUT      no answer within GEMINI_TIMEOUT_MS (shared by both tries)
 *   502 AI_FAILED       Gemini answered with an error or with something unusable, or it could
 *                       not be reached
 */
import env from '../config/env.js'
import ApiError from '../utils/ApiError.js'

const API_ROOT = 'https://generativelanguage.googleapis.com/v1beta/models'

export function isGeminiConfigured() {
  return Boolean(env.geminiApiKey)
}

export function aiFailed(message = 'The assistant gave an answer we could not use. Please try again.') {
  return new ApiError(502, message, { code: 'AI_FAILED' })
}

function logProblem(message) {
  if (!env.isTest) console.warn(`[gemini] ${message}`)
}

// Gemini 3 and later models ignore temperature, and Google says later generations will
// answer it with a 400, so only the 2.x models are sent one.
const TAKES_TEMPERATURE = /^gemini-2\./

// These answers are short lookups, and thinking only makes the search box slower. The 2.5
// Flash models switch it off with a zero budget; gemini-3.5-flash-lite and gemini-3.6-flash
// take the "minimal" level, which is close to off. Any other model keeps its default,
// because a budget or a level the model does not offer is an error.
function thinkingConfig(model) {
  if (/^gemini-2\.5-flash/.test(model)) return { thinkingBudget: 0 }
  if (/^gemini-3\.(5-flash-lite|6-flash)$/.test(model)) return { thinkingLevel: 'minimal' }
  return null
}

function generationConfig(schema, temperature, maxOutputTokens) {
  const config = {
    maxOutputTokens,
    responseMimeType: 'application/json',
    responseSchema: schema
  }
  if (TAKES_TEMPERATURE.test(env.geminiModel)) config.temperature = temperature
  const thinking = thinkingConfig(env.geminiModel)
  if (thinking) config.thinkingConfig = thinking
  return config
}

function busy() {
  return ApiError.unavailable('The assistant is busy right now. Please try again in a minute.', 'AI_UNAVAILABLE')
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

// Gemini often answers 503 "high demand" for a moment and then works again, so a busy model
// or a dropped connection gets one more try. A 429 means the key's quota is used up, which a
// retry cannot fix. Both tries share GEMINI_TIMEOUT_MS, and the second one only starts while
// at least 40% of that time is left, because an answer usually takes 6 to 8 seconds.
const MAX_ATTEMPTS = 2

async function callGemini(body) {
  const controller = new AbortController()
  const deadline = Date.now() + env.geminiTimeoutMs
  const timer = setTimeout(() => controller.abort(), env.geminiTimeoutMs)
  let problem

  try {
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        const response = await fetch(`${API_ROOT}/${env.geminiModel}:generateContent`, {
          method: 'POST',
          // Sent as a header rather than in the URL, so the key never shows up in a log line.
          headers: { 'Content-Type': 'application/json', 'x-goog-api-key': env.geminiApiKey },
          body: JSON.stringify(body),
          signal: controller.signal
        })

        if (response.status === 429) {
          logProblem('over quota, status 429')
          throw busy()
        }
        if (response.status === 503) {
          logProblem(`busy, status 503 (try ${attempt} of ${MAX_ATTEMPTS})`)
          problem = busy()
        } else if (!response.ok) {
          const detail = await response.text().catch(() => '')
          logProblem(`request failed with status ${response.status}: ${detail.slice(0, 300)}`)
          throw aiFailed('The assistant could not answer that. Please try again.')
        } else {
          // Gemini has answered (and billed the call), so a reply that is not JSON is a bad
          // answer, not a reason to ask again.
          try {
            return await response.json()
          } catch (error) {
            if (controller.signal.aborted) throw error
            logProblem('the reply was not JSON')
            throw aiFailed()
          }
        }
      } catch (error) {
        if (error instanceof ApiError) throw error
        if (controller.signal.aborted) {
          throw new ApiError(504, 'The assistant took too long to answer. Please try again.', { code: 'AI_TIMEOUT' })
        }
        logProblem(`request failed: ${error.message} (try ${attempt} of ${MAX_ATTEMPTS})`)
        problem = aiFailed('We could not reach the assistant. Please try again.')
      }

      if (attempt === MAX_ATTEMPTS || deadline - Date.now() < env.geminiTimeoutMs * 0.4) break
      await sleep(Math.min(800, env.geminiTimeoutMs / 20))
    }
    throw problem
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Sends one prompt and returns the model's answer parsed from JSON.
 *
 * @param {object} options
 * @param {string} options.system     the standing instructions
 * @param {string} options.prompt     this request's text
 * @param {object} options.schema     the response schema (Gemini's OpenAPI subset)
 */
export async function generateJson({ system, prompt, schema, temperature = 0.2, maxOutputTokens = 1024 }) {
  if (!isGeminiConfigured()) {
    throw ApiError.unavailable('The AI assistant is not set up on this server.', 'AI_UNAVAILABLE')
  }

  const data = await callGemini({
    systemInstruction: { parts: [{ text: system }] },
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: generationConfig(schema, temperature, maxOutputTokens)
  })

  // A blocked or cut-off answer has no text, or text that is not complete JSON.
  const text = data?.candidates?.[0]?.content?.parts?.find((part) => typeof part?.text === 'string')?.text
  if (!text) {
    logProblem(`empty answer, finish reason ${data?.candidates?.[0]?.finishReason ?? 'unknown'}`)
    throw aiFailed()
  }

  try {
    return JSON.parse(text)
  } catch {
    logProblem('the answer was not valid JSON')
    throw aiFailed()
  }
}
