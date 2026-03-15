'use client'

import { AlertTriangle, Brain, CheckCircle2, Wrench } from 'lucide-react'
import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'
import type { AutomationEvent } from '@/lib/brain/domain-types'

const eventIcon = {
  thinking: Brain,
  action: Wrench,
  result: CheckCircle2,
  warning: AlertTriangle,
} satisfies Record<AutomationEvent['tone'], React.ElementType>

const eventTone = {
  thinking: 'text-cyan-400 border-cyan-500/20 bg-cyan-500/8',
  action: 'text-pi-accent border-pi-accent/20 bg-pi-accent/8',
  result: 'text-emerald-400 border-emerald-500/20 bg-emerald-500/8',
  warning: 'text-red-400 border-red-500/20 bg-red-500/8',
} satisfies Record<AutomationEvent['tone'], string>

export function AutomationTimeline({ events }: { events: AutomationEvent[] }) {
  if (events.length === 0) {
    return <p className="text-[11px] italic text-pi-text-dim">No background events yet</p>
  }

  return (
    <div className="space-y-2">
      {events.map((event, index) => {
        const Icon = eventIcon[event.tone]
        return (
          <motion.div
            key={event.id}
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: index * 0.03 }}
            className="flex gap-2"
          >
            <div className="flex flex-col items-center">
              <div className={cn('rounded-full border p-1.5', eventTone[event.tone])}>
                <Icon className="h-3 w-3" />
              </div>
              {index !== events.length - 1 && <div className="mt-1 h-full w-px bg-pi-border/60" />}
            </div>
            <div className="min-w-0 flex-1 pb-2">
              <p className="text-[11px] leading-snug text-pi-text">{event.label}</p>
              <p className="mt-0.5 text-[9px] uppercase tracking-[0.14em] text-pi-text-dim">{event.at}</p>
            </div>
          </motion.div>
        )
      })}
    </div>
  )
}
