'use client'

import { CheckCircle2, CornerDownRight } from 'lucide-react'
import type { CycleSummary } from '@/lib/brain/domain-types'

export function CycleSummaryCard({ cycle }: { cycle: CycleSummary | null }) {
  if (!cycle) {
    return <p className="text-[11px] italic text-pi-text-dim">No completed cycle summary yet</p>
  }

  return (
    <div className="rounded-xl border border-pi-border bg-pi-surface/35 p-3">
      <div className="flex items-start gap-2">
        <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 p-1.5">
          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
        </div>
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-emerald-400">Completed cycle</p>
          <p className="mt-1 text-[12px] font-semibold text-pi-text">{cycle.title}</p>
          <p className="mt-1 text-[11px] leading-snug text-pi-text-dim">{cycle.outcome}</p>
          {cycle.nextStep && (
            <div className="mt-2 inline-flex items-center gap-1 rounded-full border border-pi-border bg-pi-bg/40 px-2 py-1 text-[10px] text-pi-text-dim">
              <CornerDownRight className="h-3 w-3 text-pi-accent" />
              Next: {cycle.nextStep}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
