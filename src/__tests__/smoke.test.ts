// Smoke test — validates Vitest config and pdfjs import side-effect tolerance.
// Removed before merge; this file is intentionally trivial.
import { describe, it, expect } from 'vitest'

describe('smoke', () => {
  it('runs', () => {
    expect(1 + 1).toBe(2)
  })
})
