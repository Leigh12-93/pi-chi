'use client'

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import {
  ChevronDown, Check, Loader2, Trash2, ExternalLink, RefreshCw, Copy, Upload,
  AlertTriangle, X, Table2, Calendar, Mail, FolderOpen, Map, Youtube, Languages,
  Zap, Shield, Eye, EyeOff, Wand2, Globe, Search,
  FileText, Plus, Settings2, CheckCircle2, XCircle, Clock, Link2,
} from 'lucide-react'
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

// ── Scope → label mapping ──
const SCOPE_LABELS: Record<string, string> = {
  'https://www.googleapis.com/auth/drive.file': 'Drive',
  'https://www.googleapis.com/auth/spreadsheets': 'Sheets',
  'https://www.googleapis.com/auth/calendar': 'Calendar',
  'https://www.googleapis.com/auth/gmail.send': 'Gmail (Send)',
  'https://www.googleapis.com/auth/gmail.readonly': 'Gmail (Read)',
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

// ── Google service definitions ──

interface GoogleService {
  id: string
  label: string
  icon: React.FC<{ className?: string }>
  description: string
  authType: 'oauth' | 'apikey' | 'both' | 'serviceaccount'
  scope?: string
  tools: { name: string; description: string }[]
  envVars?: string[]  // env var names this service looks for
  docsUrl: string
  apiLibraryId?: string  // for Google Cloud API Library links
}

const GOOGLE_SERVICES: GoogleService[] = [
  {
    id: 'sheets',
    label: 'Google Sheets',
    icon: Table2,
    description: 'Read, write, and create spreadsheets',
    authType: 'oauth',
    scope: 'https://www.googleapis.com/auth/spreadsheets',
    tools: [
      { name: 'google_sheets_read', description: 'Read data from a spreadsheet range' },
      { name: 'google_sheets_write', description: 'Write data to a spreadsheet range' },
      { name: 'google_sheets_create', description: 'Create a new spreadsheet' },
    ],
    docsUrl: 'https://developers.google.com/sheets/api',
    apiLibraryId: 'sheets.googleapis.com',
  },
  {
    id: 'calendar',
    label: 'Google Calendar',
    icon: Calendar,
    description: 'List and create calendar events',
    authType: 'oauth',
    scope: 'https://www.googleapis.com/auth/calendar',
    tools: [
      { name: 'google_calendar_list_events', description: 'List upcoming events' },
      { name: 'google_calendar_create_event', description: 'Create a new event' },
    ],
    docsUrl: 'https://developers.google.com/calendar/api',
    apiLibraryId: 'calendar-json.googleapis.com',
  },
  {
    id: 'gmail',
    label: 'Gmail',
    icon: Mail,
    description: 'List, read, and send emails',
    authType: 'oauth',
    scope: 'https://www.googleapis.com/auth/gmail.send',
    tools: [
      { name: 'google_gmail_send', description: 'Send an email' },
      { name: 'google_gmail_list', description: 'List recent emails' },
      { name: 'google_gmail_read', description: 'Read a specific email' },
    ],
    docsUrl: 'https://developers.google.com/gmail/api',
    apiLibraryId: 'gmail.googleapis.com',
  },
  {
    id: 'drive',
    label: 'Google Drive',
    icon: FolderOpen,
    description: 'List and read files from Drive',
    authType: 'oauth',
    scope: 'https://www.googleapis.com/auth/drive.file',
    tools: [
      { name: 'google_drive_list', description: 'List files in Drive' },
      { name: 'google_drive_read', description: 'Read/download a file' },
    ],
    docsUrl: 'https://developers.google.com/drive/api',
    apiLibraryId: 'drive.googleapis.com',
  },
  {
    id: 'maps',
    label: 'Google Maps',
    icon: Map,
    description: 'Geocoding, directions, places search',
    authType: 'apikey',
    tools: [
      { name: 'google_maps_geocode', description: 'Convert address to coordinates' },
      { name: 'google_maps_directions', description: 'Get directions between locations' },
      { name: 'google_maps_places_search', description: 'Search for nearby places' },
    ],
    envVars: ['NEXT_PUBLIC_GOOGLE_MAPS_KEY', 'GOOGLE_MAPS_API_KEY', 'REACT_APP_GOOGLE_MAPS_KEY'],
    docsUrl: 'https://developers.google.com/maps',
    apiLibraryId: 'maps-backend.googleapis.com',
  },
  {
    id: 'youtube',
    label: 'YouTube Data',
    icon: Youtube,
    description: 'Search videos, get channel & video info',
    authType: 'apikey',
    tools: [
      { name: 'google_youtube_search', description: 'Search YouTube videos' },
      { name: 'google_youtube_video_info', description: 'Get video details' },
    ],
    envVars: ['YOUTUBE_API_KEY', 'GOOGLE_YOUTUBE_KEY'],
    docsUrl: 'https://developers.google.com/youtube/v3',
    apiLibraryId: 'youtube.googleapis.com',
  },
  {
    id: 'translate',
    label: 'Google Translate',
    icon: Languages,
    description: 'Translate text between languages',
    authType: 'apikey',
    tools: [
      { name: 'google_translate_text', description: 'Translate text to another language' },
    ],
    envVars: ['GOOGLE_TRANSLATE_KEY'],
    docsUrl: 'https://cloud.google.com/translate/docs',
    apiLibraryId: 'translate.googleapis.com',
  },
]

// ── Detect Google env vars from project files ──

interface DetectedEnvVar {
  key: string
  value: string
  file: string
}

function detectGoogleEnvVars(fileContents: Record<string, string>): DetectedEnvVar[] {
  const envFiles = ['.env', '.env.local', '.env.development', '.env.production']
  const found: DetectedEnvVar[] = []

  for (const [path, content] of Object.entries(fileContents)) {
    const filename = path.split('/').pop() || ''
    if (!envFiles.includes(filename)) continue

    const lines = content.split('\n')
    for (const line of lines) {
      const trimmed = line.trim()
      if (trimmed.startsWith('#') || !trimmed.includes('=')) continue
      const [key, ...rest] = trimmed.split('=')
      const value = rest.join('=').replace(/^["']|["']$/g, '')
      if (key && value && (
        key.includes('GOOGLE') ||
        key.includes('MAPS') ||
        key.includes('YOUTUBE') ||
        key.includes('TRANSLATE') ||
        key.includes('FIREBASE') ||
        key.includes('GCLOUD')
      )) {
        found.push({ key: key.trim(), value, file: path })
      }
    }
  }
  return found
}

// Detect if project uses Google Maps (script tags, @react-google-maps, etc.)
function detectGoogleMapsUsage(fileContents: Record<string, string>): boolean {
  for (const [path, content] of Object.entries(fileContents)) {
    if (path.endsWith('.tsx') || path.endsWith('.jsx') || path.endsWith('.ts') || path.endsWith('.js') || path.endsWith('.html')) {
      if (
        content.includes('maps.googleapis.com') ||
        content.includes('@react-google-maps') ||
        content.includes('google-map-react') ||
        content.includes('@vis.gl/react-google-maps') ||
        content.includes('GoogleMap') ||
        content.includes('useJsApiLoader')
      ) return true
    }
  }
  return false
}

// Detect Google Fonts usage
function detectGoogleFontsUsage(fileContents: Record<string, string>): { detected: boolean; fonts: string[] } {
  const fonts: string[] = []
  for (const [path, content] of Object.entries(fileContents)) {
    if (path.endsWith('.css') || path.endsWith('.html') || path.endsWith('.tsx') || path.endsWith('.jsx')) {
      const matches = content.matchAll(/fonts\.googleapis\.com\/css2?\?family=([^"'&\s]+)/g)
      for (const m of matches) {
        const fontName = decodeURIComponent(m[1]).replace(/\+/g, ' ').split(':')[0]
        if (!fonts.includes(fontName)) fonts.push(fontName)
      }
    }
  }
  return { detected: fonts.length > 0, fonts }
}

// ── Main Component ──

export function GooglePanel({ fileContents, onFileChange }: GooglePanelProps) {
  const [settings, setSettings] = useState<GoogleSettings>(DEFAULT_SETTINGS)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<string | null>(null)

  // Auth forms
  const [clientId, setClientId] = useState('')
  const [clientSecret, setClientSecret] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [serviceAccountJson, setServiceAccountJson] = useState('')
  const [showSecret, setShowSecret] = useState(false)
  const [showApiKey, setShowApiKey] = useState(false)

  // Section state
  const [activeSection, setActiveSection] = useState<string | null>(null)
  const [authTab, setAuthTab] = useState<'oauth' | 'apikey' | 'sa'>('oauth')

  // Error banner
  const [errorBanner, setErrorBanner] = useState<string | null>(null)

  // Testing & refreshing
  const [testing, setTesting] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)

  const fileInputRef = useRef<HTMLInputElement>(null)

  // Auto-detect from project files
  const detectedEnvVars = useMemo(() => detectGoogleEnvVars(fileContents), [fileContents])
  const usesGoogleMaps = useMemo(() => detectGoogleMapsUsage(fileContents), [fileContents])
  const googleFonts = useMemo(() => detectGoogleFontsUsage(fileContents), [fileContents])

  // Detected API key from env
  const detectedApiKey = useMemo(() => {
    const match = detectedEnvVars.find(v =>
      v.key === 'GOOGLE_API_KEY' || v.key === 'NEXT_PUBLIC_GOOGLE_API_KEY' || v.key.includes('GOOGLE') && v.value.startsWith('AIza')
    )
    return match || null
  }, [detectedEnvVars])

  // Detected Maps key from env
  const detectedMapsKey = useMemo(() => {
    return detectedEnvVars.find(v =>
      v.key.includes('MAPS') && v.value.startsWith('AIza')
    ) || null
  }, [detectedEnvVars])

  // ── Load settings ──
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

  useEffect(() => { loadSettings() }, [loadSettings])

  // Check for OAuth callback query params
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

    if (googleError || googleConnected) {
      const url = new URL(window.location.href)
      url.searchParams.delete('google_error')
      url.searchParams.delete('google_connected')
      window.history.replaceState({}, '', url.toString())
    }
  }, [loadSettings])

  // Auto-refresh expired token on mount
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

  // Auto-detect and auto-save Google API key from env files
  const autoSavedGoogle = useRef(false)
  useEffect(() => {
    if (!settings.hasGoogleApiKey && detectedApiKey && !apiKey) {
      setApiKey(detectedApiKey.value)
      setAuthTab('apikey')
      // Auto-save to settings (fire-and-forget)
      if (!autoSavedGoogle.current && detectedApiKey.value.startsWith('AIza')) {
        autoSavedGoogle.current = true
        fetch('/api/settings', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ googleApiKey: detectedApiKey.value }),
        }).then(() => loadSettings()).catch(() => {})
      }
    }
  }, [settings.hasGoogleApiKey, detectedApiKey, apiKey, loadSettings])

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
      if (!res.ok) { toast.error(data.error || 'Failed to save'); return }
      toast.success('OAuth credentials saved')
      setClientId('')
      setClientSecret('')
      loadSettings()
    } catch { toast.error('Network error') }
    finally { setSaving(null) }
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
      if (!res.ok) { toast.error(data.error || 'Failed to save'); return }
      toast.success('API key saved')
      setApiKey('')
      loadSettings()
    } catch { toast.error('Network error') }
    finally { setSaving(null) }
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
      if (!res.ok) { toast.error(data.error || 'Failed to save'); return }
      toast.success('Service account saved')
      setServiceAccountJson('')
      loadSettings()
    } catch { toast.error('Network error') }
    finally { setSaving(null) }
  }

  const handleDelete = async (target: string, label: string) => {
    try {
      const res = await fetch(`/api/settings?target=${target}`, { method: 'DELETE' })
      if (!res.ok) { toast.error(`Failed to remove ${label}`); return }
      toast.success(`${label} removed`)
      loadSettings()
    } catch { toast.error('Network error') }
  }

  const handleConnect = () => { window.location.href = '/api/auth/google' }

  const handleRefresh = async () => {
    setRefreshing(true)
    try {
      const res = await fetch('/api/auth/google/refresh', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) { toast.error(data.error || 'Refresh failed'); return }
      toast.success('Token refreshed')
      loadSettings()
    } catch { toast.error('Network error') }
    finally { setRefreshing(false) }
  }

  const handleTest = async (service: string) => {
    setTesting(service)
    try {
      const res = await fetch('/api/google/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ service }),
      })
      const data = await res.json()
      if (data.ok) toast.success(`${service} connection verified`)
      else toast.error(data.error || `${service} test failed`)
    } catch { toast.error('Network error') }
    finally { setTesting(null) }
  }

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => { setServiceAccountJson(reader.result as string) }
    reader.readAsText(file)
    e.target.value = ''
  }

  const handleCopyRedirectUri = () => {
    const uri = `${window.location.origin}/api/auth/google/callback`
    navigator.clipboard.writeText(uri)
    toast.success('Redirect URI copied')
  }

  // ── Inject env var into project ──
  const handleInjectEnvVar = (key: string, value: string) => {
    const envPath = '.env.local'
    const existing = fileContents[envPath] || ''
    const lines = existing.split('\n').filter(l => !l.startsWith(`${key}=`))
    lines.push(`${key}=${value}`)
    onFileChange(envPath, lines.join('\n'))
    toast.success(`Added ${key} to .env.local`)
  }

  // ── Determine service status ──
  const getServiceStatus = useCallback((service: GoogleService): 'ready' | 'partial' | 'missing' => {
    if (service.authType === 'oauth' || service.authType === 'both') {
      if (settings.hasGoogleAccount && service.scope && settings.googleConnectedScopes.includes(service.scope)) {
        return 'ready'
      }
      if (settings.hasGoogleOAuth && !settings.hasGoogleAccount) return 'partial'
    }
    if (service.authType === 'apikey' || service.authType === 'both') {
      if (settings.hasGoogleApiKey) return 'ready'
      // Check if key exists in project env
      if (service.envVars?.some(v => detectedEnvVars.some(d => d.key === v))) return 'partial'
    }
    if (service.authType === 'serviceaccount') {
      if (settings.hasGoogleServiceAccount) return 'ready'
    }
    return 'missing'
  }, [settings, detectedEnvVars])

  const toggleSection = (id: string) => setActiveSection(prev => prev === id ? null : id)

  if (loading) {
    return (
      <div className="p-3 flex items-center justify-center">
        <Loader2 className="w-4 h-4 animate-spin text-forge-text-dim" />
      </div>
    )
  }

  const redirectUri = typeof window !== 'undefined' ? `${window.location.origin}/api/auth/google/callback` : ''
  const connectedCount = GOOGLE_SERVICES.filter(s => getServiceStatus(s) === 'ready').length
  const hasAnyAuth = settings.hasGoogleOAuth || settings.hasGoogleApiKey || settings.hasGoogleServiceAccount

  return (
    <div className="p-3 space-y-2.5">
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

      {/* Status Summary Bar */}
      <div className="rounded-md border border-forge-border bg-forge-surface/30 p-2.5">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[11px] font-medium text-forge-text">Connection Status</span>
          <span className="text-[10px] text-forge-text-dim">
            {connectedCount}/{GOOGLE_SERVICES.length} services
          </span>
        </div>

        {/* Quick status indicators */}
        <div className="flex flex-wrap gap-1.5">
          {settings.hasGoogleAccount ? (
            <div className="flex items-center gap-1 text-[10px] text-forge-success">
              <CheckCircle2 className="w-3 h-3" />
              <span className="truncate max-w-[130px]">{settings.googleConnectedEmail || 'OAuth connected'}</span>
            </div>
          ) : settings.hasGoogleOAuth ? (
            <div className="flex items-center gap-1 text-[10px] text-amber-400">
              <Clock className="w-3 h-3" />
              <span>OAuth configured — not connected</span>
            </div>
          ) : null}
          {settings.hasGoogleApiKey && (
            <div className="flex items-center gap-1 text-[10px] text-forge-success">
              <CheckCircle2 className="w-3 h-3" /> API Key
            </div>
          )}
          {settings.hasGoogleServiceAccount && (
            <div className="flex items-center gap-1 text-[10px] text-forge-success">
              <CheckCircle2 className="w-3 h-3" /> Service Account
            </div>
          )}
          {!hasAnyAuth && (
            <div className="flex items-center gap-1 text-[10px] text-forge-text-dim">
              <XCircle className="w-3 h-3" /> No credentials configured
            </div>
          )}
        </div>

        {/* Token expiry + quick refresh */}
        {settings.hasGoogleAccount && settings.googleTokenExpiry && (
          <div className="flex items-center gap-1.5 mt-1.5">
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
      </div>

      {/* Auto-Detected Env Vars */}
      {detectedEnvVars.length > 0 && !hasAnyAuth && (
        <div className="rounded-md border border-blue-500/30 bg-blue-500/5 p-2.5">
          <div className="flex items-center gap-1.5 mb-1.5">
            <Wand2 className="w-3.5 h-3.5 text-blue-400" />
            <span className="text-[11px] font-medium text-blue-300">Auto-Detected Credentials</span>
          </div>
          <p className="text-[10px] text-blue-300/70 mb-2">
            Found Google credentials in your project env files.
          </p>
          {detectedEnvVars.slice(0, 5).map(v => (
            <div key={v.key} className="flex items-center gap-1.5 py-0.5">
              <code className="text-[9px] font-mono text-blue-300/80 truncate flex-1">{v.key}</code>
              <span className="text-[9px] text-forge-text-dim">{v.file}</span>
            </div>
          ))}
          {detectedApiKey && !settings.hasGoogleApiKey && (
            <button
              onClick={handleSaveApiKey}
              className="mt-1.5 w-full flex items-center justify-center gap-1 px-2 py-1 text-[10px] rounded bg-blue-500/20 text-blue-300 hover:bg-blue-500/30 transition-colors"
            >
              <Zap className="w-3 h-3" />
              Auto-save detected API key
            </button>
          )}
        </div>
      )}

      {/* Project Integrations Detected */}
      {(usesGoogleMaps || googleFonts.detected) && (
        <div className="rounded-md border border-forge-border bg-forge-surface/30 p-2.5">
          <div className="flex items-center gap-1.5 mb-1">
            <Search className="w-3 h-3 text-forge-text-dim" />
            <span className="text-[11px] font-medium text-forge-text">Detected in Project</span>
          </div>
          {usesGoogleMaps && (
            <div className="flex items-center gap-1.5 py-0.5">
              <Map className="w-3 h-3 text-forge-text-dim" />
              <span className="text-[10px] text-forge-text">Google Maps</span>
              {!detectedMapsKey && !settings.hasGoogleApiKey && (
                <span className="text-[9px] text-amber-400 ml-auto">Needs API key</span>
              )}
              {(detectedMapsKey || settings.hasGoogleApiKey) && (
                <CheckCircle2 className="w-3 h-3 text-forge-success ml-auto" />
              )}
            </div>
          )}
          {googleFonts.detected && (
            <div className="flex items-center gap-1.5 py-0.5">
              <FileText className="w-3 h-3 text-forge-text-dim" />
              <span className="text-[10px] text-forge-text">
                Google Fonts: {googleFonts.fonts.slice(0, 3).join(', ')}
                {googleFonts.fonts.length > 3 && ` +${googleFonts.fonts.length - 3}`}
              </span>
              <CheckCircle2 className="w-3 h-3 text-forge-success ml-auto" />
            </div>
          )}
        </div>
      )}

      {/* Authentication Setup */}
      <div className="rounded-md border border-forge-border">
        <button
          onClick={() => toggleSection('auth')}
          className="w-full flex items-center gap-2 px-2.5 py-2 text-left hover:bg-forge-surface/50 transition-colors"
        >
          <ChevronDown className={`w-3 h-3 text-forge-text-dim transition-transform ${activeSection === 'auth' ? '' : '-rotate-90'}`} />
          <Shield className="w-3.5 h-3.5 text-forge-text-dim" />
          <span className="text-[11px] font-medium text-forge-text flex-1">Authentication</span>
          {hasAnyAuth && <Check className="w-3 h-3 text-forge-success" />}
        </button>

        {activeSection === 'auth' && (
          <div className="border-t border-forge-border/50">
            {/* Auth type tabs */}
            <div className="flex border-b border-forge-border/30">
              {([
                { id: 'oauth' as const, label: 'OAuth', hasIt: settings.hasGoogleOAuth },
                { id: 'apikey' as const, label: 'API Key', hasIt: settings.hasGoogleApiKey },
                { id: 'sa' as const, label: 'Service Acct', hasIt: settings.hasGoogleServiceAccount },
              ]).map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setAuthTab(tab.id)}
                  className={`flex-1 flex items-center justify-center gap-1 py-1.5 text-[10px] transition-colors border-b-2 ${
                    authTab === tab.id
                      ? 'border-forge-accent text-forge-accent'
                      : 'border-transparent text-forge-text-dim hover:text-forge-text'
                  }`}
                >
                  {tab.label}
                  {tab.hasIt && <Check className="w-2.5 h-2.5 text-forge-success" />}
                </button>
              ))}
            </div>

            <div className="px-2.5 py-2.5 space-y-2">
              {/* ── OAuth Tab ── */}
              {authTab === 'oauth' && (
                <>
                  {!settings.hasGoogleOAuth ? (
                    <>
                      <p className="text-[10px] text-forge-text-dim leading-relaxed">
                        For Sheets, Calendar, Gmail, Drive access. Create OAuth credentials in Google Cloud Console.
                      </p>
                      <input
                        type="text"
                        placeholder="Client ID (xxx.apps.googleusercontent.com)"
                        value={clientId}
                        onChange={e => setClientId(e.target.value)}
                        className="w-full px-2 py-1.5 text-xs font-mono bg-forge-bg border border-forge-border rounded-md focus:outline-none focus:border-forge-accent"
                      />
                      <div className="relative">
                        <input
                          type={showSecret ? 'text' : 'password'}
                          placeholder="Client Secret"
                          value={clientSecret}
                          onChange={e => setClientSecret(e.target.value)}
                          className="w-full px-2 py-1.5 pr-7 text-xs font-mono bg-forge-bg border border-forge-border rounded-md focus:outline-none focus:border-forge-accent"
                        />
                        <button
                          onClick={() => setShowSecret(!showSecret)}
                          className="absolute right-1.5 top-1/2 -translate-y-1/2 text-forge-text-dim hover:text-forge-text"
                        >
                          {showSecret ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                        </button>
                      </div>
                      <button
                        onClick={handleSaveOAuth}
                        disabled={saving === 'oauth' || !clientId.trim() || !clientSecret.trim()}
                        className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs rounded-md bg-forge-accent text-white hover:bg-forge-accent/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                      >
                        {saving === 'oauth' ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
                        Save & Continue
                      </button>

                      {/* Redirect URI helper */}
                      <div className="space-y-1 pt-1">
                        <p className="text-[10px] text-forge-text-dim">Redirect URI (add to Google Console):</p>
                        <div className="flex items-center gap-1">
                          <code className="flex-1 text-[9px] font-mono text-forge-text bg-forge-bg px-1.5 py-1 rounded border border-forge-border truncate">
                            {redirectUri}
                          </code>
                          <button onClick={handleCopyRedirectUri} className="p-1 text-forge-text-dim hover:text-forge-text" title="Copy">
                            <Copy className="w-3 h-3" />
                          </button>
                        </div>
                      </div>

                      {/* Setup help links */}
                      <div className="pt-1 space-y-0.5">
                        <p className="text-[10px] text-forge-text-dim font-medium">Quick setup:</p>
                        <a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noopener noreferrer"
                          className="flex items-center gap-1 text-[10px] text-forge-accent hover:underline">
                          <ExternalLink className="w-2.5 h-2.5" /> 1. Create OAuth Client ID
                        </a>
                        <a href="https://console.cloud.google.com/apis/credentials/consent" target="_blank" rel="noopener noreferrer"
                          className="flex items-center gap-1 text-[10px] text-forge-accent hover:underline">
                          <ExternalLink className="w-2.5 h-2.5" /> 2. Configure consent screen
                        </a>
                        <a href="https://console.cloud.google.com/apis/library" target="_blank" rel="noopener noreferrer"
                          className="flex items-center gap-1 text-[10px] text-forge-accent hover:underline">
                          <ExternalLink className="w-2.5 h-2.5" /> 3. Enable APIs
                        </a>
                      </div>
                    </>
                  ) : (
                    <>
                      {settings.hasGoogleAccount ? (
                        <div className="space-y-1.5">
                          <div className="flex items-center gap-1.5">
                            <Check className="w-3 h-3 text-forge-success shrink-0" />
                            <span className="text-[11px] text-forge-text truncate">
                              {settings.googleConnectedEmail || 'Connected'}
                            </span>
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

                          <div className="flex gap-2">
                            <button
                              onClick={() => handleDelete('googleAccount', 'Google account')}
                              className="flex items-center gap-1 text-[10px] text-red-400 hover:text-red-300 transition-colors"
                            >
                              <Trash2 className="w-2.5 h-2.5" /> Disconnect
                            </button>
                            <button
                              onClick={() => handleDelete('googleOAuth', 'OAuth credentials')}
                              className="flex items-center gap-1 text-[10px] text-red-400 hover:text-red-300 transition-colors"
                            >
                              <Trash2 className="w-2.5 h-2.5" /> Remove OAuth
                            </button>
                          </div>
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
                          <button
                            onClick={() => handleDelete('googleOAuth', 'OAuth credentials')}
                            className="flex items-center gap-1 text-[10px] text-red-400 hover:text-red-300 transition-colors"
                          >
                            <Trash2 className="w-2.5 h-2.5" /> Remove OAuth
                          </button>
                        </div>
                      )}
                    </>
                  )}
                </>
              )}

              {/* ── API Key Tab ── */}
              {authTab === 'apikey' && (
                <>
                  {!settings.hasGoogleApiKey ? (
                    <>
                      <p className="text-[10px] text-forge-text-dim leading-relaxed">
                        For Maps, YouTube, Translate, and other key-based services.
                      </p>
                      {detectedApiKey && (
                        <div className="flex items-center gap-1.5 py-1 px-2 rounded bg-blue-500/10 border border-blue-500/20">
                          <Wand2 className="w-3 h-3 text-blue-400" />
                          <span className="text-[10px] text-blue-300">Auto-filled from {detectedApiKey.file}</span>
                        </div>
                      )}
                      <div className="relative">
                        <input
                          type={showApiKey ? 'text' : 'password'}
                          placeholder="API Key (AIza...)"
                          value={apiKey}
                          onChange={e => setApiKey(e.target.value)}
                          className="w-full px-2 py-1.5 pr-7 text-xs font-mono bg-forge-bg border border-forge-border rounded-md focus:outline-none focus:border-forge-accent"
                        />
                        <button
                          onClick={() => setShowApiKey(!showApiKey)}
                          className="absolute right-1.5 top-1/2 -translate-y-1/2 text-forge-text-dim hover:text-forge-text"
                        >
                          {showApiKey ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                        </button>
                      </div>
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
                        <ExternalLink className="w-2.5 h-2.5" /> Create API key in Google Console
                      </a>
                    </>
                  ) : (
                    <div className="space-y-1.5">
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
                      {/* Show which services can use this key */}
                      <div className="flex flex-wrap gap-1">
                        {GOOGLE_SERVICES.filter(s => s.authType === 'apikey').map(s => (
                          <span key={s.id} className="text-[9px] px-1.5 py-0.5 rounded-full bg-forge-surface text-forge-text-dim">
                            {s.label}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}

              {/* ── Service Account Tab ── */}
              {authTab === 'sa' && (
                <>
                  {!settings.hasGoogleServiceAccount ? (
                    <>
                      <p className="text-[10px] text-forge-text-dim leading-relaxed">
                        For Firebase Admin, Cloud Storage, BigQuery. Server-to-server auth.
                      </p>
                      <textarea
                        placeholder="Paste service account JSON key..."
                        value={serviceAccountJson}
                        onChange={e => setServiceAccountJson(e.target.value)}
                        rows={5}
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
                        <input ref={fileInputRef} type="file" accept=".json" onChange={handleFileUpload} className="hidden" />
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
                        <ExternalLink className="w-2.5 h-2.5" /> Create service account
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
                </>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Google Services */}
      <div className="rounded-md border border-forge-border">
        <button
          onClick={() => toggleSection('services')}
          className="w-full flex items-center gap-2 px-2.5 py-2 text-left hover:bg-forge-surface/50 transition-colors"
        >
          <ChevronDown className={`w-3 h-3 text-forge-text-dim transition-transform ${activeSection === 'services' ? '' : '-rotate-90'}`} />
          <Globe className="w-3.5 h-3.5 text-forge-text-dim" />
          <span className="text-[11px] font-medium text-forge-text flex-1">Services & Tools</span>
          <span className="text-[9px] text-forge-text-dim">{connectedCount} active</span>
        </button>

        {activeSection === 'services' && (
          <div className="border-t border-forge-border/50">
            {GOOGLE_SERVICES.map(service => {
              const status = getServiceStatus(service)
              const Icon = service.icon

              return (
                <div key={service.id} className="border-b border-forge-border/30 last:border-b-0">
                  {/* Service header */}
                  <div className="px-2.5 py-2 flex items-center gap-2">
                    <Icon className={`w-3.5 h-3.5 shrink-0 ${
                      status === 'ready' ? 'text-forge-success'
                        : status === 'partial' ? 'text-amber-400'
                        : 'text-forge-text-dim/30'
                    }`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className={`text-[11px] font-medium ${
                          status === 'ready' ? 'text-forge-text' : 'text-forge-text-dim'
                        }`}>
                          {service.label}
                        </span>
                        {status === 'ready' && <CheckCircle2 className="w-3 h-3 text-forge-success" />}
                        {status === 'partial' && <Clock className="w-3 h-3 text-amber-400" />}
                      </div>
                      <p className="text-[9px] text-forge-text-dim/70 leading-tight">{service.description}</p>
                    </div>

                    {/* Auth requirement badge */}
                    <span className={`text-[8px] px-1 py-0.5 rounded ${
                      service.authType === 'oauth' ? 'bg-blue-500/10 text-blue-400'
                        : service.authType === 'apikey' ? 'bg-amber-500/10 text-amber-400'
                        : 'bg-purple-500/10 text-purple-400'
                    }`}>
                      {service.authType === 'oauth' ? 'OAuth' : service.authType === 'apikey' ? 'API Key' : 'SA'}
                    </span>
                  </div>

                  {/* Tools list */}
                  <div className="px-2.5 pb-2 pl-8">
                    {service.tools.map(t => (
                      <div key={t.name} className="flex items-center gap-1.5 py-0.5">
                        <Zap className={`w-2.5 h-2.5 shrink-0 ${status === 'ready' ? 'text-forge-accent' : 'text-forge-text-dim/20'}`} />
                        <span className={`text-[9px] font-mono ${status === 'ready' ? 'text-forge-text-dim' : 'text-forge-text-dim/30'}`}>
                          {t.name}
                        </span>
                      </div>
                    ))}

                    {/* Action buttons for this service */}
                    {status === 'missing' && (
                      <div className="mt-1">
                        {service.authType === 'oauth' && (
                          <button
                            onClick={() => { toggleSection('auth'); setAuthTab('oauth') }}
                            className="text-[9px] text-forge-accent hover:underline"
                          >
                            Set up OAuth to enable
                          </button>
                        )}
                        {service.authType === 'apikey' && (
                          <button
                            onClick={() => { toggleSection('auth'); setAuthTab('apikey') }}
                            className="text-[9px] text-forge-accent hover:underline"
                          >
                            Add API Key to enable
                          </button>
                        )}
                      </div>
                    )}
                    {status === 'partial' && service.authType === 'oauth' && !settings.hasGoogleAccount && (
                      <button
                        onClick={handleConnect}
                        className="mt-1 text-[9px] text-forge-accent hover:underline"
                      >
                        Connect Google Account to activate
                      </button>
                    )}

                    {/* Docs link */}
                    <a href={service.docsUrl} target="_blank" rel="noopener noreferrer"
                      className="flex items-center gap-1 text-[9px] text-forge-text-dim/50 hover:text-forge-accent mt-0.5">
                      <ExternalLink className="w-2 h-2" /> API docs
                    </a>
                  </div>
                </div>
              )
            })}

            {/* Re-connect with more scopes if missing some OAuth services */}
            {settings.hasGoogleAccount && GOOGLE_SERVICES.some(s =>
              s.authType === 'oauth' && s.scope && !settings.googleConnectedScopes.includes(s.scope)
            ) && (
              <div className="px-2.5 py-2 border-t border-forge-border/30">
                <button
                  onClick={handleConnect}
                  className="w-full flex items-center justify-center gap-1 px-2 py-1 text-[10px] rounded border border-forge-border text-forge-text-dim hover:text-forge-text hover:bg-forge-surface/50 transition-colors"
                >
                  <RefreshCw className="w-2.5 h-2.5" /> Re-connect with all scopes
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Project Integration */}
      <div className="rounded-md border border-forge-border">
        <button
          onClick={() => toggleSection('integration')}
          className="w-full flex items-center gap-2 px-2.5 py-2 text-left hover:bg-forge-surface/50 transition-colors"
        >
          <ChevronDown className={`w-3 h-3 text-forge-text-dim transition-transform ${activeSection === 'integration' ? '' : '-rotate-90'}`} />
          <Link2 className="w-3.5 h-3.5 text-forge-text-dim" />
          <span className="text-[11px] font-medium text-forge-text flex-1">Project Integration</span>
        </button>

        {activeSection === 'integration' && (
          <div className="px-2.5 pb-2.5 space-y-2 border-t border-forge-border/50 pt-2">
            <p className="text-[10px] text-forge-text-dim leading-relaxed">
              Add Google env vars to your project so the AI and preview can use them.
            </p>

            {/* Quick-add env var buttons for Maps */}
            {settings.hasGoogleApiKey && !detectedMapsKey && (
              <button
                onClick={() => handleInjectEnvVar('NEXT_PUBLIC_GOOGLE_MAPS_KEY', '${GOOGLE_API_KEY}')}
                className="w-full flex items-center gap-1.5 px-2 py-1.5 text-[10px] rounded border border-forge-border hover:bg-forge-surface/50 text-forge-text-dim hover:text-forge-text transition-colors"
              >
                <Plus className="w-3 h-3" />
                Add NEXT_PUBLIC_GOOGLE_MAPS_KEY to .env.local
              </button>
            )}

            {/* Existing detected vars */}
            {detectedEnvVars.length > 0 && (
              <div className="space-y-0.5">
                <p className="text-[10px] text-forge-text-dim font-medium">Current env vars:</p>
                {detectedEnvVars.map(v => (
                  <div key={`${v.file}:${v.key}`} className="flex items-center gap-1.5">
                    <CheckCircle2 className="w-2.5 h-2.5 text-forge-success shrink-0" />
                    <code className="text-[9px] font-mono text-forge-text-dim truncate">{v.key}</code>
                    <span className="text-[8px] text-forge-text-dim/50 ml-auto">{v.file}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Preview compatibility note */}
            <div className="rounded bg-forge-surface/50 p-2 mt-1">
              <div className="flex items-center gap-1.5 mb-1">
                <Settings2 className="w-3 h-3 text-forge-text-dim" />
                <span className="text-[10px] font-medium text-forge-text">Preview Support</span>
              </div>
              <p className="text-[9px] text-forge-text-dim leading-relaxed">
                Google Maps JS API and Google Fonts are auto-injected into the static preview when detected in your project files.
                For full Google API integration, use the WebContainer preview (sandbox mode).
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
