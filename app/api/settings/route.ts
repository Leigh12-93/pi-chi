import { NextResponse } from 'next/server'
import { getSession, encryptToken, decryptToken } from '@/lib/auth'
import { supabaseFetch } from '@/lib/supabase-fetch'

/** GET /api/settings — return user's settings (hasApiKey, preferredModel, preferences) */
export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, ok } = await supabaseFetch(
    `/forge_user_settings?github_username=eq.${encodeURIComponent(session.githubUsername)}&select=encrypted_api_key,api_key_validated_at,preferred_model,preferences`,
  )

  if (!ok || !Array.isArray(data) || data.length === 0) {
    return NextResponse.json({
      hasApiKey: false,
      preferredModel: 'claude-sonnet-4-20250514',
      preferences: {},
    })
  }

  const row = data[0] as any
  return NextResponse.json({
    hasApiKey: !!row.encrypted_api_key,
    apiKeyValidatedAt: row.api_key_validated_at,
    preferredModel: row.preferred_model || 'claude-sonnet-4-20250514',
    preferences: row.preferences || {},
  })
}

/** PUT /api/settings — save API key (validate → encrypt → store) or preferences */
export async function PUT(req: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { apiKey, preferredModel, preferences } = body

  const updates: Record<string, unknown> = {}

  // Validate and store API key
  if (apiKey) {
    const trimmed = apiKey.trim()
    if (!trimmed.startsWith('sk-ant-')) {
      return NextResponse.json({ error: 'Invalid API key format. Must start with sk-ant-' }, { status: 400 })
    }

    // Validate by making a minimal API call
    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': trimmed,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 1,
          messages: [{ role: 'user', content: 'Hi' }],
        }),
        signal: AbortSignal.timeout(15000),
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        return NextResponse.json({
          error: `API key validation failed: ${(err as any).error?.message || `HTTP ${res.status}`}`,
        }, { status: 400 })
      }
    } catch (err: any) {
      return NextResponse.json({
        error: `API key validation failed: ${err.message || 'Network error'}`,
      }, { status: 400 })
    }

    // Encrypt and store
    const encrypted = await encryptToken(trimmed)
    updates.encrypted_api_key = `v1:${encrypted}`
    updates.api_key_validated_at = new Date().toISOString()
  }

  if (preferredModel) updates.preferred_model = preferredModel
  if (preferences) updates.preferences = preferences

  // Upsert settings
  const { ok, data, status } = await supabaseFetch(
    '/forge_user_settings',
    {
      method: 'POST',
      headers: { 'Prefer': 'resolution=merge-duplicates,return=representation' },
      body: JSON.stringify({
        github_username: session.githubUsername,
        ...updates,
      }),
    },
  )

  if (!ok) {
    return NextResponse.json({ error: 'Failed to save settings' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}

/** DELETE /api/settings — remove API key */
export async function DELETE() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { ok } = await supabaseFetch(
    `/forge_user_settings?github_username=eq.${encodeURIComponent(session.githubUsername)}`,
    {
      method: 'PATCH',
      body: JSON.stringify({
        encrypted_api_key: null,
        api_key_validated_at: null,
      }),
    },
  )

  if (!ok) {
    return NextResponse.json({ error: 'Failed to remove API key' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
