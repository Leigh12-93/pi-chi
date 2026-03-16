'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'

interface Provider {
  id: string
  name: string
  phone: string | null
  slug: string
}

const BIN_SIZES = ['2m³', '4m³', '6m³', '8m³', '10m³']

export default function BookingPage() {
  const [form, setForm] = useState({
    customer_name: '',
    phone: '',
    address: '',
    postcode: '',
    bin_size: '',
    pickup_date: '',
  })
  const [providers, setProviders] = useState<Provider[]>([])
  const [selectedProvider, setSelectedProvider] = useState<Provider | null>(null)
  const [loadingProviders, setLoadingProviders] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null)

  const update = (field: string, value: string) => {
    setForm(prev => ({ ...prev, [field]: value }))
    if (field === 'postcode') {
      setSelectedProvider(null)
      setProviders([])
    }
  }

  async function searchProviders() {
    if (!form.postcode || form.postcode.length < 4) return
    setLoadingProviders(true)
    setProviders([])
    setSelectedProvider(null)
    try {
      const res = await fetch(`/api/providers?postcode=${encodeURIComponent(form.postcode)}`)
      if (res.ok) {
        const data = await res.json()
        setProviders(data.providers || [])
      }
    } catch (err) {
      console.error('Failed to fetch providers:', err)
    } finally {
      setLoadingProviders(false)
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!selectedProvider) return
    setSubmitting(true)
    setResult(null)

    try {
      const res = await fetch('/api/send-booking', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          provider_id: selectedProvider.id,
          provider_phone: selectedProvider.phone || '',
          provider_name: selectedProvider.name,
        }),
      })
      const data = await res.json()
      if (data.ok) {
        setResult({ ok: true, message: 'Booking sent! The provider will be in touch shortly.' })
        setForm({ customer_name: '', phone: '', address: '', postcode: '', bin_size: '', pickup_date: '' })
        setProviders([])
        setSelectedProvider(null)
      } else {
        setResult({ ok: false, message: data.error || 'Something went wrong' })
      }
    } catch {
      setResult({ ok: false, message: 'Failed to submit booking' })
    } finally {
      setSubmitting(false)
    }
  }

  const inputClass = 'w-full rounded-lg border border-pi-border bg-pi-bg px-3 py-2.5 text-sm text-pi-text placeholder:text-pi-text-dim/50 focus:border-pi-accent focus:outline-none focus:ring-2 focus:ring-pi-ring transition-colors'

  return (
    <div className="min-h-screen bg-pi-bg">
      <div className="mx-auto max-w-lg px-4 py-8">
        <h1 className="text-2xl font-bold text-pi-text mb-1">Book a Skip Bin</h1>
        <p className="text-sm text-pi-text-dim mb-6">
          Fill in your details and we&apos;ll connect you with a local provider.
        </p>

        {result && (
          <div className={cn(
            'mb-6 rounded-lg border px-4 py-3 text-sm',
            result.ok
              ? 'border-pi-success/30 bg-pi-success/10 text-pi-success'
              : 'border-pi-danger/30 bg-pi-danger/10 text-pi-danger'
          )}>
            {result.message}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Customer name */}
          <div>
            <label className="block text-xs font-medium text-pi-text-dim mb-1">Your Name</label>
            <input
              type="text"
              required
              value={form.customer_name}
              onChange={e => update('customer_name', e.target.value)}
              placeholder="John Smith"
              className={inputClass}
            />
          </div>

          {/* Phone */}
          <div>
            <label className="block text-xs font-medium text-pi-text-dim mb-1">Phone Number</label>
            <input
              type="tel"
              required
              value={form.phone}
              onChange={e => update('phone', e.target.value)}
              placeholder="0412 345 678"
              className={inputClass}
            />
          </div>

          {/* Address */}
          <div>
            <label className="block text-xs font-medium text-pi-text-dim mb-1">Delivery Address</label>
            <input
              type="text"
              required
              value={form.address}
              onChange={e => update('address', e.target.value)}
              placeholder="123 Main St, Adelaide"
              className={inputClass}
            />
          </div>

          {/* Postcode + search */}
          <div>
            <label className="block text-xs font-medium text-pi-text-dim mb-1">Postcode</label>
            <div className="flex gap-2">
              <input
                type="text"
                required
                maxLength={4}
                value={form.postcode}
                onChange={e => update('postcode', e.target.value.replace(/\D/g, ''))}
                placeholder="5000"
                className={cn(inputClass, 'flex-1')}
              />
              <button
                type="button"
                onClick={searchProviders}
                disabled={form.postcode.length < 4 || loadingProviders}
                className="rounded-lg bg-pi-accent px-4 py-2.5 text-sm font-medium text-white hover:bg-pi-accent-hover disabled:opacity-40 transition-colors"
              >
                {loadingProviders ? 'Searching...' : 'Find Providers'}
              </button>
            </div>
          </div>

          {/* Bin size */}
          <div>
            <label className="block text-xs font-medium text-pi-text-dim mb-1">Bin Size</label>
            <select
              required
              value={form.bin_size}
              onChange={e => update('bin_size', e.target.value)}
              className={cn(inputClass, 'appearance-none')}
            >
              <option value="">Select a size...</option>
              {BIN_SIZES.map(size => (
                <option key={size} value={size}>{size}</option>
              ))}
            </select>
          </div>

          {/* Pickup date */}
          <div>
            <label className="block text-xs font-medium text-pi-text-dim mb-1">Preferred Pickup Date</label>
            <input
              type="date"
              required
              value={form.pickup_date}
              onChange={e => update('pickup_date', e.target.value)}
              className={inputClass}
            />
          </div>

          {/* Provider list */}
          {providers.length > 0 && (
            <div>
              <label className="block text-xs font-medium text-pi-text-dim mb-2">Select a Provider</label>
              <div className="space-y-2">
                {providers.map(p => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setSelectedProvider(p)}
                    className={cn(
                      'w-full rounded-lg border px-4 py-3 text-left text-sm transition-colors',
                      selectedProvider?.id === p.id
                        ? 'border-pi-accent bg-pi-accent/10 text-pi-text'
                        : 'border-pi-border bg-pi-surface text-pi-text hover:border-pi-accent/50'
                    )}
                  >
                    <span className="font-medium">{p.name}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {loadingProviders && (
            <p className="text-sm text-pi-text-dim">Searching for providers in {form.postcode}...</p>
          )}

          {providers.length === 0 && !loadingProviders && form.postcode.length === 4 && (
            <p className="text-xs text-pi-text-dim">
              Enter your postcode and click &quot;Find Providers&quot; to see available skip bin providers.
            </p>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={submitting || !selectedProvider || !form.bin_size || !form.pickup_date}
            className="w-full rounded-lg bg-pi-accent px-4 py-3 text-sm font-semibold text-white hover:bg-pi-accent-hover disabled:opacity-40 transition-colors"
          >
            {submitting ? 'Sending...' : 'Book Now'}
          </button>
        </form>
      </div>
    </div>
  )
}
