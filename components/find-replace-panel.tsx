'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import { Search, Replace, X, ChevronDown, ChevronUp, CaseSensitive, Regex } from 'lucide-react'
import { cn } from '@/lib/utils'

interface FindReplacePanelProps {
  open: boolean
  onClose: () => void
  files: Record<string, string>
  onReplace: (path: string, content: string) => void
  activeFile?: string | null
}

interface SearchResult {
  file: string
  line: number
  column: number
  lineText: string
  matchLength: number
}

export function FindReplacePanel({ open, onClose, files, onReplace, activeFile }: FindReplacePanelProps) {
  const [searchTerm, setSearchTerm] = useState('')
  const [replaceTerm, setReplaceTerm] = useState('')
  const [caseSensitive, setCaseSensitive] = useState(false)
  const [useRegex, setUseRegex] = useState(false)
  const [results, setResults] = useState<SearchResult[]>([])
  const [showReplace, setShowReplace] = useState(false)
  const [selectedIdx, setSelectedIdx] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) inputRef.current?.focus()
  }, [open])

  const doSearch = useCallback(() => {
    if (!searchTerm) { setResults([]); return }

    const matches: SearchResult[] = []
    const filesToSearch = activeFile ? { [activeFile]: files[activeFile] } : files

    for (const [path, content] of Object.entries(filesToSearch)) {
      if (!content) continue
      const lines = content.split('\n')

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i]
        let searchIn = line
        let term = searchTerm

        if (!caseSensitive) {
          searchIn = line.toLowerCase()
          term = searchTerm.toLowerCase()
        }

        if (useRegex) {
          try {
            const regex = new RegExp(searchTerm, caseSensitive ? 'g' : 'gi')
            let match
            while ((match = regex.exec(line)) !== null) {
              matches.push({
                file: path,
                line: i + 1,
                column: match.index + 1,
                lineText: line,
                matchLength: match[0].length,
              })
              if (matches.length > 500) break
            }
          } catch { /* invalid regex */ }
        } else {
          let idx = 0
          while ((idx = searchIn.indexOf(term, idx)) !== -1) {
            matches.push({
              file: path,
              line: i + 1,
              column: idx + 1,
              lineText: line,
              matchLength: term.length,
            })
            idx += term.length
            if (matches.length > 500) break
          }
        }
        if (matches.length > 500) break
      }
      if (matches.length > 500) break
    }

    setResults(matches)
    setSelectedIdx(0)
  }, [searchTerm, files, activeFile, caseSensitive, useRegex])

  useEffect(() => { doSearch() }, [doSearch])

  const handleReplaceOne = () => {
    if (results.length === 0 || selectedIdx >= results.length) return
    const result = results[selectedIdx]
    const content = files[result.file]
    if (!content) return

    const lines = content.split('\n')
    const line = lines[result.line - 1]
    const before = line.slice(0, result.column - 1)
    const after = line.slice(result.column - 1 + result.matchLength)
    lines[result.line - 1] = before + replaceTerm + after

    onReplace(result.file, lines.join('\n'))
  }

  const handleReplaceAll = () => {
    const fileChanges: Record<string, string> = {}

    for (const [path, content] of Object.entries(files)) {
      if (!content) continue
      let newContent: string

      if (useRegex) {
        try {
          const regex = new RegExp(searchTerm, caseSensitive ? 'g' : 'gi')
          newContent = content.replace(regex, replaceTerm)
        } catch { continue }
      } else {
        if (caseSensitive) {
          newContent = content.split(searchTerm).join(replaceTerm)
        } else {
          const regex = new RegExp(searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi')
          newContent = content.replace(regex, replaceTerm)
        }
      }

      if (newContent !== content) {
        fileChanges[path] = newContent
      }
    }

    for (const [path, content] of Object.entries(fileChanges)) {
      onReplace(path, content)
    }
  }

  if (!open) return null

  return (
    <div className="border-b border-forge-border bg-forge-panel px-3 py-2 space-y-2">
      <div className="flex items-center gap-2">
        <div className="flex-1 flex items-center gap-1.5 bg-forge-surface border border-forge-border rounded-lg px-2">
          <Search className="w-3.5 h-3.5 text-forge-text-dim shrink-0" />
          <input
            ref={inputRef}
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            placeholder="Search..."
            className="flex-1 py-1.5 text-xs bg-transparent text-forge-text placeholder:text-forge-text-dim/50 focus:outline-none"
            onKeyDown={e => {
              if (e.key === 'Escape') onClose()
              if (e.key === 'Enter') setSelectedIdx(prev => (prev + 1) % Math.max(results.length, 1))
            }}
          />
          <button
            onClick={() => setCaseSensitive(!caseSensitive)}
            className={cn('p-0.5 rounded', caseSensitive ? 'text-forge-accent bg-forge-accent/10' : 'text-forge-text-dim')}
            title="Case sensitive"
          >
            <CaseSensitive className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setUseRegex(!useRegex)}
            className={cn('p-0.5 rounded', useRegex ? 'text-forge-accent bg-forge-accent/10' : 'text-forge-text-dim')}
            title="Use regex"
          >
            <Regex className="w-3.5 h-3.5" />
          </button>
        </div>

        <span className="text-[10px] text-forge-text-dim whitespace-nowrap">
          {results.length > 0 ? `${selectedIdx + 1}/${results.length}` : 'No results'}
        </span>

        <button onClick={() => setSelectedIdx(prev => Math.max(0, prev - 1))} className="p-1 text-forge-text-dim hover:text-forge-text">
          <ChevronUp className="w-3.5 h-3.5" />
        </button>
        <button onClick={() => setSelectedIdx(prev => Math.min(results.length - 1, prev + 1))} className="p-1 text-forge-text-dim hover:text-forge-text">
          <ChevronDown className="w-3.5 h-3.5" />
        </button>
        <button onClick={() => setShowReplace(!showReplace)} className="p-1 text-forge-text-dim hover:text-forge-text" title="Toggle replace">
          <Replace className="w-3.5 h-3.5" />
        </button>
        <button onClick={onClose} className="p-1 text-forge-text-dim hover:text-forge-text">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {showReplace && (
        <div className="flex items-center gap-2">
          <div className="flex-1 flex items-center gap-1.5 bg-forge-surface border border-forge-border rounded-lg px-2">
            <Replace className="w-3.5 h-3.5 text-forge-text-dim shrink-0" />
            <input
              value={replaceTerm}
              onChange={e => setReplaceTerm(e.target.value)}
              placeholder="Replace with..."
              className="flex-1 py-1.5 text-xs bg-transparent text-forge-text placeholder:text-forge-text-dim/50 focus:outline-none"
            />
          </div>
          <button
            onClick={handleReplaceOne}
            disabled={results.length === 0}
            className="px-2 py-1 text-[10px] bg-forge-surface border border-forge-border rounded hover:bg-forge-accent/10 text-forge-text-dim hover:text-forge-text disabled:opacity-50 transition-colors"
          >
            Replace
          </button>
          <button
            onClick={handleReplaceAll}
            disabled={results.length === 0}
            className="px-2 py-1 text-[10px] bg-forge-surface border border-forge-border rounded hover:bg-forge-accent/10 text-forge-text-dim hover:text-forge-text disabled:opacity-50 transition-colors"
          >
            All
          </button>
        </div>
      )}
    </div>
  )
}
