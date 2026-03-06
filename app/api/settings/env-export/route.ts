import { NextResponse } from 'next/server'
import { getSession, decryptToken } from '@/lib/auth'
import { supabaseFetch } from '@/lib/supabase-fetch'

/** Map from encrypted DB columns to standard env var names */
const CREDENTIAL_MAP: Record<string, string> = {
  encrypted_supabase_url: 'NEXT_PUBLIC_SUPABASE_URL',
  encrypted_supabase_key: 'SUPABASE_SERVICE_ROLE_KEY',
  encrypted_api_key: 'ANTHROPIC_API_KEY',
}

/** GET /api/settings/env-export — decrypt saved credentials and return as env var map */
export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const columns = Object.keys(CREDENTIAL_MAP).join(',')
  const { data, ok } = await supabaseFetch(
    `/forge_user_settings?github_username=eq.${encodeURIComponent(session.githubUsername)}&select=${columns}`,
  )

  if (!ok || !Array.isArray(data) || data.length === 0) {
    return NextResponse.json({ vars: {}, available: false })
  }

  const row = data[0] as Record<string, string | null>
  const vars: Record<string, string> = {}

  for (const [dbCol, envName] of Object.entries(CREDENTIAL_MAP)) {
    const encrypted = row[dbCol]
    if (!encrypted) continue
    try {
      vars[envName] = await decryptToken(encrypted.replace(/^v1:/, ''))
    } catch {
      // Skip credentials that fail to decrypt
    }
  }

  return NextResponse.json({
    vars,
    available: Object.keys(vars).length > 0,
  })
}
