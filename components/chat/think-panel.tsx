'use client'

import { useState } from 'react'
import { Brain, ChevronRight } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '@/lib/utils'

export function ThinkPanel({ plan, files }: { plan: string; files: string[] }) {
  const [expanded, setExpanded] = useState(false)
  const rawPlan = String(plan || '')
  const planText = rawPlan.slice(0, 800)
  const isTruncated = rawPlan.length > 800

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className="tool-timeline-item"
    >
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2.5 w-full py-1 text-[13px] hover:opacity-80 transition-opacity"
      >
        <div className="w-5 h-5 rounded-md flex items-center justify-center shrink-0 text-purple-600 bg-purple-50 dark:text-purple-400 dark:bg-purple-950/40">
          <Brain className="w-3 h-3" />
        </div>
        <span className="flex-1 text-left text-forge-text-dim font-medium">Thought</span>
        <ChevronRight className={cn('w-3.5 h-3.5 text-forge-text-dim/40 transition-transform duration-200', expanded && 'rotate-90')} />
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
            <div className="ml-2.5 border-l border-forge-border/50 pl-5 py-2 space-y-2">
              <p className="text-[12.5px] text-forge-text-dim/70 leading-relaxed whitespace-pre-wrap">{planText}{isTruncated && <span className="text-forge-text-dim/40">... (truncated)</span>}</p>
              {files.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {files.map((f: string, fi: number) => (
                    <span key={fi} className="px-1.5 py-0.5 bg-forge-surface text-forge-text-dim/60 rounded-md text-[10.5px] font-mono border border-forge-border/30">{f}</span>
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
