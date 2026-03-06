'use client'

import { useState, useCallback } from 'react'
import { Database, Play, Table, Loader2, AlertCircle, ChevronRight, Columns } from 'lucide-react'
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

interface ColumnInfo {
  column_name: string
  data_type: string
  is_nullable: string
  column_default: string | null
}

export function DbExplorer({ className }: DbExplorerProps) {
  const [selectedTable, setSelectedTable] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Record<string, unknown>[] | null>(null)
  const [columns, setColumns] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [tableSchemas, setTableSchemas] = useState<Record<string, ColumnInfo[]>>({})
  const [showSchema, setShowSchema] = useState(false)

  const runQuery = useCallback(async (sql?: string) => {
    const q = sql || query
    if (!q.trim()) return

    setLoading(true)
    setError(null)

    try {
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
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Query failed')
    } finally {
      setLoading(false)
    }
  }, [query])

  const fetchSchema = async (table: string) => {
    if (tableSchemas[table]) return tableSchemas[table]

    try {
      const schemaQuery = `SELECT column_name, data_type, is_nullable, column_default FROM information_schema.columns WHERE table_name = '${table}' ORDER BY ordinal_position`
      const res = await fetch('/api/db/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: schemaQuery }),
      })
      if (res.ok) {
        const data = await res.json()
        if (Array.isArray(data)) {
          setTableSchemas(prev => ({ ...prev, [table]: data as ColumnInfo[] }))
          return data as ColumnInfo[]
        }
      }
    } catch {}
    return []
  }

  const handleTableClick = async (table: string) => {
    setSelectedTable(table)
    const q = `SELECT * FROM ${table} LIMIT 20`
    setQuery(q)
    setLoading(true)
    setError(null)
    setShowSchema(false)

    // Fetch schema and data in parallel
    const [, dataRes] = await Promise.all([
      fetchSchema(table),
      fetch('/api/db/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: q }),
      }).catch(() => null),
    ])

    if (dataRes?.ok) {
      const data = await dataRes.json()
      if (Array.isArray(data) && data.length > 0) {
        setColumns(Object.keys(data[0]))
        setResults(data)
      } else {
        setResults([])
        setColumns([])
      }
    }
    setLoading(false)
  }

  const schema = selectedTable ? tableSchemas[selectedTable] : null

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
              <div className="flex flex-col gap-1 self-end">
                <button
                  onClick={() => runQuery()}
                  disabled={loading || !query.trim()}
                  className="px-3 py-2 bg-forge-accent text-white rounded-lg hover:bg-forge-accent-hover disabled:opacity-50 transition-colors"
                  aria-label="Run query"
                >
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                </button>
                {selectedTable && schema && (
                  <button
                    onClick={() => setShowSchema(!showSchema)}
                    className={cn(
                      'px-3 py-2 rounded-lg transition-colors',
                      showSchema ? 'bg-forge-accent/20 text-forge-accent' : 'bg-forge-surface text-forge-text-dim hover:text-forge-text',
                    )}
                    aria-label="Toggle schema view"
                    title="Show column types"
                  >
                    <Columns className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Schema panel */}
          {showSchema && schema && schema.length > 0 && (
            <div className="border-b border-forge-border bg-forge-panel/50 p-2 max-h-40 overflow-y-auto">
              <p className="text-[10px] text-forge-text-dim/70 uppercase tracking-wider mb-1.5">
                Schema: {selectedTable?.replace('forge_', '')}
              </p>
              <div className="grid grid-cols-[1fr_auto_auto] gap-x-3 gap-y-0.5">
                {schema.map(col => (
                  <div key={col.column_name} className="contents text-xs">
                    <span className="font-mono text-forge-text">{col.column_name}</span>
                    <span className="text-forge-accent font-mono">{col.data_type}</span>
                    <span className="text-forge-text-dim/50">
                      {col.is_nullable === 'YES' ? 'null' : 'not null'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

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
              {schema && <span className="ml-2">{schema.length} columns</span>}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
