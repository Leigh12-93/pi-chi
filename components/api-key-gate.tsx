'use client'

import { useState, useCallback } from 'react'
import { Key, Loader2, CheckCircle2, AlertCircle, ExternalLink } from 'lucide-react'

interface ApiKeyGateProps {
  onKeySet: () => void
}

export function ApiKeyGate({ onKeySet }: ApiKeyGateProps) {
  const [apiKey, setApiKey] = useState('')
  const [status, setStatus] = useState<'idle' | 'validating' | 'success' | 'error'>('idle')
  const [error, setError] = useState('')

  const handleSubmit = useCallback(async () => {
    const trimmed = apiKey.trim()
    if (!trimmed) return

    if (!trimmed.startsWith('sk-ant-')) {
      setError('API key must start with sk-ant-')
      setStatus('error')
      return
    }

    setStatus('validating')
    setError('')

    try {
      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey: trimmed }),
      })

      if (res.ok) {
        setStatus('success')
        setTimeout(onKeySet, 800)
      } else {
        const data = await res.json()
        setError(data.error || 'Validation failed')
        setStatus('error')
      }
    } catch {
      setError('Network error. Please try again.')
      setStatus('error')
    }
  }, [apiKey, onKeySet])

  return (
    <div className="min-h-screen bg-forge-bg flex items-center justify-center p-4">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center space-y-2">
          <div className="w-12 h-12 mx-auto rounded-xl bg-forge-surface border border-forge-border flex items-center justify-center">
            <Key className="w-5 h-5 text-forge-accent" />
          </div>
          <h2 className="text-xl font-bold text-forge-text">Enter your API Key</h2>
          <p className="text-sm text-forge-text-dim max-w-xs mx-auto">
            Forge uses your own Anthropic API key. It's encrypted and stored securely — never logged or shared.
          </p>
        </div>

        <div className="space-y-3">
          <div className="relative">
            <input
              type="password"
              value={apiKey}
              onChange={e => { setApiKey(e.target.value); setStatus('idle'); setError('') }}
              placeholder="sk-ant-api03-..."
              className="w-full px-4 py-3 bg-forge-surface border border-forge-border rounded-xl text-sm text-forge-text placeholder:text-forge-text-dim/50 focus:outline-none focus:border-forge-accent transition-colors font-mono"
              onKeyDown={e => { if (e.key === 'Enter') handleSubmit() }}
              autoFocus
            />
            {status === 'success' && (
              <CheckCircle2 className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-green-400" />
            )}
          </div>

          {error && (
            <div className="flex items-start gap-2 text-xs text-red-400">
              <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <button
            onClick={handleSubmit}
            disabled={!apiKey.trim() || status === 'validating' || status === 'success'}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-forge-accent text-white font-medium rounded-xl hover:bg-forge-accent-hover transition-colors disabled:opacity-50"
          >
            {status === 'validating' ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Validating...
              </>
            ) : status === 'success' ? (
              <>
                <CheckCircle2 className="w-4 h-4" />
                Key verified!
              </>
            ) : (
              'Save & Continue'
            )}
          </button>
        </div>

        <div className="text-center">
          <a
            href="https://console.anthropic.com/settings/keys"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-xs text-forge-text-dim hover:text-forge-accent transition-colors"
          >
            Get an API key from Anthropic
            <ExternalLink className="w-3 h-3" />
          </a>
        </div>

        <div className="rounded-lg bg-forge-surface/50 border border-forge-border p-3">
          <p className="text-[10px] text-forge-text-dim/70 leading-relaxed">
            <span className="font-medium text-forge-text-dim">BYOK (Bring Your Own Key):</span> Your key is encrypted with AES-256-GCM before storage. It's decrypted server-side only when making API calls. Forge never logs, caches, or shares your key. You can delete it anytime from Settings.
          </p>
        </div>
      </div>
    </div>
  )
}
