'use client'

import { useState, useRef, useEffect, useMemo } from 'react'
import { Search, X, FileText } from 'lucide-react'

interface FileSearchProps {
  files: Record<string, string>
  onResultClick: (path: string) => void
  open: boolean
  onClose: () => void
}

interface SearchResult {
  path: string
  line: number
  text: string
  matchStart: number
  matchEnd: number
}

export function FileSearch({ files, onResultClick, open, onClose }: FileSearchProps) {
  const [query, setQuery] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) {
      setQuery('')
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, onClose])

  const results = useMemo(() => {
    if (!query || query.length < 2) return []
    const matches: SearchResult[] = []
    const regex = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi')

    for (const [path, content] of Object.entries(files)) {
      const lines = content.split('\n')
      for (let i = 0; i < lines.length && matches.length < 50; i++) {
        const match = regex.exec(lines[i])
        if (match) {
          matches.push({
            path,
            line: i + 1,
            text: lines[i].trim().slice(0, 120),
            matchStart: match.index,
            matchEnd: match.index + match[0].length,
          })
          regex.lastIndex = 0
        }
      }
    }
    return matches
  }, [query, files])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center pt-[15vh]" onClick={onClose}>
      <div className="absolute inset-0 bg-forge-overlay backdrop-blur-md animate-fade-in" />
      <div
        className="relative w-full max-w-lg mx-4 bg-forge-bg rounded-xl shadow-2xl border border-forge-border overflow-hidden animate-scale-in"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 px-3 border-b border-forge-border">
          <Search className="w-4 h-4 text-forge-text-dim shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search across all files..."
            className="flex-1 bg-transparent py-3 text-sm text-forge-text placeholder:text-forge-text-dim/50 outline-none"
          />
          {query && (
            <button onClick={() => setQuery('')} className="p-1 text-forge-text-dim hover:text-forge-text">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        <div className="max-h-[50vh] overflow-y-auto">
          {query.length >= 2 && results.length === 0 && (
            <div className="py-8 text-center text-xs text-forge-text-dim">No results found</div>
          )}
          {results.map((result, i) => (
            <button
              key={`${result.path}:${result.line}:${i}`}
              onClick={() => { onResultClick(result.path); onClose() }}
              className="flex items-start gap-2 w-full px-3 py-2 text-left hover:bg-forge-surface transition-colors border-b border-forge-border/50 last:border-0"
            >
              <FileText className="w-3.5 h-3.5 text-forge-text-dim mt-0.5 shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 text-[11px]">
                  <span className="font-medium text-forge-text truncate">{result.path}</span>
                  <span className="text-forge-text-dim shrink-0">:{result.line}</span>
                </div>
                <p className="text-[11px] text-forge-text-dim truncate font-mono mt-0.5">{result.text}</p>
              </div>
            </button>
          ))}
        </div>

        {query.length >= 2 && results.length > 0 && (
          <div className="px-3 py-2 border-t border-forge-border bg-forge-surface/30 text-[10px] text-forge-text-dim text-center">
            {results.length} result{results.length !== 1 ? 's' : ''}{results.length >= 50 ? ' (showing first 50)' : ''}
          </div>
        )}
      </div>
    </div>
  )
}
