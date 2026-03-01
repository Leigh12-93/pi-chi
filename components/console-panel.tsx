'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { Terminal, X, Trash2, ChevronDown, ChevronUp, ArrowDown } from 'lucide-react'
import { cn } from '@/lib/utils'

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

  useEffect(() => {
    if (scrollRef.current && isAtBottom) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [entries, isAtBottom])

  return (
    <div className={cn(
      'border-t border-forge-border bg-forge-panel',
      open ? 'h-40 transition-[height] duration-200' : 'h-7 transition-[height] duration-150',
    )}>
      {/* Header */}
      <button
        onClick={onToggle}
        className="flex items-center justify-between w-full px-3 h-7 text-[10px] hover:bg-forge-surface/50 transition-colors"
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
            <span
              onClick={e => { e.stopPropagation(); onClear() }}
              className="p-0.5 rounded hover:bg-forge-surface text-forge-text-dim hover:text-forge-text transition-colors"
              title="Clear console"
            >
              <Trash2 className="w-3 h-3" />
            </span>
          )}
          {open ? <ChevronDown className="w-3 h-3 text-forge-text-dim" /> : <ChevronUp className="w-3 h-3 text-forge-text-dim" />}
        </div>
      </button>

      {/* Output */}
      {open && (
        <div className="relative h-[calc(100%-28px)]">
          <div ref={scrollRef} onScroll={checkIfAtBottom} className="h-full overflow-y-auto px-3 py-1 font-mono text-[11px] leading-relaxed">
            {entries.length === 0 ? (
              <div className="flex items-center justify-center h-full text-forge-text-dim/50 text-[10px]">
                No output yet
              </div>
            ) : (
              entries.map((entry, i) => (
                <div key={entry.id || i} className={cn(
                  'flex gap-2 px-1 py-0.5 -mx-1 rounded-sm',
                  entry.type === 'error' && 'border-l-2 border-l-red-500 pl-1.5',
                  entry.type === 'warn' && 'border-l-2 border-l-amber-500 pl-1.5',
                  i % 2 === 0 && 'bg-forge-surface/30',
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
              ))
            )}
          </div>

          {/* Scroll to bottom button */}
          {!isAtBottom && entries.length > 0 && (
            <button
              onClick={scrollToBottom}
              className="absolute bottom-2 right-3 p-1 rounded-full bg-forge-surface border border-forge-border shadow-md text-forge-text-dim hover:text-forge-text hover:bg-forge-surface-hover transition-all animate-fade-in"
              title="Scroll to bottom"
            >
              <ArrowDown className="w-3 h-3" />
            </button>
          )}
        </div>
      )}
    </div>
  )
}
