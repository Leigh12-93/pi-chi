// Rate limiting, concurrent stream tracking, and in-memory caches for the chat endpoint

export const MAX_CONCURRENT_STREAMS = 3
export const STREAM_ENTRY_TTL = 5 * 60 * 1000
export const MAX_USAGE_ENTRIES = 500
export const MEMORY_TTL = 60_000
export const MAX_HISTORY = 30
export const FULL_DETAIL_WINDOW = 4

export const activeStreams = new Map<string, { count: number; ts: number }>()
export const usageTracker = new Map<string, { tokens: number; requests: number; ts: number }>()
export const editFailCache = new Map<string, { counts: Map<string, number>; ts: number }>()
export const memoryCache = new Map<string, { data: Record<string, string>; ts: number }>()

let lastCacheCleanup = 0

/** Periodic cleanup of all in-memory caches — runs at most once per minute */
export function cleanupCaches() {
  const now = Date.now()
  if (now - lastCacheCleanup < 60_000) return
  lastCacheCleanup = now

  // editFailCache: evict entries older than 10 min
  for (const [k, v] of editFailCache) {
    if (now - v.ts > 10 * 60 * 1000) editFailCache.delete(k)
  }
  // Hard cap
  if (editFailCache.size > 500) {
    const sorted = [...editFailCache.entries()].sort((a, b) => a[1].ts - b[1].ts)
    while (editFailCache.size > 400) editFailCache.delete(sorted.shift()![0])
  }

  // memoryCache: evict entries older than MEMORY_TTL
  for (const [k, v] of memoryCache) {
    if (now - v.ts > MEMORY_TTL) memoryCache.delete(k)
  }
  if (memoryCache.size > 200) {
    const sorted = [...memoryCache.entries()].sort((a, b) => a[1].ts - b[1].ts)
    while (memoryCache.size > 150) memoryCache.delete(sorted.shift()![0])
  }

  // usageTracker: evict entries older than STREAM_ENTRY_TTL
  for (const [k, v] of usageTracker) {
    if (now - v.ts > STREAM_ENTRY_TTL) usageTracker.delete(k)
  }
  if (usageTracker.size > MAX_USAGE_ENTRIES) {
    const sorted = [...usageTracker.entries()].sort((a, b) => a[1].ts - b[1].ts)
    while (usageTracker.size > 400) usageTracker.delete(sorted.shift()![0])
  }

  // activeStreams: evict stale
  for (const [k, v] of activeStreams) {
    if (now - v.ts > STREAM_ENTRY_TTL) activeStreams.delete(k)
  }
}

export function getEditFailCounts(projectId: string | null): Map<string, number> {
  const key = projectId || '_anon'
  cleanupCaches()
  let entry = editFailCache.get(key)
  if (!entry) {
    entry = { counts: new Map(), ts: Date.now() }
    editFailCache.set(key, entry)
  }
  entry.ts = Date.now()
  // Cap inner Map to 50 entries per project
  if (entry.counts.size > 50) {
    const keys = [...entry.counts.keys()]
    while (entry.counts.size > 40) entry.counts.delete(keys.shift()!)
  }
  return entry.counts
}
