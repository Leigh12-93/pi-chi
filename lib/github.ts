// ═══════════════════════════════════════════════════════════════════
// GitHub API helpers
// ═══════════════════════════════════════════════════════════════════

export const GITHUB_TOKEN = (process.env.GITHUB_TOKEN || '').trim()
export const GITHUB_API = 'https://api.github.com'

export async function githubFetch(path: string, token: string, options: RequestInit = {}) {
  const ctrl = new AbortController()
  const timeout = setTimeout(() => ctrl.abort(), 30000)
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
  // Detect rate limiting
  if (res.status === 403 || res.status === 429) {
    const remaining = res.headers.get('x-ratelimit-remaining')
    const resetAt = res.headers.get('x-ratelimit-reset')
    if (remaining === '0' || res.status === 429) {
      const resetMin = resetAt ? Math.ceil((parseInt(resetAt) * 1000 - Date.now()) / 60000) : 0
      return { error: `GitHub API rate limited. Try again${resetMin > 0 ? ` in ~${resetMin} minute${resetMin > 1 ? 's' : ''}` : ' later'}.`, status: res.status, rateLimited: true }
    }
  }
  const data = await res.json()
  if (!res.ok) return { error: data.message || `GitHub API ${res.status}`, status: res.status }
  return data
}

/** Run async operations in parallel batches */
export async function batchParallel<T, R>(items: T[], batchSize: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = []
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize)
    results.push(...await Promise.all(batch.map(fn)))
  }
  return results
}
