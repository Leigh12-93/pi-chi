// Simple in-memory rate limiter — no external deps
// Tracks requests per IP with sliding window

interface RateLimitEntry {
  count: number
  resetAt: number
}

const stores = new Map<string, Map<string, RateLimitEntry>>()

// Clean up expired entries every 60s
setInterval(() => {
  const now = Date.now()
  for (const store of stores.values()) {
    for (const [key, entry] of store) {
      if (now > entry.resetAt) store.delete(key)
    }
  }
}, 60_000)

export function rateLimit(
  name: string,
  maxRequests: number,
  windowMs: number,
): (ip: string) => { ok: boolean; remaining: number; resetIn: number } {
  if (!stores.has(name)) stores.set(name, new Map())
  const store = stores.get(name)!

  return (ip: string) => {
    const now = Date.now()
    const entry = store.get(ip)

    if (!entry || now > entry.resetAt) {
      store.set(ip, { count: 1, resetAt: now + windowMs })
      return { ok: true, remaining: maxRequests - 1, resetIn: windowMs }
    }

    entry.count++
    const remaining = Math.max(0, maxRequests - entry.count)
    const resetIn = entry.resetAt - now

    if (entry.count > maxRequests) {
      return { ok: false, remaining: 0, resetIn }
    }

    return { ok: true, remaining, resetIn }
  }
}

// Pre-configured limiters
export const chatLimiter = rateLimit('chat', 20, 60_000)       // 20 req/min
export const sandboxLimiter = rateLimit('sandbox', 5, 60_000)  // 5 req/min
