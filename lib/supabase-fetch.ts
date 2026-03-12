export const SUPABASE_URL = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim()
export const SUPABASE_KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim()

export async function supabaseFetch(
  path: string,
  options: RequestInit = {},
): Promise<{ ok: boolean; data: unknown; status: number }> {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return { data: null, status: 500, ok: false }
  }

  const maxRetries = 2

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1${path}`, {
        ...options,
        signal: options.signal ?? AbortSignal.timeout(10_000),
        headers: {
          'Content-Type': 'application/json',
          'apikey': SUPABASE_KEY,
          'Authorization': `Bearer ${SUPABASE_KEY}`,
          'Prefer': 'return=representation',
          ...options.headers,
        },
      })

      // Retry on 5xx server errors or 429 rate limit
      if (!res.ok && (res.status >= 500 || res.status === 429) && attempt < maxRetries) {
        const retryAfter = res.status === 429 ? parseInt(res.headers.get('Retry-After') || '0') * 1000 : 0
        const backoff = Math.max(retryAfter, 1000 * Math.pow(2, attempt))
        await new Promise(r => setTimeout(r, backoff))
        continue
      }

      let data
      try {
        const text = await res.text()
        data = text ? JSON.parse(text) : null
      } catch {
        console.warn('supabase-fetch: JSON parse failed for', path, 'status:', res.status)
        data = null
      }

      return { ok: res.ok, data, status: res.status }
    } catch (err) {
      if (attempt < maxRetries) {
        await new Promise(r => setTimeout(r, 1000 * Math.pow(2, attempt)))
        continue
      }
      const msg = err instanceof Error ? err.message : 'Network error'
      return { ok: false, data: { error: msg }, status: 0 }
    }
  }

  return { ok: false, data: { error: 'Unreachable' }, status: 0 }
}
