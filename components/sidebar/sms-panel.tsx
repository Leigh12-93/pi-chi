'use client'

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import {
  Loader2, CheckCircle2, ExternalLink, RefreshCw, Eye, EyeOff,
  Trash2, ChevronDown, AlertCircle, Zap, Wand2, Send, MessageSquare,
} from 'lucide-react'
import { toast } from 'sonner'

interface SmsPanelProps {
  fileContents: Record<string, string>
  onFileChange: (path: string, content: string) => void
}

interface SmsSettings {
  hasAussieSmsApiKey: boolean
}

// ── AussieSMS tools for AI chat integration ──
const SMS_TOOLS = [
  { name: 'aussiesms_send', description: 'Send an SMS message to a phone number' },
  { name: 'aussiesms_send_otp', description: 'Send a one-time password via SMS' },
  { name: 'aussiesms_verify_otp', description: 'Verify an OTP code' },
]

// ── Quick links ──
const QUICK_LINKS = [
  { label: 'Dashboard', url: 'https://aussieotp.vercel.app', icon: ExternalLink },
  { label: 'API Keys', url: 'https://aussieotp.vercel.app/dashboard/api-keys', icon: ExternalLink },
  { label: 'Credits', url: 'https://aussieotp.vercel.app/dashboard/credits', icon: ExternalLink },
]

/** Detect AussieSMS keys from project env files */
function detectSmsFromEnv(fileContents: Record<string, string>): {
  apiKey?: { value: string; file: string }
} {
  const envFiles = ['.env.local', '.env', '.env.development', '.env.production']
  const result: ReturnType<typeof detectSmsFromEnv> = {}

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

      if (k === 'AUSSIESMS_API_KEY' || k === 'SMS_API_KEY') {
        if (!result.apiKey) result.apiKey = { value: v, file: path }
      }
    }
  }

  return result
}

export function SmsPanel({ fileContents, onFileChange: _onFileChange }: SmsPanelProps) {
  const [settings, setSettings] = useState<SmsSettings>({ hasAussieSmsApiKey: false })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<string | null>(null)

  // Connection data
  const [connected, setConnected] = useState(false)
  const [mode, setMode] = useState<string | null>(null)
  const [connectionError, setConnectionError] = useState<string | null>(null)
  const [loadingConnection, setLoadingConnection] = useState(false)

  // Test SMS form
  const [testTo, setTestTo] = useState('')
  const [testMessage, setTestMessage] = useState('')
  const [sendingTest, setSendingTest] = useState(false)

  // Form state
  const [apiKey, setApiKey] = useState('')
  const [showApiKey, setShowApiKey] = useState(false)

  // Section toggles
  const [activeSection, setActiveSection] = useState<string | null>(null)

  // Auto-detect
  const envDetected = useMemo(() => detectSmsFromEnv(fileContents), [fileContents])
  const autoSaved = useRef(false)

  const toggleSection = (id: string) => setActiveSection(prev => prev === id ? null : id)

  // ── Load settings ──
  const loadSettings = useCallback(async () => {
    try {
      const res = await fetch('/api/settings')
      if (!res.ok) return
      const data = await res.json()
      setSettings({
        hasAussieSmsApiKey: data.hasAussieSmsApiKey ?? false,
      })
    } catch (e) { console.warn('[pi:sms] Failed to load SMS settings:', e) } finally {
      setLoading(false)
    }
  }, [])

  const loadConnection = useCallback(async () => {
    setLoadingConnection(true)
    setConnectionError(null)
    try {
      const res = await fetch('/api/aussiesms/stats')
      const data = await res.json()
      if (data.connected) {
        setConnected(true)
        setMode(data.mode || null)
      } else {
        setConnected(false)
        setConnectionError(data.error || null)
      }
    } catch {
      setConnectionError('Failed to check connection')
    } finally {
      setLoadingConnection(false)
    }
  }, [])

  useEffect(() => { loadSettings() }, [loadSettings])

  // When settings show we have a key, check connection
  useEffect(() => {
    if (settings.hasAussieSmsApiKey) {
      loadConnection()
    }
  }, [settings.hasAussieSmsApiKey, loadConnection])

  // Auto-detect from env and auto-save
  useEffect(() => {
    if (autoSaved.current || settings.hasAussieSmsApiKey) return
    if (envDetected.apiKey) {
      setApiKey(envDetected.apiKey.value)
      autoSaved.current = true
      fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ aussieSmsApiKey: envDetected.apiKey.value, skipValidation: true }),
      }).then(() => loadSettings()).catch(() => {})
    }
  }, [envDetected, settings.hasAussieSmsApiKey, loadSettings])

  // ── Save handler ──
  const handleSave = async () => {
    if (!apiKey.trim()) { toast.error('API key is required'); return }
    setSaving('key')
    try {
      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ aussieSmsApiKey: apiKey }),
      })
      const data = await res.json()
      if (!res.ok) { toast.error(data.error || 'Failed to save'); return }
      toast.success('AussieSMS connected')
      setApiKey('')
      loadSettings()
    } catch { toast.error('Network error') }
    finally { setSaving(null) }
  }

  const handleDelete = async () => {
    try {
      const res = await fetch('/api/settings?target=aussiesms', { method: 'DELETE' })
      if (!res.ok) { toast.error('Failed to remove AussieSMS credentials'); return }
      toast.success('AussieSMS credentials removed')
      setConnected(false)
      setMode(null)
      loadSettings()
    } catch { toast.error('Network error') }
  }

  const handleTestSms = async () => {
    if (!testTo.trim() || !testMessage.trim()) {
      toast.error('Phone number and message are required')
      return
    }
    setSendingTest(true)
    try {
      const res = await fetch('/api/aussiesms/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: testTo, message: testMessage }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error || 'Failed to send SMS')
        return
      }
      toast.success('Test SMS sent successfully')
      setTestTo('')
      setTestMessage('')
    } catch { toast.error('Network error') }
    finally { setSendingTest(false) }
  }

  if (loading) {
    return (
      <div className="p-3 flex items-center justify-center">
        <Loader2 className="w-4 h-4 animate-spin text-pi-text-dim" />
      </div>
    )
  }

  if (!settings.hasAussieSmsApiKey) {
    return (
      <div className="p-3 space-y-3">
        <p className="text-[10px] uppercase tracking-wider text-pi-text-dim font-medium">AussieSMS</p>

        <div className="flex items-center gap-2 p-3 bg-pi-surface border border-pi-border rounded-lg">
          <MessageSquare className="w-4 h-4 text-pi-text-dim shrink-0" />
          <div className="min-w-0">
            <p className="text-xs font-medium text-pi-text">No AussieSMS account connected</p>
            <p className="text-[10px] text-pi-text-dim mt-0.5">
              Connect your AussieSMS account to send SMS messages and OTP codes from your app.
            </p>
          </div>
        </div>

        {/* Auto-detected env vars hint */}
        {envDetected.apiKey && (
          <div className="rounded-md border border-cyan-500/30 bg-cyan-500/5 p-2.5">
            <div className="flex items-center gap-1.5 mb-1">
              <Wand2 className="w-3.5 h-3.5 text-cyan-400" />
              <span className="text-[11px] font-medium text-cyan-300">Auto-Detected Credentials</span>
            </div>
            <p className="text-[10px] text-cyan-300/70 mb-1.5">
              Found AussieSMS key in your project env files. Saving automatically...
            </p>
            <div className="flex items-center gap-1.5">
              <code className="text-[9px] font-mono text-cyan-300/80">{envDetected.apiKey.file.includes('SMS_API_KEY') ? 'SMS_API_KEY' : 'AUSSIESMS_API_KEY'}</code>
              <span className="text-[9px] text-pi-text-dim ml-auto">{envDetected.apiKey.file}</span>
            </div>
          </div>
        )}

        {/* Manual setup form */}
        <div className="space-y-2.5">
          <div className="relative">
            <input
              type={showApiKey ? 'text' : 'password'}
              placeholder="AussieSMS API Key"
              value={apiKey}
              onChange={e => setApiKey(e.target.value)}
              className="w-full px-3 py-2.5 pr-10 text-sm font-mono bg-pi-bg border border-pi-border rounded-lg focus:outline-none focus:border-cyan-500 min-h-[44px]"
            />
            <button
              onClick={() => setShowApiKey(!showApiKey)}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-pi-text-dim hover:text-pi-text active:scale-95 transition-all"
            >
              {showApiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>

          <button
            onClick={handleSave}
            disabled={saving === 'key' || !apiKey.trim()}
            className="w-full flex items-center justify-center gap-2 px-3 py-3 text-sm rounded-lg bg-cyan-600 text-white hover:bg-cyan-500 active:bg-cyan-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors font-medium min-h-[44px]"
          >
            {saving === 'key' ? <Loader2 className="w-4 h-4 animate-spin" /> : <MessageSquare className="w-4 h-4" />}
            Connect AussieSMS
          </button>
        </div>

        <div className="flex items-center gap-2 px-1">
          <span className="flex-1 h-px bg-pi-border" />
          <span className="text-[9px] text-pi-text-dim">or</span>
          <span className="flex-1 h-px bg-pi-border" />
        </div>

        <div className="p-2.5 rounded-lg border border-dashed border-pi-border">
          <p className="text-[9px] text-pi-text-dim leading-relaxed">
            Add <code className="text-cyan-400 px-0.5 bg-cyan-500/10 rounded">AUSSIESMS_API_KEY</code> to your{' '}
            <code className="text-cyan-400 px-0.5 bg-cyan-500/10 rounded">.env.local</code> — auto-connects instantly.
          </p>
        </div>

        <a
          href="https://aussieotp.vercel.app"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1 text-[10px] text-cyan-400 hover:underline"
        >
          <ExternalLink className="w-2.5 h-2.5" /> Sign up at AussieSMS Dashboard
        </a>
      </div>
    )
  }

  return (
    <div className="p-3 space-y-2.5">
      <p className="text-[10px] uppercase tracking-wider text-pi-text-dim font-medium">AussieSMS</p>

      <div className={`rounded-md border p-2.5 ${
        connected ? 'border-green-500/20 bg-green-500/5' : connectionError ? 'border-red-500/20 bg-red-500/5' : 'border-pi-border bg-pi-surface/30'
      }`}>
        {loadingConnection ? (
          <div className="flex items-center gap-2 justify-center py-1">
            <Loader2 className="w-3.5 h-3.5 animate-spin text-pi-text-dim" />
            <span className="text-[10px] text-pi-text-dim">Connecting to AussieSMS...</span>
          </div>
        ) : connected ? (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-green-400" />
                <span className="text-[11px] font-medium text-pi-text">AussieSMS Connected</span>
              </div>
              <div className="flex items-center gap-1">
                {mode && (
                  <span className={`text-[8px] px-1.5 py-0.5 rounded-full font-medium ${
                    mode === 'live' ? 'bg-green-500/20 text-green-400' : 'bg-amber-500/20 text-amber-400'
                  }`}>
                    {mode.toUpperCase()}
                  </span>
                )}
                <button
                  onClick={loadConnection}
                  className="p-0.5 text-pi-text-dim hover:text-pi-text transition-colors"
                  title="Refresh"
                >
                  <RefreshCw className="w-3 h-3" />
                </button>
              </div>
            </div>
            <a
              href="https://aussieotp.vercel.app"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-[10px] text-cyan-400 hover:underline"
            >
              <ExternalLink className="w-2.5 h-2.5" /> Open Dashboard
            </a>
          </div>
        ) : connectionError ? (
          <div className="flex items-start gap-2">
            <AlertCircle className="w-3.5 h-3.5 text-red-400 shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-[10px] text-red-400">{connectionError}</p>
              <button onClick={loadConnection} className="text-[9px] text-pi-accent hover:underline mt-1">Retry</button>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <Loader2 className="w-3.5 h-3.5 animate-spin text-pi-text-dim" />
            <span className="text-[10px] text-pi-text-dim">Checking connection...</span>
          </div>
        )}
      </div>

      <div className="rounded-lg border border-pi-border">
        <button
          onClick={() => toggleSection('test')}
          className="w-full flex items-center gap-2.5 px-3 py-2.5 text-left hover:bg-pi-surface/50 active:bg-pi-surface/80 transition-colors min-h-[44px]"
        >
          <ChevronDown className={`w-3.5 h-3.5 text-pi-text-dim transition-transform ${activeSection === 'test' ? '' : '-rotate-90'}`} />
          <Send className="w-4 h-4 text-pi-text-dim" />
          <span className="text-xs font-medium text-pi-text flex-1">Test SMS</span>
        </button>

        {activeSection === 'test' && (
          <div className="border-t border-pi-border/50 px-3 py-3 space-y-2.5">
            <input
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              placeholder="Phone number (e.g. +61412345678)"
              value={testTo}
              onChange={e => setTestTo(e.target.value)}
              className="w-full px-3 py-2.5 text-sm font-mono bg-pi-bg border border-pi-border rounded-lg focus:outline-none focus:border-cyan-500 min-h-[44px]"
            />
            <textarea
              placeholder="Message..."
              value={testMessage}
              onChange={e => setTestMessage(e.target.value)}
              rows={3}
              className="w-full px-3 py-2.5 text-sm bg-pi-bg border border-pi-border rounded-lg focus:outline-none focus:border-cyan-500 resize-none"
            />
            <button
              onClick={handleTestSms}
              disabled={sendingTest || !testTo.trim() || !testMessage.trim()}
              className="w-full flex items-center justify-center gap-2 px-3 py-2.5 text-xs rounded-lg bg-cyan-600 text-white hover:bg-cyan-500 active:bg-cyan-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors font-medium min-h-[44px]"
            >
              {sendingTest ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              {sendingTest ? 'Sending...' : 'Send Test SMS'}
            </button>
          </div>
        )}
      </div>

      <div className="rounded-lg border border-pi-border">
        <button
          onClick={() => toggleSection('tools')}
          className="w-full flex items-center gap-2.5 px-3 py-2.5 text-left hover:bg-pi-surface/50 active:bg-pi-surface/80 transition-colors min-h-[44px]"
        >
          <ChevronDown className={`w-3.5 h-3.5 text-pi-text-dim transition-transform ${activeSection === 'tools' ? '' : '-rotate-90'}`} />
          <Zap className="w-4 h-4 text-pi-text-dim" />
          <span className="text-xs font-medium text-pi-text flex-1">AI Tools</span>
          <span className="text-[10px] text-pi-text-dim">{SMS_TOOLS.length} available</span>
        </button>

        {activeSection === 'tools' && (
          <div className="border-t border-pi-border/50 px-3 py-2.5">
            <div className="space-y-1.5">
              {SMS_TOOLS.map(t => (
                <div key={t.name} className="flex items-start gap-2 py-1">
                  <Zap className="w-3 h-3 shrink-0 mt-0.5 text-cyan-400" />
                  <div className="min-w-0">
                    <span className="text-[10px] font-mono text-pi-text block">{t.name}</span>
                    <span className="text-[9px] text-pi-text-dim">{t.description}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="rounded-lg border border-pi-border">
        <button
          onClick={() => toggleSection('links')}
          className="w-full flex items-center gap-2.5 px-3 py-2.5 text-left hover:bg-pi-surface/50 active:bg-pi-surface/80 transition-colors min-h-[44px]"
        >
          <ChevronDown className={`w-3.5 h-3.5 text-pi-text-dim transition-transform ${activeSection === 'links' ? '' : '-rotate-90'}`} />
          <ExternalLink className="w-4 h-4 text-pi-text-dim" />
          <span className="text-xs font-medium text-pi-text flex-1">Quick Links</span>
        </button>

        {activeSection === 'links' && (
          <div className="border-t border-pi-border/50 px-3 py-2 space-y-0.5">
            {QUICK_LINKS.map(link => (
              <a
                key={link.label}
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 py-2 text-xs text-pi-text-dim hover:text-cyan-400 active:text-cyan-300 transition-colors min-h-[40px]"
              >
                <link.icon className="w-4 h-4" />
                {link.label}
              </a>
            ))}
          </div>
        )}
      </div>

      <div className="rounded-lg border border-pi-border bg-pi-surface/30 p-3">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[10px] text-pi-text-dim font-medium">Saved Credentials</span>
        </div>
        <div className="flex flex-wrap gap-2 mb-3">
          {settings.hasAussieSmsApiKey && (
            <span className="flex items-center gap-1.5 text-[10px] text-green-400">
              <CheckCircle2 className="w-3 h-3" /> API Key
            </span>
          )}
        </div>
        <button
          onClick={handleDelete}
          className="flex items-center gap-1.5 py-2 text-xs text-red-400 hover:text-red-300 active:text-red-200 transition-colors min-h-[40px]"
        >
          <Trash2 className="w-3.5 h-3.5" /> Remove AussieSMS credentials
        </button>
      </div>
    </div>
  )
}
