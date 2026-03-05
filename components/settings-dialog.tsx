'use client'

import { useState, useEffect, useCallback } from 'react'
import { X, Key, Monitor, Type, Palette, Trash2, Loader2, CheckCircle2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useSession } from './session-provider'

interface SettingsDialogProps {
  open: boolean
  onClose: () => void
}

type Tab = 'general' | 'editor' | 'api-key'

export function SettingsDialog({ open, onClose }: SettingsDialogProps) {
  const { session, refresh } = useSession()
  const [tab, setTab] = useState<Tab>('general')
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

  // Load settings on open
  useEffect(() => {
    if (!open) return
    fetch('/api/settings')
      .then(r => r.json())
      .then(data => {
        setHasKey(data.hasApiKey)
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
      await fetch('/api/settings', { method: 'DELETE' })
      setHasKey(false)
      refresh()
    } catch {}
    setDeleting(false)
  }, [refresh])

  if (!open) return null

  const TABS: { id: Tab; label: string; icon: typeof Key }[] = [
    { id: 'general', label: 'General', icon: Monitor },
    { id: 'editor', label: 'Editor', icon: Type },
    { id: 'api-key', label: 'API Key', icon: Key },
  ]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-lg bg-forge-bg border border-forge-border rounded-xl shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-forge-border">
          <h2 className="text-sm font-medium text-forge-text">Settings</h2>
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
              </div>
            )}
          </div>
        </div>
      </div>
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
