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
  it('treats the seeded accounts as the shared demo accounts unless told otherwise', () => {
    const seeded = loadEnv({ JWT_SECRET: LONG_SECRET, SEED_ADMIN_EMAIL: 'Boss@Shop.dev' })
    assert.deepEqual(seeded.env.demoAccountEmails, ['boss@shop.dev', 'demo@shopsmart.dev'])

    const listed = loadEnv({ JWT_SECRET: LONG_SECRET, DEMO_ACCOUNT_EMAILS: ' Guest@Shop.dev, ,trial@shop.dev ' })
    assert.deepEqual(listed.env.demoAccountEmails, ['guest@shop.dev', 'trial@shop.dev'])

    const off = loadEnv({ JWT_SECRET: LONG_SECRET, DEMO_ACCOUNT_EMAILS: '' })
    assert.deepEqual(off.env.demoAccountEmails, [])
  })
})
