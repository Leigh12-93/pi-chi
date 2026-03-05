import { NextResponse } from 'next/server'
import { getSession, encryptToken, decryptToken } from '@/lib/auth'
import { supabaseFetch } from '@/lib/supabase-fetch'

/** GET /api/settings — return user's settings (hasApiKey, hasVercelToken, preferredModel, preferences) */
export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, ok } = await supabaseFetch(
    `/forge_user_settings?github_username=eq.${encodeURIComponent(session.githubUsername)}&select=encrypted_api_key,api_key_validated_at,encrypted_vercel_token,preferred_model,preferences`,
  )

  if (!ok || !Array.isArray(data) || data.length === 0) {
    return NextResponse.json({
      hasApiKey: false,
      hasVercelToken: false,
      preferredModel: 'claude-sonnet-4-20250514',
      preferences: {},
    })
  }

  const row = data[0] as any
  return NextResponse.json({
    hasApiKey: !!row.encrypted_api_key,
    apiKeyValidatedAt: row.api_key_validated_at,
    hasVercelToken: !!row.encrypted_vercel_token,
    preferredModel: row.preferred_model || 'claude-sonnet-4-20250514',
    preferences: row.preferences || {},
  })
}

/** PUT /api/settings — save API key, Vercel token, or preferences */
export async function PUT(req: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { apiKey, vercelToken, preferredModel, preferences } = body

  const updates: Record<string, unknown> = {}

  // Validate and store Anthropic API key
  if (apiKey) {
    const trimmed = apiKey.trim()
    if (!trimmed.startsWith('sk-ant-')) {
      return NextResponse.json({ error: 'Invalid API key format. Must start with sk-ant-' }, { status: 400 })
    }

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

    const encrypted = await encryptToken(trimmed)
    updates.encrypted_api_key = `v1:${encrypted}`
    updates.api_key_validated_at = new Date().toISOString()
  }

  // Validate and store Vercel token
  if (vercelToken) {
    const trimmed = vercelToken.trim()

    // Validate by listing projects
    try {
      const res = await fetch('https://api.vercel.com/v9/projects?limit=1', {
        headers: { Authorization: `Bearer ${trimmed}` },
        signal: AbortSignal.timeout(10000),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        return NextResponse.json({
          error: `Vercel token validation failed: ${(err as any).error?.message || `HTTP ${res.status}`}`,
        }, { status: 400 })
      }
    } catch (err: any) {
      return NextResponse.json({
        error: `Vercel token validation failed: ${err.message || 'Network error'}`,
      }, { status: 400 })
    }

    const encrypted = await encryptToken(trimmed)
    updates.encrypted_vercel_token = `v1:${encrypted}`
  }

  if (preferredModel) updates.preferred_model = preferredModel
  if (preferences) updates.preferences = preferences

  const { ok } = await supabaseFetch(
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

/** DELETE /api/settings — remove API key or Vercel token */
export async function DELETE(req: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Check query param for which key to delete
  const url = new URL(req.url)
  const target = url.searchParams.get('target') || 'apiKey'

  const patch: Record<string, null> = {}
  if (target === 'vercelToken') {
    patch.encrypted_vercel_token = null
  } else {
    patch.encrypted_api_key = null
    patch.api_key_validated_at = null
  }

  const { ok } = await supabaseFetch(
    `/forge_user_settings?github_username=eq.${encodeURIComponent(session.githubUsername)}`,
    {
      method: 'PATCH',
      body: JSON.stringify(patch),
    },
  )

  if (!ok) {
    return NextResponse.json({ error: 'Failed to remove credential' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
