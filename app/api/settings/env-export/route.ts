import { NextResponse } from 'next/server'
import { getSession, decryptToken, encryptToken } from '@/lib/auth'
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

/** GET /api/settings/env-export — decrypt saved credentials + custom global env vars */
export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const columns = [...Object.keys(CREDENTIAL_MAP), 'encrypted_google_service_account', 'global_env_vars'].join(',')
  const { data, ok } = await supabaseFetch(
    `/forge_user_settings?github_username=eq.${encodeURIComponent(session.githubUsername)}&select=${columns}`,
  )

  if (!ok || !Array.isArray(data) || data.length === 0) {
    return NextResponse.json({ vars: {}, available: false, variables: [] })
  }

  const row = data[0] as Record<string, unknown>
  const vars: Record<string, string> = {}

  for (const [dbCol, envName] of Object.entries(CREDENTIAL_MAP)) {
    const encrypted = row[dbCol] as string | null
    if (!encrypted) continue
    try {
      vars[envName] = await decryptToken(encrypted.replace(/^v1:/, ''))
    } catch {
      // Skip credentials that fail to decrypt
    }
  }

  // Service account exported as raw JSON string (not in standard map)
  const encSA = row.encrypted_google_service_account as string | null
  if (encSA) {
    try {
      vars['GOOGLE_SERVICE_ACCOUNT_JSON'] = await decryptToken(encSA.replace(/^v1:/, ''))
    } catch {
      // Skip if decrypt fails
    }
  }

  // Custom global env vars (stored as encrypted JSONB array)
  let variables: Array<{ key: string; value: string }> = []
  const rawEnvVars = row.global_env_vars as string | null
  if (rawEnvVars) {
    try {
      const decrypted = await decryptToken(rawEnvVars.replace(/^v1:/, ''))
      variables = JSON.parse(decrypted)
    } catch {
      // If it's already plain JSON (not encrypted), try parsing directly
      try { variables = JSON.parse(rawEnvVars) } catch { /* skip */ }
    }
  }

  return NextResponse.json({
    vars,
    available: Object.keys(vars).length > 0,
    variables,
  })
}

/** PUT /api/settings/env-export — save custom global env vars */
export async function PUT(req: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const variables = body.variables as Array<{ key: string; value: string }> | undefined

  if (!Array.isArray(variables)) {
    return NextResponse.json({ error: 'variables must be an array of {key, value}' }, { status: 400 })
  }

  // Validate: max 50 vars, keys must be valid env var names
  if (variables.length > 50) {
    return NextResponse.json({ error: 'Maximum 50 environment variables' }, { status: 400 })
  }
  for (const v of variables) {
    if (!v.key || typeof v.key !== 'string' || !v.key.match(/^[A-Za-z_][A-Za-z0-9_]*$/)) {
      return NextResponse.json({ error: `Invalid variable name: ${v.key}` }, { status: 400 })
    }
  }

  // Encrypt the JSON array before storing
  const encrypted = 'v1:' + await encryptToken(JSON.stringify(variables))

  // Upsert into forge_user_settings
  const { ok } = await supabaseFetch(
    `/forge_user_settings?github_username=eq.${encodeURIComponent(session.githubUsername)}`,
    {
      method: 'PATCH',
      body: JSON.stringify({ global_env_vars: encrypted }),
      headers: { 'Prefer': 'return=minimal' },
    },
  )

  if (!ok) {
    // Try insert if row doesn't exist yet
    const { ok: insertOk } = await supabaseFetch('/forge_user_settings', {
      method: 'POST',
      body: JSON.stringify({
        github_username: session.githubUsername,
        global_env_vars: encrypted,
      }),
      headers: { 'Prefer': 'return=minimal' },
    })
    if (!insertOk) {
      return NextResponse.json({ error: 'Failed to save' }, { status: 500 })
    }
  }

  return NextResponse.json({ ok: true, count: variables.length })
}
