'use client'

import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import {
  Terminal, ChevronDown, Loader2,
  Copy, Check, Maximize2, Minimize2, AlertCircle,
  Search, ArrowDown,
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '@/lib/utils'

/* ─── Props ─────────────────────────────────────── */

interface LiveLogPanelProps {
  className?: string
  defaultExpanded?: boolean
}

interface LogData {
  active: boolean
  content: string
  size: number
  unchanged?: boolean
  error?: string
}

/* ─── ANSI strip ────────────────────────────────── */

function stripAnsi(str: string): string {
  return str.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '')
}

/* ─── Loading skeleton ─────────────────────────── */

function LogSkeleton() {
  return (
    <div className="p-3 space-y-2">
      {[75, 60, 85, 45, 70].map((w, i) => (
        <div
          key={i}
          className="h-3 rounded animate-skeleton"
          style={{ width: `${w}%`, animationDelay: `${i * 100}ms` }}
        />
      ))}
    </div>
  )
}

/* ─── Component ─────────────────────────────────── */

export function LiveLogPanel({ className, defaultExpanded = false }: LiveLogPanelProps) {
  const [expanded, setExpanded] = useState(defaultExpanded)
  const [fullscreen, setFullscreen] = useState(false)
  const [logData, setLogData] = useState<LogData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [retryCount, setRetryCount] = useState(0)
  const [showSearch, setShowSearch] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const scrollRef = useRef<HTMLPreElement>(null)
  const sizeRef = useRef(0)
  const userScrolledRef = useRef(false)

  // Scroll detection
  const handleScroll = useCallback(() => {
    if (!scrollRef.current) return
    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current
    userScrolledRef.current = scrollHeight - scrollTop - clientHeight > 50
  }, [])

  // Auto-scroll
  useEffect(() => {
    if (scrollRef.current && !userScrolledRef.current && logData?.content) {
      requestAnimationFrame(() => {
        if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight
      })
    }
  }, [logData?.content])

  // Poll
  useEffect(() => {
    if (!expanded) return

    let cancelled = false
    let consecutiveErrors = 0

    async function poll() {
      try {
        const res = await fetch(`/api/brain/live-log?since=${sizeRef.current}`)
        if (cancelled) return

        if (!res.ok) {
          consecutiveErrors++
          if (consecutiveErrors >= 3) {
            setError(`Server returned ${res.status}`)
            setLoading(false)
          }
          return
        }

        consecutiveErrors = 0
        const data: LogData = await res.json()
        if (cancelled) return

        setError(null)
        setLoading(false)

        if (!data.unchanged) {
          sizeRef.current = data.size
          setLogData(data)
        }
      } catch (err) {
        if (cancelled) return
        consecutiveErrors++
        if (consecutiveErrors >= 3) {
          setError(err instanceof Error ? err.message : 'Connection failed')
          setLoading(false)
        }
      }
    }

    setLoading(true)
    poll()
    const interval = setInterval(poll, 2000)
    return () => { cancelled = true; clearInterval(interval) }
  }, [expanded, retryCount])

  // Copy to clipboard
  const handleCopy = useCallback(async () => {
    if (!logData?.content) return
    try {
      await navigator.clipboard.writeText(stripAnsi(logData.content))
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {}
  }, [logData?.content])

  const isActive = logData?.active ?? false
  const content = logData?.content ? stripAnsi(logData.content) : ''
  const hasContent = content.length > 0
  const lineCount = content.split('\n').length

  // Add line numbers
  const displayContent = useMemo(() => {
    if (!hasContent) return ''
    const lines = content.split('\n')
    return lines.map((line, i) => {
      const num = String(i + 1).padStart(4, ' ')
      return `${num} | ${line}`
    }).join('\n')
  }, [content, hasContent])

  // Find first error line
  const firstErrorLine = useMemo(() => {
    if (!hasContent) return -1
    const lines = content.split('\n')
    return lines.findIndex(l => /error/i.test(l))
  }, [content, hasContent])

  // Jump to error
  const jumpToError = useCallback(() => {
    if (firstErrorLine < 0 || !scrollRef.current) return
    const lineHeight = 18 // approximate
    scrollRef.current.scrollTop = firstErrorLine * lineHeight
  }, [firstErrorLine])

  // Filter by search
  const filteredContent = useMemo(() => {
    if (!searchQuery || !hasContent) return displayContent
    const lines = displayContent.split('\n')
    return lines.filter(l => l.toLowerCase().includes(searchQuery.toLowerCase())).join('\n')
  }, [displayContent, searchQuery, hasContent])

  return (
    <motion.div
      layout
      className={cn(
        'border border-pi-border rounded-lg overflow-hidden bg-pi-panel transition-shadow',
        isActive && 'border-pi-accent/30 shadow-[0_0_15px_rgba(0,212,255,0.08)]',
        fullscreen && 'fixed inset-4 z-50 rounded-xl shadow-2xl',
        className,
      )}
    >
      {/* Fullscreen backdrop */}
      <AnimatePresence>
        {fullscreen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-pi-overlay z-40"
            onClick={() => setFullscreen(false)}
          />
        )}
      </AnimatePresence>

      {/* Header */}
      <button
        onClick={() => setExpanded(e => !e)}
        className={cn(
          'w-full flex items-center justify-between px-3 py-2 hover:bg-pi-surface/50 transition-all',
          isActive && 'bg-gradient-to-r from-pi-accent/5 to-transparent',
        )}
        aria-expanded={expanded}
        aria-label={`${expanded ? 'Collapse' : 'Expand'} Claude Code output`}
      >
        <div className="flex items-center gap-2">
          <div className="relative">
            <Terminal className={cn('w-3.5 h-3.5 transition-colors', isActive ? 'text-pi-accent' : 'text-pi-text-dim')} />
            {isActive && (
              <motion.span
                animate={{ scale: [1, 1.5, 1], opacity: [0.5, 0, 0.5] }}
                transition={{ duration: 1.5, repeat: Infinity }}
                className="absolute inset-0 rounded-full bg-pi-accent/30"
              />
            )}
          </div>
          <span className="text-[11px] font-semibold text-pi-text">Claude Code Output</span>

          <AnimatePresence mode="wait">
            {isActive ? (
              <motion.span
                key="active"
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 10 }}
                className="flex items-center gap-1 text-[9px] text-pi-accent font-medium"
              >
                <Loader2 className="w-2.5 h-2.5 animate-spin" />
                Working...
              </motion.span>
            ) : hasContent ? (
              <motion.span
                key="done"
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 10 }}
                className="text-[9px] text-pi-text-dim/50 font-mono"
              >
                {lineCount} lines
              </motion.span>
            ) : null}
          </AnimatePresence>
        </div>

        <div className="flex items-center gap-1">
          {expanded && hasContent && (
            <>
              {/* Jump to error */}
              {firstErrorLine >= 0 && (
                <motion.button
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  onClick={e => { e.stopPropagation(); jumpToError() }}
                  className="p-1 rounded hover:bg-red-500/10 transition-colors"
                  title="Jump to error"
                  aria-label="Jump to first error"
                >
                  <ArrowDown className="w-3 h-3 text-red-400" />
                </motion.button>
              )}
              {/* Search */}
              <motion.button
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                onClick={e => { e.stopPropagation(); setShowSearch(s => !s) }}
                className={cn('p-1 rounded transition-colors', showSearch ? 'bg-pi-accent/10 text-pi-accent' : 'hover:bg-pi-surface text-pi-text-dim')}
                title="Search log"
                aria-label="Search log content"
              >
                <Search className="w-3 h-3" />
              </motion.button>
              <motion.button
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                onClick={e => { e.stopPropagation(); handleCopy() }}
                className="p-1 rounded hover:bg-pi-surface transition-colors"
                title="Copy output"
                aria-label="Copy log output"
              >
                {copied
                  ? <Check className="w-3 h-3 text-emerald-500" />
                  : <Copy className="w-3 h-3 text-pi-text-dim" />
                }
              </motion.button>
              <motion.button
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                onClick={e => { e.stopPropagation(); setFullscreen(f => !f) }}
                className="p-1 rounded hover:bg-pi-surface transition-colors"
                title={fullscreen ? 'Exit fullscreen' : 'Fullscreen'}
                aria-label={fullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
              >
                {fullscreen
                  ? <Minimize2 className="w-3 h-3 text-pi-text-dim" />
                  : <Maximize2 className="w-3 h-3 text-pi-text-dim" />
                }
              </motion.button>
            </>
          )}
          <motion.div animate={{ rotate: expanded ? 180 : 0 }} transition={{ duration: 0.2 }}>
            <ChevronDown className="w-3.5 h-3.5 text-pi-text-dim" />
          </motion.div>
        </div>
      </button>

      {/* Progress bar when active */}
      {isActive && (
        <div className="relative h-0.5 bg-pi-border/30">
          <div className="indeterminate-bar" />
        </div>
      )}

      {/* Content */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 400, damping: 30 }}
            className="border-t border-pi-border overflow-hidden"
          >
            {/* Search bar */}
            {showSearch && (
              <div className="px-3 py-1.5 border-b border-pi-border/50 bg-[#0a0a0f]">
                <input
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder="Search log..."
                  className="w-full bg-pi-surface border border-pi-border rounded-md px-2.5 py-1 text-[10px] text-pi-text placeholder:text-pi-text-dim/40 focus:outline-none focus:ring-1 focus:ring-pi-accent/50"
                  autoFocus
                />
              </div>
            )}

            {/* Error state */}
            {error ? (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="p-4 flex flex-col items-center gap-2 text-center"
              >
                <AlertCircle className="w-8 h-8 text-pi-danger/40" />
                <p className="text-xs text-pi-danger">{error}</p>
                <button
                  onClick={() => { setError(null); setRetryCount(c => c + 1) }}
                  className="text-[10px] text-pi-accent hover:underline mt-1"
                >
                  Retry
                </button>
              </motion.div>
            ) : loading ? (
              <LogSkeleton />
            ) : (
              <pre
                ref={scrollRef}
                onScroll={handleScroll}
                className={cn(
                  'overflow-auto text-[11px] font-mono leading-relaxed p-3',
                  'bg-[#0a0a0f] text-gray-300',
                  fullscreen ? 'max-h-[calc(100vh-120px)]' : 'max-h-[300px]',
                  'min-h-[80px]',
                  'selection:bg-pi-accent/30'
                )}
              >
                {hasContent ? filteredContent : (
                  <span className="text-pi-text-dim/30 italic">
                    No recent Claude Code activity
                  </span>
                )}
                {isActive && (
                  <span className="inline-block w-2 h-4 bg-pi-accent/70 ml-0.5 animate-[cursorBlink_1s_ease-in-out_infinite] rounded-sm" />
                )}
              </pre>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}
