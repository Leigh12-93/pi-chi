// ═══════════════════════════════════════════════════════════════════
// Supabase PostgREST fetch helper
// ═══════════════════════════════════════════════════════════════════

export const SUPABASE_URL = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim()
export const SUPABASE_KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim()

export async function supabaseFetch(
  path: string,
  options: RequestInit = {},
): Promise<{ ok: boolean; data: any; status: number }> {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return { data: null, status: 500, ok: false }
  }

  const maxRetries = 1

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

      // Retry only on 5xx server errors
      if (!res.ok && res.status >= 500 && attempt < maxRetries) {
        await new Promise(r => setTimeout(r, 1000 * (attempt + 1)))
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
    } catch (err: any) {
      if (attempt < maxRetries) {
        await new Promise(r => setTimeout(r, 1000 * (attempt + 1)))
        continue
      }
      // Return error object instead of throwing — matches existing callsite expectations
      return { ok: false, data: { error: err.message || 'Network error' }, status: 0 }
    }
  }

  return { ok: false, data: { error: 'Unreachable' }, status: 0 }
}
