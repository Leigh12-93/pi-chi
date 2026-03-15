'use client'

import { Target, Zap, Search, Rocket, Wrench, Sparkles } from 'lucide-react'
import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'
import type { Mission } from '@/lib/brain/domain-types'

interface CurrentMissionCardProps {
  mission: Mission | null
  nowDoing: string
  cyclePhase?: 'idle' | 'planning' | 'executing' | 'responding' | 'sleeping' | 'offline' | 'error'
  lastEventLabel?: string | null
  autonomyReason?: string | null
  nextUp?: string | null
}

const missionIcons: Record<Mission['type'], React.ElementType> = {
  maintain: Wrench,
  grow: Zap,
  explore: Search,
  launch: Rocket,
  'self-improve': Sparkles,
}

const missionLabels: Record<Mission['type'], string> = {
  maintain: 'Maintaining',
  grow: 'Growing',
  explore: 'Exploring',
  launch: 'Launching',
  'self-improve': 'Improving',
}

const phaseTone: Record<NonNullable<CurrentMissionCardProps['cyclePhase']>, string> = {
  idle: 'text-pi-text-dim bg-pi-surface/60 border-pi-border',
  planning: 'text-cyan-400 bg-cyan-500/10 border-cyan-500/20',
  executing: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
  responding: 'text-pi-accent bg-pi-accent/10 border-pi-accent/20',
  sleeping: 'text-yellow-400 bg-yellow-500/10 border-yellow-500/20',
  offline: 'text-gray-400 bg-gray-500/10 border-gray-500/20',
  error: 'text-red-400 bg-red-500/10 border-red-500/20',
}

export function CurrentMissionCard({
  mission, nowDoing, cyclePhase = 'idle', lastEventLabel, autonomyReason, nextUp,
}: CurrentMissionCardProps) {
  if (!mission) {
    return (
      <div className="px-3 py-3">
        <p className="text-[11px] text-pi-text-dim italic">No active mission</p>
        {nowDoing && (
          <p className="text-[11px] text-pi-text mt-1">{nowDoing}</p>
        )}
        {lastEventLabel && (
          <p className="mt-2 text-[10px] text-pi-text-dim">Latest: {lastEventLabel}</p>
        )}
        {autonomyReason && (
          <p className="mt-1 text-[10px] text-pi-text-dim">Why: {autonomyReason}</p>
        )}
      </div>
    )
  }

  const Icon = missionIcons[mission.type] || Target

  return (
    <div className="px-3 py-3 space-y-2 alive-panel">
      <div className="flex items-start gap-2">
        <motion.div
          animate={cyclePhase === 'executing' || cyclePhase === 'responding' ? { scale: [1, 1.1, 1] } : undefined}
          transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
          className={cn(
            'w-7 h-7 rounded-lg flex items-center justify-center shrink-0',
            'bg-pi-accent/10 border border-pi-accent/20'
          )}
        >
          <Icon className="w-3.5 h-3.5 text-pi-accent" />
        </motion.div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="mission-badge" data-type={mission.type}>
              {missionLabels[mission.type]}
            </span>
            <span className={cn('inline-flex items-center rounded-full border px-1.5 py-px text-[8px] font-semibold', phaseTone[cyclePhase])}>
              {cyclePhase}
            </span>
            {mission.status === 'blocked' && (
              <span className="text-[8px] px-1.5 py-px rounded-full bg-red-500/10 text-red-400 border border-red-500/20 font-semibold">
                Blocked
              </span>
            )}
          </div>
          <p className="text-[12px] font-semibold text-pi-text mt-1 leading-tight">
            {mission.title}
          </p>
        </div>
      </div>

      {/* Now doing */}
      <div className="bg-pi-surface/50 rounded-lg px-2.5 py-1.5 border border-pi-border/50">
        <p className="text-[10px] text-pi-text-dim font-medium">Now</p>
        <p className="text-[11px] text-pi-text leading-snug">{nowDoing || mission.progressLabel}</p>
      </div>
      {autonomyReason && (
        <div className="rounded-lg border border-pi-border/40 bg-pi-bg/40 px-2.5 py-1.5">
          <p className="text-[10px] text-pi-text-dim font-medium">Why this mission</p>
          <p className="text-[10px] text-pi-text-dim leading-snug">{autonomyReason}</p>
        </div>
      )}
      {nextUp && (
        <div className="rounded-lg border border-pi-border/40 bg-pi-bg/40 px-2.5 py-1.5">
          <p className="text-[10px] text-pi-text-dim font-medium">Next</p>
          <p className="text-[10px] text-pi-text-dim leading-snug">{nextUp}</p>
        </div>
      )}
      {lastEventLabel && (
        <div className="rounded-lg border border-pi-border/40 bg-pi-bg/40 px-2.5 py-1.5">
          <p className="text-[10px] text-pi-text-dim font-medium">Latest event</p>
          <p className="text-[10px] text-pi-text-dim leading-snug">{lastEventLabel}</p>
        </div>
      )}
    </div>
  )
}
