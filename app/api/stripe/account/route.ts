import { NextResponse } from 'next/server'
import { getSession, decryptToken } from '@/lib/auth'
import { supabaseFetch } from '@/lib/supabase-fetch'

/** GET /api/stripe/account — fetch Stripe account info + balance using saved secret key */
export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Load encrypted Stripe secret key
  const { data, ok } = await supabaseFetch(
    `/forge_user_settings?github_username=eq.${encodeURIComponent(session.githubUsername)}&select=encrypted_stripe_secret_key`,
  )

  if (!ok || !Array.isArray(data) || data.length === 0 || !data[0].encrypted_stripe_secret_key) {
    return NextResponse.json({ connected: false })
  }

  let secretKey: string
  try {
    secretKey = await decryptToken(data[0].encrypted_stripe_secret_key.replace(/^v1:/, ''))
  } catch (err) {
    console.error('[stripe/account] decrypt Stripe key failed:', err instanceof Error ? err.message : err)
    return NextResponse.json({ error: 'Failed to decrypt Stripe key' }, { status: 500 })
  }

  try {
    // Fetch account info and balance in parallel
    const [accountRes, balanceRes] = await Promise.all([
      fetch('https://api.stripe.com/v1/account', {
        headers: { Authorization: `Bearer ${secretKey}` },
        signal: AbortSignal.timeout(10000),
      }),
      fetch('https://api.stripe.com/v1/balance', {
        headers: { Authorization: `Bearer ${secretKey}` },
        signal: AbortSignal.timeout(10000),
      }),
    ])

    if (!accountRes.ok) {
      const err = await accountRes.json().catch(() => ({}))
      return NextResponse.json({
        connected: false,
        error: `Stripe API error: ${(err as any).error?.message || `HTTP ${accountRes.status}`}`,
      })
    }

    const account = await accountRes.json()
    const balance = balanceRes.ok ? await balanceRes.json() : null

    return NextResponse.json({
      connected: true,
      account: {
        id: account.id,
        name: account.settings?.dashboard?.display_name || account.business_profile?.name || account.email || account.id,
        email: account.email,
        country: account.country,
        defaultCurrency: account.default_currency,
        livemode: !secretKey.includes('_test_'),
        chargesEnabled: account.charges_enabled,
        payoutsEnabled: account.payouts_enabled,
        detailsSubmitted: account.details_submitted,
      },
      balance: balance ? {
        available: balance.available?.map((b: any) => ({ amount: b.amount, currency: b.currency })) || [],
        pending: balance.pending?.map((b: any) => ({ amount: b.amount, currency: b.currency })) || [],
      } : null,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({
      connected: false,
      error: `Failed to connect to Stripe: ${msg || 'Network error'}`,
    })
  }
}
