'use client'

import { useState, useMemo } from 'react'
import {
  Microscope, ChevronDown, ChevronRight,
  CheckCircle2, Circle, XCircle, Play, Pause, BookCheck,
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '@/lib/utils'
import type { ResearchThread } from '@/lib/brain/brain-types'

interface ResearchThreadsPanelProps {
  threads: ResearchThread[]
  className?: string
}

type StatusFilter = 'all' | 'active' | 'paused' | 'concluded'

const statusBadge: Record<string, { color: string; icon: React.ElementType }> = {
  active: { color: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20', icon: Play },
  paused: { color: 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20', icon: Pause },
  concluded: { color: 'bg-blue-500/10 text-blue-500 border-blue-500/20', icon: BookCheck },
}

const stepStatusIcon: Record<string, React.ReactNode> = {
  done: <CheckCircle2 className="w-3 h-3 text-emerald-500 shrink-0" />,
  pending: <Circle className="w-3 h-3 text-pi-text-dim/30 shrink-0" />,
  failed: <XCircle className="w-3 h-3 text-red-500 shrink-0" />,
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

export function ResearchThreadsPanel({ threads, className }: ResearchThreadsPanelProps) {
  const [filter, setFilter] = useState<StatusFilter>('all')
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const filtered = useMemo(() => {
    if (filter === 'all') return threads
    return threads.filter(t => t.status === filter)
  }, [threads, filter])

  return (
    <div className={cn('h-full flex flex-col', className)}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-pi-border bg-pi-panel/80 backdrop-blur-sm">
        <div className="flex items-center gap-2">
          <Microscope className="w-3.5 h-3.5 text-pi-accent" />
          <span className="text-xs font-bold text-pi-text">Research</span>
          <span className="text-[10px] text-pi-text-dim bg-pi-surface px-1.5 py-0.5 rounded-full font-mono">
            {threads.length}
          </span>
        </div>

        {/* Filter chips */}
        <div className="flex items-center gap-1">
          {(['all', 'active', 'paused', 'concluded'] as StatusFilter[]).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={cn(
                'text-[9px] px-2 py-0.5 rounded-full font-medium transition-all capitalize',
                filter === f
                  ? 'bg-pi-accent/10 text-pi-accent border border-pi-accent/30'
                  : 'text-pi-text-dim hover:text-pi-text hover:bg-pi-surface'
              )}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {/* Threads list */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {filtered.length === 0 ? (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col items-center justify-center py-12 text-pi-text-dim"
          >
            <Microscope className="w-10 h-10 mb-3 opacity-15" />
            <p className="text-xs font-medium">
              {threads.length === 0 ? 'No research threads yet' : `No ${filter} threads`}
            </p>
            <p className="text-[10px] mt-1 text-center max-w-[200px]">
              Multi-cycle investigations will appear here as the brain explores topics.
            </p>
          </motion.div>
        ) : (
          <AnimatePresence>
            {filtered.map((thread, i) => {
              const isExpanded = expandedId === thread.id
              const badge = statusBadge[thread.status] || statusBadge.active
              const BadgeIcon = badge.icon
              const doneSteps = thread.steps.filter(s => s.status === 'done').length
              const totalSteps = thread.steps.length

              return (
                <motion.div
                  key={thread.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ delay: i * 0.03, type: 'spring', stiffness: 400, damping: 25 }}
                  className={cn(
                    'border border-pi-border rounded-lg bg-pi-surface/50 transition-all',
                    thread.status === 'active' && 'ring-1 ring-emerald-500/20'
                  )}
                >
                  {/* Collapsed header */}
                  <button
                    onClick={() => setExpandedId(isExpanded ? null : thread.id)}
                    className="w-full flex items-start gap-2 p-3 text-left hover:bg-pi-surface-hover/50 transition-colors rounded-lg"
                  >
                    {isExpanded
                      ? <ChevronDown className="w-3 h-3 text-pi-text-dim mt-0.5 shrink-0" />
                      : <ChevronRight className="w-3 h-3 text-pi-text-dim mt-0.5 shrink-0" />
                    }
                    <div className="flex-1 min-w-0">
                      <p className="text-[11px] font-semibold text-pi-text leading-tight">{thread.title}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className={cn(
                          'inline-flex items-center gap-1 text-[8px] px-1.5 py-px rounded-full font-medium border',
                          badge.color
                        )}>
                          <BadgeIcon className="w-2 h-2" />
                          {thread.status}
                        </span>
                        {totalSteps > 0 && (
                          <span className="text-[9px] text-pi-text-dim font-mono">
                            {doneSteps}/{totalSteps} steps
                          </span>
                        )}
                        <span className="text-[9px] text-pi-text-dim/40 font-mono">
                          {formatRelativeTime(thread.updatedAt)}
                        </span>
                      </div>
                    </div>
                  </button>

                  {/* Expanded content */}
                  <AnimatePresence>
                    {isExpanded && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="overflow-hidden"
                      >
                        <div className="px-3 pb-3 border-t border-pi-border/50 pt-2 mx-3 space-y-3">
                          {/* Hypothesis */}
                          <div>
                            <p className="text-[9px] text-pi-text-dim uppercase tracking-wider font-medium mb-1">Hypothesis</p>
                            <p className="text-[10px] text-pi-text italic leading-relaxed">{thread.hypothesis}</p>
                          </div>

                          {/* Steps */}
                          {thread.steps.length > 0 && (
                            <div>
                              <p className="text-[9px] text-pi-text-dim uppercase tracking-wider font-medium mb-1.5">Steps</p>
                              <div className="space-y-1">
                                {thread.steps.map(step => (
                                  <div key={step.id} className="flex items-start gap-2 py-0.5">
                                    {stepStatusIcon[step.status] || stepStatusIcon.pending}
                                    <div className="min-w-0">
                                      <p className={cn(
                                        'text-[10px]',
                                        step.status === 'done' ? 'text-pi-text-dim line-through' :
                                        step.status === 'failed' ? 'text-red-400' : 'text-pi-text-dim'
                                      )}>
                                        {step.description}
                                      </p>
                                      {step.result && (
                                        <p className="text-[9px] text-pi-text-dim/60 mt-0.5">{step.result}</p>
                                      )}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Findings */}
                          {thread.findings.length > 0 && (
                            <div>
                              <p className="text-[9px] text-pi-text-dim uppercase tracking-wider font-medium mb-1.5">Findings</p>
                              <ul className="space-y-1">
                                {thread.findings.map((finding, fi) => (
                                  <li key={fi} className="text-[10px] text-pi-text-dim leading-relaxed flex items-start gap-1.5">
                                    <span className="text-pi-accent mt-0.5 shrink-0">•</span>
                                    {finding}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}

                          {/* Timestamps */}
                          <div className="flex items-center gap-3 text-[9px] text-pi-text-dim/40 font-mono">
                            <span>Created: {formatRelativeTime(thread.createdAt)}</span>
                            <span>Updated: {formatRelativeTime(thread.updatedAt)}</span>
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              )
            })}
          </AnimatePresence>
        )}
      </div>
    </div>
  )
}
