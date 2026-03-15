'use client'

import { Cpu, Gauge, MonitorOff } from 'lucide-react'
import type { DisplayModeSnapshot } from '@/lib/brain/domain-types'

export function DisplayModeBanner({ displayMode }: { displayMode: DisplayModeSnapshot | null }) {
  if (!displayMode || displayMode.mode !== 'standby') return null

  return (
    <div className="border-b border-amber-500/40 bg-[linear-gradient(90deg,rgba(245,158,11,0.25),rgba(245,158,11,0.12))] px-4 py-2.5">
      <div className="flex flex-wrap items-center gap-2.5 text-[11px]">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-400/60 bg-amber-500/30 px-2.5 py-1 font-bold uppercase tracking-[0.14em] text-amber-200 shadow-[0_0_8px_rgba(245,158,11,0.15)]">
          <MonitorOff className="h-3 w-3" />
          Heavy Task Mode
        </span>
        <span className="font-semibold text-white">{displayMode.reason}</span>
        {displayMode.missionTitle && (
          <span className="inline-flex items-center gap-1 font-medium text-amber-200">
            <Gauge className="h-3 w-3" />
            {displayMode.missionTitle}
          </span>
        )}
        {displayMode.detail && (
          <span className="inline-flex items-center gap-1 text-amber-100">
            <Cpu className="h-3 w-3" />
            {displayMode.detail}
          </span>
        )}
      </div>
    </div>
  )
}
