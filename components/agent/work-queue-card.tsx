'use client'

import { ArrowRight, CircleDashed, Clock3, PauseCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { WorkQueueItem } from '@/lib/brain/domain-types'

const queueTone: Record<WorkQueueItem['status'], string> = {
  now: 'border-pi-accent/30 bg-pi-accent/10 text-pi-accent',
  next: 'border-emerald-500/20 bg-emerald-500/10 text-emerald-400',
  queued: 'border-pi-border bg-pi-surface/40 text-pi-text-dim',
  blocked: 'border-red-500/20 bg-red-500/10 text-red-400',
}

const queueIcon = {
  now: ArrowRight,
  next: Clock3,
  queued: CircleDashed,
  blocked: PauseCircle,
} satisfies Record<WorkQueueItem['status'], React.ElementType>

export function WorkQueueCard({ items }: { items: WorkQueueItem[] }) {
  if (items.length === 0) {
    return <p className="text-[11px] italic text-pi-text-dim">No queued work</p>
  }

  return (
    <div className="space-y-2">
      {items.map(item => {
        const Icon = queueIcon[item.status]
        return (
          <div key={item.id} className={cn('flex items-start gap-2 rounded-xl border px-2.5 py-2', queueTone[item.status])}>
            <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <div className="min-w-0">
              <p className="text-[9px] font-semibold uppercase tracking-[0.16em]">{item.status}</p>
              <p className="mt-0.5 text-[11px] leading-snug">{item.label}</p>
            </div>
          </div>
        )
      })}
    </div>
  )
}
