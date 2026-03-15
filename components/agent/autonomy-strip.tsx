'use client'

import { Activity, ArrowRight, BrainCircuit, Clock3 } from 'lucide-react'
import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'
import type { DashboardSummary } from '@/lib/brain/domain-types'

export function AutonomyStrip({ summary, className }: { summary: DashboardSummary; className?: string }) {
  return (
    <div className={cn('border-b border-pi-border bg-pi-panel/70 px-4 py-2.5 backdrop-blur-sm', className)}>
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div className="flex min-w-0 items-start gap-2">
          <motion.div
            animate={summary.cyclePhase === 'executing' || summary.cyclePhase === 'responding' ? { scale: [1, 1.08, 1] } : undefined}
            transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
            className="mt-0.5 rounded-xl border border-pi-accent/20 bg-pi-accent/10 p-2"
          >
            <BrainCircuit className="h-3.5 w-3.5 text-pi-accent" />
          </motion.div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-pi-accent">Autonomy</span>
              <span className="rounded-full border border-pi-border bg-pi-surface/50 px-2 py-0.5 text-[9px] text-pi-text-dim">
                {summary.cyclePhase}
              </span>
            </div>
            <p className="mt-1 truncate text-[12px] font-semibold text-pi-text">{summary.nowDoing}</p>
            {summary.autonomyReason && (
              <p className="mt-0.5 line-clamp-1 text-[10px] text-pi-text-dim">Why: {summary.autonomyReason}</p>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 md:justify-end">
          {summary.currentMission && (
            <span className="inline-flex items-center gap-1 rounded-full border border-pi-border bg-pi-surface/40 px-2 py-1 text-[10px] text-pi-text-dim">
              <Activity className="h-3 w-3 text-pi-accent" />
              {summary.currentMission.title}
            </span>
          )}
          {summary.nextUp && (
            <span className="inline-flex items-center gap-1 rounded-full border border-pi-border bg-pi-surface/40 px-2 py-1 text-[10px] text-pi-text-dim">
              <ArrowRight className="h-3 w-3 text-emerald-400" />
              Next: {summary.nextUp}
            </span>
          )}
          {summary.lastCycle && (
            <span className="inline-flex items-center gap-1 rounded-full border border-pi-border bg-pi-surface/40 px-2 py-1 text-[10px] text-pi-text-dim">
              <Clock3 className="h-3 w-3 text-yellow-400" />
              Last cycle: {summary.lastCycle.outcome}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
