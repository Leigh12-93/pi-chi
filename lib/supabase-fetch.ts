// ═══════════════════════════════════════════════════════════════════
// Supabase PostgREST fetch helper
// ═══════════════════════════════════════════════════════════════════

export const SUPABASE_URL = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim()
export const SUPABASE_KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim()

export async function supabaseFetch(path: string, options: RequestInit = {}) {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return { data: null, status: 500, ok: false }
  }
  const res = await fetch(`${SUPABASE_URL}/rest/v1${path}`, {
    ...options,
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation',
      ...options.headers,
    },
  })
  const text = await res.text()
  try {
    return { data: JSON.parse(text), status: res.status, ok: res.ok }
  } catch {
    return { data: text, status: res.status, ok: res.ok }
  }
}
