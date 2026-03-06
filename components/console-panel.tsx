'use client'

import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { Terminal, Trash2, ChevronDown, ChevronUp, ArrowDown, Search, X, Clipboard } from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

export interface ConsoleEntry {
  id: string
  type: 'info' | 'error' | 'warn' | 'success'
  message: string
  timestamp: number
}

interface ConsolePanelProps {
  entries: ConsoleEntry[]
  onClear: () => void
  open: boolean
  onToggle: () => void
}

const TYPE_STYLES: Record<string, string> = {
  info: 'text-forge-text-dim',
  error: 'text-red-500',
  warn: 'text-amber-500',
  success: 'text-emerald-500',
}

const TYPE_PREFIX: Record<string, string> = {
  info: '[INFO]',
  error: '[ERR]',
  warn: '[WARN]',
  success: '[OK]',
}

export function ConsolePanel({ entries, onClear, open, onToggle }: ConsolePanelProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [isAtBottom, setIsAtBottom] = useState(true)
  const prevEntryCountRef = useRef(entries.length)
  const [searchQuery, setSearchQuery] = useState('')
  const [showSearch, setShowSearch] = useState(false)
  const [typeFilter, setTypeFilter] = useState<'all' | 'error' | 'warn'>('all')

  const filteredEntries = useMemo(() => {
    let result = entries
    if (typeFilter !== 'all') {
      result = result.filter(e => e.type === typeFilter)
    }
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      result = result.filter(e => e.message.toLowerCase().includes(q))
    }
    return result
  }, [entries, typeFilter, searchQuery])

  const handleCopyAll = useCallback(() => {
    const text = filteredEntries.map(e => {
      const time = new Date(e.timestamp).toLocaleTimeString('en-AU', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })
      return `[${time}] ${TYPE_PREFIX[e.type]} ${e.message}`
    }).join('\n')
    navigator.clipboard.writeText(text)
    toast.success('Console copied', { duration: 1500 })
  }, [filteredEntries])

  const checkIfAtBottom = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    const threshold = 24
    setIsAtBottom(el.scrollHeight - el.scrollTop - el.clientHeight < threshold)
  }, [])

  const scrollToBottom = useCallback(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
    }
  }, [])

  // Track new entries for slide-in animation
  const isNewEntry = entries.length > prevEntryCountRef.current
  useEffect(() => {
    prevEntryCountRef.current = entries.length
  }, [entries.length])

  useEffect(() => {
    if (scrollRef.current && isAtBottom) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [entries, isAtBottom])

  return (
    <div
      className="border-t border-forge-border bg-forge-panel overflow-hidden"
      style={{
        height: open ? 160 : 28,
        transition: 'height 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
      }}
    >
      {/* Header */}
      <button
        onClick={onToggle}
        className="flex items-center justify-between w-full px-3 h-7 text-[10px] hover:bg-forge-surface/50 transition-colors"
        aria-label="Toggle console"
      >
        <div className="flex items-center gap-1.5">
          <Terminal className="w-3 h-3 text-forge-text-dim" />
          <span className="font-medium text-forge-text-dim">Console</span>
          {entries.length > 0 && (
            <span className="px-1.5 py-0.5 text-[9px] rounded-full bg-forge-surface text-forge-text-dim">
              {entries.length}
            </span>
          )}
          {entries.some(e => e.type === 'error') && (
            <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
          )}
        </div>
        <div className="flex items-center gap-1">
          {open && entries.length > 0 && (
            <button
              onClick={e => { e.stopPropagation(); setShowSearch(prev => !prev) }}
              className="p-0.5 rounded hover:bg-forge-surface text-forge-text-dim hover:text-forge-text transition-colors"
              title="Search console"
              aria-label="Search console"
            >
              <Search className="w-3 h-3" />
            </button>
          )}
          {open && filteredEntries.length > 0 && (
            <button
              onClick={e => { e.stopPropagation(); handleCopyAll() }}
              className="p-0.5 rounded hover:bg-forge-surface text-forge-text-dim hover:text-forge-text transition-colors"
              title="Copy all"
              aria-label="Copy all console entries"
            >
              <Clipboard className="w-3 h-3" />
            </button>
          )}
          {open && entries.length > 0 && (
            <button
              onClick={e => { e.stopPropagation(); onClear() }}
              className="p-0.5 rounded hover:bg-forge-surface text-forge-text-dim hover:text-forge-text transition-colors"
              title="Clear console"
              aria-label="Clear console"
            >
              <Trash2 className="w-3 h-3" />
            </button>
          )}
          {open ? <ChevronDown className="w-3 h-3 text-forge-text-dim" /> : <ChevronUp className="w-3 h-3 text-forge-text-dim" />}
        </div>
      </button>

      {/* Search + Type Filter Bar */}
      {open && showSearch && (
        <div className="flex items-center gap-1.5 px-3 py-1 border-b border-forge-border bg-forge-surface/50">
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Filter..."
            className="flex-1 bg-transparent text-[10px] text-forge-text placeholder:text-forge-text-dim/40 outline-none"
            autoFocus
          />
          {searchQuery && (
            <button onClick={() => setSearchQuery('')} className="p-0.5 text-forge-text-dim hover:text-forge-text" aria-label="Clear search">
              <X className="w-2.5 h-2.5" />
            </button>
          )}
          <div className="flex items-center gap-0.5 ml-1">
            {(['all', 'error', 'warn'] as const).map(t => (
              <button
                key={t}
                onClick={() => setTypeFilter(t)}
                className={cn(
                  'px-1.5 py-0.5 text-[9px] rounded font-medium transition-colors',
                  typeFilter === t ? 'bg-forge-accent/15 text-forge-accent' : 'text-forge-text-dim hover:text-forge-text'
                )}
              >
                {t === 'all' ? 'All' : t === 'error' ? 'Errors' : 'Warnings'}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Output — always mounted for smooth height transition */}
      <div className="relative h-[calc(100%-28px)]">
        <div ref={scrollRef} onScroll={checkIfAtBottom} className="h-full overflow-y-auto px-3 py-1 font-mono text-[11px] leading-relaxed">
          {filteredEntries.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-1.5 text-forge-text-dim/50 text-[10px]">
              <Terminal className="w-4 h-4 console-breathe" />
              <span>{entries.length === 0 ? 'Waiting for output...' : 'No matching entries'}</span>
            </div>
          ) : (
            filteredEntries.map((entry, i) => {
              const isLast = i === filteredEntries.length - 1

              return (
                <div key={entry.id || i} className={cn(
                  'flex gap-2 px-1 py-0.5 -mx-1 rounded-sm',
                  entry.type === 'error' && 'border-l-2 border-l-red-500 pl-1.5 console-entry-error',
                  entry.type === 'warn' && 'border-l-2 border-l-amber-500 pl-1.5 console-entry-warn',
                  i % 2 === 0 && 'bg-forge-surface/30',
                  isLast && isNewEntry && 'console-entry-new',
                )}>
                  <span className="text-forge-text-dim/40 shrink-0 select-none">
                    {new Date(entry.timestamp).toLocaleTimeString('en-AU', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                  </span>
                  <span className={cn('shrink-0 font-medium', TYPE_STYLES[entry.type])}>
                    {TYPE_PREFIX[entry.type]}
                  </span>
                  <span className={TYPE_STYLES[entry.type]}>
                    {entry.message}
                  </span>
                </div>
              )
            })
          )}
        </div>

        {/* Scroll to bottom button */}
        {!isAtBottom && filteredEntries.length > 0 && open && (
          <button
            onClick={scrollToBottom}
            className="absolute bottom-2 right-3 p-1 rounded-full bg-forge-surface border border-forge-border shadow-md text-forge-text-dim hover:text-forge-text hover:bg-forge-surface-hover transition-all animate-fade-in"
            title="Scroll to bottom"
            aria-label="Scroll to bottom"
          >
            <ArrowDown className="w-3 h-3" />
          </button>
        )}
      </div>
    </div>
  )
}
