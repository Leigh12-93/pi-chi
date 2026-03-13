'use client'

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import {
  Loader2, CheckCircle2, XCircle, ExternalLink, RefreshCw, Eye, EyeOff,
  Trash2, ChevronDown, CreditCard, DollarSign, Zap, AlertCircle, Clock,
  ArrowUpRight, ArrowDownRight, Shield, Link2, Copy, Wand2, TrendingUp,
} from 'lucide-react'
import { toast } from 'sonner'

interface StripePanelProps {
  fileContents: Record<string, string>
  onFileChange: (path: string, content: string) => void
}

interface StripeSettings {
  hasStripeSecretKey: boolean
  hasStripePublishableKey: boolean
  hasStripeWebhookSecret: boolean
}

interface StripeAccount {
  id: string
  name: string
  email: string | null
  country: string | null
  defaultCurrency: string | null
  livemode: boolean
  chargesEnabled: boolean
  payoutsEnabled: boolean
  detailsSubmitted: boolean
}

interface BalanceAmount {
  amount: number
  currency: string
}

interface Charge {
  id: string
  amount: number
  currency: string
  status: string
  customerEmail: string | null
  description: string | null
  created: number
}

interface Payout {
  id: string
  amount: number
  currency: string
  status: string
  arrivalDate: number
  created: number
}

// ── Stripe tools for AI chat integration ──
const STRIPE_TOOLS = [
  { name: 'stripe_list_charges', description: 'List recent charges with filters' },
  { name: 'stripe_create_charge', description: 'Create a one-time charge' },
  { name: 'stripe_refund_charge', description: 'Refund a charge (full or partial)' },
  { name: 'stripe_list_customers', description: 'List and search customers' },
  { name: 'stripe_create_customer', description: 'Create a new customer' },
  { name: 'stripe_list_subscriptions', description: 'List active subscriptions' },
  { name: 'stripe_create_subscription', description: 'Create a subscription' },
  { name: 'stripe_cancel_subscription', description: 'Cancel a subscription' },
  { name: 'stripe_list_products', description: 'List products and prices' },
  { name: 'stripe_create_product', description: 'Create a product with price' },
  { name: 'stripe_create_checkout_session', description: 'Generate a Checkout URL' },
  { name: 'stripe_create_payment_link', description: 'Create a reusable payment link' },
  { name: 'stripe_list_invoices', description: 'List invoices for a customer' },
  { name: 'stripe_create_invoice', description: 'Create and send an invoice' },
  { name: 'stripe_get_balance', description: 'Get current balance' },
  { name: 'stripe_list_payouts', description: 'List recent payouts' },
  { name: 'stripe_list_payment_intents', description: 'List payment intents' },
  { name: 'stripe_create_payment_intent', description: 'Create a payment intent' },
  { name: 'stripe_list_webhooks', description: 'List webhook endpoints' },
  { name: 'stripe_create_webhook', description: 'Create a webhook endpoint' },
  { name: 'stripe_list_disputes', description: 'List open disputes' },
  { name: 'stripe_get_balance_transactions', description: 'List balance transactions' },
  { name: 'stripe_create_coupon', description: 'Create a discount coupon' },
  { name: 'stripe_list_events', description: 'List recent Stripe events' },
]

// ── Quick links ──
const QUICK_LINKS = [
  { label: 'Dashboard', url: 'https://dashboard.stripe.com', icon: ExternalLink },
  { label: 'API Docs', url: 'https://docs.stripe.com/api', icon: ExternalLink },
  { label: 'Webhook Events', url: 'https://dashboard.stripe.com/webhooks', icon: ExternalLink },
  { label: 'Test Clocks', url: 'https://dashboard.stripe.com/test/billing/subscriptions/test-clocks', icon: Clock },
  { label: 'API Logs', url: 'https://dashboard.stripe.com/logs', icon: ExternalLink },
  { label: 'Stripe CLI', url: 'https://docs.stripe.com/stripe-cli', icon: ExternalLink },
]

/** Detect Stripe keys from project env files */
function detectStripeFromEnv(fileContents: Record<string, string>): {
  secretKey?: { value: string; file: string }
  publishableKey?: { value: string; file: string }
  webhookSecret?: { value: string; file: string }
} {
  const envFiles = ['.env.local', '.env', '.env.development', '.env.production']
  const result: ReturnType<typeof detectStripeFromEnv> = {}

  for (const [path, content] of Object.entries(fileContents)) {
    const filename = path.split('/').pop() || path
    if (!envFiles.includes(filename)) continue

    for (const line of content.split('\n')) {
      const trimmed = line.trim()
      if (trimmed.startsWith('#') || !trimmed.includes('=')) continue
      const eqIdx = trimmed.indexOf('=')
      const k = trimmed.slice(0, eqIdx).trim()
      const v = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '')

      if (!v) continue

      if ((k === 'STRIPE_SECRET_KEY' || k === 'STRIPE_SK') && (v.startsWith('sk_live_') || v.startsWith('sk_test_'))) {
        if (!result.secretKey) result.secretKey = { value: v, file: path }
      }
      if ((k === 'STRIPE_PUBLISHABLE_KEY' || k === 'NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY' || k === 'REACT_APP_STRIPE_PUBLISHABLE_KEY' || k === 'STRIPE_PK') && (v.startsWith('pk_live_') || v.startsWith('pk_test_'))) {
        if (!result.publishableKey) result.publishableKey = { value: v, file: path }
      }
      if ((k === 'STRIPE_WEBHOOK_SECRET' || k === 'STRIPE_WEBHOOK_SIGNING_SECRET') && v.startsWith('whsec_')) {
        if (!result.webhookSecret) result.webhookSecret = { value: v, file: path }
      }
    }
  }

  return result
}

function formatCurrency(amount: number, currency: string): string {
  const amountInMajor = amount / 100
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: currency.toUpperCase() }).format(amountInMajor)
  } catch {
    return `${amountInMajor.toFixed(2)} ${currency.toUpperCase()}`
  }
}

function timeAgo(unix: number): string {
  const diff = Date.now() - unix * 1000
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

function statusColor(status: string): string {
  switch (status) {
    case 'succeeded': case 'paid': return 'text-green-400'
    case 'pending': case 'in_transit': return 'text-amber-400'
    case 'failed': case 'canceled': return 'text-red-400'
    default: return 'text-pi-text-dim'
  }
}

export function StripePanel({ fileContents, onFileChange }: StripePanelProps) {
  const [settings, setSettings] = useState<StripeSettings>({ hasStripeSecretKey: false, hasStripePublishableKey: false, hasStripeWebhookSecret: false })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<string | null>(null)

  // Account data
  const [account, setAccount] = useState<StripeAccount | null>(null)
  const [balance, setBalance] = useState<{ available: BalanceAmount[]; pending: BalanceAmount[] } | null>(null)
  const [accountError, setAccountError] = useState<string | null>(null)
  const [loadingAccount, setLoadingAccount] = useState(false)

  // Recent activity
  const [charges, setCharges] = useState<Charge[]>([])
  const [payouts, setPayouts] = useState<Payout[]>([])
  const [activeSubscriptions, setActiveSubscriptions] = useState(0)
  const [loadingRecent, setLoadingRecent] = useState(false)

  // Form state
  const [secretKey, setSecretKey] = useState('')
  const [publishableKey, setPublishableKey] = useState('')
  const [webhookSecret, setWebhookSecret] = useState('')
  const [showSecretKey, setShowSecretKey] = useState(false)
  const [showWebhookSecret, setShowWebhookSecret] = useState(false)

  // Section toggles
  const [activeSection, setActiveSection] = useState<string | null>(null)

  // Auto-detect
  const envDetected = useMemo(() => detectStripeFromEnv(fileContents), [fileContents])
  const autoSaved = useRef(false)

  const toggleSection = (id: string) => setActiveSection(prev => prev === id ? null : id)

  // ── Load settings ──
  const loadSettings = useCallback(async () => {
    try {
      const res = await fetch('/api/settings')
      if (!res.ok) return
      const data = await res.json()
      setSettings({
        hasStripeSecretKey: data.hasStripeSecretKey ?? false,
        hasStripePublishableKey: data.hasStripePublishableKey ?? false,
        hasStripeWebhookSecret: data.hasStripeWebhookSecret ?? false,
      })
    } catch (e) { console.warn('[pi:stripe] Failed to load Stripe settings:', e) } finally {
      setLoading(false)
    }
  }, [])

  const loadAccount = useCallback(async () => {
    setLoadingAccount(true)
    setAccountError(null)
    try {
      const res = await fetch('/api/stripe/account')
      const data = await res.json()
      if (data.connected) {
        setAccount(data.account)
        setBalance(data.balance)
      } else {
        setAccount(null)
        setAccountError(data.error || null)
      }
    } catch {
      setAccountError('Failed to fetch account')
    } finally {
      setLoadingAccount(false)
    }
  }, [])

  const loadRecent = useCallback(async () => {
    setLoadingRecent(true)
    try {
      const res = await fetch('/api/stripe/recent')
      if (res.ok) {
        const data = await res.json()
        setCharges(data.charges || [])
        setPayouts(data.payouts || [])
        setActiveSubscriptions(data.activeSubscriptions || 0)
      }
    } catch (e) { console.warn('[pi:stripe] Failed to load recent Stripe data:', e) } finally {
      setLoadingRecent(false)
    }
  }, [])

  useEffect(() => { loadSettings() }, [loadSettings])

  // When settings show we have a key, load account + recent
  useEffect(() => {
    if (settings.hasStripeSecretKey) {
      loadAccount()
      loadRecent()
    }
  }, [settings.hasStripeSecretKey, loadAccount, loadRecent])

  // Auto-detect from env and auto-save
  useEffect(() => {
    if (autoSaved.current || settings.hasStripeSecretKey) return
    if (envDetected.secretKey) {
      setSecretKey(envDetected.secretKey.value)
      // Auto-save env creds to settings
      autoSaved.current = true
      const body: Record<string, string> = { skipValidation: 'true' } as any
      body.stripeSecretKey = envDetected.secretKey.value
      if (envDetected.publishableKey) body.stripePublishableKey = envDetected.publishableKey.value
      if (envDetected.webhookSecret) body.stripeWebhookSecret = envDetected.webhookSecret.value

      fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }).then(() => loadSettings()).catch(() => {})
    }
  }, [envDetected, settings.hasStripeSecretKey, loadSettings])

  // ── Save handlers ──
  const handleSave = async () => {
    if (!secretKey.trim()) { toast.error('Secret key is required'); return }
    setSaving('keys')
    try {
      const body: Record<string, string> = { stripeSecretKey: secretKey }
      if (publishableKey.trim()) body.stripePublishableKey = publishableKey
      if (webhookSecret.trim()) body.stripeWebhookSecret = webhookSecret

      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) { toast.error(data.error || 'Failed to save'); return }
      toast.success('Stripe credentials saved')
      setSecretKey('')
      setPublishableKey('')
      setWebhookSecret('')
      loadSettings()
    } catch { toast.error('Network error') }
    finally { setSaving(null) }
  }

  const handleDelete = async () => {
    try {
      const res = await fetch('/api/settings?target=stripe', { method: 'DELETE' })
      if (!res.ok) { toast.error('Failed to remove Stripe credentials'); return }
      toast.success('Stripe credentials removed')
      setAccount(null)
      setBalance(null)
      setCharges([])
      setPayouts([])
      loadSettings()
    } catch { toast.error('Network error') }
  }

  const handleInjectEnvVar = (key: string, value: string) => {
    const envPath = '.env.local'
    const existing = fileContents[envPath] || ''
    const lines = existing.split('\n').filter(l => !l.startsWith(`${key}=`))
    lines.push(`${key}=${value}`)
    onFileChange(envPath, lines.filter(Boolean).join('\n') + '\n')
    toast.success(`Added ${key} to .env.local`)
  }

  const handleCopy = (text: string, label: string) => {
    navigator.clipboard.writeText(text)
    toast.success(`${label} copied`)
  }

  if (loading) {
    return (
      <div className="p-3 flex items-center justify-center">
        <Loader2 className="w-4 h-4 animate-spin text-pi-text-dim" />
      </div>
    )
  }

  if (!settings.hasStripeSecretKey) {
    return (
      <div className="p-3 space-y-3">
        <p className="text-[10px] uppercase tracking-wider text-pi-text-dim font-medium">Stripe</p>

        <div className="flex items-center gap-2 p-3 bg-pi-surface border border-pi-border rounded-lg">
          <CreditCard className="w-4 h-4 text-pi-text-dim shrink-0" />
          <div className="min-w-0">
            <p className="text-xs font-medium text-pi-text">No Stripe account connected</p>
            <p className="text-[10px] text-pi-text-dim mt-0.5">
              Connect your Stripe account to manage payments, subscriptions, and customers.
            </p>
          </div>
        </div>

        {/* Auto-detected env vars hint */}
        {envDetected.secretKey && (
          <div className="rounded-md border border-blue-500/30 bg-blue-500/5 p-2.5">
            <div className="flex items-center gap-1.5 mb-1">
              <Wand2 className="w-3.5 h-3.5 text-blue-400" />
              <span className="text-[11px] font-medium text-blue-300">Auto-Detected Credentials</span>
            </div>
            <p className="text-[10px] text-blue-300/70 mb-1.5">
              Found Stripe keys in your project env files. Saving automatically...
            </p>
            <div className="space-y-0.5">
              {envDetected.secretKey && (
                <div className="flex items-center gap-1.5">
                  <code className="text-[9px] font-mono text-blue-300/80">STRIPE_SECRET_KEY</code>
                  <span className="text-[9px] text-pi-text-dim ml-auto">{envDetected.secretKey.file}</span>
                </div>
              )}
              {envDetected.publishableKey && (
                <div className="flex items-center gap-1.5">
                  <code className="text-[9px] font-mono text-blue-300/80">STRIPE_PUBLISHABLE_KEY</code>
                  <span className="text-[9px] text-pi-text-dim ml-auto">{envDetected.publishableKey.file}</span>
                </div>
              )}
              {envDetected.webhookSecret && (
                <div className="flex items-center gap-1.5">
                  <code className="text-[9px] font-mono text-blue-300/80">STRIPE_WEBHOOK_SECRET</code>
                  <span className="text-[9px] text-pi-text-dim ml-auto">{envDetected.webhookSecret.file}</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Manual setup form */}
        <div className="space-y-2">
          <div className="relative">
            <input
              type={showSecretKey ? 'text' : 'password'}
              placeholder="Secret Key (sk_live_... or sk_test_...)"
              value={secretKey}
              onChange={e => setSecretKey(e.target.value)}
              className="w-full px-2 py-1.5 pr-7 text-xs font-mono bg-pi-bg border border-pi-border rounded-md focus:outline-none focus:border-[#635BFF]"
            />
            <button
              onClick={() => setShowSecretKey(!showSecretKey)}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 text-pi-text-dim hover:text-pi-text"
            >
              {showSecretKey ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
            </button>
          </div>

          <input
            type="text"
            placeholder="Publishable Key (pk_live_... or pk_test_...) — optional"
            value={publishableKey}
            onChange={e => setPublishableKey(e.target.value)}
            className="w-full px-2 py-1.5 text-xs font-mono bg-pi-bg border border-pi-border rounded-md focus:outline-none focus:border-[#635BFF]"
          />

          <div className="relative">
            <input
              type={showWebhookSecret ? 'text' : 'password'}
              placeholder="Webhook Secret (whsec_...) — optional"
              value={webhookSecret}
              onChange={e => setWebhookSecret(e.target.value)}
              className="w-full px-2 py-1.5 pr-7 text-xs font-mono bg-pi-bg border border-pi-border rounded-md focus:outline-none focus:border-[#635BFF]"
            />
            <button
              onClick={() => setShowWebhookSecret(!showWebhookSecret)}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 text-pi-text-dim hover:text-pi-text"
            >
              {showWebhookSecret ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
            </button>
          </div>

          <button
            onClick={handleSave}
            disabled={saving === 'keys' || !secretKey.trim()}
            className="w-full flex items-center justify-center gap-1.5 px-3 py-2 text-xs rounded-md bg-[#635BFF] text-white hover:bg-[#5851ea] disabled:opacity-40 disabled:cursor-not-allowed transition-colors font-medium"
          >
            {saving === 'keys' ? <Loader2 className="w-3 h-3 animate-spin" /> : <CreditCard className="w-3.5 h-3.5" />}
            Connect Stripe
          </button>
        </div>

        <div className="flex items-center gap-2 px-1">
          <span className="flex-1 h-px bg-pi-border" />
          <span className="text-[9px] text-pi-text-dim">or</span>
          <span className="flex-1 h-px bg-pi-border" />
        </div>

        <div className="p-2.5 rounded-lg border border-dashed border-pi-border">
          <p className="text-[9px] text-pi-text-dim leading-relaxed">
            Add <code className="text-[#635BFF] px-0.5 bg-[#635BFF]/10 rounded">STRIPE_SECRET_KEY</code> to your{' '}
            <code className="text-[#635BFF] px-0.5 bg-[#635BFF]/10 rounded">.env.local</code> — auto-connects instantly.
          </p>
        </div>

        <a
          href="https://dashboard.stripe.com/apikeys"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1 text-[10px] text-[#635BFF] hover:underline"
        >
          <ExternalLink className="w-2.5 h-2.5" /> Get your API keys from Stripe Dashboard
        </a>
      </div>
    )
  }

  return (
    <div className="p-3 space-y-2.5">
      <p className="text-[10px] uppercase tracking-wider text-pi-text-dim font-medium">Stripe</p>

      <div className={`rounded-md border p-2.5 ${
        account ? 'border-green-500/20 bg-green-500/5' : accountError ? 'border-red-500/20 bg-red-500/5' : 'border-pi-border bg-pi-surface/30'
      }`}>
        {loadingAccount ? (
          <div className="flex items-center gap-2 justify-center py-1">
            <Loader2 className="w-3.5 h-3.5 animate-spin text-pi-text-dim" />
            <span className="text-[10px] text-pi-text-dim">Connecting to Stripe...</span>
          </div>
        ) : account ? (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-green-400" />
                <span className="text-[11px] font-medium text-pi-text">{account.name}</span>
              </div>
              <div className="flex items-center gap-1">
                <span className={`text-[8px] px-1.5 py-0.5 rounded-full font-medium ${
                  account.livemode ? 'bg-green-500/20 text-green-400' : 'bg-amber-500/20 text-amber-400'
                }`}>
                  {account.livemode ? 'LIVE' : 'TEST'}
                </span>
                <button
                  onClick={() => { loadAccount(); loadRecent() }}
                  className="p-0.5 text-pi-text-dim hover:text-pi-text transition-colors"
                  title="Refresh"
                >
                  <RefreshCw className="w-3 h-3" />
                </button>
              </div>
            </div>
            {account.email && <p className="text-[10px] text-pi-text-dim">{account.email}</p>}
            <div className="flex items-center gap-2 text-[9px] text-pi-text-dim">
              {account.country && <span>{account.country}</span>}
              {account.defaultCurrency && <span>{account.defaultCurrency.toUpperCase()}</span>}
              {account.chargesEnabled && <span className="text-green-400">Charges OK</span>}
              {account.payoutsEnabled && <span className="text-green-400">Payouts OK</span>}
            </div>
            <a
              href={`https://dashboard.stripe.com${account.livemode ? '' : '/test'}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-[10px] text-[#635BFF] hover:underline"
            >
              <ExternalLink className="w-2.5 h-2.5" /> Open Dashboard
            </a>
          </div>
        ) : accountError ? (
          <div className="flex items-start gap-2">
            <AlertCircle className="w-3.5 h-3.5 text-red-400 shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-[10px] text-red-400">{accountError}</p>
              <button onClick={loadAccount} className="text-[9px] text-pi-accent hover:underline mt-1">Retry</button>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <Loader2 className="w-3.5 h-3.5 animate-spin text-pi-text-dim" />
            <span className="text-[10px] text-pi-text-dim">Loading account...</span>
          </div>
        )}
      </div>

      {balance && (
        <div className="rounded-md border border-pi-border bg-pi-surface/30 p-2.5">
          <div className="flex items-center gap-1.5 mb-2">
            <DollarSign className="w-3.5 h-3.5 text-pi-text-dim" />
            <span className="text-[11px] font-medium text-pi-text">Balance</span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <p className="text-[9px] text-pi-text-dim uppercase tracking-wider mb-0.5">Available</p>
              {balance.available.map(b => (
                <p key={b.currency} className="text-[12px] font-medium text-green-400 font-mono">
                  {formatCurrency(b.amount, b.currency)}
                </p>
              ))}
              {balance.available.length === 0 && <p className="text-[10px] text-pi-text-dim">—</p>}
            </div>
            <div>
              <p className="text-[9px] text-pi-text-dim uppercase tracking-wider mb-0.5">Pending</p>
              {balance.pending.map(b => (
                <p key={b.currency} className="text-[12px] font-medium text-amber-400 font-mono">
                  {formatCurrency(b.amount, b.currency)}
                </p>
              ))}
              {balance.pending.length === 0 && <p className="text-[10px] text-pi-text-dim">—</p>}
            </div>
          </div>
        </div>
      )}

      <div className="rounded-md border border-pi-border">
        <button
          onClick={() => toggleSection('recent')}
          className="w-full flex items-center gap-2 px-2.5 py-2 text-left hover:bg-pi-surface/50 transition-colors"
        >
          <ChevronDown className={`w-3 h-3 text-pi-text-dim transition-transform ${activeSection === 'recent' ? '' : '-rotate-90'}`} />
          <TrendingUp className="w-3.5 h-3.5 text-pi-text-dim" />
          <span className="text-[11px] font-medium text-pi-text flex-1">Recent Activity</span>
          {loadingRecent && <Loader2 className="w-3 h-3 animate-spin text-pi-text-dim" />}
          {activeSubscriptions > 0 && (
            <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-[#635BFF]/10 text-[#635BFF]">
              {activeSubscriptions} sub{activeSubscriptions !== 1 ? 's' : ''}
            </span>
          )}
        </button>

        {activeSection === 'recent' && (
          <div className="border-t border-pi-border/50 px-2.5 py-2 space-y-2">
            {/* Charges */}
            {charges.length > 0 && (
              <div>
                <p className="text-[9px] uppercase tracking-wider text-pi-text-dim font-medium mb-1">
                  Recent Charges ({charges.length})
                </p>
                <div className="space-y-1 max-h-[200px] overflow-y-auto">
                  {charges.map(c => (
                    <div key={c.id} className="flex items-center gap-1.5 py-0.5">
                      <ArrowUpRight className={`w-3 h-3 shrink-0 ${statusColor(c.status)}`} />
                      <span className="text-[10px] font-mono text-pi-text flex-1 truncate">
                        {formatCurrency(c.amount, c.currency)}
                      </span>
                      <span className={`text-[9px] ${statusColor(c.status)}`}>{c.status}</span>
                      <span className="text-[8px] text-pi-text-dim">{timeAgo(c.created)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Payouts */}
            {payouts.length > 0 && (
              <div>
                <p className="text-[9px] uppercase tracking-wider text-pi-text-dim font-medium mb-1">
                  Recent Payouts ({payouts.length})
                </p>
                <div className="space-y-1">
                  {payouts.map(p => (
                    <div key={p.id} className="flex items-center gap-1.5 py-0.5">
                      <ArrowDownRight className={`w-3 h-3 shrink-0 ${statusColor(p.status)}`} />
                      <span className="text-[10px] font-mono text-pi-text flex-1">
                        {formatCurrency(p.amount, p.currency)}
                      </span>
                      <span className={`text-[9px] ${statusColor(p.status)}`}>{p.status}</span>
                      <span className="text-[8px] text-pi-text-dim">{timeAgo(p.created)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {charges.length === 0 && payouts.length === 0 && !loadingRecent && (
              <p className="text-[10px] text-pi-text-dim text-center py-2">No recent activity</p>
            )}

            <button
              onClick={loadRecent}
              disabled={loadingRecent}
              className="w-full flex items-center justify-center gap-1 px-2 py-1 text-[10px] rounded border border-pi-border hover:bg-pi-surface/50 text-pi-text-dim hover:text-pi-text transition-colors"
            >
              <RefreshCw className={`w-2.5 h-2.5 ${loadingRecent ? 'animate-spin' : ''}`} /> Refresh
            </button>
          </div>
        )}
      </div>

      <div className="rounded-md border border-pi-border">
        <button
          onClick={() => toggleSection('webhooks')}
          className="w-full flex items-center gap-2 px-2.5 py-2 text-left hover:bg-pi-surface/50 transition-colors"
        >
          <ChevronDown className={`w-3 h-3 text-pi-text-dim transition-transform ${activeSection === 'webhooks' ? '' : '-rotate-90'}`} />
          <Shield className="w-3.5 h-3.5 text-pi-text-dim" />
          <span className="text-[11px] font-medium text-pi-text flex-1">Webhooks</span>
          {settings.hasStripeWebhookSecret && <CheckCircle2 className="w-3 h-3 text-green-400" />}
        </button>

        {activeSection === 'webhooks' && (
          <div className="border-t border-pi-border/50 px-2.5 py-2 space-y-2">
            {settings.hasStripeWebhookSecret ? (
              <div className="flex items-center gap-1.5">
                <CheckCircle2 className="w-3 h-3 text-green-400" />
                <span className="text-[10px] text-pi-text">Webhook secret configured</span>
              </div>
            ) : (
              <>
                <p className="text-[10px] text-pi-text-dim">
                  Add your webhook signing secret to verify webhook events.
                </p>
                <div className="relative">
                  <input
                    type={showWebhookSecret ? 'text' : 'password'}
                    placeholder="whsec_..."
                    value={webhookSecret}
                    onChange={e => setWebhookSecret(e.target.value)}
                    className="w-full px-2 py-1.5 pr-7 text-xs font-mono bg-pi-bg border border-pi-border rounded-md focus:outline-none focus:border-[#635BFF]"
                  />
                  <button
                    onClick={() => setShowWebhookSecret(!showWebhookSecret)}
                    className="absolute right-1.5 top-1/2 -translate-y-1/2 text-pi-text-dim hover:text-pi-text"
                  >
                    {showWebhookSecret ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                  </button>
                </div>
                <button
                  onClick={async () => {
                    if (!webhookSecret.trim()) return
                    setSaving('webhook')
                    try {
                      const res = await fetch('/api/settings', {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ stripeWebhookSecret: webhookSecret }),
                      })
                      if (res.ok) { toast.success('Webhook secret saved'); setWebhookSecret(''); loadSettings() }
                      else { const d = await res.json(); toast.error(d.error || 'Failed') }
                    } catch { toast.error('Network error') }
                    finally { setSaving(null) }
                  }}
                  disabled={saving === 'webhook' || !webhookSecret.trim()}
                  className="w-full flex items-center justify-center gap-1 px-2 py-1 text-[10px] rounded bg-[#635BFF] text-white hover:bg-[#5851ea] disabled:opacity-40 transition-colors"
                >
                  {saving === 'webhook' ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
                  Save Webhook Secret
                </button>
              </>
            )}

            <div className="space-y-1 pt-1">
              <p className="text-[10px] text-pi-text-dim font-medium">Recommended webhook URL:</p>
              <div className="flex items-center gap-1">
                <code className="flex-1 text-[9px] font-mono text-pi-text bg-pi-bg px-1.5 py-1 rounded border border-pi-border truncate">
                  {typeof window !== 'undefined' ? `${window.location.origin}/api/webhooks/stripe` : '/api/webhooks/stripe'}
                </code>
                <button
                  onClick={() => handleCopy(`${window.location.origin}/api/webhooks/stripe`, 'Webhook URL')}
                  className="p-1 text-pi-text-dim hover:text-pi-text"
                >
                  <Copy className="w-3 h-3" />
                </button>
              </div>
            </div>

            <a
              href="https://dashboard.stripe.com/webhooks"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-[10px] text-[#635BFF] hover:underline"
            >
              <ExternalLink className="w-2.5 h-2.5" /> Manage webhooks in Stripe
            </a>
          </div>
        )}
      </div>

      <div className="rounded-md border border-pi-border">
        <button
          onClick={() => toggleSection('env')}
          className="w-full flex items-center gap-2 px-2.5 py-2 text-left hover:bg-pi-surface/50 transition-colors"
        >
          <ChevronDown className={`w-3 h-3 text-pi-text-dim transition-transform ${activeSection === 'env' ? '' : '-rotate-90'}`} />
          <Link2 className="w-3.5 h-3.5 text-pi-text-dim" />
          <span className="text-[11px] font-medium text-pi-text flex-1">Environment</span>
        </button>

        {activeSection === 'env' && (
          <div className="border-t border-pi-border/50 px-2.5 py-2 space-y-2">
            {/* Detected env vars */}
            {(envDetected.secretKey || envDetected.publishableKey || envDetected.webhookSecret) && (
              <div className="space-y-0.5">
                <p className="text-[10px] text-pi-text-dim font-medium">Detected in project:</p>
                {envDetected.secretKey && (
                  <div className="flex items-center gap-1.5">
                    <CheckCircle2 className="w-2.5 h-2.5 text-green-400 shrink-0" />
                    <code className="text-[9px] font-mono text-pi-text-dim truncate">STRIPE_SECRET_KEY</code>
                    <span className="text-[8px] text-pi-text-dim/50 ml-auto">{envDetected.secretKey.file}</span>
                  </div>
                )}
                {envDetected.publishableKey && (
                  <div className="flex items-center gap-1.5">
                    <CheckCircle2 className="w-2.5 h-2.5 text-green-400 shrink-0" />
                    <code className="text-[9px] font-mono text-pi-text-dim truncate">STRIPE_PUBLISHABLE_KEY</code>
                    <span className="text-[8px] text-pi-text-dim/50 ml-auto">{envDetected.publishableKey.file}</span>
                  </div>
                )}
                {envDetected.webhookSecret && (
                  <div className="flex items-center gap-1.5">
                    <CheckCircle2 className="w-2.5 h-2.5 text-green-400 shrink-0" />
                    <code className="text-[9px] font-mono text-pi-text-dim truncate">STRIPE_WEBHOOK_SECRET</code>
                    <span className="text-[8px] text-pi-text-dim/50 ml-auto">{envDetected.webhookSecret.file}</span>
                  </div>
                )}
              </div>
            )}

            {/* Inject publishable key into .env.local */}
            {settings.hasStripePublishableKey && !envDetected.publishableKey && (
              <button
                onClick={() => handleInjectEnvVar('NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY', '${STRIPE_PUBLISHABLE_KEY}')}
                className="w-full flex items-center gap-1.5 px-2 py-1.5 text-[10px] rounded border border-pi-border hover:bg-pi-surface/50 text-pi-text-dim hover:text-pi-text transition-colors"
              >
                <Zap className="w-3 h-3" />
                Add NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY to .env.local
              </button>
            )}

            <p className="text-[9px] text-pi-text-dim leading-relaxed">
              The AI can use your Stripe keys to build payment flows, create checkout pages, manage subscriptions, and handle webhooks.
            </p>
          </div>
        )}
      </div>

      <div className="rounded-md border border-pi-border">
        <button
          onClick={() => toggleSection('tools')}
          className="w-full flex items-center gap-2 px-2.5 py-2 text-left hover:bg-pi-surface/50 transition-colors"
        >
          <ChevronDown className={`w-3 h-3 text-pi-text-dim transition-transform ${activeSection === 'tools' ? '' : '-rotate-90'}`} />
          <Zap className="w-3.5 h-3.5 text-pi-text-dim" />
          <span className="text-[11px] font-medium text-pi-text flex-1">AI Tools</span>
          <span className="text-[9px] text-pi-text-dim">{STRIPE_TOOLS.length} available</span>
        </button>

        {activeSection === 'tools' && (
          <div className="border-t border-pi-border/50 px-2.5 py-2 max-h-[300px] overflow-y-auto">
            <div className="space-y-0.5">
              {STRIPE_TOOLS.map(t => (
                <div key={t.name} className="flex items-start gap-1.5 py-0.5">
                  <Zap className="w-2.5 h-2.5 shrink-0 mt-0.5 text-[#635BFF]" />
                  <div className="min-w-0">
                    <span className="text-[9px] font-mono text-pi-text block">{t.name}</span>
                    <span className="text-[8px] text-pi-text-dim">{t.description}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="rounded-md border border-pi-border">
        <button
          onClick={() => toggleSection('links')}
          className="w-full flex items-center gap-2 px-2.5 py-2 text-left hover:bg-pi-surface/50 transition-colors"
        >
          <ChevronDown className={`w-3 h-3 text-pi-text-dim transition-transform ${activeSection === 'links' ? '' : '-rotate-90'}`} />
          <ExternalLink className="w-3.5 h-3.5 text-pi-text-dim" />
          <span className="text-[11px] font-medium text-pi-text flex-1">Quick Links</span>
        </button>

        {activeSection === 'links' && (
          <div className="border-t border-pi-border/50 px-2.5 py-2 space-y-1">
            {QUICK_LINKS.map(link => (
              <a
                key={link.label}
                href={account?.livemode === false ? link.url.replace('dashboard.stripe.com/', 'dashboard.stripe.com/test/') : link.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 py-0.5 text-[10px] text-pi-text-dim hover:text-[#635BFF] transition-colors"
              >
                <link.icon className="w-3 h-3" />
                {link.label}
              </a>
            ))}
          </div>
        )}
      </div>

      <div className="rounded-md border border-pi-border bg-pi-surface/30 p-2.5">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[10px] text-pi-text-dim font-medium">Saved Credentials</span>
        </div>
        <div className="flex flex-wrap gap-1.5 mb-2">
          {settings.hasStripeSecretKey && (
            <span className="flex items-center gap-1 text-[9px] text-green-400">
              <CheckCircle2 className="w-2.5 h-2.5" /> Secret Key
            </span>
          )}
          {settings.hasStripePublishableKey && (
            <span className="flex items-center gap-1 text-[9px] text-green-400">
              <CheckCircle2 className="w-2.5 h-2.5" /> Publishable Key
            </span>
          )}
          {settings.hasStripeWebhookSecret && (
            <span className="flex items-center gap-1 text-[9px] text-green-400">
              <CheckCircle2 className="w-2.5 h-2.5" /> Webhook Secret
            </span>
          )}
          {!settings.hasStripePublishableKey && (
            <span className="flex items-center gap-1 text-[9px] text-pi-text-dim">
              <XCircle className="w-2.5 h-2.5" /> No publishable key
            </span>
          )}
        </div>
        <button
          onClick={handleDelete}
          className="flex items-center gap-1 text-[10px] text-red-400 hover:text-red-300 transition-colors"
        >
          <Trash2 className="w-2.5 h-2.5" /> Remove all Stripe credentials
        </button>
      </div>
    </div>
  )
}
