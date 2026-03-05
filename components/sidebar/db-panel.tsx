'use client'

import { useState, useEffect, useMemo } from 'react'
import { Database, RefreshCw, Loader2, Link2, Unlink, ChevronRight } from 'lucide-react'

interface DbPanelProps {
  fileContents: Record<string, string>
  onOpenDbExplorer: () => void
}

/** Extract Supabase credentials from project env files */
function detectSupabaseFromEnv(fileContents: Record<string, string>): { url: string; key: string } | null {
  // Check common env file locations
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
      // Prefer service role key, fall back to anon key
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

export function DbPanel({ fileContents, onOpenDbExplorer }: DbPanelProps) {
  const detected = useMemo(() => detectSupabaseFromEnv(fileContents), [fileContents])

  // Manual connection state (when not auto-detected)
  const [manualUrl, setManualUrl] = useState('')
  const [manualKey, setManualKey] = useState('')

  // Active connection
  const [connected, setConnected] = useState(false)
  const [activeUrl, setActiveUrl] = useState('')
  const [activeKey, setActiveKey] = useState('')

  // Tables
  const [tables, setTables] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // Auto-connect when detected
  useEffect(() => {
    if (detected && !connected) {
      setActiveUrl(detected.url)
      setActiveKey(detected.key)
      setConnected(true)
    }
  }, [detected, connected])

  // Fetch tables when connected
  useEffect(() => {
    if (connected && activeUrl && activeKey) {
      fetchTables()
    }
  }, [connected, activeUrl, activeKey])

  const fetchTables = async () => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/db/external', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          supabaseUrl: activeUrl,
          supabaseKey: activeKey,
          query: `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name`,
        }),
      })
      const data = await res.json()

      if (data.tables) {
        // From OpenAPI spec fallback
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
  }

  const handleManualConnect = () => {
    const url = manualUrl.trim().replace(/\/$/, '')
    const key = manualKey.trim()
    if (!url || !key) return
    setActiveUrl(url)
    setActiveKey(key)
    setConnected(true)
  }

  const handleDisconnect = () => {
    setConnected(false)
    setActiveUrl('')
    setActiveKey('')
    setTables([])
    setError('')
  }

  // Extract project ID from Supabase URL for display
  const projectRef = activeUrl.match(/https:\/\/([^.]+)\.supabase/)?.[1] || ''

  if (!connected) {
    return (
      <div className="p-3 space-y-3">
        {detected ? (
          <div className="flex items-center gap-2 p-2 bg-green-500/10 border border-green-500/20 rounded-lg">
            <Database className="w-3.5 h-3.5 text-green-400 shrink-0" />
            <div className="min-w-0">
              <p className="text-[10px] text-green-400 font-medium">Supabase detected</p>
              <p className="text-[9px] text-forge-text-dim font-mono truncate">{detected.url}</p>
            </div>
          </div>
        ) : (
          <>
            <p className="text-[10px] uppercase tracking-wider text-forge-text-dim font-medium">Connect Supabase</p>
            <p className="text-[10px] text-forge-text-dim">
              Add <code className="text-forge-accent">SUPABASE_URL</code> and <code className="text-forge-accent">SUPABASE_SERVICE_ROLE_KEY</code> to your <code>.env.local</code> to auto-connect, or enter manually:
            </p>
            <input
              type="text"
              placeholder="https://xxxxx.supabase.co"
              value={manualUrl}
              onChange={e => setManualUrl(e.target.value)}
              className="w-full px-2 py-1.5 text-xs font-mono bg-forge-bg border border-forge-border rounded-md focus:outline-none focus:border-forge-accent"
            />
            <input
              type="password"
              placeholder="Service role key (eyJ...)"
              value={manualKey}
              onChange={e => setManualKey(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleManualConnect()}
              className="w-full px-2 py-1.5 text-xs font-mono bg-forge-bg border border-forge-border rounded-md focus:outline-none focus:border-forge-accent"
            />
            <button
              onClick={handleManualConnect}
              disabled={!manualUrl.trim() || !manualKey.trim()}
              className="w-full flex items-center justify-center gap-1.5 px-3 py-2 text-xs rounded-lg bg-forge-accent text-white hover:bg-forge-accent/90 disabled:opacity-40 transition-colors"
            >
              <Link2 className="w-3 h-3" />
              Connect
            </button>
          </>
        )}
      </div>
    )
  }

  return (
    <div className="p-3 space-y-3">
      {/* Connection status */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="w-1.5 h-1.5 rounded-full bg-green-400 shrink-0" />
          <span className="text-[10px] font-mono text-forge-text-dim truncate">{projectRef}</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={fetchTables}
            disabled={loading}
            className="p-1 text-forge-text-dim hover:text-forge-text transition-colors"
            title="Refresh tables"
          >
            {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
          </button>
          {!detected && (
            <button
              onClick={handleDisconnect}
              className="p-1 text-forge-text-dim hover:text-red-400 transition-colors"
              title="Disconnect"
            >
              <Unlink className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>

      {error && (
        <p className="text-[10px] text-red-400">{error}</p>
      )}

      {/* Tables list */}
      {loading && tables.length === 0 ? (
        <div className="flex items-center gap-2 py-4 justify-center">
          <Loader2 className="w-3.5 h-3.5 animate-spin text-forge-text-dim" />
          <span className="text-xs text-forge-text-dim">Loading tables...</span>
        </div>
      ) : tables.length > 0 ? (
        <div className="space-y-0.5">
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
          <p className="text-[9px] text-forge-text-dim pt-1">{tables.length} tables</p>
        </div>
      ) : !loading && (
        <p className="text-[10px] text-forge-text-dim">No tables found</p>
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
