import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, describe, it } from 'node:test'

const ENV_MODULE = new URL('../config/env.js', import.meta.url).href
const LONG_SECRET = 'a-test-secret-that-is-long-enough-for-production'

// An empty folder, so dotenv finds no .env and only the variables given below apply.
const emptyFolder = mkdtempSync(join(tmpdir(), 'shopsmart-env-'))
after(() => rmSync(emptyFolder, { recursive: true, force: true }))

/**
 * config/env.js reads the environment once, when it is first imported, so each case
 * loads it in a fresh Node process. Gives the configuration, or the startup error.
 */
function loadEnv(vars) {
  const script = `const { default: env } = await import(${JSON.stringify(ENV_MODULE)}); console.log(JSON.stringify(env))`
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', script], {
    cwd: emptyFolder,
    env: { PATH: process.env.PATH, ...vars },
    encoding: 'utf8'
  })
  if (result.status !== 0) return { error: result.stderr }
  return { env: JSON.parse(result.stdout) }
}

describe('config/env.js', () => {
  const production = { NODE_ENV: 'production', JWT_SECRET: LONG_SECRET, CLIENT_URL: 'https://shop.example.com' }

  it('starts in production with a long secret and the site\'s origin', () => {
    const { env, error } = loadEnv(production)
    assert.equal(error, undefined)
    assert.equal(env.isProduction, true)
    assert.deepEqual(env.clientUrls, ['https://shop.example.com'])
  })

  it('refuses a short or published JWT secret in production', () => {
    const placeholder = loadEnv({ ...production, JWT_SECRET: 'change-me-to-a-long-random-string' })
    assert.match(placeholder.error, /JWT_SECRET must be a random string of at least 32 characters/)
    const short = loadEnv({ ...production, JWT_SECRET: 'shopsmart-secret' })
    assert.match(short.error, /JWT_SECRET must be/)

    // On a developer's machine the example value is fine.
    const local = loadEnv({ NODE_ENV: 'development', JWT_SECRET: 'change-me-to-a-long-random-string' })
    assert.equal(local.error, undefined)
  })

  it('refuses a missing or malformed CLIENT_URL in production', () => {
    // spawnSync leaves out variables whose value is undefined.
    assert.match(loadEnv({ ...production, CLIENT_URL: undefined }).error, /CLIENT_URL is not set/)
    assert.match(loadEnv({ ...production, CLIENT_URL: ' ' }).error, /CLIENT_URL is not set/)

    for (const wrong of ['shop.example.com', 'https://shop.example.com/store', 'https://Shop.example.com']) {
      assert.match(loadEnv({ ...production, CLIENT_URL: `https://ok.example.com, ${wrong}` }).error, /is not an origin/, wrong)
    }
    // A trailing slash is trimmed, so it is still the same origin.
    assert.equal(loadEnv({ ...production, CLIENT_URL: 'https://shop.example.com/' }).error, undefined)
  })

  it('shows developer extras only when NODE_ENV is development', () => {
    assert.equal(loadEnv({ NODE_ENV: 'development', JWT_SECRET: LONG_SECRET }).env.isDevelopment, true)

    // A host that forgot NODE_ENV still runs, but never puts stack traces in its answers.
    const unset = loadEnv({ JWT_SECRET: LONG_SECRET }).env
    assert.equal(unset.isDevelopment, false)
    assert.equal(unset.isProduction, false)
  })

  it('treats the seeded accounts as the shared demo accounts unless told otherwise', () => {
    const seeded = loadEnv({ JWT_SECRET: LONG_SECRET, SEED_ADMIN_EMAIL: 'Boss@Shop.dev' })
    assert.deepEqual(seeded.env.demoAccountEmails, ['boss@shop.dev', 'demo@shopsmart.dev'])

    const listed = loadEnv({ JWT_SECRET: LONG_SECRET, DEMO_ACCOUNT_EMAILS: ' Guest@Shop.dev, ,trial@shop.dev ' })
    assert.deepEqual(listed.env.demoAccountEmails, ['guest@shop.dev', 'trial@shop.dev'])

    const off = loadEnv({ JWT_SECRET: LONG_SECRET, DEMO_ACCOUNT_EMAILS: '' })
    assert.deepEqual(off.env.demoAccountEmails, [])
  })
})
