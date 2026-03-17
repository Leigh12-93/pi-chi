'use client'

import { Cpu, Gauge, MonitorOff } from 'lucide-react'
import type { DisplayModeSnapshot } from '@/lib/brain/domain-types'

export function DisplayModeBanner({ displayMode }: { displayMode: DisplayModeSnapshot | null }) {
  if (!displayMode || displayMode.mode !== 'standby') return null

  return (
    <div className="border-b-2 border-amber-500/60 bg-gradient-to-r from-amber-950/80 via-amber-900/60 to-amber-950/80 px-4 py-3 backdrop-blur-sm">
      <div className="flex flex-wrap items-center gap-3 text-xs">
        <span className="inline-flex items-center gap-2 rounded-md border border-amber-400/70 bg-amber-500/40 px-3 py-1.5 font-bold uppercase tracking-wider text-amber-100 shadow-[0_0_12px_rgba(245,158,11,0.3),inset_0_1px_0_rgba(255,255,255,0.1)]">
          <MonitorOff className="h-3.5 w-3.5" />
          Heavy Task Mode
        </span>
        <span className="font-semibold text-white/95 drop-shadow-sm">{displayMode.reason}</span>
        {displayMode.missionTitle && (
          <span className="inline-flex items-center gap-1.5 rounded-md bg-amber-800/50 px-2 py-1 font-medium text-amber-100 border border-amber-600/30">
            <Gauge className="h-3 w-3 text-amber-300" />
            {displayMode.missionTitle}
          </span>
        )}
        {displayMode.detail && (
          <span className="inline-flex items-center gap-1.5 text-amber-200/90">
            <Cpu className="h-3 w-3 text-amber-400 animate-pulse" />
            {displayMode.detail}
          </span>
        )}
      </div>
    </div>
  )
}
