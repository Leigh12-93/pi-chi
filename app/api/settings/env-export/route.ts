import { NextResponse } from 'next/server'
import { getSession, decryptToken } from '@/lib/auth'
import { supabaseFetch } from '@/lib/supabase-fetch'

/** Map from encrypted DB columns to standard env var names */
const CREDENTIAL_MAP: Record<string, string> = {
  encrypted_supabase_url: 'NEXT_PUBLIC_SUPABASE_URL',
  encrypted_supabase_key: 'SUPABASE_SERVICE_ROLE_KEY',
  encrypted_api_key: 'ANTHROPIC_API_KEY',
  encrypted_google_client_id: 'GOOGLE_CLIENT_ID',
  encrypted_google_client_secret: 'GOOGLE_CLIENT_SECRET',
  encrypted_google_api_key: 'GOOGLE_API_KEY',
}

/** GET /api/settings/env-export — decrypt saved credentials and return as env var map */
export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const columns = [...Object.keys(CREDENTIAL_MAP), 'encrypted_google_service_account'].join(',')
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

  // Service account exported as raw JSON string (not in standard map)
  if (row.encrypted_google_service_account) {
    try {
      vars['GOOGLE_SERVICE_ACCOUNT_JSON'] = await decryptToken(
        row.encrypted_google_service_account.replace(/^v1:/, ''),
      )
    } catch {
      // Skip if decrypt fails
    }
  }

  return NextResponse.json({
    vars,
    available: Object.keys(vars).length > 0,
  })
}
