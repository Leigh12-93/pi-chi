'use client'

import { useState, useMemo } from 'react'
import { Plus, Trash2, Eye, EyeOff } from 'lucide-react'

interface EnvPanelProps {
  fileContents: Record<string, string>
  onFileChange: (path: string, content: string) => void
}

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

export function EnvPanel({ fileContents, onFileChange }: EnvPanelProps) {
  const envContent = fileContents['.env.local'] || fileContents['/.env.local'] || ''
  const entries = useMemo(() => parseEnvFile(envContent), [envContent])
  const [visibleKeys, setVisibleKeys] = useState<Set<string>>(new Set())
  const [newKey, setNewKey] = useState('')
  const [newValue, setNewValue] = useState('')

  const toggleVisibility = (key: string) => {
    setVisibleKeys(prev => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })
  }

  const handleAdd = () => {
    if (!newKey.trim()) return
    const updated = [...entries, { key: newKey.trim(), value: newValue }]
    onFileChange('.env.local', serializeEnv(updated))
    setNewKey('')
    setNewValue('')
  }

  const handleDelete = (key: string) => {
    const updated = entries.filter(e => e.key !== key)
    onFileChange('.env.local', serializeEnv(updated))
  }

  return (
    <div className="p-3 space-y-3">
      <p className="text-[10px] uppercase tracking-wider text-forge-text-dim font-medium">.env.local</p>

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
            <button
              onClick={() => handleDelete(key)}
              className="p-0.5 text-forge-text-dim hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
            >
              <Trash2 className="w-3 h-3" />
            </button>
          </div>
        ))}
      </div>

      <div className="border-t border-forge-border pt-2 space-y-1.5">
        <input
          type="text"
          placeholder="KEY"
          value={newKey}
          onChange={e => setNewKey(e.target.value)}
          className="w-full px-2 py-1.5 text-xs font-mono bg-forge-bg border border-forge-border rounded-md focus:outline-none focus:border-forge-accent"
        />
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
