'use client'

import { Clock3 } from 'lucide-react'
import type { CycleSummary } from '@/lib/brain/domain-types'

export function RecentCyclesList({ cycles }: { cycles: CycleSummary[] }) {
  if (cycles.length === 0) {
    return <p className="text-[11px] italic text-pi-text-dim">No cycle history yet</p>
  }

  return (
    <div className="space-y-2">
      {cycles.map((cycle, index) => (
        <div key={cycle.id} className="rounded-xl border border-pi-border bg-pi-surface/30 px-3 py-2.5">
          <div className="flex items-center gap-1.5">
            <Clock3 className="h-3 w-3 text-pi-accent" />
            <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-pi-accent">
              {index === 0 ? 'Current thread' : `Recent cycle ${index}`}
            </span>
          </div>
          <p className="mt-1 text-[11px] font-semibold text-pi-text">{cycle.title}</p>
          <p className="mt-1 text-[10px] leading-snug text-pi-text-dim">{cycle.outcome}</p>
          {cycle.nextStep && (
            <p className="mt-1 text-[10px] text-pi-text-dim">Next: {cycle.nextStep}</p>
          )}
        </div>
      ))}
    </div>
  )
}
