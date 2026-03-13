'use client'

import { useMemo } from 'react'
import { Heart, Zap, Frown, Users, Sparkles, Trophy } from 'lucide-react'
import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'

/* ─── Types ─────────────────────────────────────── */

interface MoodState {
  curiosity: number
  satisfaction: number
  frustration: number
  loneliness: number
  energy: number
  pride: number
}

interface MoodPanelProps {
  mood?: MoodState
  className?: string
}

/* ─── Mood metric config ────────────────────────── */

const moodMetrics = [
  { key: 'curiosity' as keyof MoodState, label: 'Curiosity', icon: Sparkles, color: 'text-purple-500', barColor: 'bg-purple-500', gradient: 'from-purple-500/20 to-purple-500/5' },
  { key: 'satisfaction' as keyof MoodState, label: 'Satisfaction', icon: Heart, color: 'text-emerald-500', barColor: 'bg-emerald-500', gradient: 'from-emerald-500/20 to-emerald-500/5' },
  { key: 'energy' as keyof MoodState, label: 'Energy', icon: Zap, color: 'text-yellow-500', barColor: 'bg-yellow-500', gradient: 'from-yellow-500/20 to-yellow-500/5' },
  { key: 'pride' as keyof MoodState, label: 'Pride', icon: Trophy, color: 'text-orange-500', barColor: 'bg-orange-500', gradient: 'from-orange-500/20 to-orange-500/5' },
  { key: 'frustration' as keyof MoodState, label: 'Frustration', icon: Frown, color: 'text-red-500', barColor: 'bg-red-500', gradient: 'from-red-500/20 to-red-500/5', inverted: true },
  { key: 'loneliness' as keyof MoodState, label: 'Loneliness', icon: Users, color: 'text-blue-500', barColor: 'bg-blue-500', gradient: 'from-blue-500/20 to-blue-500/5', inverted: true },
]

/* ─── Component ─────────────────────────────────── */

export function MoodPanel({ mood, className }: MoodPanelProps) {
  const currentMood: MoodState = mood || {
    curiosity: 50, satisfaction: 50, frustration: 20,
    loneliness: 30, energy: 60, pride: 40,
  }

  const overallScore = useMemo(() => {
    const pos = currentMood.curiosity + currentMood.satisfaction + currentMood.energy + currentMood.pride
    const neg = currentMood.frustration + currentMood.loneliness
    return Math.round((pos - neg) / 4)
  }, [currentMood])

  const moodEmoji = useMemo(() => {
    if (overallScore > 75) return { emoji: '🚀', label: 'Thriving' }
    if (overallScore > 50) return { emoji: '😊', label: 'Content' }
    if (overallScore > 25) return { emoji: '🤔', label: 'Contemplative' }
    if (overallScore > 0) return { emoji: '😐', label: 'Neutral' }
    return { emoji: '😟', label: 'Struggling' }
  }, [overallScore])

  return (
    <div className={cn('', className)}>
      {/* Header with overall mood */}
      <div className="flex items-center justify-between mb-4 sm:mb-3">
        <div className="flex items-center gap-2.5 sm:gap-2">
          <Heart className="w-4 h-4 sm:w-3.5 sm:h-3.5 text-pink-500" />
          <span className="text-[12px] sm:text-[11px] font-bold text-pi-text uppercase tracking-wider">Mood</span>
        </div>
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          className={cn(
            'flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-medium border',
            overallScore > 50 ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' :
            overallScore > 25 ? 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20' :
            'bg-red-500/10 text-red-500 border-red-500/20'
          )}
        >
          <span>{moodEmoji.emoji}</span>
          <span>{moodEmoji.label}</span>
        </motion.div>
      </div>

      {/* Mood metrics */}
      <div className="space-y-2.5">
        {moodMetrics.map(({ key, label, icon: Icon, color, barColor, gradient, inverted }, i) => {
          const value = currentMood[key]
          const displayValue = inverted ? 100 - value : value

          return (
            <motion.div
              key={key}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.05, type: 'spring', stiffness: 400, damping: 25 }}
            >
              <div className="flex items-center gap-2 mb-1">
                <div className={cn('w-5 h-5 rounded flex items-center justify-center bg-gradient-to-br', gradient)}>
                  <Icon className={cn('w-3 h-3', color)} />
                </div>
                <span className="text-[10px] font-medium text-pi-text flex-1">{label}</span>
                <span className={cn(
                  'text-[10px] font-mono font-bold',
                  inverted
                    ? (value > 60 ? 'text-red-400' : value > 30 ? 'text-yellow-400' : 'text-emerald-400')
                    : (value > 60 ? 'text-emerald-400' : value > 30 ? 'text-yellow-400' : 'text-red-400')
                )}>
                  {value}%
                </span>
              </div>
              <div className="h-1.5 bg-pi-surface rounded-full overflow-hidden border border-pi-border/30">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${displayValue}%` }}
                  transition={{ duration: 0.6, delay: i * 0.05, ease: 'easeOut' }}
                  className={cn(barColor, 'h-full rounded-full relative')}
                >
                  <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/15 to-transparent animate-shimmer" style={{ backgroundSize: '200% 100%' }} />
                </motion.div>
              </div>
            </motion.div>
          )
        })}
      </div>
    </div>
  )
}
