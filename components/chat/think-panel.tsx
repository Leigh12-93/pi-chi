'use client'

import { useState } from 'react'
import { Brain, ChevronRight } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '@/lib/utils'

export function ThinkPanel({ plan, files }: { plan: string; files: string[] }) {
  const [expanded, setExpanded] = useState(false)
  const rawPlan = String(plan || '')
  const planText = rawPlan.slice(0, 500)
  const isTruncated = rawPlan.length > 500

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className="rounded-xl border border-forge-border border-l-2 border-l-purple-400 dark:border-l-purple-500 overflow-hidden"
    >
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 w-full px-3 py-2 text-[12px] hover:bg-forge-surface-hover transition-colors"
      >
        <div className="relative">
          <Brain className="w-3.5 h-3.5 text-purple-500 dark:text-purple-400 shrink-0 relative z-10" />
          {!expanded && <div className="absolute inset-0 -m-1 rounded-full bg-purple-400/15 dark:bg-purple-500/15 animate-pulse-dot" />}
        </div>
        <span className="flex-1 text-left text-forge-text-dim font-medium">Thinking</span>
        <ChevronRight className={cn('w-3 h-3 text-forge-text-dim/50 transition-transform duration-200', expanded && 'rotate-90')} />
      </button>
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="overflow-hidden"
          >
            <div className="border-t border-forge-border px-3.5 py-2.5">
              <p className="text-[12px] text-forge-text-dim leading-relaxed whitespace-pre-wrap">{planText}{isTruncated && <span className="text-forge-text-dim/50">... (truncated)</span>}</p>
              {files.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {files.map((f: string, fi: number) => (
                    <span key={fi} className="px-1.5 py-0.5 bg-forge-surface text-forge-text-dim rounded text-[10px] font-mono">{f}</span>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}
