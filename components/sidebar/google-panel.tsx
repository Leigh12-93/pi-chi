'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { ChevronDown, Check, Loader2, Trash2, ExternalLink, RefreshCw, Copy, Upload, AlertTriangle, X } from 'lucide-react'
import { toast } from 'sonner'

interface GooglePanelProps {
  fileContents: Record<string, string>
  onFileChange: (path: string, content: string) => void
}

interface GoogleSettings {
  hasGoogleOAuth: boolean
  hasGoogleApiKey: boolean
  hasGoogleServiceAccount: boolean
  hasGoogleAccount: boolean
  googleConnectedEmail: string | null
  googleConnectedScopes: string[]
  googleTokenExpiry: string | null
  googleServiceAccountEmail: string | null
  googleServiceAccountProject: string | null
}

const DEFAULT_SETTINGS: GoogleSettings = {
  hasGoogleOAuth: false,
  hasGoogleApiKey: false,
  hasGoogleServiceAccount: false,
  hasGoogleAccount: false,
  googleConnectedEmail: null,
  googleConnectedScopes: [],
  googleTokenExpiry: null,
  googleServiceAccountEmail: null,
  googleServiceAccountProject: null,
}

// Friendly scope label mapping
const SCOPE_LABELS: Record<string, string> = {
  'https://www.googleapis.com/auth/drive.file': 'Drive',
  'https://www.googleapis.com/auth/spreadsheets': 'Sheets',
  'https://www.googleapis.com/auth/calendar': 'Calendar',
  'https://www.googleapis.com/auth/gmail.send': 'Gmail',
  'openid': 'OpenID',
  'email': 'Email',
  'profile': 'Profile',
}

function scopeLabel(scope: string): string {
  return SCOPE_LABELS[scope] || scope.split('/').pop() || scope
}

function timeUntilExpiry(expiry: string): string {
  const diff = new Date(expiry).getTime() - Date.now()
  if (diff <= 0) return 'expired'
  const mins = Math.floor(diff / 60000)
  if (mins < 60) return `${mins}m`
  const hours = Math.floor(mins / 60)
  return `${hours}h ${mins % 60}m`
}

export function GooglePanel({ fileContents, onFileChange }: GooglePanelProps) {
  const [settings, setSettings] = useState<GoogleSettings>(DEFAULT_SETTINGS)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<string | null>(null)

  // OAuth form
  const [clientId, setClientId] = useState('')
  const [clientSecret, setClientSecret] = useState('')

  // API Key form
  const [apiKey, setApiKey] = useState('')

  // Service Account form
  const [serviceAccountJson, setServiceAccountJson] = useState('')

  // Section collapse state
  const [oauthOpen, setOauthOpen] = useState(true)
  const [apiKeyOpen, setApiKeyOpen] = useState(true)
  const [saOpen, setSaOpen] = useState(true)

  // Error banner
  const [errorBanner, setErrorBanner] = useState<string | null>(null)

  // Testing
  const [testing, setTesting] = useState<string | null>(null)

  // Refreshing
  const [refreshing, setRefreshing] = useState(false)

  const fileInputRef = useRef<HTMLInputElement>(null)

  // Load settings on mount
  const loadSettings = useCallback(async () => {
    try {
      const res = await fetch('/api/settings')
      if (!res.ok) return
      const data = await res.json()
      setSettings({
        hasGoogleOAuth: data.hasGoogleOAuth ?? false,
        hasGoogleApiKey: data.hasGoogleApiKey ?? false,
        hasGoogleServiceAccount: data.hasGoogleServiceAccount ?? false,
        hasGoogleAccount: data.hasGoogleAccount ?? false,
        googleConnectedEmail: data.googleConnectedEmail ?? null,
        googleConnectedScopes: data.googleConnectedScopes ?? [],
        googleTokenExpiry: data.googleTokenExpiry ?? null,
        googleServiceAccountEmail: data.googleServiceAccountEmail ?? null,
        googleServiceAccountProject: data.googleServiceAccountProject ?? null,
      })
    } catch {
      // Silent fail
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadSettings()
  }, [loadSettings])

  // Check for error/success query params on mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const googleError = params.get('google_error')
    const googleConnected = params.get('google_connected')

    if (googleError === 'redirect_uri_mismatch') {
      const redirectUri = `${window.location.origin}/api/auth/google/callback`
      setErrorBanner(`Redirect URI mismatch. Add this URI to your Google Cloud Console:\n${redirectUri}`)
    } else if (googleError) {
      setErrorBanner(`Google connection failed: ${googleError.replace(/_/g, ' ')}`)
    }

    if (googleConnected === 'true') {
      toast.success('Google account connected')
      loadSettings()
    }

    // Clean up URL params
    if (googleError || googleConnected) {
      const url = new URL(window.location.href)
      url.searchParams.delete('google_error')
      url.searchParams.delete('google_connected')
      window.history.replaceState({}, '', url.toString())
    }
  }, [loadSettings])

  // Auto-refresh if token expired on mount
  useEffect(() => {
    if (settings.hasGoogleAccount && settings.googleTokenExpiry) {
      const expiry = new Date(settings.googleTokenExpiry).getTime()
      if (expiry < Date.now()) {
        fetch('/api/auth/google/refresh', { method: 'POST' })
          .then(res => { if (res.ok) loadSettings() })
          .catch(() => {})
      }
    }
  }, [settings.hasGoogleAccount, settings.googleTokenExpiry, loadSettings])

  // ── Save handlers ──

  const handleSaveOAuth = async () => {
    if (!clientId.trim() || !clientSecret.trim()) {
      toast.error('Both Client ID and Client Secret are required')
      return
    }
    setSaving('oauth')
    try {
      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ googleClientId: clientId, googleClientSecret: clientSecret }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error || 'Failed to save')
        return
      }
      toast.success('OAuth credentials saved')
      setClientId('')
      setClientSecret('')
      loadSettings()
    } catch {
      toast.error('Network error')
    } finally {
      setSaving(null)
    }
  }

  const handleSaveApiKey = async () => {
    if (!apiKey.trim()) return
    setSaving('apiKey')
    try {
      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ googleApiKey: apiKey }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error || 'Failed to save')
        return
      }
      toast.success('API key saved')
      setApiKey('')
      loadSettings()
    } catch {
      toast.error('Network error')
    } finally {
      setSaving(null)
    }
  }

  const handleSaveServiceAccount = async () => {
    if (!serviceAccountJson.trim()) return
    setSaving('sa')
    try {
      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ googleServiceAccount: serviceAccountJson }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error || 'Failed to save')
        return
      }
      toast.success('Service account saved')
      setServiceAccountJson('')
      loadSettings()
    } catch {
      toast.error('Network error')
    } finally {
      setSaving(null)
    }
  }

  // ── Delete handlers ──

  const handleDelete = async (target: string, label: string) => {
    try {
      const res = await fetch(`/api/settings?target=${target}`, { method: 'DELETE' })
      if (!res.ok) {
        toast.error(`Failed to remove ${label}`)
        return
      }
      toast.success(`${label} removed`)
      loadSettings()
    } catch {
      toast.error('Network error')
    }
  }

  // ── Connect Google Account ──

  const handleConnect = () => {
    window.location.href = '/api/auth/google'
  }

  // ── Refresh token ──

  const handleRefresh = async () => {
    setRefreshing(true)
    try {
      const res = await fetch('/api/auth/google/refresh', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error || 'Refresh failed')
        return
      }
      toast.success('Token refreshed')
      loadSettings()
    } catch {
      toast.error('Network error')
    } finally {
      setRefreshing(false)
    }
  }

  // ── Test connection ──

  const handleTest = async (service: string) => {
    setTesting(service)
    try {
      const res = await fetch('/api/google/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ service }),
      })
      const data = await res.json()
      if (data.ok) {
        toast.success(`${service} connection verified`)
      } else {
        toast.error(data.error || `${service} test failed`)
      }
    } catch {
      toast.error('Network error')
    } finally {
      setTesting(null)
    }
  }

  // ── File upload for SA ──

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      setServiceAccountJson(reader.result as string)
    }
    reader.readAsText(file)
    // Reset input so same file can be selected again
    e.target.value = ''
  }

  // ── Copy redirect URI ──

  const handleCopyRedirectUri = () => {
    const uri = `${window.location.origin}/api/auth/google/callback`
    navigator.clipboard.writeText(uri)
    toast.success('Redirect URI copied')
  }

  if (loading) {
    return (
      <div className="p-3 flex items-center justify-center">
        <Loader2 className="w-4 h-4 animate-spin text-forge-text-dim" />
      </div>
    )
  }

  const redirectUri = typeof window !== 'undefined'
    ? `${window.location.origin}/api/auth/google/callback`
    : ''

  return (
    <div className="p-3 space-y-3">
      <p className="text-[10px] uppercase tracking-wider text-forge-text-dim font-medium">Google Cloud</p>

      {/* Error banner */}
      {errorBanner && (
        <div className="rounded-md border border-red-500/30 bg-red-500/5 p-2.5">
          <div className="flex items-start gap-2">
            <AlertTriangle className="w-3.5 h-3.5 text-red-400 shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-[11px] text-red-300 whitespace-pre-wrap break-all">{errorBanner}</p>
            </div>
            <button onClick={() => setErrorBanner(null)} className="text-red-400 hover:text-red-300">
              <X className="w-3 h-3" />
            </button>
          </div>
        </div>
      )}

      {/* ═══ Section 1: OAuth Credentials ═══ */}
      <div className="rounded-md border border-forge-border">
        <button
          onClick={() => setOauthOpen(!oauthOpen)}
          className="w-full flex items-center gap-2 px-2.5 py-2 text-left hover:bg-forge-surface/50 transition-colors"
        >
          <ChevronDown className={`w-3 h-3 text-forge-text-dim transition-transform ${oauthOpen ? '' : '-rotate-90'}`} />
          <span className="text-[11px] font-medium text-forge-text flex-1">OAuth Credentials</span>
          {settings.hasGoogleOAuth && <Check className="w-3 h-3 text-forge-success" />}
        </button>

        {oauthOpen && (
          <div className="px-2.5 pb-2.5 space-y-2 border-t border-forge-border/50 pt-2">
            {!settings.hasGoogleOAuth ? (
              <>
                <p className="text-[10px] text-forge-text-dim leading-relaxed">
                  Connect Google Sign-In or authorize Forge to access your Google account.
                </p>
                <input
                  type="text"
                  placeholder="Client ID"
                  value={clientId}
                  onChange={e => setClientId(e.target.value)}
                  className="w-full px-2 py-1.5 text-xs font-mono bg-forge-bg border border-forge-border rounded-md focus:outline-none focus:border-forge-accent"
                />
                <input
                  type="password"
                  placeholder="Client Secret"
                  value={clientSecret}
                  onChange={e => setClientSecret(e.target.value)}
                  className="w-full px-2 py-1.5 text-xs font-mono bg-forge-bg border border-forge-border rounded-md focus:outline-none focus:border-forge-accent"
                />
                <button
                  onClick={handleSaveOAuth}
                  disabled={saving === 'oauth' || !clientId.trim() || !clientSecret.trim()}
                  className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs rounded-md bg-forge-accent text-white hover:bg-forge-accent/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  {saving === 'oauth' ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
                  Save Credentials
                </button>

                {/* Redirect URI */}
                <div className="space-y-1">
                  <p className="text-[10px] text-forge-text-dim">Required redirect URI:</p>
                  <div className="flex items-center gap-1">
                    <code className="flex-1 text-[9px] font-mono text-forge-text bg-forge-bg px-1.5 py-1 rounded border border-forge-border truncate">
                      {redirectUri}
                    </code>
                    <button onClick={handleCopyRedirectUri} className="p-1 text-forge-text-dim hover:text-forge-text" title="Copy">
                      <Copy className="w-3 h-3" />
                    </button>
                  </div>
                </div>

                {/* Links */}
                <div className="space-y-0.5">
                  <a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-1 text-[10px] text-forge-accent hover:underline">
                    <ExternalLink className="w-2.5 h-2.5" /> Create credentials
                  </a>
                  <a href="https://console.cloud.google.com/apis/credentials/consent" target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-1 text-[10px] text-forge-accent hover:underline">
                    <ExternalLink className="w-2.5 h-2.5" /> OAuth consent screen
                  </a>
                  <a href="https://console.cloud.google.com/apis/library" target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-1 text-[10px] text-forge-accent hover:underline">
                    <ExternalLink className="w-2.5 h-2.5" /> Enable APIs
                  </a>
                </div>
              </>
            ) : (
              <>
                {/* Connected account state */}
                {settings.hasGoogleAccount ? (
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-1.5">
                      <Check className="w-3 h-3 text-forge-success shrink-0" />
                      <span className="text-[11px] text-forge-text truncate">{settings.googleConnectedEmail || 'Connected'}</span>
                    </div>

                    {/* Scope badges */}
                    {settings.googleConnectedScopes.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {settings.googleConnectedScopes
                          .filter(s => !['openid', 'email', 'profile'].includes(s) && !s.includes('/auth/userinfo'))
                          .map(s => (
                            <span key={s} className="text-[9px] px-1.5 py-0.5 rounded-full bg-forge-surface text-forge-text-dim">
                              {scopeLabel(s)}
                            </span>
                          ))}
                      </div>
                    )}

                    {/* Token expiry + refresh */}
                    {settings.googleTokenExpiry && (
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] text-forge-text-dim">
                          Token: {timeUntilExpiry(settings.googleTokenExpiry) === 'expired'
                            ? <span className="text-amber-400">expired</span>
                            : <>expires in {timeUntilExpiry(settings.googleTokenExpiry)}</>}
                        </span>
                        <button
                          onClick={handleRefresh}
                          disabled={refreshing}
                          className="p-0.5 text-forge-text-dim hover:text-forge-accent transition-colors"
                          title="Refresh token"
                        >
                          <RefreshCw className={`w-3 h-3 ${refreshing ? 'animate-spin' : ''}`} />
                        </button>
                      </div>
                    )}

                    {/* Test buttons */}
                    <div className="flex flex-wrap gap-1">
                      {['userinfo', 'drive', 'sheets', 'calendar', 'gmail'].map(svc => (
                        <button
                          key={svc}
                          onClick={() => handleTest(svc)}
                          disabled={testing !== null}
                          className="px-1.5 py-0.5 text-[9px] rounded border border-forge-border hover:bg-forge-surface disabled:opacity-40 transition-colors capitalize"
                        >
                          {testing === svc ? <Loader2 className="w-2.5 h-2.5 animate-spin inline" /> : `Test ${svc}`}
                        </button>
                      ))}
                    </div>

                    <button
                      onClick={() => handleDelete('googleAccount', 'Google account')}
                      className="flex items-center gap-1 text-[10px] text-red-400 hover:text-red-300 transition-colors"
                    >
                      <Trash2 className="w-2.5 h-2.5" /> Disconnect account
                    </button>
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-1.5">
                      <Check className="w-3 h-3 text-forge-success shrink-0" />
                      <span className="text-[11px] text-forge-text">OAuth configured</span>
                    </div>
                    <button
                      onClick={handleConnect}
                      className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs rounded-md bg-white text-gray-800 hover:bg-gray-100 font-medium transition-colors"
                    >
                      <svg className="w-3.5 h-3.5" viewBox="0 0 24 24">
                        <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
                        <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                        <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                        <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                      </svg>
                      Connect Google Account
                    </button>
                  </div>
                )}

                <button
                  onClick={() => handleDelete('googleOAuth', 'OAuth credentials')}
                  className="flex items-center gap-1 text-[10px] text-red-400 hover:text-red-300 transition-colors"
                >
                  <Trash2 className="w-2.5 h-2.5" /> Remove OAuth credentials
                </button>
              </>
            )}
          </div>
        )}
      </div>

      {/* ═══ Section 2: API Key ═══ */}
      <div className="rounded-md border border-forge-border">
        <button
          onClick={() => setApiKeyOpen(!apiKeyOpen)}
          className="w-full flex items-center gap-2 px-2.5 py-2 text-left hover:bg-forge-surface/50 transition-colors"
        >
          <ChevronDown className={`w-3 h-3 text-forge-text-dim transition-transform ${apiKeyOpen ? '' : '-rotate-90'}`} />
          <span className="text-[11px] font-medium text-forge-text flex-1">API Key</span>
          {settings.hasGoogleApiKey && <Check className="w-3 h-3 text-forge-success" />}
        </button>

        {apiKeyOpen && (
          <div className="px-2.5 pb-2.5 space-y-2 border-t border-forge-border/50 pt-2">
            {!settings.hasGoogleApiKey ? (
              <>
                <p className="text-[10px] text-forge-text-dim leading-relaxed">
                  For Google Maps, YouTube Data, Places, and other key-based services.
                </p>
                <input
                  type="password"
                  placeholder="API Key (AIza...)"
                  value={apiKey}
                  onChange={e => setApiKey(e.target.value)}
                  className="w-full px-2 py-1.5 text-xs font-mono bg-forge-bg border border-forge-border rounded-md focus:outline-none focus:border-forge-accent"
                />
                <button
                  onClick={handleSaveApiKey}
                  disabled={saving === 'apiKey' || !apiKey.trim()}
                  className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs rounded-md bg-forge-accent text-white hover:bg-forge-accent/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  {saving === 'apiKey' ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
                  Save API Key
                </button>
                <a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-1 text-[10px] text-forge-accent hover:underline">
                  <ExternalLink className="w-2.5 h-2.5" /> Create API key
                </a>
              </>
            ) : (
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <Check className="w-3 h-3 text-forge-success" />
                  <span className="text-[11px] text-forge-text">API Key saved</span>
                </div>
                <button
                  onClick={() => handleDelete('googleApiKey', 'API Key')}
                  className="flex items-center gap-1 text-[10px] text-red-400 hover:text-red-300 transition-colors"
                >
                  <Trash2 className="w-2.5 h-2.5" /> Remove
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ═══ Section 3: Service Account ═══ */}
      <div className="rounded-md border border-forge-border">
        <button
          onClick={() => setSaOpen(!saOpen)}
          className="w-full flex items-center gap-2 px-2.5 py-2 text-left hover:bg-forge-surface/50 transition-colors"
        >
          <ChevronDown className={`w-3 h-3 text-forge-text-dim transition-transform ${saOpen ? '' : '-rotate-90'}`} />
          <span className="text-[11px] font-medium text-forge-text flex-1">Service Account</span>
          {settings.hasGoogleServiceAccount && <Check className="w-3 h-3 text-forge-success" />}
        </button>

        {saOpen && (
          <div className="px-2.5 pb-2.5 space-y-2 border-t border-forge-border/50 pt-2">
            {!settings.hasGoogleServiceAccount ? (
              <>
                <p className="text-[10px] text-forge-text-dim leading-relaxed">
                  For Firebase Admin, Cloud Storage, BigQuery — server-to-server auth.
                </p>
                <textarea
                  placeholder="Paste JSON key..."
                  value={serviceAccountJson}
                  onChange={e => setServiceAccountJson(e.target.value)}
                  rows={6}
                  className="w-full px-2 py-1.5 text-xs font-mono bg-forge-bg border border-forge-border rounded-md focus:outline-none focus:border-forge-accent resize-none"
                />
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-forge-text-dim">or</span>
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="flex items-center gap-1 text-[10px] text-forge-accent hover:underline"
                  >
                    <Upload className="w-2.5 h-2.5" /> Upload .json
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".json"
                    onChange={handleFileUpload}
                    className="hidden"
                  />
                </div>
                <button
                  onClick={handleSaveServiceAccount}
                  disabled={saving === 'sa' || !serviceAccountJson.trim()}
                  className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs rounded-md bg-forge-accent text-white hover:bg-forge-accent/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  {saving === 'sa' ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
                  Save Service Account
                </button>
                <a href="https://console.cloud.google.com/iam-admin/serviceaccounts" target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-1 text-[10px] text-forge-accent hover:underline">
                  <ExternalLink className="w-2.5 h-2.5" /> Download key
                </a>
              </>
            ) : (
              <div className="space-y-1.5">
                <div className="flex items-center gap-1.5">
                  <Check className="w-3 h-3 text-forge-success shrink-0" />
                  <span className="text-[11px] text-forge-text">Service Account configured</span>
                </div>
                {settings.googleServiceAccountEmail && (
                  <p className="text-[10px] text-forge-text-dim font-mono truncate pl-[18px]">
                    {settings.googleServiceAccountEmail}
                  </p>
                )}
                {settings.googleServiceAccountProject && (
                  <p className="text-[10px] text-forge-text-dim pl-[18px]">
                    Project: {settings.googleServiceAccountProject}
                  </p>
                )}
                <button
                  onClick={() => handleDelete('googleServiceAccount', 'Service Account')}
                  className="flex items-center gap-1 text-[10px] text-red-400 hover:text-red-300 transition-colors"
                >
                  <Trash2 className="w-2.5 h-2.5" /> Remove
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
