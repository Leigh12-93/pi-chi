'use client'

import { useState, useRef, useEffect } from 'react'
import { Terminal, X, Trash2, ChevronDown, ChevronUp } from 'lucide-react'
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

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [entries])

  return (
    <div className={cn(
      'border-t border-forge-border bg-forge-panel transition-all',
      open ? 'h-40' : 'h-7',
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
        <div ref={scrollRef} className="h-[calc(100%-28px)] overflow-y-auto px-3 py-1 font-mono text-[11px] leading-relaxed">
          {entries.length === 0 ? (
            <div className="flex items-center justify-center h-full text-forge-text-dim/50 text-[10px]">
              No output yet
            </div>
          ) : (
            entries.map(entry => (
              <div key={entry.id} className="flex gap-2">
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
      )}
    </div>
  )
}
