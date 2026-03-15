'use client'

import { AlertTriangle, Info, AlertCircle } from 'lucide-react'
import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'
import type { AttentionItem } from '@/lib/brain/domain-types'

interface AttentionPanelProps {
  items: AttentionItem[]
}

const levelConfig = {
  info: { icon: Info, color: 'text-blue-400', bg: 'bg-blue-500/10', border: 'border-blue-500/20' },
  warn: { icon: AlertTriangle, color: 'text-amber-400', bg: 'bg-amber-500/10', border: 'border-amber-500/20' },
  critical: { icon: AlertCircle, color: 'text-red-400', bg: 'bg-red-500/10', border: 'border-red-500/20' },
} as const

export function AttentionPanel({ items }: AttentionPanelProps) {
  if (items.length === 0) return null

  // Sort critical first
  const sorted = [...items].sort((a, b) => {
    const order = { critical: 0, warn: 1, info: 2 }
    return order[a.level] - order[b.level]
  })

  return (
    <div className="px-3 py-2 space-y-1.5">
      {sorted.map((item, i) => {
        const config = levelConfig[item.level]
        const Icon = config.icon
        return (
          <motion.div
            key={item.id}
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.05, type: 'spring', stiffness: 400, damping: 25 }}
            className={cn(
              'flex items-start gap-2 px-2.5 py-1.5 rounded-lg border',
              config.bg, config.border,
              item.level === 'critical' && 'animate-breathe'
            )}
          >
            <Icon className={cn('w-3.5 h-3.5 mt-0.5 shrink-0', config.color)} />
            <p className="text-[11px] text-pi-text leading-snug">{item.message}</p>
          </motion.div>
        )
      })}
    </div>
  )
}
