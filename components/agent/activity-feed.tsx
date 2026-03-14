'use client'

import { useRef, useEffect, useMemo, useState, useCallback } from 'react'
import {
  Brain, Cpu, Target, Zap, AlertTriangle,
  CheckCircle2, Activity, Wifi, Search, Pause, Play,
} from 'lucide-react'
import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'
import type { ActivityEntry, AgentStatus } from '@/lib/agent-types'

/* ─── Props ─────────────────────────────────────── */

interface ActivityFeedProps {
  entries: ActivityEntry[]
  agentStatus: AgentStatus
}

/* ─── Icon & color helpers ──────────────────────── */

const activityIcons: Record<ActivityEntry['type'], { icon: React.ElementType; color: string }> = {
  system: { icon: Cpu, color: 'text-cyan-500' },
  goal: { icon: Target, color: 'text-pi-accent' },
  action: { icon: Zap, color: 'text-yellow-500' },
  decision: { icon: Brain, color: 'text-purple-500' },
  error: { icon: AlertTriangle, color: 'text-red-500' },
  success: { icon: CheckCircle2, color: 'text-emerald-500' },
  gpio: { icon: Activity, color: 'text-orange-500' },
  network: { icon: Wifi, color: 'text-blue-500' },
}

const statusMessages: Record<AgentStatus, { label: string; color: string }> = {
  idle: { label: 'Awaiting next cycle...', color: 'text-pi-text-dim/40' },
  thinking: { label: 'Evaluating next action...', color: 'text-purple-400' },
  executing: { label: 'Executing tool...', color: 'text-yellow-400' },
  error: { label: 'Encountered an error', color: 'text-red-400' },
}

const allTypes = ['system', 'goal', 'action', 'decision', 'error', 'success', 'gpio', 'network'] as const

/* ─── Component ─────────────────────────────────── */

export function ActivityFeed({ entries, agentStatus }: ActivityFeedProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const prevLenRef = useRef(0)
  const [autoScroll, setAutoScroll] = useState(true)
  const [typeFilter, setTypeFilter] = useState<Set<string>>(new Set())
  const [searchQuery, setSearchQuery] = useState('')
  const [searchDebounced, setSearchDebounced] = useState('')

  // Debounce search
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const handleSearch = useCallback((value: string) => {
    setSearchQuery(value)
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current)
    searchTimerRef.current = setTimeout(() => setSearchDebounced(value), 200)
  }, [])

  const [newCount, setNewCount] = useState(0)

  // Track scroll position to detect if user is scrolled up
  const handleScroll = useCallback(() => {
    if (!scrollRef.current) return
    const el = scrollRef.current
    const isAtBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40
    if (isAtBottom) {
      setAutoScroll(true)
      setNewCount(0)
    }
  }, [])

  // Auto-scroll on new entries
  useEffect(() => {
    if (entries.length > prevLenRef.current) {
      const diff = entries.length - prevLenRef.current
      if (autoScroll && scrollRef.current) {
        requestAnimationFrame(() => {
          scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
        })
      } else {
        // Not auto-scrolling — accumulate new entry count
        setNewCount(prev => prev + diff)
      }
    }
    prevLenRef.current = entries.length
  }, [entries.length, autoScroll])

  // Count by type
  const typeCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    entries.forEach(e => { counts[e.type] = (counts[e.type] || 0) + 1 })
    return counts
  }, [entries])

  // Filter entries
  const filteredEntries = useMemo(() => {
    let result = entries
    if (typeFilter.size > 0) {
      result = result.filter(e => typeFilter.has(e.type))
    }
    if (searchDebounced) {
      const q = searchDebounced.toLowerCase()
      result = result.filter(e => e.message.toLowerCase().includes(q))
    }
    return result
  }, [entries, typeFilter, searchDebounced])

  const toggleTypeFilter = useCallback((type: string) => {
    setTypeFilter(prev => {
      const next = new Set(prev)
      if (next.has(type)) next.delete(type)
      else next.add(type)
      return next
    })
  }, [])

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-pi-border bg-pi-panel/80 backdrop-blur-sm px-4 py-2.5">
        <div className="flex items-center gap-2">
          <Activity className="w-3.5 h-3.5 text-pi-accent" />
          <span className="text-xs font-bold text-pi-text">Activity</span>
          <span className="text-[10px] text-pi-text-dim font-mono bg-pi-surface px-1.5 py-0.5 rounded-full">
            {filteredEntries.length}{filteredEntries.length !== entries.length ? `/${entries.length}` : ''}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {/* Type counts */}
          <div className="hidden sm:flex items-center gap-1.5">
            {typeCounts['error'] && (
              <span className="flex items-center gap-0.5 text-[9px] text-red-400">
                <AlertTriangle className="w-2.5 h-2.5" />
                {typeCounts['error']}
              </span>
            )}
            {typeCounts['success'] && (
              <span className="flex items-center gap-0.5 text-[9px] text-emerald-400">
                <CheckCircle2 className="w-2.5 h-2.5" />
                {typeCounts['success']}
              </span>
            )}
          </div>
          {/* Pause/resume */}
          <button
            onClick={() => setAutoScroll(s => !s)}
            className={cn(
              'p-1 rounded-lg transition-all',
              autoScroll ? 'text-pi-text-dim hover:text-pi-text' : 'text-yellow-500 bg-yellow-500/10'
            )}
            title={autoScroll ? 'Pause auto-scroll' : 'Resume auto-scroll'}
            aria-label={autoScroll ? 'Pause auto-scroll' : 'Resume auto-scroll'}
          >
            {autoScroll ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}
          </button>
          <span className="flex items-center gap-1 text-[10px] text-pi-text-dim" aria-live="polite">
            <motion.span
              animate={{ opacity: [0.4, 1, 0.4] }}
              transition={{ duration: 2, repeat: Infinity }}
              className="w-1.5 h-1.5 rounded-full bg-emerald-500"
            />
            Live
          </span>
        </div>
      </div>

      {/* Filter bar */}
      <div className="px-3 py-1.5 border-b border-pi-border/50 flex items-center gap-1.5 overflow-x-auto">
        {/* Search */}
        <div className="relative shrink-0">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-2.5 h-2.5 text-pi-text-dim/40" />
          <input
            value={searchQuery}
            onChange={e => handleSearch(e.target.value)}
            placeholder="Filter..."
            className="bg-pi-surface border border-pi-border rounded-md pl-6 pr-2 py-1 text-[10px] text-pi-text placeholder:text-pi-text-dim/40 focus:outline-none focus:ring-1 focus:ring-pi-accent/50 w-24"
          />
        </div>
        {/* Type chips */}
        {allTypes.map(type => {
          const { icon: Icon, color } = activityIcons[type]
          const count = typeCounts[type] || 0
          if (count === 0 && typeFilter.size === 0) return null
          const isActive = typeFilter.has(type)
          return (
            <button
              key={type}
              onClick={() => toggleTypeFilter(type)}
              className={cn(
                'flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded-full font-medium transition-all shrink-0',
                isActive
                  ? 'bg-pi-accent/10 text-pi-accent border border-pi-accent/30'
                  : 'text-pi-text-dim/50 hover:text-pi-text-dim border border-transparent'
              )}
            >
              <Icon className={cn('w-2.5 h-2.5', isActive ? 'text-pi-accent' : color)} />
              {count > 0 && <span>{count}</span>}
            </button>
          )
        })}
      </div>

      {/* Entries */}
      <div ref={scrollRef} onScroll={handleScroll} className="flex-1 overflow-y-auto relative" aria-live="polite">
        {/* New content badge */}
        {newCount > 0 && (
          <button
            onClick={() => {
              setAutoScroll(true)
              setNewCount(0)
              scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
            }}
            className="sticky top-0 z-10 w-full py-1 bg-pi-accent/90 text-white text-[10px] font-medium text-center hover:bg-pi-accent transition-colors"
          >
            {newCount} new {newCount === 1 ? 'entry' : 'entries'} — click to scroll
          </button>
        )}
        <div className="px-3 py-2 space-y-px">
          {filteredEntries.length === 0 ? (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex flex-col items-center justify-center py-12 text-pi-text-dim"
            >
              <motion.div
                animate={{ rotate: [0, 5, -5, 0] }}
                transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
              >
                <Activity className="w-10 h-10 mb-3 opacity-15" />
              </motion.div>
              <p className="text-xs font-medium">
                {entries.length === 0 ? 'No activity yet' : 'No matching entries'}
              </p>
              <p className="text-[10px] mt-1 text-center max-w-[200px]">
                {entries.length === 0
                  ? 'Actions will appear here as the brain operates.'
                  : 'Try adjusting your filters.'}
              </p>
            </motion.div>
          ) : (
            filteredEntries.map((entry, i) => {
              const { icon: Icon, color } = activityIcons[entry.type] || activityIcons.action
              const isRecent = i >= filteredEntries.length - 3

              return (
                <motion.div
                  key={entry.id}
                  initial={isRecent ? { opacity: 0, x: -8, scale: 0.97 } : false}
                  animate={{ opacity: 1, x: 0, scale: 1 }}
                  transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                  className={cn(
                    'flex items-start gap-2 py-1.5 -mx-1 px-1 rounded-md transition-all group',
                    'hover:bg-pi-surface/40',
                    entry.type === 'error' && 'bg-red-500/5 hover:bg-red-500/10',
                    entry.type === 'success' && isRecent && 'animate-success-glow'
                  )}
                >
                  {/* Icon with indicator dot */}
                  <div className="relative mt-0.5 shrink-0">
                    <Icon className={cn('w-3 h-3', color)} />
                    {entry.type === 'error' && (
                      <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse" />
                    )}
                  </div>

                  {/* Timestamp */}
                  <span className="text-[9px] text-pi-text-dim/40 font-mono shrink-0 mt-px min-w-[32px]">
                    {entry.time}
                  </span>

                  {/* Message */}
                  <span className={cn(
                    'text-[11px] leading-relaxed',
                    entry.type === 'error' ? 'text-red-400' :
                    entry.type === 'success' ? 'text-emerald-400' :
                    entry.type === 'decision' ? 'text-purple-400' :
                    entry.type === 'goal' ? 'text-pi-accent' :
                    'text-pi-text-dim'
                  )}>
                    {entry.message}
                  </span>
                </motion.div>
              )
            })
          )}
        </div>
      </div>

      {/* Status footer */}
      <div className="px-4 py-2 border-t border-pi-border bg-pi-panel/50 flex items-center gap-2">
        <Brain className={cn(
          'w-3.5 h-3.5 transition-colors',
          agentStatus === 'thinking' ? 'text-purple-500 animate-pulse' :
          agentStatus === 'executing' ? 'text-yellow-500' :
          agentStatus === 'error' ? 'text-red-500' :
          'text-pi-text-dim/20'
        )} />
        <span className={cn('text-[11px]', statusMessages[agentStatus].color)}>
          {agentStatus === 'thinking' ? (
            <span className="shimmer-text">{statusMessages[agentStatus].label}</span>
          ) : (
            statusMessages[agentStatus].label
          )}
        </span>
        {agentStatus === 'executing' && (
          <div className="ml-auto relative h-1 w-20 bg-pi-border/30 rounded-full overflow-hidden">
            <div className="indeterminate-bar" />
          </div>
        )}
      </div>
    </div>
  )
}
