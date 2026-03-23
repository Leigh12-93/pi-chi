import { NextResponse } from 'next/server'
import { getSession, decryptToken } from '@/lib/auth'
import { supabaseFetch } from '@/lib/supabase-fetch'

/**
 * POST /api/checkout
 * Create a Stripe Checkout Session for the authenticated user.
 * Returns { url } — the hosted Stripe checkout URL to redirect the customer to.
 */
export async function POST(req: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: { priceId?: string; successUrl?: string; cancelUrl?: string; mode?: string; customerEmail?: string; quantity?: number }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { priceId, successUrl, cancelUrl, mode = 'subscription', customerEmail, quantity } = body

  if (!priceId) return NextResponse.json({ error: 'priceId is required' }, { status: 400 })
  if (!successUrl) return NextResponse.json({ error: 'successUrl is required' }, { status: 400 })
  if (!cancelUrl) return NextResponse.json({ error: 'cancelUrl is required' }, { status: 400 })

  // Validate mode
  const validModes = ['payment', 'subscription', 'setup']
  if (!validModes.includes(mode)) {
    return NextResponse.json({ error: `mode must be one of: ${validModes.join(', ')}` }, { status: 400 })
  }

  // Load encrypted Stripe secret key for this user
  const { data, ok } = await supabaseFetch(
    `/pi_user_settings?github_username=eq.${encodeURIComponent(session.githubUsername)}&select=encrypted_stripe_secret_key`,
  )

  if (!ok || !Array.isArray(data) || data.length === 0 || !(data[0] as Record<string, unknown>).encrypted_stripe_secret_key) {
    return NextResponse.json({ error: 'No Stripe key configured. Add your Stripe secret key in Settings → Stripe.' }, { status: 400 })
  }

  let secretKey: string
  try {
    const encrypted = (data[0] as Record<string, string>).encrypted_stripe_secret_key
    secretKey = await decryptToken(encrypted.replace(/^v1:/, ''))
  } catch (err) {
    console.error('[checkout] decrypt Stripe key failed:', err instanceof Error ? err.message : err)
    return NextResponse.json({ error: 'Failed to decrypt Stripe key' }, { status: 500 })
  }

  try {
    const formBody = new URLSearchParams({
      mode,
      'line_items[0][price]': priceId,
      'line_items[0][quantity]': String(quantity || 1),
      success_url: successUrl,
      cancel_url: cancelUrl,
    })
    if (customerEmail) formBody.set('customer_email', customerEmail)

    const res = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${secretKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: formBody,
      signal: AbortSignal.timeout(15000),
    })

    const result = await res.json() as Record<string, unknown>

    if (!res.ok) {
      const errMsg = (result.error as Record<string, unknown>)?.message || `Stripe API ${res.status}`
      return NextResponse.json({ error: `Stripe error: ${errMsg}` }, { status: 502 })
    }

    return NextResponse.json({ url: result.url, id: result.id })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[checkout] Stripe API error:', msg)
    return NextResponse.json({ error: `Failed to create checkout session: ${msg}` }, { status: 500 })
  }
}
