'use client'

import { Target, Zap, Search, Rocket, Wrench, Sparkles } from 'lucide-react'
import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'
import type { Mission } from '@/lib/brain/domain-types'

interface CurrentMissionCardProps {
  mission: Mission | null
  nowDoing: string
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

export function CurrentMissionCard({ mission, nowDoing }: CurrentMissionCardProps) {
  if (!mission) {
    return (
      <div className="px-3 py-3">
        <p className="text-[11px] text-pi-text-dim italic">No active mission</p>
        {nowDoing && (
          <p className="text-[11px] text-pi-text mt-1">{nowDoing}</p>
        )}
      </div>
    )
  }

  const Icon = missionIcons[mission.type] || Target

  return (
    <div className="px-3 py-3 space-y-2">
      <div className="flex items-start gap-2">
        <motion.div
          animate={{ scale: [1, 1.1, 1] }}
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
    </div>
  )
}
