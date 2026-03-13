'use client'

import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'

interface VitalBarProps {
  label: string
  value: number
  max: number
  unit: string
  color: string
  icon?: React.ElementType
}

export function VitalBar({ label, value, max, unit, color, icon: Icon }: VitalBarProps) {
  const pct = Math.min(Math.round((value / max) * 100), 100)
  const isHigh = pct > 85
  const isMed = pct > 60

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-[10px]">
        <div className="flex items-center gap-1.5">
          {Icon && <Icon className={cn('w-3 h-3', isHigh ? 'text-pi-danger' : 'text-pi-text-dim')} />}
          <span className="text-pi-text-dim font-medium">{label}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-pi-text font-mono font-semibold">{value.toFixed(1)}{unit}</span>
          <span className="text-pi-text-dim/50">/</span>
          <span className="text-pi-text-dim font-mono">{max.toFixed(1)}{unit}</span>
          <span className={cn(
            'text-[9px] font-mono font-bold ml-1 px-1 py-px rounded',
            isHigh ? 'text-pi-danger bg-red-500/10' :
            isMed ? 'text-pi-warning bg-yellow-500/10' :
            'text-pi-text-dim/50'
          )}>
            {pct}%
          </span>
        </div>
      </div>
      <div className="h-2 bg-pi-surface rounded-full overflow-hidden border border-pi-border/30">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.8, ease: 'easeOut' }}
          className={cn(
            'h-full rounded-full relative',
            isHigh ? 'bg-gradient-to-r from-red-500 to-red-400' :
            isMed ? `${color} opacity-80` :
            color
          )}
        >
          {/* Shimmer effect */}
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent animate-shimmer" style={{ backgroundSize: '200% 100%' }} />
        </motion.div>
      </div>
    </div>
  )
}
