import '@testing-library/jest-dom/vitest'
import { afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'

// Each test starts from an empty browser: no stored lists, token or session markers.
afterEach(() => {
  cleanup()
  window.localStorage.clear()
})
