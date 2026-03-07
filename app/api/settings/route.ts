import { NextResponse } from 'next/server'
import { getSession, encryptToken, decryptToken } from '@/lib/auth'
import { supabaseFetch } from '@/lib/supabase-fetch'

/** GET /api/settings — return user's settings (hasApiKey, hasVercelToken, hasSupabase, Google flags, preferredModel, preferences) */
export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, ok } = await supabaseFetch(
    `/forge_user_settings?github_username=eq.${encodeURIComponent(session.githubUsername)}&select=encrypted_api_key,api_key_validated_at,encrypted_vercel_token,encrypted_supabase_url,encrypted_supabase_key,encrypted_supabase_access_token,preferred_model,preferences,encrypted_google_client_id,encrypted_google_client_secret,encrypted_google_api_key,encrypted_google_service_account,encrypted_google_access_token,google_connected_email,google_connected_scopes,google_token_expiry,encrypted_stripe_secret_key,encrypted_stripe_publishable_key,encrypted_stripe_webhook_secret,encrypted_aussiesms_api_key`,
  )

  // Check which OAuth providers are configured
  const oauthProviders = {
    supabase: !!(process.env.SUPABASE_OAUTH_CLIENT_ID || '').trim(),
    vercel: !!(process.env.VERCEL_OAUTH_CLIENT_ID || '').trim(),
  }

  if (!ok || !Array.isArray(data) || data.length === 0) {
    return NextResponse.json({
      hasApiKey: false,
      hasVercelToken: false,
      hasSupabase: false,
      hasSupabaseAccessToken: false,
      supabaseProjectRef: null,
      preferredModel: 'claude-sonnet-4-20250514',
      preferences: {},
      oauthProviders,
      hasGoogleOAuth: false,
      hasGoogleApiKey: false,
      hasGoogleServiceAccount: false,
      hasGoogleAccount: false,
      googleConnectedEmail: null,
      googleConnectedScopes: [],
      googleTokenExpiry: null,
      googleServiceAccountEmail: null,
      googleServiceAccountProject: null,
      hasStripeSecretKey: false,
      hasStripePublishableKey: false,
      hasStripeWebhookSecret: false,
      hasAussieSmsApiKey: false,
    })
  }

  const row = data[0] as any
  const hasSupabase = !!(row.encrypted_supabase_url && row.encrypted_supabase_key)

  // Decrypt the URL to extract the project ref for display (not the key)
  let supabaseProjectRef: string | null = null
  if (hasSupabase && row.encrypted_supabase_url) {
    try {
      const sbUrl = await decryptToken(row.encrypted_supabase_url.replace(/^v1:/, ''))
      supabaseProjectRef = sbUrl.match(/https:\/\/([^.]+)\.supabase/)?.[1] || null
    } catch {}
  }

  // Extract service account display info if available
  let googleServiceAccountEmail: string | null = null
  let googleServiceAccountProject: string | null = null
  if (row.encrypted_google_service_account) {
    try {
      const saJson = await decryptToken(row.encrypted_google_service_account.replace(/^v1:/, ''))
      const sa = JSON.parse(saJson)
      googleServiceAccountEmail = sa.client_email || null
      googleServiceAccountProject = sa.project_id || null
    } catch {}
  }

  return NextResponse.json({
    hasApiKey: !!row.encrypted_api_key,
    apiKeyValidatedAt: row.api_key_validated_at,
    hasVercelToken: !!row.encrypted_vercel_token,
    hasSupabase,
    hasSupabaseAccessToken: !!row.encrypted_supabase_access_token,
    supabaseProjectRef,
    preferredModel: row.preferred_model || 'claude-sonnet-4-20250514',
    preferences: row.preferences || {},
    oauthProviders,
    hasGoogleOAuth: !!(row.encrypted_google_client_id && row.encrypted_google_client_secret),
    hasGoogleApiKey: !!row.encrypted_google_api_key,
    hasGoogleServiceAccount: !!row.encrypted_google_service_account,
    hasGoogleAccount: !!row.encrypted_google_access_token,
    googleConnectedEmail: row.google_connected_email || null,
    googleConnectedScopes: row.google_connected_scopes || [],
    googleTokenExpiry: row.google_token_expiry || null,
    googleServiceAccountEmail,
    googleServiceAccountProject,
    hasStripeSecretKey: !!row.encrypted_stripe_secret_key,
    hasStripePublishableKey: !!row.encrypted_stripe_publishable_key,
    hasStripeWebhookSecret: !!row.encrypted_stripe_webhook_secret,
    hasAussieSmsApiKey: !!row.encrypted_aussiesms_api_key,
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

    // Skip validation when auto-saving from env detection (already verified by the panel)
    if (!body.skipValidation) {
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
    }

    const encrypted = await encryptToken(trimmed)
    updates.encrypted_api_key = `v1:${encrypted}`
    updates.api_key_validated_at = new Date().toISOString()
  }

  // Validate and store Vercel token
  if (vercelToken) {
    const trimmed = vercelToken.trim()

    // Skip validation when auto-saving from env detection
    if (!body.skipValidation) {
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
    }

    const encrypted = await encryptToken(trimmed)
    updates.encrypted_vercel_token = `v1:${encrypted}`
  }

  // Validate and store Supabase project credentials (URL + key)
  if (body.supabaseUrl && body.supabaseKey) {
    const sbUrl = body.supabaseUrl.trim().replace(/\/$/, '')
    const sbKey = body.supabaseKey.trim()

    if (!sbUrl.startsWith('https://') || !sbUrl.includes('supabase')) {
      return NextResponse.json({ error: 'Invalid Supabase URL. Must be https://xxxxx.supabase.co' }, { status: 400 })
    }
    if (!sbKey.startsWith('ey')) {
      return NextResponse.json({ error: 'Invalid Supabase key format' }, { status: 400 })
    }

    // Skip validation when auto-saving from env detection (already verified by the DB panel)
    if (!body.skipValidation) {
      try {
        const res = await fetch(`${sbUrl}/rest/v1/`, {
          headers: {
            'apikey': sbKey,
            'Authorization': `Bearer ${sbKey}`,
          },
          signal: AbortSignal.timeout(10000),
        })
        if (!res.ok) {
          return NextResponse.json({
            error: `Supabase validation failed: HTTP ${res.status}`,
          }, { status: 400 })
        }
      } catch (err: any) {
        return NextResponse.json({
          error: `Supabase validation failed: ${err.message || 'Connection refused'}`,
        }, { status: 400 })
      }
    }

    updates.encrypted_supabase_url = `v1:${await encryptToken(sbUrl)}`
    updates.encrypted_supabase_key = `v1:${await encryptToken(sbKey)}`
  }

  // Validate and store Supabase management API access token
  if (body.supabaseAccessToken) {
    const trimmed = body.supabaseAccessToken.trim()
    try {
      const res = await fetch('https://api.supabase.com/v1/projects', {
        headers: { Authorization: `Bearer ${trimmed}` },
        signal: AbortSignal.timeout(10000),
      })
      if (!res.ok) {
        return NextResponse.json({
          error: `Supabase access token validation failed: HTTP ${res.status}`,
        }, { status: 400 })
      }
    } catch (err: any) {
      return NextResponse.json({
        error: `Supabase access token validation failed: ${err.message || 'Network error'}`,
      }, { status: 400 })
    }
    updates.encrypted_supabase_access_token = `v1:${await encryptToken(trimmed)}`
  }

  // Validate and store Google OAuth credentials (Client ID + Secret)
  if (body.googleClientId && body.googleClientSecret) {
    const clientId = body.googleClientId.trim()
    const clientSecret = body.googleClientSecret.trim()

    if (!clientId.includes('.apps.googleusercontent.com')) {
      return NextResponse.json({ error: 'Invalid Client ID format. Must contain .apps.googleusercontent.com' }, { status: 400 })
    }

    updates.encrypted_google_client_id = `v1:${await encryptToken(clientId)}`
    updates.encrypted_google_client_secret = `v1:${await encryptToken(clientSecret)}`

    // If Client ID changes, clear connected account (tokens are bound to the old credentials)
    updates.encrypted_google_access_token = null
    updates.encrypted_google_refresh_token = null
    updates.google_token_expiry = null
    updates.google_connected_email = null
    updates.google_connected_scopes = null
  }

  // Validate and store Google API Key
  if (body.googleApiKey) {
    const apiKeyTrimmed = body.googleApiKey.trim()
    if (!apiKeyTrimmed.startsWith('AIza')) {
      return NextResponse.json({ error: 'Invalid Google API key format. Must start with AIza' }, { status: 400 })
    }
    updates.encrypted_google_api_key = `v1:${await encryptToken(apiKeyTrimmed)}`
  }

  // Validate and store Google Service Account JSON
  if (body.googleServiceAccount) {
    const saStr = typeof body.googleServiceAccount === 'string'
      ? body.googleServiceAccount.trim()
      : JSON.stringify(body.googleServiceAccount)

    if (saStr.length > 50 * 1024) {
      return NextResponse.json({ error: 'Service account JSON exceeds 50KB limit' }, { status: 400 })
    }

    try {
      const sa = JSON.parse(saStr)
      if (sa.type !== 'service_account') {
        return NextResponse.json({ error: 'Invalid service account: type must be "service_account"' }, { status: 400 })
      }
      if (!sa.project_id) {
        return NextResponse.json({ error: 'Invalid service account: missing project_id' }, { status: 400 })
      }
      if (!sa.private_key) {
        return NextResponse.json({ error: 'Invalid service account: missing private_key' }, { status: 400 })
      }
      if (!sa.client_email) {
        return NextResponse.json({ error: 'Invalid service account: missing client_email' }, { status: 400 })
      }
    } catch {
      return NextResponse.json({ error: 'Invalid JSON in service account' }, { status: 400 })
    }

    updates.encrypted_google_service_account = `v1:${await encryptToken(saStr)}`
  }

  // Validate and store Stripe Secret Key
  if (body.stripeSecretKey) {
    const trimmed = body.stripeSecretKey.trim()
    if (!body.skipValidation && !trimmed.startsWith('sk_live_') && !trimmed.startsWith('sk_test_')) {
      return NextResponse.json({ error: 'Invalid Stripe secret key format. Must start with sk_live_ or sk_test_' }, { status: 400 })
    }
    updates.encrypted_stripe_secret_key = `v1:${await encryptToken(trimmed)}`
  }

  // Validate and store Stripe Publishable Key
  if (body.stripePublishableKey) {
    const trimmed = body.stripePublishableKey.trim()
    if (!trimmed.startsWith('pk_live_') && !trimmed.startsWith('pk_test_')) {
      return NextResponse.json({ error: 'Invalid Stripe publishable key format. Must start with pk_live_ or pk_test_' }, { status: 400 })
    }
    updates.encrypted_stripe_publishable_key = `v1:${await encryptToken(trimmed)}`
  }

  // Validate and store Stripe Webhook Secret
  if (body.stripeWebhookSecret) {
    const trimmed = body.stripeWebhookSecret.trim()
    if (!trimmed.startsWith('whsec_')) {
      return NextResponse.json({ error: 'Invalid Stripe webhook secret format. Must start with whsec_' }, { status: 400 })
    }
    updates.encrypted_stripe_webhook_secret = `v1:${await encryptToken(trimmed)}`
  }

  // Validate and store AussieSMS API Key
  if (body.aussieSmsApiKey) {
    const trimmed = body.aussieSmsApiKey.trim()

    if (!body.skipValidation) {
      // Validate by calling the AussieSMS API — 400 = valid key (missing params), 401 = invalid key
      try {
        const res = await fetch('https://aussieotp.vercel.app/api/gateway/send', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': trimmed,
          },
          body: JSON.stringify({}),
          signal: AbortSignal.timeout(10000),
        })
        if (res.status === 401 || res.status === 403) {
          return NextResponse.json({ error: 'Invalid AussieSMS API key' }, { status: 400 })
        }
        // 400 = valid key but missing params (expected), 200 = also fine
      } catch (err: any) {
        return NextResponse.json({
          error: `AussieSMS key validation failed: ${err.message || 'Network error'}`,
        }, { status: 400 })
      }
    }

    updates.encrypted_aussiesms_api_key = `v1:${await encryptToken(trimmed)}`
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
  } else if (target === 'supabase') {
    patch.encrypted_supabase_url = null
    patch.encrypted_supabase_key = null
  } else if (target === 'supabaseAccessToken') {
    patch.encrypted_supabase_access_token = null
  } else if (target === 'googleOAuth') {
    patch.encrypted_google_client_id = null
    patch.encrypted_google_client_secret = null
  } else if (target === 'googleApiKey') {
    patch.encrypted_google_api_key = null
  } else if (target === 'googleServiceAccount') {
    patch.encrypted_google_service_account = null
  } else if (target === 'googleAccount') {
    patch.encrypted_google_access_token = null
    patch.encrypted_google_refresh_token = null
    patch.google_token_expiry = null
    patch.google_connected_email = null
    patch.google_connected_scopes = null
  } else if (target === 'stripe') {
    patch.encrypted_stripe_secret_key = null
    patch.encrypted_stripe_publishable_key = null
    patch.encrypted_stripe_webhook_secret = null
  } else if (target === 'aussiesms') {
    patch.encrypted_aussiesms_api_key = null
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
