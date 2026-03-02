// ═══════════════════════════════════════════════════════════════════
// GitHub API helpers — with retry + secondary rate limit handling
// ═══════════════════════════════════════════════════════════════════

export const GITHUB_TOKEN = (process.env.GITHUB_TOKEN || '').trim()
export const GITHUB_API = 'https://api.github.com'

const MAX_RETRIES = 3
const INITIAL_BACKOFF_MS = 2000 // 2s → 4s → 8s exponential backoff

/** Detect if a GitHub response is a secondary/abuse rate limit */
function isSecondaryRateLimit(status: number, body: any): boolean {
  if (status === 429) return true
  if (status === 403) {
    const msg = (body?.message || '').toLowerCase()
    return msg.includes('rate limit') || msg.includes('abuse') || msg.includes('secondary')
      || msg.includes('too many requests') || msg.includes('retry')
  }
  return false
}

export async function githubFetch(path: string, token: string, options: RequestInit = {}) {
  let lastError: any = null

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const ctrl = new AbortController()
    const timeout = setTimeout(() => ctrl.abort(), 30000)
    try {
      const res = await fetch(`${GITHUB_API}${path}`, {
        ...options,
        signal: ctrl.signal,
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
          'Content-Type': 'application/json',
          ...options.headers,
        },
      })
      clearTimeout(timeout)

      const text = await res.text()
      let data: any
      try {
        data = JSON.parse(text)
      } catch {
        // Non-JSON responses can't be rate limits — return immediately
        if (!res.ok) return { error: text || `GitHub API ${res.status} (non-JSON response)`, status: res.status }
        return text
      }

      // Detect rate limiting (primary + secondary)
      if (isSecondaryRateLimit(res.status, data)) {
        const remaining = res.headers.get('x-ratelimit-remaining')
        const resetAt = res.headers.get('x-ratelimit-reset')
        const retryAfter = res.headers.get('retry-after')

        // If we have retries left, back off and retry
        if (attempt < MAX_RETRIES) {
          const backoffMs = retryAfter
            ? parseInt(retryAfter) * 1000
            : INITIAL_BACKOFF_MS * Math.pow(2, attempt)
          console.log(`[github] Rate limited on ${path}, retry ${attempt + 1}/${MAX_RETRIES} in ${backoffMs}ms`)
          await new Promise(r => setTimeout(r, backoffMs))
          continue
        }

        // Out of retries — return rate limit error
        const resetMin = resetAt ? Math.ceil((parseInt(resetAt) * 1000 - Date.now()) / 60000) : 0
        return {
          error: `GitHub API rate limited after ${MAX_RETRIES} retries. Try again${resetMin > 0 ? ` in ~${resetMin} minute${resetMin > 1 ? 's' : ''}` : ' later'}.`,
          status: res.status,
          rateLimited: true,
        }
      }

      // Retry on 5xx server errors
      if (res.status >= 500 && attempt < MAX_RETRIES) {
        console.log(`[github] Server error ${res.status} on ${path}, retry ${attempt + 1}/${MAX_RETRIES}`)
        await new Promise(r => setTimeout(r, INITIAL_BACKOFF_MS * Math.pow(2, attempt)))
        continue
      }

      if (!res.ok) return { error: data.message || `GitHub API ${res.status}`, status: res.status }
      return data
    } catch (err: any) {
      clearTimeout(timeout)
      lastError = err

      // Retry on network/timeout errors
      if (attempt < MAX_RETRIES && (err.name === 'AbortError' || err.code === 'ECONNRESET' || err.code === 'ETIMEDOUT')) {
        console.log(`[github] Network error on ${path}, retry ${attempt + 1}/${MAX_RETRIES}: ${err.message}`)
        await new Promise(r => setTimeout(r, INITIAL_BACKOFF_MS * Math.pow(2, attempt)))
        continue
      }
      throw err
    }
  }
  throw lastError || new Error('GitHub API request failed after retries')
}

/** Run async operations in parallel batches with inter-batch delay */
export async function batchParallel<T, R>(
  items: T[],
  batchSize: number,
  fn: (item: T, index: number) => Promise<R>,
  delayMs: number = 150,
): Promise<R[]> {
  const results: R[] = []
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize)
    results.push(...await Promise.all(batch.map((item, j) => fn(item, i + j))))
    // Inter-batch delay to avoid triggering secondary rate limits
    if (i + batchSize < items.length && delayMs > 0) {
      await new Promise(r => setTimeout(r, delayMs))
    }
  }
  return results
}
