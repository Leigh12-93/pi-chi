import { describe, it, expect } from 'vitest'
import { chatLimiter } from '@/lib/rate-limit'

describe('chatLimiter', () => {
  it('allows requests under limit', () => {
    const result = chatLimiter('test-ip-' + Date.now())
    expect(result.ok).toBe(true)
  })

  it('rate limits after too many requests', () => {
    const ip = 'test-flood-' + Date.now()
    let lastResult
    for (let i = 0; i < 25; i++) {
      lastResult = chatLimiter(ip)
    }
    expect(lastResult!.ok).toBe(false)
  })
})
