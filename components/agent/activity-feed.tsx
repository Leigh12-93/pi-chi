'use client'

import { useRef, useEffect } from 'react'
import {
  Brain, Cpu, Target, Zap, AlertTriangle,
  CheckCircle2, Activity, Wifi,
} from 'lucide-react'
import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'
import type { ActivityEntry, AgentStatus } from '@/lib/agent-types'

interface ActivityFeedProps {
  entries: ActivityEntry[]
  agentStatus: AgentStatus
}

function getActivityIcon(type: ActivityEntry['type']) {
  switch (type) {
    case 'system': return <Cpu className="w-3 h-3 text-cyan-500" />
    case 'goal': return <Target className="w-3 h-3 text-pi-accent" />
    case 'action': return <Zap className="w-3 h-3 text-yellow-500" />
    case 'decision': return <Brain className="w-3 h-3 text-purple-500" />
    case 'error': return <AlertTriangle className="w-3 h-3 text-red-500" />
    case 'success': return <CheckCircle2 className="w-3 h-3 text-emerald-500" />
    case 'gpio': return <Activity className="w-3 h-3 text-orange-500" />
    case 'network': return <Wifi className="w-3 h-3 text-blue-500" />
  }
}

function getEntryColor(type: ActivityEntry['type']) {
  switch (type) {
    case 'error': return 'text-red-400'
    case 'success': return 'text-emerald-400'
    case 'decision': return 'text-purple-400'
    case 'goal': return 'text-pi-accent'
    case 'gpio': return 'text-orange-400'
    default: return 'text-pi-text-dim'
  }
}

const statusLabel: Record<AgentStatus, string> = {
  idle: 'Awaiting next action...',
  thinking: 'Evaluating next action...',
  executing: 'Executing tool...',
  error: 'Encountered an error',
}

export function ActivityFeed({ entries, agentStatus }: ActivityFeedProps) {
  const scrollRef = useRef<HTMLDivElement>(null)

  // Auto-scroll to bottom when new entries arrive
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [entries.length])

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-pi-border bg-pi-panel px-4 py-2.5">
        <div className="flex items-center gap-2">
          <Activity className="w-3.5 h-3.5 text-pi-accent" />
          <span className="text-xs font-semibold text-pi-text">Activity</span>
        </div>
        <div className="flex items-center gap-2 text-[10px] text-pi-text-dim">
          <span className="flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            Live
          </span>
        </div>
      </div>

      {/* Entries */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        <div className="px-4 py-3 space-y-0.5">
          {entries.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-pi-text-dim">
              <Activity className="w-8 h-8 mb-2 opacity-30" />
              <p className="text-xs">No activity yet</p>
              <p className="text-[10px] mt-1">Actions will appear here as the AI operates</p>
            </div>
          ) : (
            entries.map((entry, i) => (
              <motion.div
                key={entry.id}
                initial={i > entries.length - 3 ? { opacity: 0, x: 8 } : false}
                animate={{ opacity: 1, x: 0 }}
                className="flex items-start gap-2.5 py-1.5 group hover:bg-pi-surface/30 -mx-2 px-2 rounded transition-colors"
              >
                <span className="mt-0.5 shrink-0">{getActivityIcon(entry.type)}</span>
                <span className="text-[10px] text-pi-text-dim/50 font-mono shrink-0 mt-px">
                  {entry.time}
                </span>
                <span className={cn('text-[11px] leading-relaxed', getEntryColor(entry.type))}>
                  {entry.message}
                </span>
              </motion.div>
            ))
          )}
        </div>
      </div>

      {/* Thinking indicator */}
      <div className="px-4 py-2 border-t border-pi-border bg-pi-panel/50 flex items-center gap-2">
        <Brain className={cn(
          'w-3.5 h-3.5',
          agentStatus === 'thinking' ? 'text-purple-500 animate-pulse' :
          agentStatus === 'executing' ? 'text-yellow-500' :
          agentStatus === 'error' ? 'text-red-500' :
          'text-pi-text-dim/30'
        )} />
        <span className={cn(
          'text-[11px]',
          agentStatus === 'thinking' ? 'text-pi-text-dim shimmer-text' :
          agentStatus === 'error' ? 'text-red-400' :
          'text-pi-text-dim/50'
        )}>
          {statusLabel[agentStatus]}
        </span>
      </div>
    </div>
  )
}
