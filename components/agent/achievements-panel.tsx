'use client'

import { useMemo } from 'react'
import { Trophy } from 'lucide-react'
import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'
import { getAchievementDefinitions } from '@/lib/brain/achievements'
import type { Achievement } from '@/lib/brain/brain-types'
import type { BrainMetaExtended } from '@/hooks/use-agent-state'

interface AchievementsPanelProps {
  achievements: Achievement[]
  brainMeta: BrainMetaExtended | null
  className?: string
}

function formatDate(dateStr: string): string {
  try {
    const d = new Date(dateStr)
    return d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })
  } catch {
    return ''
  }
}

export function AchievementsPanel({ achievements, brainMeta: _brainMeta, className }: AchievementsPanelProps) {
  const allAchievements = useMemo(() => {
    const definitions = getAchievementDefinitions()
    const unlockedMap = new Map<string, Achievement>()
    for (const a of achievements) {
      unlockedMap.set(a.id, a)
    }
    return definitions.map(def => ({
      ...def,
      unlockedAt: unlockedMap.get(def.id)?.unlockedAt ?? null,
    }))
  }, [achievements])

  const unlockedCount = allAchievements.filter(a => a.unlockedAt).length
  const totalCount = allAchievements.length

  return (
    <div className={cn('h-full flex flex-col', className)}>
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-pi-border bg-pi-panel/80 backdrop-blur-sm">
        <Trophy className="w-3.5 h-3.5 text-pi-accent" />
        <span className="text-xs font-bold text-pi-text">Achievements</span>
        <span className="text-[10px] text-pi-text-dim bg-pi-surface px-1.5 py-0.5 rounded-full font-mono">
          {unlockedCount}/{totalCount}
        </span>
      </div>

      {/* Achievements grid */}
      <div className="flex-1 overflow-y-auto p-3">
        {totalCount === 0 ? (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col items-center justify-center py-12 text-pi-text-dim"
          >
            <Trophy className="w-10 h-10 mb-3 opacity-15" />
            <p className="text-xs font-medium">No achievements defined</p>
          </motion.div>
        ) : (
          <div className="grid grid-cols-3 gap-2">
            {allAchievements.map((achievement, i) => {
              const isUnlocked = achievement.unlockedAt != null
              return (
                <motion.div
                  key={achievement.id}
                  initial={{ opacity: 0, y: 8, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{ delay: i * 0.03, type: 'spring', stiffness: 500, damping: 30 }}
                  className={cn(
                    'relative flex flex-col items-center text-center rounded-lg border p-3 transition-all',
                    isUnlocked
                      ? 'border-pi-accent/30 bg-pi-accent/5 shadow-[0_0_12px_-4px_rgba(0,212,255,0.15)]'
                      : 'border-pi-border bg-pi-surface/30 opacity-40 grayscale'
                  )}
                >
                  {/* Icon */}
                  <span
                    className={cn(
                      'text-2xl leading-none mb-1.5 select-none',
                      !isUnlocked && 'brightness-50'
                    )}
                  >
                    {achievement.icon}
                  </span>

                  {/* Title */}
                  <p className={cn(
                    'text-[10px] font-semibold leading-tight',
                    isUnlocked ? 'text-pi-text' : 'text-pi-text-dim'
                  )}>
                    {achievement.title}
                  </p>

                  {/* Description */}
                  <p className="text-[9px] text-pi-text-dim mt-0.5 leading-snug line-clamp-2">
                    {achievement.description}
                  </p>

                  {/* Unlock date */}
                  {isUnlocked && achievement.unlockedAt && (
                    <p className="text-[8px] text-pi-accent/70 mt-1 font-mono">
                      {formatDate(achievement.unlockedAt)}
                    </p>
                  )}
                </motion.div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
