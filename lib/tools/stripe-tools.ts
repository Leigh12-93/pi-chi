import { tool } from 'ai'
import { z } from 'zod'
import { decryptToken } from '@/lib/auth'
import type { ToolContext } from './types'

/** Load and decrypt the user's Stripe secret key from pi_user_settings */
async function getStripeKey(
  githubUsername: string | undefined,
  supabaseFetch: ToolContext['supabaseFetch'],
): Promise<{ key: string } | { error: string }> {
  if (!githubUsername) return { error: 'No session — Stripe tools require authentication' }

  const { data, ok } = await supabaseFetch(
    `/pi_user_settings?github_username=eq.${encodeURIComponent(githubUsername)}&select=encrypted_stripe_secret_key`,
  )

  if (!ok || !Array.isArray(data) || data.length === 0 || !(data[0] as Record<string, unknown>).encrypted_stripe_secret_key) {
    return { error: 'No Stripe key configured. Add your Stripe secret key in Settings → Stripe.' }
  }

  try {
    const encrypted = (data[0] as Record<string, string>).encrypted_stripe_secret_key
    const key = await decryptToken(encrypted.replace(/^v1:/, ''))
    return { key }
  } catch {
    return { error: 'Failed to decrypt Stripe key' }
  }
}

/** Shared Stripe API fetch helper */
async function stripeFetch(
  key: string,
  path: string,
  options?: { method?: string; body?: URLSearchParams },
): Promise<{ ok: boolean; data: Record<string, unknown>; status: number }> {
  const res = await fetch(`https://api.stripe.com/v1${path}`, {
    method: options?.method || 'GET',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: options?.body,
    signal: AbortSignal.timeout(15000),
  })
  const data = await res.json().catch(() => ({})) as Record<string, unknown>
  return { ok: res.ok, data, status: res.status }
}

export function createStripeTools(ctx: ToolContext) {
  const { githubUsername, supabaseFetch } = ctx

  /** Run a Stripe API call, handling key loading and errors */
  async function withStripe<T>(
    fn: (key: string) => Promise<T>,
  ): Promise<T | { error: string }> {
    const auth = await getStripeKey(githubUsername, supabaseFetch)
    if ('error' in auth) return auth
    try {
      return await fn(auth.key)
    } catch (err) {
      return { error: `Stripe API error: ${err instanceof Error ? err.message : String(err)}` }
    }
  }

  return {
    stripe_list_customers: tool({
      description: 'List Stripe customers. Optionally filter by email address.',
      inputSchema: z.object({
        email: z.string().optional().describe('Filter by exact email address'),
        limit: z.number().min(1).max(100).optional().describe('Max results (default: 20)'),
      }),
      execute: async ({ email, limit }) =>
        withStripe(async (key) => {
          const params = new URLSearchParams({ limit: String(limit || 20) })
          if (email) params.set('email', email)
          const { ok, data } = await stripeFetch(key, `/customers?${params}`)
          if (!ok) return { error: (data.error as Record<string, unknown>)?.message || 'Failed to list customers' }
          const list = data as { data: Array<Record<string, unknown>>; has_more: boolean }
          return {
            customers: list.data.map((c) => ({
              id: c.id,
              email: c.email,
              name: c.name,
              created: c.created,
              currency: c.currency,
              balance: c.balance,
            })),
            hasMore: list.has_more,
          }
        }),
    }),

    stripe_create_customer: tool({
      description: 'Create a new Stripe customer.',
      inputSchema: z.object({
        email: z.string().email().describe('Customer email address'),
        name: z.string().optional().describe('Customer full name'),
        metadata: z.record(z.string()).optional().describe('Key-value metadata to attach to the customer'),
      }),
      execute: async ({ email, name, metadata }) =>
        withStripe(async (key) => {
          const body = new URLSearchParams({ email })
          if (name) body.set('name', name)
          if (metadata) {
            for (const [k, v] of Object.entries(metadata)) body.set(`metadata[${k}]`, v)
          }
          const { ok, data } = await stripeFetch(key, '/customers', { method: 'POST', body })
          if (!ok) return { error: (data.error as Record<string, unknown>)?.message || 'Failed to create customer' }
          return { id: data.id, email: data.email, name: data.name, created: data.created }
        }),
    }),

    stripe_list_products: tool({
      description: 'List Stripe products (your offerings/plans).',
      inputSchema: z.object({
        active: z.boolean().optional().describe('Filter to active products only (default: all)'),
        limit: z.number().min(1).max(100).optional().describe('Max results (default: 20)'),
      }),
      execute: async ({ active, limit }) =>
        withStripe(async (key) => {
          const params = new URLSearchParams({ limit: String(limit || 20) })
          if (active !== undefined) params.set('active', String(active))
          const { ok, data } = await stripeFetch(key, `/products?${params}`)
          if (!ok) return { error: (data.error as Record<string, unknown>)?.message || 'Failed to list products' }
          const list = data as { data: Array<Record<string, unknown>>; has_more: boolean }
          return {
            products: list.data.map((p) => ({
              id: p.id,
              name: p.name,
              description: p.description,
              active: p.active,
              created: p.created,
            })),
            hasMore: list.has_more,
          }
        }),
    }),

    stripe_create_product: tool({
      description: 'Create a new Stripe product (e.g., a subscription plan or one-time item).',
      inputSchema: z.object({
        name: z.string().describe('Product name'),
        description: z.string().optional().describe('Product description'),
        metadata: z.record(z.string()).optional().describe('Key-value metadata'),
      }),
      execute: async ({ name, description, metadata }) =>
        withStripe(async (key) => {
          const body = new URLSearchParams({ name })
          if (description) body.set('description', description)
          if (metadata) {
            for (const [k, v] of Object.entries(metadata)) body.set(`metadata[${k}]`, v)
          }
          const { ok, data } = await stripeFetch(key, '/products', { method: 'POST', body })
          if (!ok) return { error: (data.error as Record<string, unknown>)?.message || 'Failed to create product' }
          return { id: data.id, name: data.name, description: data.description, active: data.active }
        }),
    }),

    stripe_create_price: tool({
      description: 'Create a price for a Stripe product. Can be recurring (subscription) or one-time.',
      inputSchema: z.object({
        productId: z.string().describe('Stripe product ID to attach this price to'),
        unitAmount: z.number().describe('Amount in smallest currency unit (e.g., 999 = $9.99 USD)'),
        currency: z.string().default('usd').describe('3-letter ISO currency code (default: usd)'),
        recurring: z.object({
          interval: z.enum(['day', 'week', 'month', 'year']).describe('Billing interval'),
          intervalCount: z.number().optional().describe('Number of intervals between billings (default: 1)'),
        }).optional().describe('Omit for one-time prices; include for subscriptions'),
        nickname: z.string().optional().describe('Internal nickname for this price'),
      }),
      execute: async ({ productId, unitAmount, currency, recurring, nickname }) =>
        withStripe(async (key) => {
          const body = new URLSearchParams({
            product: productId,
            unit_amount: String(unitAmount),
            currency,
          })
          if (nickname) body.set('nickname', nickname)
          if (recurring) {
            body.set('recurring[interval]', recurring.interval)
            if (recurring.intervalCount) body.set('recurring[interval_count]', String(recurring.intervalCount))
          }
          const { ok, data } = await stripeFetch(key, '/prices', { method: 'POST', body })
          if (!ok) return { error: (data.error as Record<string, unknown>)?.message || 'Failed to create price' }
          const rec = data.recurring as Record<string, unknown> | null
          return {
            id: data.id,
            unitAmount: data.unit_amount,
            currency: data.currency,
            recurring: rec ? { interval: rec.interval, intervalCount: rec.interval_count } : null,
            active: data.active,
          }
        }),
    }),

    stripe_create_checkout_session: tool({
      description: 'Create a Stripe Checkout Session and return the payment URL to share with a customer.',
      inputSchema: z.object({
        priceId: z.string().describe('Stripe price ID'),
        successUrl: z.string().url().describe('URL to redirect to after successful payment'),
        cancelUrl: z.string().url().describe('URL to redirect to if the customer cancels'),
        mode: z.enum(['payment', 'subscription', 'setup']).default('subscription').describe('Checkout mode'),
        customerEmail: z.string().email().optional().describe('Pre-fill the customer email'),
        quantity: z.number().min(1).optional().describe('Quantity (default: 1)'),
      }),
      execute: async ({ priceId, successUrl, cancelUrl, mode, customerEmail, quantity }) =>
        withStripe(async (key) => {
          const body = new URLSearchParams({
            mode,
            'line_items[0][price]': priceId,
            'line_items[0][quantity]': String(quantity || 1),
            success_url: successUrl,
            cancel_url: cancelUrl,
          })
          if (customerEmail) body.set('customer_email', customerEmail)
          const { ok, data } = await stripeFetch(key, '/checkout/sessions', { method: 'POST', body })
          if (!ok) return { error: (data.error as Record<string, unknown>)?.message || 'Failed to create checkout session' }
          return { id: data.id, url: data.url, mode: data.mode }
        }),
    }),

    stripe_list_subscriptions: tool({
      description: 'List Stripe subscriptions.',
      inputSchema: z.object({
        status: z.enum(['active', 'past_due', 'unpaid', 'canceled', 'incomplete', 'trialing', 'all']).optional().describe('Filter by status (default: active)'),
        customerId: z.string().optional().describe('Filter to a specific customer ID'),
        limit: z.number().min(1).max(100).optional().describe('Max results (default: 20)'),
      }),
      execute: async ({ status, customerId, limit }) =>
        withStripe(async (key) => {
          const params = new URLSearchParams({ limit: String(limit || 20) })
          if (status && status !== 'all') params.set('status', status)
          if (customerId) params.set('customer', customerId)
          const { ok, data } = await stripeFetch(key, `/subscriptions?${params}`)
          if (!ok) return { error: (data.error as Record<string, unknown>)?.message || 'Failed to list subscriptions' }
          const list = data as { data: Array<Record<string, unknown>>; has_more: boolean }
          return {
            subscriptions: list.data.map((s) => {
              const items = (s.items as Record<string, unknown>)?.data as Array<Record<string, unknown>> || []
              return {
                id: s.id,
                customer: s.customer,
                status: s.status,
                currentPeriodEnd: s.current_period_end,
                cancelAtPeriodEnd: s.cancel_at_period_end,
                items: items.map((item) => {
                  const price = item.price as Record<string, unknown> || {}
                  const recurring = price.recurring as Record<string, unknown> | null
                  return {
                    priceId: price.id,
                    productId: price.product,
                    amount: price.unit_amount,
                    currency: price.currency,
                    interval: recurring?.interval,
                  }
                }),
              }
            }),
            hasMore: list.has_more,
          }
        }),
    }),

    stripe_list_invoices: tool({
      description: 'List recent Stripe invoices.',
      inputSchema: z.object({
        customerId: z.string().optional().describe('Filter to a specific customer ID'),
        status: z.enum(['draft', 'open', 'paid', 'uncollectible', 'void']).optional().describe('Filter by invoice status'),
        limit: z.number().min(1).max(100).optional().describe('Max results (default: 10)'),
      }),
      execute: async ({ customerId, status, limit }) =>
        withStripe(async (key) => {
          const params = new URLSearchParams({ limit: String(limit || 10) })
          if (customerId) params.set('customer', customerId)
          if (status) params.set('status', status)
          const { ok, data } = await stripeFetch(key, `/invoices?${params}`)
          if (!ok) return { error: (data.error as Record<string, unknown>)?.message || 'Failed to list invoices' }
          const list = data as { data: Array<Record<string, unknown>>; has_more: boolean }
          return {
            invoices: list.data.map((inv) => ({
              id: inv.id,
              customer: inv.customer,
              customerEmail: inv.customer_email,
              status: inv.status,
              amountDue: inv.amount_due,
              amountPaid: inv.amount_paid,
              currency: inv.currency,
              created: inv.created,
              dueDate: inv.due_date,
              hostedInvoiceUrl: inv.hosted_invoice_url,
            })),
            hasMore: list.has_more,
          }
        }),
    }),

    stripe_create_refund: tool({
      description: 'Issue a full or partial refund on a Stripe charge.',
      inputSchema: z.object({
        chargeId: z.string().describe('Stripe charge ID to refund (starts with ch_)'),
        amount: z.number().optional().describe('Amount to refund in smallest currency unit. Omit for full refund.'),
        reason: z.enum(['duplicate', 'fraudulent', 'requested_by_customer']).optional().describe('Reason for refund'),
      }),
      execute: async ({ chargeId, amount, reason }) =>
        withStripe(async (key) => {
          const body = new URLSearchParams({ charge: chargeId })
          if (amount) body.set('amount', String(amount))
          if (reason) body.set('reason', reason)
          const { ok, data } = await stripeFetch(key, '/refunds', { method: 'POST', body })
          if (!ok) return { error: (data.error as Record<string, unknown>)?.message || 'Failed to create refund' }
          return {
            id: data.id,
            amount: data.amount,
            currency: data.currency,
            status: data.status,
            charge: data.charge,
            reason: data.reason,
          }
        }),
    }),

    stripe_get_balance: tool({
      description: "Get the Stripe account's current balance (available and pending funds).",
      inputSchema: z.object({}),
      execute: async () =>
        withStripe(async (key) => {
          const { ok, data } = await stripeFetch(key, '/balance')
          if (!ok) return { error: (data.error as Record<string, unknown>)?.message || 'Failed to get balance' }
          const available = (data.available as Array<Record<string, unknown>>) || []
          const pending = (data.pending as Array<Record<string, unknown>>) || []
          return {
            available: available.map((b) => ({ amount: b.amount, currency: b.currency })),
            pending: pending.map((b) => ({ amount: b.amount, currency: b.currency })),
          }
        }),
    }),
  }
}
