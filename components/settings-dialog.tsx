'use client'

import { useState, useEffect, useCallback } from 'react'
import { X, Key, Monitor, Type, Trash2, Loader2, CheckCircle2, Rocket, Database, ExternalLink, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useSession } from './session-provider'

interface SettingsDialogProps {
  open: boolean
  onClose: () => void
  defaultTab?: Tab
}

type Tab = 'general' | 'editor' | 'api-key' | 'vercel' | 'supabase'

export function SettingsDialog({ open, onClose, defaultTab }: SettingsDialogProps) {
  const { session: _session, refresh } = useSession()
  const [tab, setTab] = useState<Tab>(defaultTab || 'general')
  const [settings, setSettings] = useState({
    editorFontSize: 13,
    editorTabSize: 2,
    editorWordWrap: true,
    editorMinimap: false,
    terminalFontSize: 13,
  })
  const [apiKeyInput, setApiKeyInput] = useState('')
  const [apiKeyStatus, setApiKeyStatus] = useState<'idle' | 'saving' | 'success' | 'error'>('idle')
  const [apiKeyError, setApiKeyError] = useState('')
  const [hasKey, setHasKey] = useState(false)
  const [deleting, setDeleting] = useState(false)

  // Vercel token state
  const [vercelInput, setVercelInput] = useState('')
  const [vercelStatus, setVercelStatus] = useState<'idle' | 'saving' | 'success' | 'error'>('idle')
  const [vercelError, setVercelError] = useState('')
  const [hasVercel, setHasVercel] = useState(false)
  const [deletingVercel, setDeletingVercel] = useState(false)
  const [showManualVercel, setShowManualVercel] = useState(false)

  // Supabase state
  const [sbUrlInput, setSbUrlInput] = useState('')
  const [sbKeyInput, setSbKeyInput] = useState('')
  const [sbStatus, setSbStatus] = useState<'idle' | 'saving' | 'success' | 'error'>('idle')
  const [sbError, setSbError] = useState('')
  const [hasSupabase, setHasSupabase] = useState(false)
  const [sbProjectRef, setSbProjectRef] = useState<string | null>(null)
  const [deletingSupabase, setDeletingSupabase] = useState(false)
  const [showManualSupabase, setShowManualSupabase] = useState(false)
  // Supabase access token (for project picker)
  const [sbTokenInput, setSbTokenInput] = useState('')
  const [sbTokenStatus, setSbTokenStatus] = useState<'idle' | 'saving' | 'success' | 'error'>('idle')
  const [sbTokenError, setSbTokenError] = useState('')
  const [hasSbToken, setHasSbToken] = useState(false)
  // Project picker
  const [sbProjects, setSbProjects] = useState<{ ref: string; name: string; url: string }[]>([])
  const [loadingSbProjects, setLoadingSbProjects] = useState(false)
  const [connectingProject, setConnectingProject] = useState<string | null>(null)

  // OAuth provider availability
  const [oauthProviders, setOauthProviders] = useState<{ supabase: boolean; vercel: boolean }>({ supabase: false, vercel: false })

  // Reset tab when opened with a specific default
  useEffect(() => {
    if (open && defaultTab) setTab(defaultTab)
  }, [open, defaultTab])

  // Load settings on open
  useEffect(() => {
    if (!open) return
    fetch('/api/settings')
      .then(r => r.json())
      .then(data => {
        setHasKey(data.hasApiKey)
        setHasVercel(data.hasVercelToken)
        setHasSupabase(data.hasSupabase)
        setHasSbToken(data.hasSupabaseAccessToken)
        setSbProjectRef(data.supabaseProjectRef || null)
        if (data.oauthProviders) setOauthProviders(data.oauthProviders)
        if (data.preferences) {
          setSettings(prev => ({ ...prev, ...data.preferences }))
        }
      })
      .catch(() => {})
  }, [open])

  const savePreferences = useCallback(async (prefs: typeof settings) => {
    setSettings(prefs)
    await fetch('/api/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ preferences: prefs }),
    }).catch(() => {})
  }, [])

  const saveApiKey = useCallback(async () => {
    setApiKeyStatus('saving')
    setApiKeyError('')
    try {
      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey: apiKeyInput }),
      })
      if (res.ok) {
        setApiKeyStatus('success')
        setHasKey(true)
        setApiKeyInput('')
        refresh()
      } else {
        const data = await res.json()
        setApiKeyError(data.error || 'Failed to save')
        setApiKeyStatus('error')
      }
    } catch {
      setApiKeyError('Network error')
      setApiKeyStatus('error')
    }
  }, [apiKeyInput, refresh])

  const deleteApiKey = useCallback(async () => {
    setDeleting(true)
    try {
      await fetch('/api/settings?target=apiKey', { method: 'DELETE' })
      setHasKey(false)
      refresh()
    } catch {}
    setDeleting(false)
  }, [refresh])

  const saveVercelToken = useCallback(async () => {
    setVercelStatus('saving')
    setVercelError('')
    try {
      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vercelToken: vercelInput }),
      })
      if (res.ok) {
        setVercelStatus('success')
        setHasVercel(true)
        setVercelInput('')
      } else {
        const data = await res.json()
        setVercelError(data.error || 'Failed to save')
        setVercelStatus('error')
      }
    } catch {
      setVercelError('Network error')
      setVercelStatus('error')
    }
  }, [vercelInput])

  const deleteVercelToken = useCallback(async () => {
    setDeletingVercel(true)
    try {
      await fetch('/api/settings?target=vercelToken', { method: 'DELETE' })
      setHasVercel(false)
    } catch {}
    setDeletingVercel(false)
  }, [])

  const saveSupabase = useCallback(async () => {
    setSbStatus('saving')
    setSbError('')
    try {
      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ supabaseUrl: sbUrlInput, supabaseKey: sbKeyInput }),
      })
      if (res.ok) {
        setSbStatus('success')
        setHasSupabase(true)
        const ref = sbUrlInput.match(/https:\/\/([^.]+)\.supabase/)?.[1] || null
        setSbProjectRef(ref)
        setSbUrlInput('')
        setSbKeyInput('')
      } else {
        const data = await res.json()
        setSbError(data.error || 'Failed to save')
        setSbStatus('error')
      }
    } catch {
      setSbError('Network error')
      setSbStatus('error')
    }
  }, [sbUrlInput, sbKeyInput])

  const deleteSupabase = useCallback(async () => {
    setDeletingSupabase(true)
    try {
      await fetch('/api/settings?target=supabase', { method: 'DELETE' })
      setHasSupabase(false)
      setSbProjectRef(null)
    } catch {}
    setDeletingSupabase(false)
  }, [])

  // Save Supabase access token
  const saveSbToken = useCallback(async () => {
    setSbTokenStatus('saving')
    setSbTokenError('')
    try {
      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ supabaseAccessToken: sbTokenInput }),
      })
      if (res.ok) {
        setSbTokenStatus('success')
        setHasSbToken(true)
        setSbTokenInput('')
        loadSbProjects()
      } else {
        const data = await res.json()
        setSbTokenError(data.error || 'Invalid token')
        setSbTokenStatus('error')
      }
    } catch {
      setSbTokenError('Network error')
      setSbTokenStatus('error')
    }
  }, [sbTokenInput]) // eslint-disable-line react-hooks/exhaustive-deps

  // Load Supabase projects
  const loadSbProjects = useCallback(async () => {
    setLoadingSbProjects(true)
    try {
      const res = await fetch('/api/supabase/projects')
      const data = await res.json()
      if (Array.isArray(data)) {
        setSbProjects(data)
      }
    } catch {}
    setLoadingSbProjects(false)
  }, [])

  // Auto-load projects when Supabase tab is shown and token exists
  useEffect(() => {
    if (tab === 'supabase' && hasSbToken && sbProjects.length === 0) {
      loadSbProjects()
    }
  }, [tab, hasSbToken, sbProjects.length, loadSbProjects])

  // Connect a specific project (fetches its API keys automatically)
  const connectSbProject = useCallback(async (projectRef: string) => {
    setConnectingProject(projectRef)
    setSbError('')
    try {
      const res = await fetch('/api/supabase/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectRef }),
      })
      const data = await res.json()
      if (!res.ok) {
        setSbError(data.error || 'Failed to fetch project keys')
        setConnectingProject(null)
        return
      }
      const saveRes = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ supabaseUrl: data.url, supabaseKey: data.key }),
      })
      if (saveRes.ok) {
        setHasSupabase(true)
        setSbProjectRef(projectRef)
      } else {
        const err = await saveRes.json()
        setSbError(err.error || 'Failed to save credentials')
      }
    } catch {
      setSbError('Network error')
    }
    setConnectingProject(null)
  }, [])

  if (!open) return null

  const TABS: { id: Tab; label: string; icon: typeof Key }[] = [
    { id: 'general', label: 'General', icon: Monitor },
    { id: 'editor', label: 'Editor', icon: Type },
    { id: 'api-key', label: 'API Key', icon: Key },
    { id: 'vercel', label: 'Vercel', icon: Rocket },
    { id: 'supabase', label: 'Supabase', icon: Database },
  ]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onClose} role="dialog" aria-modal="true" aria-labelledby="settings-dialog-title">
      <div className="w-full max-w-lg bg-forge-bg border border-forge-border rounded-xl shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-forge-border">
          <h2 id="settings-dialog-title" className="text-sm font-medium text-forge-text">Settings</h2>
          <button onClick={onClose} className="p-1 text-forge-text-dim hover:text-forge-text rounded transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex min-h-[300px]">
          {/* Sidebar */}
          <div className="w-40 border-r border-forge-border bg-forge-panel p-2 space-y-0.5">
            {TABS.map(t => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={cn(
                  'w-full flex items-center gap-2 px-3 py-2 text-xs rounded-lg transition-colors',
                  tab === t.id ? 'bg-forge-surface text-forge-text' : 'text-forge-text-dim hover:text-forge-text hover:bg-forge-surface/50',
                )}
              >
                <t.icon className="w-3.5 h-3.5" />
                {t.label}
              </button>
            ))}
          </div>

          {/* Content */}
          <div className="flex-1 p-4 space-y-4 overflow-y-auto">
            {tab === 'general' && (
              <>
                <SettingRow label="Theme" description="Color scheme">
                  <select className="px-2 py-1 text-xs bg-forge-surface border border-forge-border rounded text-forge-text">
                    <option value="dark">Dark</option>
                    <option value="light" disabled>Light (coming soon)</option>
                  </select>
                </SettingRow>
                <SettingRow label="Terminal Font Size" description="Font size for the terminal">
                  <input
                    type="number"
                    value={settings.terminalFontSize}
                    onChange={e => savePreferences({ ...settings, terminalFontSize: Number(e.target.value) })}
                    min={10}
                    max={24}
                    className="w-16 px-2 py-1 text-xs bg-forge-surface border border-forge-border rounded text-forge-text text-center"
                  />
                </SettingRow>
              </>
            )}

            {tab === 'editor' && (
              <>
                <SettingRow label="Font Size" description="Editor font size in pixels">
                  <input
                    type="number"
                    value={settings.editorFontSize}
                    onChange={e => savePreferences({ ...settings, editorFontSize: Number(e.target.value) })}
                    min={10}
                    max={24}
                    className="w-16 px-2 py-1 text-xs bg-forge-surface border border-forge-border rounded text-forge-text text-center"
                  />
                </SettingRow>
                <SettingRow label="Tab Size" description="Number of spaces per tab">
                  <select
                    value={settings.editorTabSize}
                    onChange={e => savePreferences({ ...settings, editorTabSize: Number(e.target.value) })}
                    className="px-2 py-1 text-xs bg-forge-surface border border-forge-border rounded text-forge-text"
                  >
                    <option value={2}>2</option>
                    <option value={4}>4</option>
                  </select>
                </SettingRow>
                <SettingRow label="Word Wrap" description="Wrap long lines">
                  <Toggle
                    value={settings.editorWordWrap}
                    onChange={v => savePreferences({ ...settings, editorWordWrap: v })}
                  />
                </SettingRow>
                <SettingRow label="Minimap" description="Show code minimap">
                  <Toggle
                    value={settings.editorMinimap}
                    onChange={v => savePreferences({ ...settings, editorMinimap: v })}
                  />
                </SettingRow>
              </>
            )}

            {tab === 'api-key' && (
              <div className="space-y-4">
                <div className="text-xs text-forge-text-dim">
                  {hasKey
                    ? 'Your API key is stored and encrypted. You can update or remove it below.'
                    : 'Enter your Anthropic API key to use Forge.'}
                </div>

                {hasKey && (
                  <div className="flex items-center gap-2 p-3 bg-green-500/10 border border-green-500/20 rounded-lg">
                    <CheckCircle2 className="w-4 h-4 text-green-400" />
                    <span className="text-xs text-green-400">API key configured</span>
                    <button
                      onClick={deleteApiKey}
                      disabled={deleting}
                      className="ml-auto flex items-center gap-1 text-xs text-red-400 hover:text-red-300 transition-colors"
                    >
                      <Trash2 className="w-3 h-3" />
                      {deleting ? 'Removing...' : 'Remove'}
                    </button>
                  </div>
                )}

                <input
                  type="password"
                  value={apiKeyInput}
                  onChange={e => { setApiKeyInput(e.target.value); setApiKeyStatus('idle') }}
                  placeholder={hasKey ? 'Enter new key to update...' : 'sk-ant-api03-...'}
                  className="w-full px-3 py-2 text-xs bg-forge-surface border border-forge-border rounded-lg text-forge-text font-mono placeholder:text-forge-text-dim/50 focus:outline-none focus:border-forge-accent"
                />

                {apiKeyError && (
                  <p className="text-xs text-red-400">{apiKeyError}</p>
                )}

                <button
                  onClick={saveApiKey}
                  disabled={!apiKeyInput.trim() || apiKeyStatus === 'saving'}
                  className="px-4 py-2 text-xs font-medium bg-forge-accent text-white rounded-lg hover:bg-forge-accent-hover disabled:opacity-50 transition-colors"
                >
                  {apiKeyStatus === 'saving' ? 'Validating...' : hasKey ? 'Update Key' : 'Save Key'}
                </button>

                <p className="text-[10px] text-forge-text-dim">
                  Get your key at{' '}
                  <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noopener" className="text-forge-accent hover:underline">
                    console.anthropic.com
                  </a>
                </p>
              </div>
            )}

            {tab === 'vercel' && (
              <div className="space-y-4">
                <div className="text-xs text-forge-text-dim">
                  {hasVercel
                    ? 'Your Vercel account is connected. Projects deploy under your account.'
                    : 'Connect your Vercel account to deploy projects.'}
                </div>

                {hasVercel && (
                  <div className="flex items-center gap-2 p-3 bg-green-500/10 border border-green-500/20 rounded-lg">
                    <CheckCircle2 className="w-4 h-4 text-green-400" />
                    <span className="text-xs text-green-400">Vercel connected</span>
                    <button
                      onClick={deleteVercelToken}
                      disabled={deletingVercel}
                      className="ml-auto flex items-center gap-1 text-xs text-red-400 hover:text-red-300 transition-colors"
                    >
                      <Trash2 className="w-3 h-3" />
                      {deletingVercel ? 'Removing...' : 'Disconnect'}
                    </button>
                  </div>
                )}

                {!hasVercel && (
                  <>
                    {/* Primary: OAuth login button */}
                    {oauthProviders.vercel && (
                      <>
                        <a
                          href="/api/auth/vercel"
                          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium bg-white text-black rounded-lg hover:bg-gray-100 transition-colors"
                        >
                          <svg className="w-4 h-4" viewBox="0 0 76 65" fill="currentColor"><path d="M37.5274 0L75.0548 65H0L37.5274 0Z" /></svg>
                          Login with Vercel
                          <ExternalLink className="w-3 h-3 ml-1 opacity-50" />
                        </a>

                        <div className="flex items-center gap-2">
                          <span className="flex-1 h-px bg-forge-border" />
                          <span className="text-[9px] text-forge-text-dim">or</span>
                          <span className="flex-1 h-px bg-forge-border" />
                        </div>
                      </>
                    )}

                    {/* Secondary: Manual token input (collapsible when OAuth available) */}
                    {oauthProviders.vercel ? (
                      <div>
                        <button
                          onClick={() => setShowManualVercel(!showManualVercel)}
                          className="flex items-center gap-1 text-[11px] text-forge-text-dim hover:text-forge-text transition-colors"
                        >
                          <ChevronDown className={cn('w-3 h-3 transition-transform', showManualVercel && 'rotate-180')} />
                          Enter token manually
                        </button>
                        {showManualVercel && (
                          <div className="mt-2 space-y-2">
                            <input
                              type="password"
                              value={vercelInput}
                              onChange={e => { setVercelInput(e.target.value); setVercelStatus('idle') }}
                              placeholder="Vercel personal access token..."
                              className="w-full px-3 py-2 text-xs bg-forge-surface border border-forge-border rounded-lg text-forge-text font-mono placeholder:text-forge-text-dim/50 focus:outline-none focus:border-forge-accent"
                            />
                            {vercelError && <p className="text-[10px] text-red-400">{vercelError}</p>}
                            <button
                              onClick={saveVercelToken}
                              disabled={!vercelInput.trim() || vercelStatus === 'saving'}
                              className="px-4 py-1.5 text-xs font-medium bg-forge-accent text-white rounded-lg hover:bg-forge-accent-hover disabled:opacity-50 transition-colors"
                            >
                              {vercelStatus === 'saving' ? 'Validating...' : 'Save Token'}
                            </button>
                            <p className="text-[10px] text-forge-text-dim">
                              Create at{' '}
                              <a href="https://vercel.com/account/tokens" target="_blank" rel="noopener" className="text-forge-accent hover:underline">
                                vercel.com/account/tokens
                              </a>
                            </p>
                          </div>
                        )}
                      </div>
                    ) : (
                      /* No OAuth — show manual as primary */
                      <div className="space-y-3">
                        <input
                          type="password"
                          value={vercelInput}
                          onChange={e => { setVercelInput(e.target.value); setVercelStatus('idle') }}
                          placeholder="Vercel personal access token..."
                          className="w-full px-3 py-2 text-xs bg-forge-surface border border-forge-border rounded-lg text-forge-text font-mono placeholder:text-forge-text-dim/50 focus:outline-none focus:border-forge-accent"
                        />
                        {vercelError && <p className="text-xs text-red-400">{vercelError}</p>}
                        <button
                          onClick={saveVercelToken}
                          disabled={!vercelInput.trim() || vercelStatus === 'saving'}
                          className="px-4 py-2 text-xs font-medium bg-forge-accent text-white rounded-lg hover:bg-forge-accent-hover disabled:opacity-50 transition-colors"
                        >
                          {vercelStatus === 'saving' ? 'Validating...' : 'Connect Vercel'}
                        </button>
                        <p className="text-[10px] text-forge-text-dim">
                          Create a token at{' '}
                          <a href="https://vercel.com/account/tokens" target="_blank" rel="noopener" className="text-forge-accent hover:underline">
                            vercel.com/account/tokens
                          </a>
                          {' '}with full access scope.
                        </p>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            {tab === 'supabase' && (
              <div className="space-y-4">
                {/* Connected project status */}
                {hasSupabase && (
                  <div className="flex items-center gap-2 p-3 bg-green-500/10 border border-green-500/20 rounded-lg">
                    <CheckCircle2 className="w-4 h-4 text-green-400" />
                    <div className="flex-1 min-w-0">
                      <span className="text-xs text-green-400">Project connected</span>
                      {sbProjectRef && (
                        <p className="text-[10px] text-forge-text-dim font-mono truncate">{sbProjectRef}</p>
                      )}
                    </div>
                    <button
                      onClick={deleteSupabase}
                      disabled={deletingSupabase}
                      className="flex items-center gap-1 text-xs text-red-400 hover:text-red-300 transition-colors shrink-0"
                    >
                      <Trash2 className="w-3 h-3" />
                      {deletingSupabase ? '...' : 'Disconnect'}
                    </button>
                  </div>
                )}

                {!hasSupabase && (
                  <>
                    {/* Primary: OAuth login button */}
                    {oauthProviders.supabase && (
                      <>
                        <a
                          href="/api/auth/supabase"
                          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium bg-emerald-600 text-white rounded-lg hover:bg-emerald-500 transition-colors"
                        >
                          <svg className="w-4 h-4" viewBox="0 0 109 113" fill="none">
                            <path d="M63.7076 110.284C60.8481 113.885 55.0502 111.912 54.9813 107.314L53.9738 40.0627H99.1935C108.384 40.0627 113.398 51.1843 106.845 57.8658L63.7076 110.284Z" fill="url(#sb-a)" />
                            <path d="M63.7076 110.284C60.8481 113.885 55.0502 111.912 54.9813 107.314L53.9738 40.0627H99.1935C108.384 40.0627 113.398 51.1843 106.845 57.8658L63.7076 110.284Z" fill="url(#sb-b)" fillOpacity="0.2" />
                            <path d="M45.317 2.07103C48.1765 -1.53037 53.9745 0.442937 54.0434 5.04075L54.4849 72.2922H9.83113C0.64038 72.2922 -4.37348 61.1706 2.17953 54.489L45.317 2.07103Z" fill="#3ECF8E" />
                            <defs>
                              <linearGradient id="sb-a" x1="53.9738" y1="54.974" x2="94.1635" y2="71.8295" gradientUnits="userSpaceOnUse">
                                <stop stopColor="#249361" /><stop offset="1" stopColor="#3ECF8E" />
                              </linearGradient>
                              <linearGradient id="sb-b" x1="36.1558" y1="30.578" x2="54.4844" y2="65.0806" gradientUnits="userSpaceOnUse">
                                <stop /><stop offset="1" stopOpacity="0" />
                              </linearGradient>
                            </defs>
                          </svg>
                          Login with Supabase
                          <ExternalLink className="w-3 h-3 ml-1 opacity-50" />
                        </a>

                        <div className="flex items-center gap-2">
                          <span className="flex-1 h-px bg-forge-border" />
                          <span className="text-[9px] text-forge-text-dim">or</span>
                          <span className="flex-1 h-px bg-forge-border" />
                        </div>
                      </>
                    )}

                    {/* Secondary: Access token + project picker */}
                    {oauthProviders.supabase ? (
                      <div>
                        <button
                          onClick={() => setShowManualSupabase(!showManualSupabase)}
                          className="flex items-center gap-1 text-[11px] text-forge-text-dim hover:text-forge-text transition-colors"
                        >
                          <ChevronDown className={cn('w-3 h-3 transition-transform', showManualSupabase && 'rotate-180')} />
                          Connect manually
                        </button>
                        {showManualSupabase && (
                          <div className="mt-3 space-y-4">
                            <SupabaseManualFlow
                              hasSbToken={hasSbToken}
                              hasSupabase={hasSupabase}
                              sbTokenInput={sbTokenInput}
                              setSbTokenInput={setSbTokenInput}
                              sbTokenStatus={sbTokenStatus}
                              setSbTokenStatus={setSbTokenStatus}
                              sbTokenError={sbTokenError}
                              saveSbToken={saveSbToken}
                              setHasSbToken={setHasSbToken}
                              setSbProjects={setSbProjects}
                              loadingSbProjects={loadingSbProjects}
                              sbProjects={sbProjects}
                              connectSbProject={connectSbProject}
                              connectingProject={connectingProject}
                              sbError={sbError}
                              sbUrlInput={sbUrlInput}
                              setSbUrlInput={setSbUrlInput}
                              sbKeyInput={sbKeyInput}
                              setSbKeyInput={setSbKeyInput}
                              sbStatus={sbStatus}
                              setSbStatus={setSbStatus}
                              saveSupabase={saveSupabase}
                            />
                          </div>
                        )}
                      </div>
                    ) : (
                      /* No OAuth — show manual as primary */
                      <SupabaseManualFlow
                        hasSbToken={hasSbToken}
                        hasSupabase={hasSupabase}
                        sbTokenInput={sbTokenInput}
                        setSbTokenInput={setSbTokenInput}
                        sbTokenStatus={sbTokenStatus}
                        setSbTokenStatus={setSbTokenStatus}
                        sbTokenError={sbTokenError}
                        saveSbToken={saveSbToken}
                        setHasSbToken={setHasSbToken}
                        setSbProjects={setSbProjects}
                        loadingSbProjects={loadingSbProjects}
                        sbProjects={sbProjects}
                        connectSbProject={connectSbProject}
                        connectingProject={connectingProject}
                        sbError={sbError}
                        sbUrlInput={sbUrlInput}
                        setSbUrlInput={setSbUrlInput}
                        sbKeyInput={sbKeyInput}
                        setSbKeyInput={setSbKeyInput}
                        sbStatus={sbStatus}
                        setSbStatus={setSbStatus}
                        saveSupabase={saveSupabase}
                      />
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

/** Supabase manual connection flow — access token → project picker → manual URL/key */
function SupabaseManualFlow({
  hasSbToken, hasSupabase, sbTokenInput, setSbTokenInput, sbTokenStatus, setSbTokenStatus,
  sbTokenError, saveSbToken, setHasSbToken, setSbProjects, loadingSbProjects, sbProjects,
  connectSbProject, connectingProject, sbError, sbUrlInput, setSbUrlInput, sbKeyInput,
  setSbKeyInput, sbStatus, setSbStatus, saveSupabase,
}: {
  hasSbToken: boolean
  hasSupabase: boolean
  sbTokenInput: string
  setSbTokenInput: (v: string) => void
  sbTokenStatus: string
  setSbTokenStatus: (v: 'idle' | 'saving' | 'success' | 'error') => void
  sbTokenError: string
  saveSbToken: () => void
  setHasSbToken: (v: boolean) => void
  setSbProjects: (v: { ref: string; name: string; url: string }[]) => void
  loadingSbProjects: boolean
  sbProjects: { ref: string; name: string; url: string }[]
  connectSbProject: (ref: string) => void
  connectingProject: string | null
  sbError: string
  sbUrlInput: string
  setSbUrlInput: (v: string) => void
  sbKeyInput: string
  setSbKeyInput: (v: string) => void
  sbStatus: string
  setSbStatus: (v: 'idle' | 'saving' | 'success' | 'error') => void
  saveSupabase: () => void
}) {
  return (
    <div className="space-y-4">
      {/* Access token */}
      <div className="space-y-2">
        <p className="text-[10px] uppercase tracking-wider text-forge-text-dim font-medium">
          {hasSbToken ? 'Supabase Account' : 'Option 1 — Access Token'}
        </p>
        {hasSbToken ? (
          <div className="flex items-center gap-2 p-2 bg-forge-surface rounded-lg">
            <CheckCircle2 className="w-3.5 h-3.5 text-green-400" />
            <span className="text-[11px] text-forge-text flex-1">Access token saved</span>
            <button
              onClick={async () => {
                await fetch('/api/settings?target=supabaseAccessToken', { method: 'DELETE' })
                setHasSbToken(false)
                setSbProjects([])
              }}
              className="text-[10px] text-red-400 hover:text-red-300"
            >
              Remove
            </button>
          </div>
        ) : (
          <>
            <div className="text-[11px] text-forge-text-dim">
              Paste a Supabase access token to auto-discover your projects.
            </div>
            <input
              type="password"
              value={sbTokenInput}
              onChange={e => { setSbTokenInput(e.target.value); setSbTokenStatus('idle') }}
              placeholder="sbp_xxxxxxxxxxxxxxxxxxxxxxxx..."
              className="w-full px-3 py-2 text-xs bg-forge-surface border border-forge-border rounded-lg text-forge-text font-mono placeholder:text-forge-text-dim/50 focus:outline-none focus:border-forge-accent"
            />
            {sbTokenError && <p className="text-[10px] text-red-400">{sbTokenError}</p>}
            <button
              onClick={saveSbToken}
              disabled={!sbTokenInput.trim() || sbTokenStatus === 'saving'}
              className="px-4 py-1.5 text-xs font-medium bg-forge-accent text-white rounded-lg hover:bg-forge-accent-hover disabled:opacity-50 transition-colors"
            >
              {sbTokenStatus === 'saving' ? 'Validating...' : 'Save Token'}
            </button>
            <p className="text-[10px] text-forge-text-dim">
              Create at{' '}
              <a href="https://supabase.com/dashboard/account/tokens" target="_blank" rel="noopener" className="text-forge-accent hover:underline">
                supabase.com/dashboard/account/tokens
              </a>
            </p>
          </>
        )}
      </div>

      {/* Project picker */}
      {hasSbToken && !hasSupabase && (
        <div className="space-y-2">
          <p className="text-[10px] uppercase tracking-wider text-forge-text-dim font-medium">Select Project</p>
          {loadingSbProjects ? (
            <div className="flex items-center gap-2 py-3 justify-center">
              <Loader2 className="w-3.5 h-3.5 animate-spin text-forge-text-dim" />
              <span className="text-[11px] text-forge-text-dim">Loading projects...</span>
            </div>
          ) : sbProjects.length > 0 ? (
            <div className="max-h-48 overflow-y-auto rounded-lg border border-forge-border divide-y divide-forge-border">
              {sbProjects.map(p => (
                <button
                  key={p.ref}
                  onClick={() => connectSbProject(p.ref)}
                  disabled={connectingProject !== null}
                  className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-forge-surface transition-colors disabled:opacity-50"
                >
                  <Database className="w-3.5 h-3.5 text-forge-text-dim shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-forge-text truncate">{p.name}</p>
                    <p className="text-[9px] text-forge-text-dim font-mono truncate">{p.ref}</p>
                  </div>
                  {connectingProject === p.ref && (
                    <Loader2 className="w-3 h-3 animate-spin text-forge-accent shrink-0" />
                  )}
                </button>
              ))}
            </div>
          ) : (
            <p className="text-[11px] text-forge-text-dim py-2">No projects found.</p>
          )}
          {sbError && <p className="text-[10px] text-red-400">{sbError}</p>}
        </div>
      )}

      {/* Manual entry fallback */}
      {!hasSbToken && (
        <div className="space-y-2 border-t border-forge-border pt-3">
          <p className="text-[10px] uppercase tracking-wider text-forge-text-dim font-medium">Option 2 — Enter Manually</p>
          <input
            type="text"
            value={sbUrlInput}
            onChange={e => { setSbUrlInput(e.target.value); setSbStatus('idle') }}
            placeholder="https://xxxxx.supabase.co"
            className="w-full px-3 py-2 text-xs bg-forge-surface border border-forge-border rounded-lg text-forge-text font-mono placeholder:text-forge-text-dim/50 focus:outline-none focus:border-forge-accent"
          />
          <input
            type="password"
            value={sbKeyInput}
            onChange={e => { setSbKeyInput(e.target.value); setSbStatus('idle') }}
            placeholder="Service role key (eyJ...)"
            onKeyDown={e => e.key === 'Enter' && sbUrlInput.trim() && sbKeyInput.trim() && saveSupabase()}
            className="w-full px-3 py-2 text-xs bg-forge-surface border border-forge-border rounded-lg text-forge-text font-mono placeholder:text-forge-text-dim/50 focus:outline-none focus:border-forge-accent"
          />
          {sbError && !hasSbToken && <p className="text-[10px] text-red-400">{sbError}</p>}
          <button
            onClick={saveSupabase}
            disabled={!sbUrlInput.trim() || !sbKeyInput.trim() || sbStatus === 'saving'}
            className="px-4 py-1.5 text-xs font-medium bg-forge-accent text-white rounded-lg hover:bg-forge-accent-hover disabled:opacity-50 transition-colors"
          >
            {sbStatus === 'saving' ? 'Validating...' : 'Connect'}
          </button>
        </div>
      )}
    </div>
  )
}

function SettingRow({ label, description, children }: { label: string; description: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between">
      <div>
        <p className="text-xs font-medium text-forge-text">{label}</p>
        <p className="text-[10px] text-forge-text-dim">{description}</p>
      </div>
      {children}
    </div>
  )
}

function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!value)}
      className={cn(
        'w-8 h-4.5 rounded-full transition-colors relative',
        value ? 'bg-forge-accent' : 'bg-forge-border',
      )}
    >
      <span className={cn(
        'absolute top-0.5 w-3.5 h-3.5 rounded-full bg-white transition-transform',
        value ? 'translate-x-4' : 'translate-x-0.5',
      )} />
    </button>
  )
}
