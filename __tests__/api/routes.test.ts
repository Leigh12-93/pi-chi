// Set AUTH_SECRET before any imports — auth.ts reads it at module load time
process.env.AUTH_SECRET = 'test-secret-that-is-at-least-32-chars-long'

import { describe, it, expect, vi } from 'vitest'

// Mock next/headers before importing auth.ts (it imports cookies at top level)
vi.mock('next/headers', () => ({
  cookies: vi.fn(() => ({ get: vi.fn(), set: vi.fn(), delete: vi.fn() })),
}))

import { isValidUUID } from '@/lib/validate'
import { rateLimit } from '@/lib/rate-limit'
import { encryptToken, decryptToken } from '@/lib/auth'

describe('isValidUUID', () => {
  it('accepts a valid UUID v4', () => {
    expect(isValidUUID('550e8400-e29b-41d4-a716-446655440000')).toBe(true)
  })

  it('accepts a valid UUID v4 with uppercase hex', () => {
    expect(isValidUUID('550E8400-E29B-41D4-A716-446655440000')).toBe(true)
  })

  it('rejects an empty string', () => {
    expect(isValidUUID('')).toBe(false)
  })

  it('rejects random text', () => {
    expect(isValidUUID('not-a-uuid-at-all')).toBe(false)
  })

  it('rejects SQL injection string', () => {
    expect(isValidUUID("'; DROP TABLE users; --")).toBe(false)
  })

  it('rejects a UUID with wrong version digit (v1 instead of v4)', () => {
    // Version digit is the first char of the 3rd group — must be '4' for v4
    expect(isValidUUID('550e8400-e29b-11d4-a716-446655440000')).toBe(false)
  })

  it('rejects a UUID with invalid variant digit', () => {
    // Variant digit is the first char of the 4th group — must be [89ab]
    expect(isValidUUID('550e8400-e29b-41d4-0716-446655440000')).toBe(false)
  })
})

describe('rateLimit', () => {
  it('returns remaining count that decreases with each call', () => {
    const limiter = rateLimit('test-remaining-' + Date.now(), 5, 60_000)
    const ip = 'ip-remaining-' + Date.now()

    const first = limiter(ip)
    expect(first.ok).toBe(true)
    expect(first.remaining).toBe(4) // 5 max - 1 used = 4

    const second = limiter(ip)
    expect(second.ok).toBe(true)
    expect(second.remaining).toBe(3)
  })

  it('tracks different IPs independently', () => {
    const limiter = rateLimit('test-independent-' + Date.now(), 3, 60_000)
    const ts = Date.now()
    const ipA = 'ip-a-' + ts
    const ipB = 'ip-b-' + ts

    // Exhaust ipA's limit
    limiter(ipA) // 1
    limiter(ipA) // 2
    limiter(ipA) // 3
    const ipABlocked = limiter(ipA) // 4 — over limit
    expect(ipABlocked.ok).toBe(false)

    // ipB should still be fresh
    const ipBResult = limiter(ipB)
    expect(ipBResult.ok).toBe(true)
    expect(ipBResult.remaining).toBe(2)
  })

  it('returns resetIn as a positive number', () => {
    const limiter = rateLimit('test-resetin-' + Date.now(), 10, 60_000)
    const result = limiter('ip-resetin-' + Date.now())
    expect(result.resetIn).toBeGreaterThan(0)
    expect(result.resetIn).toBeLessThanOrEqual(60_000)
  })

  it('remaining is 0 when rate limited', () => {
    const limiter = rateLimit('test-zero-' + Date.now(), 2, 60_000)
    const ip = 'ip-zero-' + Date.now()
    limiter(ip) // 1
    limiter(ip) // 2
    const blocked = limiter(ip) // 3 — over limit
    expect(blocked.ok).toBe(false)
    expect(blocked.remaining).toBe(0)
  })
})

describe('supabaseFetch', () => {
  it('returns {ok: false, status: 500} when env vars are missing', async () => {
    // supabase-fetch reads env at module load. We import it dynamically
    // with empty env to test the missing-creds path.
    const mod = await import('@/lib/supabase-fetch')

    // SUPABASE_URL and SUPABASE_KEY are empty since env vars are not set
    // in this test environment, so supabaseFetch should return early
    if (!mod.SUPABASE_URL || !mod.SUPABASE_KEY) {
      const result = await mod.supabaseFetch('/test')
      expect(result.ok).toBe(false)
      expect(result.status).toBe(500)
      expect(result.data).toBeNull()
    }
  })

  it('exports SUPABASE_URL and SUPABASE_KEY as trimmed strings', async () => {
    const mod = await import('@/lib/supabase-fetch')
    // They should be strings (possibly empty) with no trailing whitespace
    expect(typeof mod.SUPABASE_URL).toBe('string')
    expect(typeof mod.SUPABASE_KEY).toBe('string')
    expect(mod.SUPABASE_URL).toBe(mod.SUPABASE_URL.trim())
    expect(mod.SUPABASE_KEY).toBe(mod.SUPABASE_KEY.trim())
  })
})

describe('encryptToken / decryptToken', () => {
  it('round-trips: encrypt then decrypt returns original string', async () => {
    const original = 'gho_abc123_my_github_token'
    const encrypted = await encryptToken(original)
    const decrypted = await decryptToken(encrypted)
    expect(decrypted).toBe(original)
  })

  it('encrypted format is hex(iv):hex(ciphertext)', async () => {
    const encrypted = await encryptToken('test-token')
    const parts = encrypted.split(':')
    expect(parts.length).toBe(2)
    // IV is 12 bytes = 24 hex chars
    expect(parts[0]).toMatch(/^[0-9a-f]{24}$/)
    // Ciphertext is non-empty hex
    expect(parts[1]).toMatch(/^[0-9a-f]+$/)
  })

  it('different plaintexts produce different ciphertexts', async () => {
    const enc1 = await encryptToken('token-alpha')
    const enc2 = await encryptToken('token-beta')
    expect(enc1).not.toBe(enc2)
  })

  it('same plaintext produces different ciphertexts (random IV)', async () => {
    const enc1 = await encryptToken('same-token')
    const enc2 = await encryptToken('same-token')
    // Random IV means the output differs even for the same input
    expect(enc1).not.toBe(enc2)
    // But both decrypt to the same value
    expect(await decryptToken(enc1)).toBe('same-token')
    expect(await decryptToken(enc2)).toBe('same-token')
  })

  it('throws on invalid encrypted format (no colon separator)', async () => {
    await expect(decryptToken('invalid-no-colon')).rejects.toThrow('Invalid encrypted token format')
  })

  it('throws on empty string', async () => {
    await expect(decryptToken('')).rejects.toThrow('Invalid encrypted token format')
  })

  it('throws on corrupted ciphertext', async () => {
    const encrypted = await encryptToken('real-token')
    const [iv] = encrypted.split(':')
    // Replace ciphertext with garbage
    const corrupted = `${iv}:deadbeef`
    await expect(decryptToken(corrupted)).rejects.toThrow()
  })
})
