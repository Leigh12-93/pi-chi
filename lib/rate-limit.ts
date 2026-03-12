// Simple in-memory rate limiter — no external deps
// Tracks requests per IP with sliding window

interface RateLimitEntry {
  count: number
  resetAt: number
}

const stores = new Map<string, Map<string, RateLimitEntry>>()
let _lastCleanup = Date.now()
const CLEANUP_INTERVAL = 30_000

export function rateLimit(
  name: string,
  maxRequests: number,
  windowMs: number,
): (ip: string) => { ok: boolean; remaining: number; resetIn: number } {
  if (!stores.has(name)) stores.set(name, new Map())
  const store = stores.get(name)!

  return (ip: string) => {
    const now = Date.now()

    // Time-based cleanup every 30s instead of size-based O(n) on every call
    if (now - _lastCleanup > CLEANUP_INTERVAL) {
      _lastCleanup = now
      for (const [, s] of stores) {
        for (const [key, entry] of s) {
          if (now > entry.resetAt) s.delete(key)
        }
      }
    }

    const entry = store.get(ip)

    if (!entry || now > entry.resetAt) {
      store.set(ip, { count: 1, resetAt: now + windowMs })
      return { ok: true, remaining: maxRequests - 1, resetIn: windowMs }
    }

    // Check BEFORE incrementing to fix off-by-one
    if (entry.count >= maxRequests) {
      return { ok: false, remaining: 0, resetIn: entry.resetAt - now }
    }

    entry.count++
    return { ok: true, remaining: maxRequests - entry.count, resetIn: entry.resetAt - now }
  }
}

// Pre-configured limiters
export const chatLimiter = rateLimit('chat', 20, 60_000)           // 20 req/min
export const sandboxLimiter = rateLimit('sandbox', 5, 60_000)      // 5 req/min (create)
export const sandboxSyncLimiter = rateLimit('sandbox-sync', 20, 60_000) // 20 req/min (sync)
export const authLimiter = rateLimit('auth', 10, 60_000)           // 10 req/min (OAuth callbacks)
export const shareLimiter = rateLimit('share', 30, 60_000)         // 30 req/min (share link access)
