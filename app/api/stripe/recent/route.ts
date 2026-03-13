import { NextResponse } from 'next/server'
import { getSession, decryptToken } from '@/lib/auth'
import { supabaseFetch } from '@/lib/supabase-fetch'

/** GET /api/stripe/recent — fetch recent charges, payouts, and subscription count */
export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, ok } = await supabaseFetch(
    `/pi_user_settings?github_username=eq.${encodeURIComponent(session.githubUsername)}&select=encrypted_stripe_secret_key`,
  )

  if (!ok || !Array.isArray(data) || data.length === 0 || !data[0].encrypted_stripe_secret_key) {
    return NextResponse.json({ error: 'No Stripe key configured' }, { status: 400 })
  }

  let secretKey: string
  try {
    secretKey = await decryptToken(data[0].encrypted_stripe_secret_key.replace(/^v1:/, ''))
  } catch (err) {
    console.error('[stripe/recent] decrypt Stripe key failed:', err instanceof Error ? err.message : err)
    return NextResponse.json({ error: 'Failed to decrypt Stripe key' }, { status: 500 })
  }

  const headers = { Authorization: `Bearer ${secretKey}` }
  const timeout = AbortSignal.timeout(10000)

  try {
    // Fetch charges, payouts, and subscriptions in parallel
    const [chargesRes, payoutsRes, subsRes] = await Promise.all([
      fetch('https://api.stripe.com/v1/charges?limit=10', { headers, signal: timeout }),
      fetch('https://api.stripe.com/v1/payouts?limit=5', { headers, signal: timeout }),
      fetch('https://api.stripe.com/v1/subscriptions?limit=1&status=active', { headers, signal: timeout }),
    ])

    const charges = chargesRes.ok ? await chargesRes.json() : { data: [] }
    const payouts = payoutsRes.ok ? await payoutsRes.json() : { data: [] }
    const subs = subsRes.ok ? await subsRes.json() : { data: [], total_count: 0 }

    return NextResponse.json({
      charges: charges.data?.map((c: any) => ({
        id: c.id,
        amount: c.amount,
        currency: c.currency,
        status: c.status,
        customerEmail: c.billing_details?.email || c.receipt_email || null,
        description: c.description,
        created: c.created,
      })) || [],
      payouts: payouts.data?.map((p: any) => ({
        id: p.id,
        amount: p.amount,
        currency: p.currency,
        status: p.status,
        arrivalDate: p.arrival_date,
        created: p.created,
      })) || [],
      activeSubscriptions: subs.total_count ?? subs.data?.length ?? 0,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: `Stripe API error: ${msg}` }, { status: 500 })
  }
}
