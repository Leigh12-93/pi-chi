'use client'

import { useState, useMemo } from 'react'
import { Brain, ChevronRight, CheckCircle, Circle, AlertTriangle, AlertCircle, Database, Layers, Server, ShieldAlert } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '@/lib/utils'

/** Estimate thinking duration from plan length (rough heuristic) */
function estimateDuration(text: string): string {
  const words = text.trim().split(/\s+/).length
  const seconds = Math.max(1, Math.round(words / 80))
  return `${seconds}s`
}

export interface ThinkPanelProps {
  plan: string
  files: string[]
  /** Set of file paths that have been written/edited after this think call */
  completedFiles?: Set<string>
  /** Whether the AI is still actively working (streaming) */
  isStreaming?: boolean
  /** Architecture fields from the think tool result */
  architecture?: {
    dataModel?: string | null
    stateManagement?: string | null
    apiContracts?: string | null
    errorStrategy?: string | null
  }
  /** Validation warnings from the think tool */
  warnings?: string[]
  /** Confidence in approach (0-100) */
  confidence?: number | null
  /** What would reduce uncertainty */
  uncertainties?: string[]
  /** The assumption most likely to be wrong */
  fragileAssumption?: string | null
}

const ARCH_SECTIONS = [
  { key: 'dataModel' as const, label: 'Data Model', Icon: Database },
  { key: 'stateManagement' as const, label: 'State', Icon: Layers },
  { key: 'apiContracts' as const, label: 'API', Icon: Server },
  { key: 'errorStrategy' as const, label: 'Error Handling', Icon: ShieldAlert },
]

function ConfidenceRing({ value }: { value: number }) {
  const radius = 12
  const circumference = 2 * Math.PI * radius
  const offset = circumference - (value / 100) * circumference
  const color = value >= 80 ? 'text-emerald-500' : value >= 50 ? 'text-amber-500' : 'text-red-500'
  return (
    <div className="relative w-7 h-7 shrink-0" title={`${value}% confidence`}>
      <svg className="w-7 h-7 -rotate-90" viewBox="0 0 28 28">
        <circle cx="14" cy="14" r={radius} fill="none" stroke="currentColor" strokeWidth="2" className="text-forge-border/30" />
        <circle cx="14" cy="14" r={radius} fill="none" stroke="currentColor" strokeWidth="2" strokeDasharray={circumference} strokeDashoffset={offset} strokeLinecap="round" className={color} />
      </svg>
      <span className={cn('absolute inset-0 flex items-center justify-center text-[9px] font-bold tabular-nums', color)}>
        {value}
      </span>
    </div>
  )
}

export function ThinkPanel({ plan, files, completedFiles, isStreaming, architecture, warnings, confidence, uncertainties, fragileAssumption }: ThinkPanelProps) {
  const [expanded, setExpanded] = useState(false)
  const rawPlan = String(plan || '')
  const planText = rawPlan.slice(0, 1200)
  const isTruncated = rawPlan.length > 1200
  const duration = useMemo(() => estimateDuration(rawPlan), [rawPlan])

  const done = files.filter(f => completedFiles?.has(f)).length
  const total = files.length
  const pct = total > 0 ? Math.round((done / total) * 100) : 0
  const allDone = done === total && total > 0

  const hasArchitecture = architecture && Object.values(architecture).some(v => v)

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className="tool-timeline-item"
    >
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2.5 w-full py-1 text-[13px] hover:opacity-80 transition-opacity group/think"
      >
        <div className={cn(
          'w-5 h-5 rounded-md flex items-center justify-center shrink-0',
          allDone
            ? 'text-emerald-600 bg-emerald-50 dark:text-emerald-400 dark:bg-emerald-950/40'
            : 'text-purple-600 bg-purple-50 dark:text-purple-400 dark:bg-purple-950/40',
        )}>
          {allDone ? <CheckCircle className="w-3 h-3" /> : <Brain className="w-3 h-3" />}
        </div>
        <span className="flex-1 text-left text-forge-text-dim font-medium">
          {allDone ? 'Plan complete' : isStreaming && total > 0 ? `Building... ${done}/${total}` : hasArchitecture ? 'Architecture planned' : `Thought for ${duration}`}
        </span>
        {confidence != null && confidence > 0 && (
          <ConfidenceRing value={confidence} />
        )}
        {total > 0 && (
          <span className="text-[11px] text-forge-text-dim/40 font-mono tabular-nums mr-1">
            {done}/{total}
          </span>
        )}
        <ChevronRight className={cn('w-3.5 h-3.5 text-forge-text-dim/40 transition-transform duration-200', expanded && 'rotate-90')} />
      </button>

      {/* Progress bar (always visible when files exist) */}
      {total > 0 && (
        <div className="h-[2px] bg-forge-border/20 rounded-full mx-0.5 mt-0.5 overflow-hidden">
          <motion.div
            className={cn('h-full rounded-full', allDone ? 'bg-emerald-500' : 'bg-forge-accent')}
            initial={{ width: 0 }}
            animate={{ width: `${pct}%` }}
            transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
          />
        </div>
      )}

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="overflow-hidden"
          >
            <div className="ml-2.5 border-l border-forge-border/40 pl-4 py-2 space-y-2">
              {/* Architecture sections */}
              {hasArchitecture && (
                <div className="space-y-1.5 pb-1.5 border-b border-forge-border/20">
                  {ARCH_SECTIONS.map(({ key, label, Icon }) => {
                    const value = architecture[key]
                    if (!value) return null
                    return (
                      <div key={key}>
                        <div className="flex items-center gap-1.5 mb-0.5">
                          <Icon className="w-3 h-3 text-forge-text-dim/50" />
                          <span className="text-[11px] font-medium text-forge-text-dim/60 uppercase tracking-wide">{label}</span>
                        </div>
                        <p className="text-[12px] text-forge-text-dim/70 leading-relaxed whitespace-pre-wrap pl-[18px]">{value}</p>
                      </div>
                    )
                  })}
                </div>
              )}

              {/* Warnings */}
              {warnings && warnings.length > 0 && (
                <div className="space-y-0.5 pb-1.5">
                  {warnings.map((w, i) => (
                    <div key={i} className="flex items-start gap-1.5">
                      <AlertTriangle className="w-3 h-3 text-amber-500 shrink-0 mt-0.5" />
                      <span className="text-[11.5px] text-amber-600 dark:text-amber-400">{w}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Uncertainties */}
              {uncertainties && uncertainties.length > 0 && (
                <div className="space-y-0.5 pb-1.5">
                  {uncertainties.map((u, i) => (
                    <div key={i} className="flex items-start gap-1.5">
                      <AlertCircle className="w-3 h-3 text-amber-500 shrink-0 mt-0.5" />
                      <span className="text-[11.5px] text-amber-600 dark:text-amber-400">{u}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Fragile assumption */}
              {fragileAssumption && (
                <div className="px-2.5 py-1.5 rounded-lg bg-red-950/10 border border-red-500/15">
                  <span className="text-[11px] text-red-400 font-medium">Most likely wrong: </span>
                  <span className="text-[11.5px] text-red-300/70">{fragileAssumption}</span>
                </div>
              )}

              <p className="text-[12.5px] text-forge-text-dim/70 leading-relaxed whitespace-pre-wrap">
                {planText}
                {isTruncated && <span className="text-forge-text-dim/40">{'...'} (truncated)</span>}
              </p>
              {files.length > 0 && (
                <div className="space-y-0.5">
                  {files.map((f: string, fi: number) => {
                    const isDone = completedFiles?.has(f)
                    return (
                      <div key={fi} className="flex items-center gap-1.5">
                        {isDone ? (
                          <CheckCircle className="w-3 h-3 text-emerald-500 shrink-0" />
                        ) : isStreaming ? (
                          <Circle className="w-3 h-3 text-forge-text-dim/30 shrink-0" />
                        ) : (
                          <Circle className="w-3 h-3 text-forge-text-dim/20 shrink-0" />
                        )}
                        <span className={cn(
                          'text-[11px] font-mono',
                          isDone ? 'text-forge-text-dim/50 line-through' : 'text-forge-text-dim/70',
                        )}>
                          {f}
                        </span>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}
