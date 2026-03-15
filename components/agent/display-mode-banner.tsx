'use client'

import { Cpu, Gauge, MonitorOff } from 'lucide-react'
import type { DisplayModeSnapshot } from '@/lib/brain/domain-types'

export function DisplayModeBanner({ displayMode }: { displayMode: DisplayModeSnapshot | null }) {
  if (!displayMode || displayMode.mode !== 'standby') return null

  return (
    <div className="border-b border-amber-500/30 bg-[linear-gradient(90deg,rgba(245,158,11,0.18),rgba(245,158,11,0.08))] px-4 py-2.5">
      <div className="flex flex-wrap items-center gap-2 text-[11px] text-amber-50">
        <span className="inline-flex items-center gap-1 rounded-full border border-amber-400/40 bg-amber-500/20 px-2.5 py-1 font-semibold uppercase tracking-[0.14em] text-amber-100">
          <MonitorOff className="h-3 w-3" />
          Heavy Task Mode
        </span>
        <span className="font-medium text-white/90">{displayMode.reason}</span>
        {displayMode.missionTitle && (
          <span className="inline-flex items-center gap-1 text-amber-100">
            <Gauge className="h-3 w-3" />
            {displayMode.missionTitle}
          </span>
        )}
        {displayMode.detail && (
          <span className="inline-flex items-center gap-1 text-amber-50/90">
            <Cpu className="h-3 w-3" />
            {displayMode.detail}
          </span>
        )}
      </div>
    </div>
  )
}
