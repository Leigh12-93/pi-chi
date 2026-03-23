import { NextResponse } from 'next/server'
import { supabaseFetch } from '@/lib/supabase-fetch'
import { decryptToken } from '@/lib/auth'

// Stripe sends webhooks as raw body — ensure Next.js does not pre-parse
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/** Update subscription fields for a user found by email (checkout flow) */
async function syncSubscriptionByEmail(email: string, fields: Record<string, string | null>) {
  const { ok } = await supabaseFetch(
    `/pi_user_settings?github_username=eq.${encodeURIComponent(email)}`,
    { method: 'PATCH', body: JSON.stringify(fields) },
  )
  if (!ok) console.error(`[stripe/webhook] Failed to sync subscription for email ${email}`)
}

/** Update subscription fields for a user found by stripe_customer_id */
async function syncSubscriptionByCustomer(customerId: string, fields: Record<string, string | null>) {
  const { ok } = await supabaseFetch(
    `/pi_user_settings?stripe_customer_id=eq.${encodeURIComponent(customerId)}`,
    { method: 'PATCH', body: JSON.stringify(fields) },
  )
  if (!ok) console.error(`[stripe/webhook] Failed to sync subscription for customer ${customerId}`)
}

/**
 * Verify a Stripe webhook signature using HMAC-SHA256.
 * Stripe signs requests with a timestamp + payload, separated by '.'.
 * See: https://stripe.com/docs/webhooks/signatures
 */
async function verifyStripeSignature(
  rawBody: string,
  sigHeader: string,
  secret: string,
): Promise<boolean> {
  // Parse the Stripe-Signature header: t=timestamp,v1=hash,...
  const parts: Record<string, string[]> = {}
  for (const part of sigHeader.split(',')) {
    const eqIdx = part.indexOf('=')
    if (eqIdx < 0) continue
    const k = part.slice(0, eqIdx)
    const v = part.slice(eqIdx + 1)
    if (!parts[k]) parts[k] = []
    parts[k].push(v)
  }

  const timestamp = parts['t']?.[0]
  const signatures = parts['v1'] || []
  if (!timestamp || signatures.length === 0) return false

  // Reject events older than 5 minutes (anti-replay)
  const ts = parseInt(timestamp, 10)
  const now = Math.floor(Date.now() / 1000)
  if (Math.abs(now - ts) > 300) return false

  // Compute HMAC-SHA256 of "timestamp.payload"
  const signedPayload = `${timestamp}.${rawBody}`
  const encoder = new TextEncoder()
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const signatureBuffer = await crypto.subtle.sign('HMAC', cryptoKey, encoder.encode(signedPayload))
  const computed = Array.from(new Uint8Array(signatureBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')

  return signatures.some((sig) => sig === computed)
}

/**
 * POST /api/webhooks/stripe
 * Validates Stripe webhook signature and processes events.
 * No auth required — webhooks come directly from Stripe servers.
 */
export async function POST(req: Request) {
  const sigHeader = req.headers.get('stripe-signature')
  if (!sigHeader) {
    return NextResponse.json({ error: 'Missing stripe-signature header' }, { status: 400 })
  }

  // Resolve webhook secret: env var takes precedence, then Supabase
  let webhookSecret: string | null = process.env.STRIPE_WEBHOOK_SECRET?.trim() || null

  if (!webhookSecret) {
    try {
      const { data, ok } = await supabaseFetch(
        `/pi_user_settings?encrypted_stripe_webhook_secret=not.is.null&select=encrypted_stripe_webhook_secret&limit=1`,
      )
      if (ok && Array.isArray(data) && data.length > 0 && (data[0] as Record<string, unknown>).encrypted_stripe_webhook_secret) {
        const raw = ((data[0] as Record<string, string>).encrypted_stripe_webhook_secret).replace(/^v1:/, '')
        webhookSecret = await decryptToken(raw)
      }
    } catch (err) {
      console.error('[stripe/webhook] Failed to load webhook secret:', err instanceof Error ? err.message : err)
    }
  }

  if (!webhookSecret) {
    console.error('[stripe/webhook] No webhook secret configured')
    return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 })
  }

  const rawBody = await req.text()

  const valid = await verifyStripeSignature(rawBody, sigHeader, webhookSecret)
  if (!valid) {
    console.error('[stripe/webhook] Signature verification failed')
    return NextResponse.json({ error: 'Webhook signature verification failed' }, { status: 400 })
  }

  let event: { type: string; id: string; data: { object: Record<string, unknown> } }
  try {
    event = JSON.parse(rawBody)
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  console.log(`[stripe/webhook] Received event: ${event.type} (${event.id})`)

  try {
    const obj = event.data.object

    switch (event.type) {
      case 'checkout.session.completed': {
        console.log(`[stripe/webhook] Checkout completed: ${obj.id}, customer: ${obj.customer}`)
        const customerId = obj.customer as string | undefined
        const subscriptionId = obj.subscription as string | undefined
        const customerEmail = obj.customer_email as string | undefined
        if (customerId && customerEmail) {
          await syncSubscriptionByEmail(customerEmail, { stripe_customer_id: customerId, stripe_subscription_id: subscriptionId || null })
        }
        break
      }

      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        console.log(`[stripe/webhook] Subscription ${event.type.split('.').pop()}: ${obj.id}, customer: ${obj.customer}, status: ${obj.status}`)
        const customerId = obj.customer as string
        const plan = (obj.items as Record<string, unknown[]>)?.data?.[0] as Record<string, unknown> | undefined
        const priceId = (plan?.price as Record<string, unknown>)?.id as string | undefined
        await syncSubscriptionByCustomer(customerId, {
          stripe_subscription_id: obj.id as string,
          subscription_status: obj.status as string,
          subscription_plan: priceId || null,
          subscription_current_period_end: obj.current_period_end
            ? new Date((obj.current_period_end as number) * 1000).toISOString()
            : null,
        })
        break
      }

      case 'customer.subscription.deleted': {
        console.log(`[stripe/webhook] Subscription deleted: ${obj.id}, customer: ${obj.customer}`)
        await syncSubscriptionByCustomer(obj.customer as string, {
          stripe_subscription_id: null,
          subscription_status: 'canceled',
          subscription_plan: null,
          subscription_current_period_end: null,
        })
        break
      }

      case 'invoice.payment_succeeded':
        console.log(`[stripe/webhook] Invoice paid: ${obj.id}, amount: ${obj.amount_paid} ${obj.currency}`)
        break

      case 'invoice.payment_failed':
        console.log(`[stripe/webhook] Invoice payment failed: ${obj.id}, customer: ${obj.customer}`)
        break

      default:
        console.log(`[stripe/webhook] Unhandled event type: ${event.type}`)
    }
  } catch (err) {
    console.error(`[stripe/webhook] Error processing event ${event.type}:`, err instanceof Error ? err.message : err)
    // Return 200 to prevent Stripe from retrying — the error is logged for investigation
  }

  return NextResponse.json({ received: true })
}

/** GET /api/webhooks/stripe — health check / method hint */
export async function GET() {
  return NextResponse.json(
    { error: 'Stripe webhooks use POST' },
    { status: 405, headers: { Allow: 'POST' } },
  )
}
