'use client'

import { useState, useMemo } from 'react'
import { Brain, ChevronRight, CheckCircle, Circle, Loader2 } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '@/lib/utils'

/** Estimate thinking duration from plan length (rough heuristic) */
function estimateDuration(text: string): string {
  const words = text.trim().split(/\s+/).length
  const seconds = Math.max(1, Math.round(words / 80))
  return `${seconds}s`
}

interface ThinkPanelProps {
  plan: string
  files: string[]
  /** Set of file paths that have been written/edited after this think call */
  completedFiles?: Set<string>
  /** Whether the AI is still actively working (streaming) */
  isStreaming?: boolean
}

export function ThinkPanel({ plan, files, completedFiles, isStreaming }: ThinkPanelProps) {
  const [expanded, setExpanded] = useState(false)
  const rawPlan = String(plan || '')
  const planText = rawPlan.slice(0, 1200)
  const isTruncated = rawPlan.length > 1200
  const duration = useMemo(() => estimateDuration(rawPlan), [rawPlan])

  const done = files.filter(f => completedFiles?.has(f)).length
  const total = files.length
  const pct = total > 0 ? Math.round((done / total) * 100) : 0
  const allDone = done === total && total > 0

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
          {allDone ? 'Plan complete' : isStreaming && total > 0 ? `Building... ${done}/${total}` : `Thought for ${duration}`}
        </span>
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
