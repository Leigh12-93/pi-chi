'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { Database, RefreshCw, Loader2, ChevronRight, CheckCircle2, Settings, AlertCircle, Zap } from 'lucide-react'

type ConnectionSource = 'saved' | 'env' | 'none'

interface DbPanelProps {
  fileContents: Record<string, string>
  onOpenDbExplorer: () => void
  onOpenSettings?: () => void
}

/** Extract Supabase credentials from project env files */
function detectSupabaseFromEnv(fileContents: Record<string, string>): { url: string; key: string } | null {
  const envFiles = ['.env.local', '.env', '/.env.local', '/.env', '.env.development', '.env.production']
  for (const envFile of envFiles) {
    const content = fileContents[envFile]
    if (!content) continue

    let url = ''
    let key = ''

    for (const line of content.split('\n')) {
      const trimmed = line.trim()
      if (trimmed.startsWith('#') || !trimmed.includes('=')) continue
      const eqIdx = trimmed.indexOf('=')
      const k = trimmed.slice(0, eqIdx).trim()
      const v = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '')

      if (k.includes('SUPABASE') && k.includes('URL') && v.startsWith('https://')) {
        url = v
      }
      if (k.includes('SUPABASE') && (k.includes('SERVICE_ROLE') || k.includes('ANON')) && v.startsWith('ey')) {
        if (k.includes('SERVICE_ROLE') || !key) {
          key = v
        }
      }
    }

    if (url && key) return { url, key }
  }
  return null
}

export function DbPanel({ fileContents, onOpenDbExplorer, onOpenSettings }: DbPanelProps) {
  const envDetected = useMemo(() => detectSupabaseFromEnv(fileContents), [fileContents])

  // Connection state
  const [source, setSource] = useState<ConnectionSource>('none')
  const [connected, setConnected] = useState(false)
  const [connecting, setConnecting] = useState(true) // starts true — auto-connect on mount
  const [projectRef, setProjectRef] = useState('')
  const [projectUrl, setProjectUrl] = useState('')

  // Tables
  const [tables, setTables] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // Fetch tables using the appropriate method
  const fetchTables = useCallback(async (connectionSource: ConnectionSource, envCreds?: { url: string; key: string }) => {
    setLoading(true)
    setError('')
    try {
      const body: Record<string, unknown> = {
        query: `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name`,
      }

      if (connectionSource === 'saved') {
        body.useSaved = true
      } else if (connectionSource === 'env' && envCreds) {
        body.supabaseUrl = envCreds.url
        body.supabaseKey = envCreds.key
      }

      const res = await fetch('/api/db/external', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()

      if (data.tables) {
        setTables(data.tables)
      } else if (Array.isArray(data)) {
        setTables(data.map((r: any) => r.table_name).filter(Boolean))
      } else if (data.error) {
        setError(data.error)
      }
    } catch {
      setError('Failed to connect')
    } finally {
      setLoading(false)
    }
  }, [])

  // Auto-connect on mount: try saved credentials first, then env detection
  useEffect(() => {
    let cancelled = false

    async function autoConnect() {
      setConnecting(true)

      // 1. Try saved credentials
      try {
        const res = await fetch('/api/db/external')
        const data = await res.json()
        if (data.connected && !cancelled) {
          setConnected(true)
          setSource('saved')
          setProjectRef(data.projectRef || '')
          setProjectUrl(data.url || '')
          setConnecting(false)
          fetchTables('saved')
          return
        }
      } catch {}

      // 2. Try env file detection
      if (envDetected && !cancelled) {
        const ref = envDetected.url.match(/https:\/\/([^.]+)\.supabase/)?.[1] || ''
        setConnected(true)
        setSource('env')
        setProjectRef(ref)
        setProjectUrl(envDetected.url)
        setConnecting(false)
        fetchTables('env', envDetected)
        return
      }

      if (!cancelled) {
        setConnecting(false)
      }
    }

    autoConnect()
    return () => { cancelled = true }
  }, [envDetected, fetchTables])

  const handleRefresh = () => {
    if (source === 'saved') {
      fetchTables('saved')
    } else if (source === 'env' && envDetected) {
      fetchTables('env', envDetected)
    }
  }

  // Not connected — show setup guidance
  if (connecting) {
    return (
      <div className="p-3">
        <div className="flex items-center gap-2 py-6 justify-center">
          <Loader2 className="w-4 h-4 animate-spin text-forge-accent" />
          <span className="text-xs text-forge-text-dim">Connecting...</span>
        </div>
      </div>
    )
  }

  if (!connected) {
    return (
      <div className="p-3 space-y-3">
        <div className="flex items-center gap-2 p-3 bg-forge-surface border border-forge-border rounded-lg">
          <Database className="w-4 h-4 text-forge-text-dim shrink-0" />
          <div className="min-w-0">
            <p className="text-xs font-medium text-forge-text">No database connected</p>
            <p className="text-[10px] text-forge-text-dim mt-0.5">
              Connect your Supabase project to browse tables and run queries.
            </p>
          </div>
        </div>

        <div className="space-y-2">
          <p className="text-[10px] uppercase tracking-wider text-forge-text-dim font-medium">Quick setup</p>

          <button
            onClick={onOpenSettings}
            className="w-full flex items-center gap-2.5 p-2.5 text-left rounded-lg border border-forge-border hover:border-forge-accent/50 hover:bg-forge-accent/5 transition-colors group"
          >
            <div className="w-7 h-7 rounded-md bg-emerald-500/10 flex items-center justify-center shrink-0">
              <Settings className="w-3.5 h-3.5 text-emerald-400" />
            </div>
            <div className="min-w-0">
              <p className="text-xs text-forge-text group-hover:text-forge-accent transition-colors">Connect in Settings</p>
              <p className="text-[9px] text-forge-text-dim">Save credentials for all projects</p>
            </div>
          </button>

          <div className="flex items-center gap-2 px-1">
            <span className="flex-1 h-px bg-forge-border" />
            <span className="text-[9px] text-forge-text-dim">or</span>
            <span className="flex-1 h-px bg-forge-border" />
          </div>

          <div className="p-2.5 rounded-lg border border-forge-border">
            <div className="flex items-center gap-2 mb-2">
              <Zap className="w-3 h-3 text-amber-400" />
              <p className="text-[10px] text-forge-text font-medium">Auto-detect from .env</p>
            </div>
            <p className="text-[9px] text-forge-text-dim leading-relaxed">
              Add <code className="text-forge-accent px-0.5 bg-forge-accent/10 rounded">SUPABASE_URL</code> and{' '}
              <code className="text-forge-accent px-0.5 bg-forge-accent/10 rounded">SUPABASE_SERVICE_ROLE_KEY</code>{' '}
              to your project&apos;s <code className="text-forge-accent px-0.5 bg-forge-accent/10 rounded">.env.local</code> file.
              The DB panel will auto-connect.
            </p>
          </div>
        </div>
      </div>
    )
  }

  // Connected — show tables
  return (
    <div className="p-3 space-y-3">
      {/* Connection status */}
      <div className="flex items-center gap-2 p-2 bg-green-500/10 border border-green-500/20 rounded-lg">
        <CheckCircle2 className="w-3.5 h-3.5 text-green-400 shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-[10px] text-green-400 font-medium">
            {source === 'saved' ? 'Supabase connected' : 'Auto-detected from .env'}
          </p>
          <p className="text-[9px] text-forge-text-dim font-mono truncate">{projectRef}</p>
        </div>
        <button
          onClick={handleRefresh}
          disabled={loading}
          className="p-1 text-forge-text-dim hover:text-forge-text transition-colors shrink-0"
          title="Refresh tables"
        >
          {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
        </button>
      </div>

      {error && (
        <div className="flex items-start gap-2 p-2 bg-red-500/10 border border-red-500/20 rounded-lg">
          <AlertCircle className="w-3.5 h-3.5 text-red-400 shrink-0 mt-0.5" />
          <p className="text-[10px] text-red-400">{error}</p>
        </div>
      )}

      {/* Tables list */}
      {loading && tables.length === 0 ? (
        <div className="flex items-center gap-2 py-4 justify-center">
          <Loader2 className="w-3.5 h-3.5 animate-spin text-forge-text-dim" />
          <span className="text-xs text-forge-text-dim">Loading tables...</span>
        </div>
      ) : tables.length > 0 ? (
        <div className="space-y-0.5">
          <p className="text-[10px] uppercase tracking-wider text-forge-text-dim font-medium px-1 pb-1">
            Tables ({tables.length})
          </p>
          <div className="max-h-[calc(100vh-280px)] overflow-y-auto space-y-0.5">
            {tables.map(table => (
              <button
                key={table}
                onClick={onOpenDbExplorer}
                className="w-full flex items-center gap-2 px-2 py-1.5 text-xs rounded-md hover:bg-forge-surface transition-colors text-left group"
              >
                <Database className="w-3.5 h-3.5 text-forge-accent/60 shrink-0" />
                <span className="truncate text-forge-text font-mono flex-1">{table}</span>
                <ChevronRight className="w-3 h-3 text-forge-text-dim opacity-0 group-hover:opacity-100 transition-opacity" />
              </button>
            ))}
          </div>
        </div>
      ) : !loading && !error && (
        <p className="text-[10px] text-forge-text-dim text-center py-2">No public tables found</p>
      )}

      <button
        onClick={onOpenDbExplorer}
        className="w-full flex items-center justify-center gap-2 px-3 py-2 text-xs rounded-lg border border-forge-border hover:bg-forge-surface transition-colors"
      >
        Open SQL Explorer
      </button>
    </div>
  )
}
