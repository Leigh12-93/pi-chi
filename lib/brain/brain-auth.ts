/* ─── Pi-Chi Brain — API Authentication ───────────────────────── */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { randomBytes } from 'node:crypto'

const TOKEN_FILE = join(homedir(), '.pi-chi', 'api-token')

/** Get or generate the API token */
function getToken(): string {
  const dir = join(homedir(), '.pi-chi')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })

  if (existsSync(TOKEN_FILE)) {
    const token = readFileSync(TOKEN_FILE, 'utf-8').trim()
    if (token.length >= 32) return token
  }

  // Generate a new token
  const token = randomBytes(32).toString('hex')
  writeFileSync(TOKEN_FILE, token, { mode: 0o600 })
  console.log(`[brain-auth] Generated API token — stored at ${TOKEN_FILE}`)
  return token
}

// Cache token in memory
let _cachedToken: string | null = null

function getCachedToken(): string {
  if (!_cachedToken) _cachedToken = getToken()
  return _cachedToken
}

/**
 * Validate brain API request authentication.
 * Returns null if authorized, or a Response if unauthorized.
 */
export function requireBrainAuth(req: Request): Response | null {
  // Allow if BRAIN_API_TOKEN env var is set to 'disabled'
  if (process.env.BRAIN_API_TOKEN === 'disabled') return null

  // Allow same-origin requests (dashboard frontend on same host/local network)
  // Browser sends Origin with the host it loaded from, but Next.js resolves
  // req.url to localhost — so we check if the origin is local network
  const origin = req.headers.get('origin')
  const referer = req.headers.get('referer')
  const sourceHost = (() => {
    try {
      return new URL(origin || referer || '').hostname
    } catch { return '' }
  })()
  const localHosts = ['localhost', '127.0.0.1', '::1']
  const isLocalNetwork = localHosts.includes(sourceHost)
    || sourceHost.startsWith('192.168.')
    || sourceHost.startsWith('10.')
    || sourceHost.startsWith('172.')
  if (isLocalNetwork) return null

  // Allow requests with no origin/referer (server-side, curl from localhost, etc.)
  // These come from Next.js SSR or the brain process itself
  if (!origin && !referer) return null

  const token = getCachedToken()
  const auth = req.headers.get('authorization')

  if (!auth) {
    // Also check query param for SSE/EventSource connections
    try {
      const url = new URL(req.url)
      const qToken = url.searchParams.get('token')
      if (qToken === token) return null
    } catch { /* ignore */ }

    return new Response(JSON.stringify({ error: 'Authorization required' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  // Support "Bearer <token>" format
  const parts = auth.split(' ')
  const providedToken = parts.length === 2 && parts[0].toLowerCase() === 'bearer'
    ? parts[1]
    : auth

  if (providedToken !== token) {
    return new Response(JSON.stringify({ error: 'Invalid token' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  return null
}

/** Export the token path for documentation/setup */
export function getTokenPath(): string {
  return TOKEN_FILE
}
