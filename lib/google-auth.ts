import { decryptToken } from '@/lib/auth'
import { supabaseFetch } from '@/lib/supabase-fetch'

export interface GoogleCredentials {
  accessToken: string
  apiKey?: string
  serviceAccount?: {
    client_email: string
    private_key: string
    project_id: string
  }
}

/**
 * Load and decrypt Google credentials for a user.
 * Auto-refreshes expired OAuth tokens transparently.
 */
export async function getGoogleCredentials(
  githubUsername: string,
  options?: { requireOAuth?: boolean; requireApiKey?: boolean }
): Promise<{ credentials?: GoogleCredentials; error?: string }> {
  try {
    const { data, ok } = await supabaseFetch(
      `/forge_user_settings?github_username=eq.${encodeURIComponent(githubUsername)}&select=encrypted_google_access_token,encrypted_google_refresh_token,encrypted_google_client_id,encrypted_google_client_secret,google_token_expiry,encrypted_google_api_key`
    )

    if (!ok || !Array.isArray(data) || data.length === 0) {
      return { error: 'No Google credentials found. Connect your Google account in Settings.' }
    }

    const row = data[0] as Record<string, string | null>

    if (!row.encrypted_google_access_token) {
      return { error: 'No Google OAuth token. Connect your Google account in Settings.' }
    }

    // Decrypt access token
    const rawToken = row.encrypted_google_access_token.startsWith('v1:')
      ? row.encrypted_google_access_token.slice(3)
      : row.encrypted_google_access_token
    let accessToken = await decryptToken(rawToken)

    // Check if token is expired
    const expiry = row.google_token_expiry ? new Date(row.google_token_expiry).getTime() : 0
    const isExpired = expiry > 0 && Date.now() > expiry - 60000 // 1 min buffer

    if (isExpired && row.encrypted_google_refresh_token) {
      // Refresh the token
      try {
        const refreshToken = await decryptToken(
          row.encrypted_google_refresh_token.startsWith('v1:')
            ? row.encrypted_google_refresh_token.slice(3)
            : row.encrypted_google_refresh_token
        )
        const clientId = row.encrypted_google_client_id
          ? await decryptToken(row.encrypted_google_client_id.startsWith('v1:') ? row.encrypted_google_client_id.slice(3) : row.encrypted_google_client_id)
          : process.env.GOOGLE_CLIENT_ID || ''
        const clientSecret = row.encrypted_google_client_secret
          ? await decryptToken(row.encrypted_google_client_secret.startsWith('v1:') ? row.encrypted_google_client_secret.slice(3) : row.encrypted_google_client_secret)
          : process.env.GOOGLE_CLIENT_SECRET || ''

        const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            grant_type: 'refresh_token',
            refresh_token: refreshToken,
            client_id: clientId,
            client_secret: clientSecret,
          }),
          signal: AbortSignal.timeout(10000),
        })

        if (tokenRes.ok) {
          const tokenData = await tokenRes.json()
          accessToken = tokenData.access_token
          // Note: storing refreshed token back is handled by the caller if needed
        }
      } catch (refreshErr) {
        console.warn('[google-auth] Token refresh failed, using existing token:', refreshErr)
      }
    }

    // Optionally decrypt API key
    let apiKey: string | undefined
    if (row.encrypted_google_api_key) {
      try {
        const rawKey = row.encrypted_google_api_key.startsWith('v1:')
          ? row.encrypted_google_api_key.slice(3)
          : row.encrypted_google_api_key
        apiKey = await decryptToken(rawKey)
      } catch {}
    }

    return {
      credentials: {
        accessToken,
        apiKey,
      },
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return { error: `Failed to load Google credentials: ${msg}` }
  }
}

/**
 * Make an authenticated Google API request with auto-retry on 401.
 */
export async function googleFetch(
  url: string,
  githubUsername: string,
  options?: RequestInit & { timeout?: number }
): Promise<{ ok: boolean; data: unknown; status: number; error?: string }> {
  const creds = await getGoogleCredentials(githubUsername)
  if (creds.error || !creds.credentials) {
    return { ok: false, data: null, status: 401, error: creds.error }
  }

  const timeout = (options as any)?.timeout || 15000
  const { timeout: _, ...fetchOptions } = options || {} as any

  try {
    const res = await fetch(url, {
      ...fetchOptions,
      headers: {
        Authorization: `Bearer ${creds.credentials.accessToken}`,
        ...fetchOptions?.headers,
      },
      signal: AbortSignal.timeout(timeout),
    })

    if (res.status === 401) {
      // Token expired mid-request — try once more with fresh credentials
      const freshCreds = await getGoogleCredentials(githubUsername)
      if (freshCreds.credentials) {
        const retryRes = await fetch(url, {
          ...fetchOptions,
          headers: {
            Authorization: `Bearer ${freshCreds.credentials.accessToken}`,
            ...fetchOptions?.headers,
          },
          signal: AbortSignal.timeout(timeout),
        })
        const retryData = retryRes.ok ? await retryRes.json().catch(() => null) : null
        return { ok: retryRes.ok, data: retryData, status: retryRes.status, error: retryRes.ok ? undefined : `HTTP ${retryRes.status}` }
      }
    }

    const data = res.ok ? await res.json().catch(() => null) : null
    return { ok: res.ok, data, status: res.status, error: res.ok ? undefined : `HTTP ${res.status}` }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return { ok: false, data: null, status: 0, error: msg }
  }
}
