'use client'

import { useRef, useEffect, useMemo } from 'react'
import {
  Brain, Cpu, Target, Zap, AlertTriangle,
  CheckCircle2, Activity, Wifi,
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

/* ─── Component ─────────────────────────────────── */

export function ActivityFeed({ entries, agentStatus }: ActivityFeedProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const prevLenRef = useRef(0)

  // Auto-scroll on new entries
  useEffect(() => {
    if (entries.length > prevLenRef.current && scrollRef.current) {
      requestAnimationFrame(() => {
        scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
      })
    }
    prevLenRef.current = entries.length
  }, [entries.length])

  // Count by type
  const typeCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    entries.forEach(e => { counts[e.type] = (counts[e.type] || 0) + 1 })
    return counts
  }, [entries])

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-pi-border bg-pi-panel/80 backdrop-blur-sm px-4 py-2.5">
        <div className="flex items-center gap-2">
          <Activity className="w-3.5 h-3.5 text-pi-accent" />
          <span className="text-xs font-bold text-pi-text">Activity</span>
          <span className="text-[10px] text-pi-text-dim font-mono bg-pi-surface px-1.5 py-0.5 rounded-full">
            {entries.length}
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
          <span className="flex items-center gap-1 text-[10px] text-pi-text-dim">
            <motion.span
              animate={{ opacity: [0.4, 1, 0.4] }}
              transition={{ duration: 2, repeat: Infinity }}
              className="w-1.5 h-1.5 rounded-full bg-emerald-500"
            />
            Live
          </span>
        </div>
      </div>

      {/* Entries */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        <div className="px-3 py-2 space-y-px">
          {entries.length === 0 ? (
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
              <p className="text-xs font-medium">No activity yet</p>
              <p className="text-[10px] mt-1 text-center max-w-[200px]">
                Actions will appear here as the brain operates.
              </p>
            </motion.div>
          ) : (
            entries.map((entry, i) => {
              const { icon: Icon, color } = activityIcons[entry.type] || activityIcons.action
              const isRecent = i >= entries.length - 3

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
