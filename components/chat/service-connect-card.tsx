'use client'

import { useState } from 'react'
import {
  CreditCard, Database, Key, ExternalLink, Loader2, CheckCircle2,
  Eye, EyeOff, AlertCircle,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

// ── Service definitions ──

interface ServiceField {
  name: string
  key: string          // key sent to PUT /api/settings
  placeholder: string
  required?: boolean
  sensitive?: boolean
  prefix?: string      // validation prefix
}

interface ServiceDef {
  id: string
  label: string
  description: string
  color: string        // brand color class
  bgColor: string      // light bg
  borderColor: string
  icon: React.FC<{ className?: string }>
  fields: ServiceField[]
  docsUrl: string
  docsLabel: string
}

function StripeIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 28 28" fill="currentColor">
      <path d="M13.111 11.217c0-1.09.893-1.51 2.374-1.51 2.123 0 4.806.643 6.929 1.79V5.396c-2.318-.92-4.606-1.283-6.929-1.283C10.68 4.113 7.5 6.72 7.5 11.465c0 7.371 10.15 6.198 10.15 9.375 0 1.29-1.123 1.71-2.693 1.71-2.33 0-5.313-.96-7.677-2.254v6.064c2.614 1.112 5.254 1.586 7.677 1.586 4.943 0 8.342-2.45 8.342-7.254-.03-7.952-10.188-6.543-10.188-9.475z" />
    </svg>
  )
}

function SupabaseIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 109 113" fill="currentColor">
      <path d="M63.7076 110.284C60.8481 113.885 55.0502 111.912 54.9813 107.314L53.9738 40.0627H99.1935C108.384 40.0627 113.529 50.7625 107.765 57.7278L63.7076 110.284Z" />
      <path d="M45.317 2.07103C48.1765 -1.53037 53.9745 0.442937 54.0434 5.04075L54.4849 72.2922H9.83113C0.640828 72.2922 -4.50388 61.5765 1.26003 54.6251L45.317 2.07103Z" />
    </svg>
  )
}

function AnthropicIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 46 32" fill="currentColor">
      <path d="M32.73 0h-6.73L13.27 32h6.73L32.73 0ZM13.27 0 0 32h6.9l2.73-6.72h13.82l2.73 6.72h6.9L19.81 0h-6.54Zm.63 19.52 4.18-10.28 4.19 10.28H13.9Z" />
    </svg>
  )
}

function VercelIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 76 65" fill="currentColor">
      <path d="M37.5274 0L75.0548 65H0L37.5274 0Z" />
    </svg>
  )
}

function GitHubIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 98 96" fill="currentColor">
      <path fillRule="evenodd" clipRule="evenodd" d="M48.854 0C21.839 0 0 22 0 49.217c0 21.756 13.993 40.172 33.405 46.69 2.427.49 3.316-1.059 3.316-2.362 0-1.141-.08-5.052-.08-9.127-13.59 2.934-16.42-5.867-16.42-5.867-2.184-5.704-5.42-7.17-5.42-7.17-4.448-3.015.324-3.015.324-3.015 4.934.326 7.523 5.052 7.523 5.052 4.367 7.496 11.404 5.378 14.235 4.074.404-3.178 1.699-5.378 3.074-6.6-10.839-1.141-22.243-5.378-22.243-24.283 0-5.378 1.94-9.778 5.014-13.2-.485-1.222-2.184-6.275.486-13.038 0 0 4.125-1.304 13.426 5.052a46.97 46.97 0 0 1 12.214-1.63c4.125 0 8.33.571 12.213 1.63 9.302-6.356 13.427-5.052 13.427-5.052 2.67 6.763.97 11.816.485 13.038 3.155 3.422 5.015 7.822 5.015 13.2 0 18.905-11.404 23.06-22.324 24.283 1.78 1.548 3.316 4.481 3.316 9.126 0 6.6-.08 11.897-.08 13.526 0 1.304.89 2.853 3.316 2.364 19.412-6.52 33.405-24.935 33.405-46.691C97.707 22 75.788 0 48.854 0z" />
    </svg>
  )
}

function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24">
      <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
      <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
      <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
      <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
    </svg>
  )
}

const SERVICE_DEFS: Record<string, ServiceDef> = {
  stripe: {
    id: 'stripe',
    label: 'Stripe',
    description: 'Connect your Stripe account to manage payments, subscriptions, and customers.',
    color: 'text-[#635BFF]',
    bgColor: 'bg-[#635BFF]/5',
    borderColor: 'border-[#635BFF]/30',
    icon: StripeIcon,
    fields: [
      { name: 'Secret Key', key: 'stripeSecretKey', placeholder: 'sk_live_... or sk_test_...', required: true, sensitive: true, prefix: 'sk_' },
      { name: 'Publishable Key', key: 'stripePublishableKey', placeholder: 'pk_live_... or pk_test_...', required: false, prefix: 'pk_' },
      { name: 'Webhook Secret', key: 'stripeWebhookSecret', placeholder: 'whsec_...', required: false, sensitive: true, prefix: 'whsec_' },
    ],
    docsUrl: 'https://dashboard.stripe.com/apikeys',
    docsLabel: 'Get API keys from Stripe Dashboard',
  },
  supabase: {
    id: 'supabase',
    label: 'Supabase',
    description: 'Connect your Supabase project to browse tables and run queries.',
    color: 'text-emerald-400',
    bgColor: 'bg-emerald-500/5',
    borderColor: 'border-emerald-500/30',
    icon: SupabaseIcon,
    fields: [
      { name: 'Project URL', key: 'supabaseUrl', placeholder: 'https://xxxxx.supabase.co', required: true, prefix: 'https://' },
      { name: 'Service Role Key', key: 'supabaseKey', placeholder: 'eyJhbGciOi...', required: true, sensitive: true, prefix: 'ey' },
    ],
    docsUrl: 'https://supabase.com/dashboard/project/_/settings/api',
    docsLabel: 'Get credentials from Supabase Dashboard',
  },
  anthropic: {
    id: 'anthropic',
    label: 'Anthropic',
    description: 'Add your Anthropic API key to use Claude models.',
    color: 'text-[#D4A574]',
    bgColor: 'bg-[#D4A574]/5',
    borderColor: 'border-[#D4A574]/30',
    icon: AnthropicIcon,
    fields: [
      { name: 'API Key', key: 'apiKey', placeholder: 'sk-ant-...', required: true, sensitive: true, prefix: 'sk-ant-' },
    ],
    docsUrl: 'https://console.anthropic.com/settings/keys',
    docsLabel: 'Get API key from Anthropic Console',
  },
  vercel: {
    id: 'vercel',
    label: 'Vercel',
    description: 'Connect Vercel to deploy projects and manage environments.',
    color: 'text-white',
    bgColor: 'bg-white/5',
    borderColor: 'border-white/20',
    icon: VercelIcon,
    fields: [
      { name: 'Deploy Token', key: 'vercelToken', placeholder: 'Your Vercel token...', required: true, sensitive: true },
    ],
    docsUrl: 'https://vercel.com/account/tokens',
    docsLabel: 'Create token in Vercel Settings',
  },
  google: {
    id: 'google',
    label: 'Google',
    description: 'Add a Google API key for Maps, YouTube, Translate, and other services.',
    color: 'text-blue-400',
    bgColor: 'bg-blue-500/5',
    borderColor: 'border-blue-500/30',
    icon: GoogleIcon,
    fields: [
      { name: 'API Key', key: 'googleApiKey', placeholder: 'AIza...', required: true, sensitive: true, prefix: 'AIza' },
    ],
    docsUrl: 'https://console.cloud.google.com/apis/credentials',
    docsLabel: 'Create API key in Google Console',
  },
  github: {
    id: 'github',
    label: 'GitHub',
    description: 'GitHub is connected via OAuth. Sign in to push code and manage repos.',
    color: 'text-white',
    bgColor: 'bg-white/5',
    borderColor: 'border-white/20',
    icon: GitHubIcon,
    fields: [],
    docsUrl: '',
    docsLabel: 'Sign in with GitHub',
  },
}

// ── Main Component ──

export function ServiceConnectCard({
  service,
  message,
  fields: overrideFields,
  onSendMessage,
}: {
  service: string
  message?: string
  fields?: Array<{ name: string; key: string; placeholder?: string; required?: boolean; sensitive?: boolean }>
  onSendMessage?: (text: string) => void
}) {
  const def = SERVICE_DEFS[service]
  const [values, setValues] = useState<Record<string, string>>({})
  const [showFields, setShowFields] = useState<Record<string, boolean>>({})
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!def) {
    return (
      <div className="border border-forge-border rounded-xl p-3.5 text-[12px]">
        <p className="text-forge-text-dim">Unknown service: {service}</p>
      </div>
    )
  }

  const Icon = def.icon
  const fields = overrideFields?.map(f => ({
    ...f,
    sensitive: f.sensitive ?? (f.key.toLowerCase().includes('secret') || f.key.toLowerCase().includes('key') || f.key.toLowerCase().includes('token')),
  })) || def.fields

  // GitHub is OAuth-only — show login link
  if (service === 'github') {
    return (
      <div className={cn('border rounded-xl p-3.5 text-[12px]', def.borderColor, def.bgColor)}>
        <div className="flex items-center gap-2 mb-2">
          <div className={cn('w-6 h-6 rounded-md flex items-center justify-center shrink-0', def.color, def.bgColor)}>
            <Icon className="w-4 h-4" />
          </div>
          <span className={cn('font-semibold text-[13px]', def.color)}>{def.label}</span>
        </div>
        {message && <p className="text-forge-text-dim mb-2.5">{message}</p>}
        <p className="text-forge-text-dim mb-2">{def.description}</p>
        <a
          href="/api/auth/login"
          className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-md bg-white text-gray-900 hover:bg-gray-100 text-[12px] font-medium transition-colors"
        >
          <GitHubIcon className="w-3.5 h-3.5" />
          Sign in with GitHub
          <ExternalLink className="w-3 h-3 opacity-50" />
        </a>
      </div>
    )
  }

  const handleSave = async () => {
    // Validate required fields
    for (const field of fields) {
      if (field.required !== false && !values[field.key]?.trim()) {
        setError(`${field.name} is required`)
        return
      }
    }

    setSaving(true)
    setError(null)
    try {
      const body: Record<string, unknown> = {}
      for (const field of fields) {
        const val = values[field.key]?.trim()
        if (val) body[field.key] = val
      }

      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()

      if (!res.ok) {
        setError(data.error || 'Failed to save credentials')
        return
      }

      setSaved(true)
      toast.success(`${def.label} connected successfully`)
      onSendMessage?.(`[SERVICE CONNECTED] ${def.label} credentials have been saved and verified.`)
    } catch {
      setError('Network error — please try again')
    } finally {
      setSaving(false)
    }
  }

  if (saved) {
    return (
      <div className={cn('border rounded-xl p-3.5 text-[12px]', 'border-green-500/30 bg-green-500/5')}>
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-md flex items-center justify-center shrink-0 text-green-400 bg-green-500/10">
            <CheckCircle2 className="w-4 h-4" />
          </div>
          <div>
            <span className="font-semibold text-[13px] text-green-400">{def.label} Connected</span>
            <p className="text-[11px] text-forge-text-dim mt-0.5">Credentials saved and verified.</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className={cn('border rounded-xl p-3.5 text-[12px]', def.borderColor, def.bgColor)}>
      {/* Header */}
      <div className="flex items-center gap-2 mb-2">
        <div className={cn('w-6 h-6 rounded-md flex items-center justify-center shrink-0', def.color, def.bgColor)}>
          <Icon className="w-4 h-4" />
        </div>
        <span className={cn('font-semibold text-[13px]', def.color)}>{def.label}</span>
      </div>

      {/* Custom message from AI */}
      {message && <p className="text-forge-text mb-2">{message}</p>}

      {/* Description */}
      <p className="text-forge-text-dim mb-3">{def.description}</p>

      {/* Error */}
      {error && (
        <div className="flex items-start gap-1.5 mb-2.5 text-red-400">
          <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          <span className="text-[11px]">{error}</span>
        </div>
      )}

      {/* Input fields */}
      <div className="space-y-2.5">
        {fields.map(field => (
          <div key={field.key}>
            <div className="flex items-center gap-1 mb-1">
              <span className="text-[11px] font-medium text-forge-text">{field.name}</span>
              {field.required !== false && <span className="text-red-500 text-[9px]">*</span>}
            </div>
            <div className="relative">
              <input
                type={field.sensitive && !showFields[field.key] ? 'password' : 'text'}
                value={values[field.key] || ''}
                onChange={e => setValues(prev => ({ ...prev, [field.key]: e.target.value }))}
                placeholder={field.placeholder || field.name}
                className="w-full px-2.5 py-1.5 rounded-md bg-forge-bg border border-forge-border text-[11.5px] font-mono text-forge-text placeholder:text-forge-text-dim/40 focus:outline-none focus:border-forge-accent/40 focus:shadow-[0_0_0_3px_var(--color-forge-ring)] transition-all pr-7"
              />
              {field.sensitive && (
                <button
                  onClick={() => setShowFields(prev => ({ ...prev, [field.key]: !prev[field.key] }))}
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 text-forge-text-dim hover:text-forge-text"
                >
                  {showFields[field.key] ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 mt-3">
        <button
          onClick={handleSave}
          disabled={saving || fields.filter(f => f.required !== false).some(f => !values[f.key]?.trim())}
          className={cn(
            'flex items-center gap-1.5 px-3.5 py-1.5 rounded-md text-[12px] font-medium transition-colors',
            saving
              ? 'bg-forge-surface text-forge-text-dim cursor-wait'
              : fields.filter(f => f.required !== false).every(f => values[f.key]?.trim())
                ? 'bg-forge-accent hover:bg-forge-accent/90 text-white cursor-pointer'
                : 'bg-forge-surface text-forge-text-dim/50 cursor-not-allowed'
          )}
        >
          {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Key className="w-3 h-3" />}
          {saving ? 'Connecting...' : `Connect ${def.label}`}
        </button>

        {def.docsUrl && (
          <a
            href={def.docsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-[11px] text-forge-accent hover:underline"
          >
            <ExternalLink className="w-3 h-3" />
            {def.docsLabel}
          </a>
        )}
      </div>
    </div>
  )
}
