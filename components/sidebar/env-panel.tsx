'use client'

import { useState, useMemo, useRef, useEffect, useCallback } from 'react'
import { Plus, Trash2, Eye, EyeOff, CloudDownload, CloudUpload, Loader2, Check, Sparkles, AlertTriangle, ChevronDown } from 'lucide-react'
import { toast } from 'sonner'

interface EnvPanelProps {
  fileContents: Record<string, string>
  onFileChange: (path: string, content: string) => void
  vercelProjectId?: string | null
}

/** Common env var names for smart suggestions */
const COMMON_ENV_NAMES = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'ANTHROPIC_API_KEY',
  'OPENAI_API_KEY',
  'STRIPE_SECRET_KEY',
  'STRIPE_PUBLISHABLE_KEY',
  'DATABASE_URL',
  'NEXTAUTH_SECRET',
  'NEXTAUTH_URL',
]

function parseEnvFile(content: string): { key: string; value: string }[] {
  if (!content) return []
  return content
    .split('\n')
    .filter(line => line.trim() && !line.trim().startsWith('#'))
    .map(line => {
      const eqIdx = line.indexOf('=')
      if (eqIdx === -1) return { key: line.trim(), value: '' }
      return { key: line.slice(0, eqIdx).trim(), value: line.slice(eqIdx + 1).trim() }
    })
    .filter(e => e.key)
}

function serializeEnv(entries: { key: string; value: string }[]): string {
  return entries.map(e => `${e.key}=${e.value}`).join('\n') + '\n'
}

/** Scan all file contents for process.env.XXXX references */
function detectReferencedEnvVars(fileContents: Record<string, string>): string[] {
  const found = new Set<string>()
  const regex = /process\.env\.([A-Z_][A-Z0-9_]*)/g
  for (const [path, content] of Object.entries(fileContents)) {
    // Skip .env files themselves
    if (path.includes('.env')) continue
    let match: RegExpExecArray | null
    while ((match = regex.exec(content)) !== null) {
      found.add(match[1])
    }
  }
  return Array.from(found).sort()
}

export function EnvPanel({ fileContents, onFileChange, vercelProjectId }: EnvPanelProps) {
  const envContent = fileContents['.env.local'] || fileContents['/.env.local'] || ''
  const entries = useMemo(() => parseEnvFile(envContent), [envContent])
  const [visibleKeys, setVisibleKeys] = useState<Set<string>>(new Set())
  const [newKey, setNewKey] = useState('')
  const [newValue, setNewValue] = useState('')
  const [syncing, setSyncing] = useState<'pull' | 'push' | 'forge' | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [forgeVars, setForgeVars] = useState<Record<string, string> | null>(null)
  const [forgeAvailable, setForgeAvailable] = useState(false)
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [showMissingDetails, setShowMissingDetails] = useState(false)
  const suggestionsRef = useRef<HTMLDivElement>(null)
  const keyInputRef = useRef<HTMLInputElement>(null)

  // Current env keys as a set for quick lookup
  const existingKeys = useMemo(() => new Set(entries.map(e => e.key)), [entries])

  // Feature 2: Detect missing env vars from project files
  const referencedVars = useMemo(() => detectReferencedEnvVars(fileContents), [fileContents])
  const missingVars = useMemo(
    () => referencedVars.filter(v => !existingKeys.has(v)),
    [referencedVars, existingKeys]
  )

  // Fetch Forge vars on mount (for suggestions and fill)
  useEffect(() => {
    let cancelled = false
    const fetchForgeVars = async () => {
      try {
        const res = await fetch('/api/settings/env-export')
        if (!res.ok) return
        const data = await res.json()
        if (!cancelled && data.vars) {
          setForgeVars(data.vars)
          setForgeAvailable(data.available === true)
        }
      } catch {
        // Silent fail — Forge vars are optional
      }
    }
    fetchForgeVars()
    return () => { cancelled = true }
  }, [])

  // Close suggestions dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (suggestionsRef.current && !suggestionsRef.current.contains(e.target as Node)) {
        setShowSuggestions(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const toggleVisibility = (key: string) => {
    setVisibleKeys(prev => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })
  }

  const handleAdd = useCallback(() => {
    if (!newKey.trim()) return
    const updated = [...entries, { key: newKey.trim(), value: newValue }]
    onFileChange('.env.local', serializeEnv(updated))
    setNewKey('')
    setNewValue('')
    setShowSuggestions(false)
  }, [newKey, newValue, entries, onFileChange])

  const handleAddSpecific = useCallback((key: string, value: string) => {
    if (existingKeys.has(key)) {
      toast.info(`${key} already exists in .env.local`)
      return
    }
    const updated = [...entries, { key, value }]
    onFileChange('.env.local', serializeEnv(updated))
    toast.success(`Added ${key}`)
  }, [entries, existingKeys, onFileChange])

  const handleDelete = (key: string) => {
    const updated = entries.filter(e => e.key !== key)
    onFileChange('.env.local', serializeEnv(updated))
  }

  const handlePullFromVercel = async () => {
    if (!vercelProjectId) return
    setSyncing('pull')
    try {
      const res = await fetch(`/api/vercel/env?projectId=${encodeURIComponent(vercelProjectId)}`)
      const data = await res.json()
      if (!res.ok) {
        toast.error('Failed to pull env vars', { description: data.error })
        return
      }
      if (!Array.isArray(data) || data.length === 0) {
        toast.info('No env vars found on Vercel')
        return
      }
      // Merge: Vercel vars added, existing local-only vars preserved
      const existing = new Map(entries.map(e => [e.key, e.value]))
      for (const v of data) {
        if (v.key && v.value) existing.set(v.key, v.value)
      }
      const merged = Array.from(existing.entries()).map(([key, value]) => ({ key, value }))
      onFileChange('.env.local', serializeEnv(merged))
      toast.success(`Pulled ${data.length} env vars from Vercel`)
    } catch {
      toast.error('Network error pulling env vars')
    } finally {
      setSyncing(null)
    }
  }

  const handlePushToVercel = async () => {
    if (!vercelProjectId || entries.length === 0) return
    setSyncing('push')
    try {
      const res = await fetch('/api/vercel/env', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId: vercelProjectId, envVars: entries }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error('Failed to push env vars', { description: data.error })
        return
      }
      const ok = (data.results || []).filter((r: any) => r.ok).length
      const failed = (data.results || []).filter((r: any) => !r.ok).length
      if (failed > 0) {
        toast.warning(`Pushed ${ok} vars, ${failed} failed`)
      } else {
        toast.success(`Pushed ${ok} env vars to Vercel`)
      }
    } catch {
      toast.error('Network error pushing env vars')
    } finally {
      setSyncing(null)
    }
  }

  // Feature 1: Fill from Forge
  const handleFillFromForge = async () => {
    setSyncing('forge')
    try {
      const res = await fetch('/api/settings/env-export')
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: 'Unknown error' }))
        toast.error('Failed to fetch Forge settings', { description: data.error })
        return
      }
      const data = await res.json()
      if (!data.vars || Object.keys(data.vars).length === 0) {
        toast.info('No credentials saved in Forge settings')
        return
      }

      // Merge without overwriting existing keys
      let addedCount = 0
      const existing = new Map(entries.map(e => [e.key, e.value]))
      for (const [key, value] of Object.entries(data.vars)) {
        if (!existing.has(key)) {
          existing.set(key, value as string)
          addedCount++
        }
      }

      if (addedCount === 0) {
        toast.info('All Forge variables already present in .env.local')
        return
      }

      const merged = Array.from(existing.entries()).map(([key, value]) => ({ key, value }))
      onFileChange('.env.local', serializeEnv(merged))

      // Update local cache
      setForgeVars(data.vars)
      setForgeAvailable(true)

      toast.success(`Added ${addedCount} variable${addedCount !== 1 ? 's' : ''} from Forge settings`)
    } catch {
      toast.error('Network error fetching Forge settings')
    } finally {
      setSyncing(null)
    }
  }

  // Feature 3: Filtered suggestions for the key input
  const filteredSuggestions = useMemo(() => {
    const filter = newKey.toUpperCase().trim()
    return COMMON_ENV_NAMES
      .filter(name => !existingKeys.has(name))
      .filter(name => !filter || name.includes(filter))
      .map(name => ({
        name,
        availableFromForge: !!(forgeVars && forgeVars[name]),
      }))
  }, [newKey, existingKeys, forgeVars])

  const handleSelectSuggestion = (name: string) => {
    setNewKey(name)
    setShowSuggestions(false)
    // If available from Forge, pre-fill value
    if (forgeVars && forgeVars[name]) {
      setNewValue(forgeVars[name])
    }
    // Focus the value input after selecting a suggestion
    setTimeout(() => {
      const valueInput = keyInputRef.current?.parentElement?.querySelector('input[placeholder="value"]') as HTMLInputElement | null
      valueInput?.focus()
    }, 50)
  }

  return (
    <div className="p-3 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-[10px] uppercase tracking-wider text-forge-text-dim font-medium">.env.local</p>
        <div className="flex items-center gap-1.5">
          {vercelProjectId && (
            <span className="text-[9px] text-forge-success flex items-center gap-0.5">
              <Check className="w-2.5 h-2.5" />
              Vercel
            </span>
          )}
        </div>
      </div>

      {/* Sync buttons row: Vercel + Forge */}
      <div className="flex gap-1.5">
        {vercelProjectId && (
          <>
            <button
              onClick={handlePullFromVercel}
              disabled={syncing !== null}
              className="flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 text-[11px] rounded-md border border-forge-border hover:bg-forge-surface disabled:opacity-40 transition-colors"
            >
              {syncing === 'pull' ? <Loader2 className="w-3 h-3 animate-spin" /> : <CloudDownload className="w-3 h-3" />}
              Pull
            </button>
            <button
              onClick={handlePushToVercel}
              disabled={syncing !== null || entries.length === 0}
              className="flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 text-[11px] rounded-md border border-forge-border hover:bg-forge-surface disabled:opacity-40 transition-colors"
            >
              {syncing === 'push' ? <Loader2 className="w-3 h-3 animate-spin" /> : <CloudUpload className="w-3 h-3" />}
              Push
            </button>
          </>
        )}
        <button
          onClick={handleFillFromForge}
          disabled={syncing !== null}
          className="flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 text-[11px] rounded-md border border-forge-border hover:bg-forge-surface disabled:opacity-40 transition-colors text-forge-accent border-forge-accent/30 hover:border-forge-accent/50"
        >
          {syncing === 'forge' ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
          Fill from Forge
        </button>
      </div>

      {/* Feature 2: Missing env vars indicator */}
      {missingVars.length > 0 && (
        <div className="rounded-md border border-amber-500/30 bg-amber-500/5">
          <button
            onClick={() => setShowMissingDetails(prev => !prev)}
            className="w-full flex items-center gap-2 px-2.5 py-1.5 text-left"
          >
            <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            <span className="text-[11px] text-amber-300 flex-1">
              {missingVars.length} missing env var{missingVars.length !== 1 ? 's' : ''} detected
            </span>
            <ChevronDown className={`w-3 h-3 text-amber-400 transition-transform ${showMissingDetails ? 'rotate-180' : ''}`} />
          </button>
          {showMissingDetails && (
            <div className="px-2.5 pb-2 space-y-1 border-t border-amber-500/20 pt-1.5">
              {missingVars.map(varName => {
                const availableFromForge = !!(forgeVars && forgeVars[varName])
                return (
                  <div key={varName} className="flex items-center gap-1.5">
                    <span className="text-[10px] font-mono text-amber-200/80 truncate flex-1 min-w-0">
                      {varName}
                    </span>
                    {availableFromForge ? (
                      <button
                        onClick={() => handleAddSpecific(varName, forgeVars![varName])}
                        className="shrink-0 px-1.5 py-0.5 text-[9px] rounded bg-forge-accent/20 text-forge-accent hover:bg-forge-accent/30 transition-colors"
                      >
                        Add from Forge
                      </button>
                    ) : (
                      <span className="shrink-0 text-[9px] text-forge-text-dim">not in Forge</span>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {entries.length === 0 && (
        <p className="text-xs text-forge-text-dim">No environment variables</p>
      )}

      <div className="space-y-1.5">
        {entries.map(({ key, value }) => (
          <div key={key} className="flex items-center gap-1.5 group">
            <span className="text-[11px] font-mono text-forge-text truncate flex-1 min-w-0">{key}</span>
            <span className="text-[11px] font-mono text-forge-text-dim truncate max-w-[80px]">
              {visibleKeys.has(key) ? value : '\u2022\u2022\u2022\u2022\u2022'}
            </span>
            <button
              onClick={() => toggleVisibility(key)}
              className="p-0.5 text-forge-text-dim hover:text-forge-text opacity-0 group-hover:opacity-100 transition-opacity"
            >
              {visibleKeys.has(key) ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
            </button>
            {confirmDelete === key ? (
              <button
                onClick={() => { handleDelete(key); setConfirmDelete(null) }}
                className="px-1.5 py-0.5 text-[9px] bg-red-500/20 text-red-400 rounded hover:bg-red-500/30 transition-colors"
              >
                confirm
              </button>
            ) : (
              <button
                onClick={() => setConfirmDelete(key)}
                className="p-0.5 text-forge-text-dim hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            )}
          </div>
        ))}
      </div>

      {/* Add variable form with smart suggestions */}
      <div className="border-t border-forge-border pt-2 space-y-1.5">
        <div className="relative" ref={suggestionsRef}>
          <input
            ref={keyInputRef}
            type="text"
            placeholder="KEY"
            value={newKey}
            onChange={e => {
              setNewKey(e.target.value)
              setShowSuggestions(true)
            }}
            onFocus={() => setShowSuggestions(true)}
            onKeyDown={e => {
              if (e.key === 'Escape') setShowSuggestions(false)
            }}
            className="w-full px-2 py-1.5 text-xs font-mono bg-forge-bg border border-forge-border rounded-md focus:outline-none focus:border-forge-accent"
          />
          {/* Feature 3: Smart suggestions dropdown */}
          {showSuggestions && filteredSuggestions.length > 0 && (
            <div className="absolute z-50 left-0 right-0 top-full mt-1 max-h-[200px] overflow-y-auto rounded-md border border-forge-border bg-forge-panel shadow-lg">
              {filteredSuggestions.map(({ name, availableFromForge }) => (
                <button
                  key={name}
                  onMouseDown={e => {
                    e.preventDefault() // Prevent blur before click
                    handleSelectSuggestion(name)
                  }}
                  className="w-full flex items-center gap-2 px-2.5 py-1.5 text-left hover:bg-forge-surface transition-colors"
                >
                  <span className="text-[11px] font-mono text-forge-text truncate flex-1 min-w-0">
                    {name}
                  </span>
                  {availableFromForge && (
                    <span className="shrink-0 text-[9px] px-1.5 py-0.5 rounded-full bg-forge-accent/15 text-forge-accent">
                      Forge
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
        <input
          type="text"
          placeholder="value"
          value={newValue}
          onChange={e => setNewValue(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleAdd()}
          className="w-full px-2 py-1.5 text-xs font-mono bg-forge-bg border border-forge-border rounded-md focus:outline-none focus:border-forge-accent"
        />
        <button
          onClick={handleAdd}
          disabled={!newKey.trim()}
          className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs rounded-md bg-forge-accent text-white hover:bg-forge-accent/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          <Plus className="w-3 h-3" />
          Add Variable
        </button>
      </div>
    </div>
  )
}
