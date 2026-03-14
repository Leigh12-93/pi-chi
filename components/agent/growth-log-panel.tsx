'use client'

import { useState, useMemo } from 'react'
import {
  TrendingUp, GraduationCap, Hammer, Search,
  Lightbulb, XCircle,
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '@/lib/utils'
import type { GrowthEntry } from '@/lib/brain/brain-types'

interface GrowthLogPanelProps {
  growthLog: GrowthEntry[]
  className?: string
}

type CategoryFilter = 'all' | 'learned' | 'built' | 'discovered' | 'realized' | 'failed'

const categoryConfig: Record<string, { icon: React.ElementType; color: string; bgColor: string }> = {
  learned: { icon: GraduationCap, color: 'text-purple-500', bgColor: 'bg-purple-500/10' },
  built: { icon: Hammer, color: 'text-emerald-500', bgColor: 'bg-emerald-500/10' },
  discovered: { icon: Search, color: 'text-blue-500', bgColor: 'bg-blue-500/10' },
  realized: { icon: Lightbulb, color: 'text-yellow-500', bgColor: 'bg-yellow-500/10' },
  failed: { icon: XCircle, color: 'text-red-500', bgColor: 'bg-red-500/10' },
}

function formatRelativeTime(dateStr: string): string {
  try {
    const diff = Date.now() - new Date(dateStr).getTime()
    if (diff < 60000) return 'just now'
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`
    return `${Math.floor(diff / 86400000)}d ago`
  } catch { return '' }
}

export function GrowthLogPanel({ growthLog, className }: GrowthLogPanelProps) {
  const [filter, setFilter] = useState<CategoryFilter>('all')

  const filtered = useMemo(() => {
    if (filter === 'all') return growthLog
    return growthLog.filter(e => e.category === filter)
  }, [growthLog, filter])

  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    growthLog.forEach(e => { counts[e.category] = (counts[e.category] || 0) + 1 })
    return counts
  }, [growthLog])

  return (
    <div className={cn('h-full flex flex-col', className)}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-pi-border bg-pi-panel/80 backdrop-blur-sm">
        <div className="flex items-center gap-2">
          <TrendingUp className="w-3.5 h-3.5 text-pi-accent" />
          <span className="text-xs font-bold text-pi-text">Growth</span>
          <span className="text-[10px] text-pi-text-dim bg-pi-surface px-1.5 py-0.5 rounded-full font-mono">
            {growthLog.length}
          </span>
        </div>
      </div>

      {/* Filter chips */}
      <div className="px-3 py-2 border-b border-pi-border/50 flex items-center gap-1 flex-wrap">
        {(['all', 'learned', 'built', 'discovered', 'realized', 'failed'] as CategoryFilter[]).map(f => {
          const cfg = f !== 'all' ? categoryConfig[f] : null
          const Icon = cfg?.icon
          const count = f === 'all' ? growthLog.length : (categoryCounts[f] || 0)
          return (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={cn(
                'flex items-center gap-1 text-[9px] px-2 py-1 rounded-full font-medium transition-all capitalize',
                filter === f
                  ? 'bg-pi-accent/10 text-pi-accent border border-pi-accent/30'
                  : 'text-pi-text-dim hover:text-pi-text hover:bg-pi-surface border border-transparent'
              )}
            >
              {Icon && <Icon className="w-2.5 h-2.5" />}
              {f}
              {count > 0 && (
                <span className="text-[8px] text-pi-text-dim/50 font-mono ml-0.5">{count}</span>
              )}
            </button>
          )
        })}
      </div>

      {/* Timeline */}
      <div className="flex-1 overflow-y-auto p-3">
        {filtered.length === 0 ? (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col items-center justify-center py-12 text-pi-text-dim"
          >
            <TrendingUp className="w-10 h-10 mb-3 opacity-15" />
            <p className="text-xs font-medium">
              {growthLog.length === 0 ? 'Early growth phase' : `No ${filter} entries`}
            </p>
            <p className="text-[10px] mt-1 text-center max-w-[200px]">
              {growthLog.length === 0
                ? 'Every journey starts with a first step. Growth entries will appear as the brain learns and builds.'
                : 'Try a different category filter.'}
            </p>
          </motion.div>
        ) : (
          <div className="relative">
            {/* Timeline line */}
            <div className="absolute left-[11px] top-2 bottom-2 w-px bg-pi-border/50" />

            <div className="space-y-3">
              <AnimatePresence>
                {filtered.map((entry, i) => {
                  const cfg = categoryConfig[entry.category] || categoryConfig.learned
                  const Icon = cfg.icon

                  return (
                    <motion.div
                      key={entry.id}
                      initial={{ opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -20 }}
                      transition={{ delay: i * 0.03, type: 'spring', stiffness: 400, damping: 25 }}
                      className="flex items-start gap-3 relative"
                    >
                      {/* Icon dot */}
                      <div className={cn(
                        'w-6 h-6 rounded-full flex items-center justify-center shrink-0 relative z-10 border border-pi-border',
                        cfg.bgColor
                      )}>
                        <Icon className={cn('w-3 h-3', cfg.color)} />
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0 pb-1">
                        <p className="text-[11px] text-pi-text leading-relaxed">{entry.description}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <span className={cn('text-[8px] px-1.5 py-px rounded-full font-medium capitalize', cfg.bgColor, cfg.color)}>
                            {entry.category}
                          </span>
                          <span className="text-[9px] text-pi-text-dim/40 font-mono">
                            {formatRelativeTime(entry.timestamp)}
                          </span>
                        </div>
                      </div>
                    </motion.div>
                  )
                })}
              </AnimatePresence>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
