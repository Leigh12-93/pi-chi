'use client'

import { useState, useCallback } from 'react'
import { Database, Play, Table, Loader2, AlertCircle, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'

const FORGE_TABLES = [
  'forge_projects',
  'forge_project_files',
  'forge_chat_messages',
  'forge_deployments',
  'forge_tasks',
  'forge_user_settings',
  'forge_user_preferences',
  'forge_project_snapshots',
]

interface DbExplorerProps {
  className?: string
}

export function DbExplorer({ className }: DbExplorerProps) {
  const [selectedTable, setSelectedTable] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<any[] | null>(null)
  const [columns, setColumns] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [tableSchemas, setTableSchemas] = useState<Record<string, { column: string; type: string }[]>>({})

  const runQuery = useCallback(async (sql?: string) => {
    const q = sql || query
    if (!q.trim()) return

    setLoading(true)
    setError(null)

    try {
      // Use the chat API's db tools through a direct fetch
      const res = await fetch('/api/db/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: q }),
      })

      if (!res.ok) {
        const data = await res.json()
        setError(data.error || `HTTP ${res.status}`)
        return
      }

      const data = await res.json()
      if (Array.isArray(data) && data.length > 0) {
        setColumns(Object.keys(data[0]))
        setResults(data)
      } else {
        setResults([])
        setColumns([])
      }
    } catch (err: any) {
      setError(err.message || 'Query failed')
    } finally {
      setLoading(false)
    }
  }, [query])

  const handleTableClick = async (table: string) => {
    setSelectedTable(table)
    setQuery(`SELECT * FROM ${table} LIMIT 20`)

    // Load schema if not cached
    if (!tableSchemas[table]) {
      try {
        const schemaQuery = `SELECT column_name, data_type FROM information_schema.columns WHERE table_name = '${table}' ORDER BY ordinal_position`
        // For now just run the main query
      } catch {}
    }

    // Run the query
    const q = `SELECT * FROM ${table} LIMIT 20`
    setQuery(q)
    setLoading(true)
    setError(null)

    try {
      const res = await fetch('/api/db/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: q }),
      })
      if (res.ok) {
        const data = await res.json()
        if (Array.isArray(data) && data.length > 0) {
          setColumns(Object.keys(data[0]))
          setResults(data)
        } else {
          setResults([])
          setColumns([])
        }
      }
    } catch {}
    setLoading(false)
  }

  return (
    <div className={cn('h-full flex flex-col bg-forge-bg', className)}>
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-forge-border bg-forge-panel">
        <Database className="w-4 h-4 text-forge-accent" />
        <span className="text-xs font-medium text-forge-text">Database Explorer</span>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Table list */}
        <div className="w-48 border-r border-forge-border bg-forge-panel p-2 space-y-0.5 overflow-y-auto shrink-0">
          <p className="text-[10px] text-forge-text-dim/70 uppercase tracking-wider px-2 mb-1">Tables</p>
          {FORGE_TABLES.map(table => (
            <button
              key={table}
              onClick={() => handleTableClick(table)}
              className={cn(
                'w-full flex items-center gap-1.5 px-2 py-1.5 text-xs rounded-lg transition-colors',
                selectedTable === table ? 'bg-forge-surface text-forge-accent' : 'text-forge-text-dim hover:text-forge-text hover:bg-forge-surface/50',
              )}
            >
              <Table className="w-3 h-3 shrink-0" />
              <span className="truncate">{table.replace('forge_', '')}</span>
            </button>
          ))}
        </div>

        {/* Query + Results */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* SQL editor */}
          <div className="border-b border-forge-border p-2">
            <div className="flex gap-2">
              <textarea
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="SELECT * FROM forge_projects LIMIT 10"
                className="flex-1 px-3 py-2 text-xs font-mono bg-forge-surface border border-forge-border rounded-lg text-forge-text placeholder:text-forge-text-dim/50 focus:outline-none focus:border-forge-accent resize-none h-16"
                onKeyDown={e => {
                  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') runQuery()
                }}
              />
              <button
                onClick={() => runQuery()}
                disabled={loading || !query.trim()}
                className="px-3 py-2 bg-forge-accent text-white rounded-lg hover:bg-forge-accent-hover disabled:opacity-50 transition-colors self-end"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Error */}
          {error && (
            <div className="px-3 py-2 bg-red-500/10 border-b border-red-500/20 flex items-center gap-2">
              <AlertCircle className="w-3.5 h-3.5 text-red-400 shrink-0" />
              <span className="text-xs text-red-400">{error}</span>
            </div>
          )}

          {/* Results table */}
          <div className="flex-1 overflow-auto">
            {results === null ? (
              <div className="flex items-center justify-center h-full text-xs text-forge-text-dim">
                Select a table or run a query
              </div>
            ) : results.length === 0 ? (
              <div className="flex items-center justify-center h-full text-xs text-forge-text-dim">
                No results
              </div>
            ) : (
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-forge-panel border-b border-forge-border">
                  <tr>
                    {columns.map(col => (
                      <th key={col} className="px-3 py-2 text-left text-forge-text-dim font-medium whitespace-nowrap">
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {results.map((row, i) => (
                    <tr key={i} className="border-b border-forge-border/30 hover:bg-forge-surface/30">
                      {columns.map(col => (
                        <td key={col} className="px-3 py-1.5 text-forge-text max-w-[200px] truncate whitespace-nowrap">
                          {row[col] === null ? (
                            <span className="text-forge-text-dim/50 italic">null</span>
                          ) : typeof row[col] === 'object' ? (
                            <span className="text-forge-text-dim font-mono">{JSON.stringify(row[col]).slice(0, 50)}</span>
                          ) : (
                            String(row[col]).slice(0, 100)
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Footer */}
          {results && results.length > 0 && (
            <div className="px-3 py-1 border-t border-forge-border bg-forge-panel text-[10px] text-forge-text-dim">
              {results.length} rows
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
