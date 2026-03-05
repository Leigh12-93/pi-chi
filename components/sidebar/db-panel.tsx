'use client'

import { useState, useEffect } from 'react'
import { Database, RefreshCw, Loader2 } from 'lucide-react'

const FORGE_TABLES = [
  'forge_projects',
  'forge_project_files',
  'forge_chat_messages',
  'forge_deployments',
]

interface DbPanelProps {
  onOpenDbExplorer: () => void
}

export function DbPanel({ onOpenDbExplorer }: DbPanelProps) {
  const [userTables, setUserTables] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [introspected, setIntrospected] = useState(false)

  const fetchTables = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/db/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name`,
        }),
      })
      const data = await res.json()
      if (Array.isArray(data)) {
        const names = data.map((r: any) => r.table_name).filter(Boolean)
        setUserTables(names.filter((t: string) => !FORGE_TABLES.includes(t) && !t.startsWith('forge_')))
      }
      setIntrospected(true)
    } catch {
      // silently fail — user can retry
    } finally {
      setLoading(false)
    }
  }

  // Auto-introspect on first mount
  useEffect(() => { fetchTables() }, [])

  return (
    <div className="p-3 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-[10px] uppercase tracking-wider text-forge-text-dim font-medium">Forge Tables</p>
      </div>
      <div className="space-y-0.5">
        {FORGE_TABLES.map(table => (
          <button
            key={table}
            onClick={onOpenDbExplorer}
            className="w-full flex items-center gap-2 px-2 py-1.5 text-xs rounded-md hover:bg-forge-surface transition-colors text-left"
          >
            <Database className="w-3.5 h-3.5 text-forge-text-dim shrink-0" />
            <span className="truncate text-forge-text font-mono">{table}</span>
          </button>
        ))}
      </div>

      {/* User project tables (dynamically discovered) */}
      {introspected && userTables.length > 0 && (
        <>
          <div className="flex items-center justify-between pt-1">
            <p className="text-[10px] uppercase tracking-wider text-forge-text-dim font-medium">Project Tables</p>
            <button
              onClick={fetchTables}
              disabled={loading}
              className="p-0.5 text-forge-text-dim hover:text-forge-text transition-colors"
              title="Refresh"
            >
              {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
            </button>
          </div>
          <div className="space-y-0.5">
            {userTables.map(table => (
              <button
                key={table}
                onClick={onOpenDbExplorer}
                className="w-full flex items-center gap-2 px-2 py-1.5 text-xs rounded-md hover:bg-forge-surface transition-colors text-left"
              >
                <Database className="w-3.5 h-3.5 text-forge-accent/60 shrink-0" />
                <span className="truncate text-forge-text font-mono">{table}</span>
              </button>
            ))}
          </div>
        </>
      )}

      {introspected && userTables.length === 0 && (
        <p className="text-[10px] text-forge-text-dim">No additional project tables found</p>
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
