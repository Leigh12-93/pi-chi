'use client'

import { useMemo } from 'react'
import {
  Sparkles, DollarSign, Timer, AlertTriangle,
  Moon, Clock, TrendingUp, Wrench, Target,
} from 'lucide-react'
import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'
import type { BrainMetaExtended } from '@/hooks/use-agent-state'
import type { Goal } from '@/lib/agent-types'

/* ─── Props ─────────────────────────────────────── */

interface BrainStatsProps {
  brainMeta: BrainMetaExtended | null
  brainStatus: 'running' | 'sleeping' | 'not-running' | 'error'
  goals?: Goal[]
  className?: string
}

/* ─── Helpers ───────────────────────────────────── */

function formatCost(cost: number): string {
  return cost < 0.01 ? '<$0.01' : `$${cost.toFixed(2)}`
}

function formatInterval(ms: number): string {
  const mins = Math.round(ms / 60000)
  return mins < 60 ? `${mins}m` : `${Math.floor(mins / 60)}h ${mins % 60}m`
}

function formatAge(birthTimestamp?: string): string {
  if (!birthTimestamp) return '—'
  try {
    const birth = new Date(birthTimestamp)
    const diffMs = Date.now() - birth.getTime()
    const days = Math.floor(diffMs / 86400000)
    const hours = Math.floor((diffMs % 86400000) / 3600000)
    if (days > 0) return `${days}d ${hours}h`
    return `${hours}h ${Math.floor((diffMs % 3600000) / 60000)}m`
  } catch { return '—' }
}

function costPerThought(cost: number, thoughts: number): string {
  if (thoughts === 0) return '—'
  const cpt = cost / thoughts
  if (cpt < 0.001) return '<$0.001'
  return `$${cpt.toFixed(3)}`
}

/* ─── Stat card ─────────────────────────────────── */

interface StatCardProps {
  icon: React.ElementType
  iconColor: string
  bgGradient: string
  label: string
  value: string | number
  subValue?: string
  warn?: boolean
  index: number
}

function StatCard({ icon: Icon, iconColor, bgGradient, label, value, subValue, warn, index }: StatCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ delay: index * 0.05, type: 'spring', stiffness: 500, damping: 30 }}
      className={cn(
        'relative overflow-hidden p-2.5 rounded-lg border transition-all duration-200',
        'hover:shadow-md hover:border-pi-accent/20',
        warn
          ? 'border-pi-danger/30 bg-red-500/5'
          : 'border-pi-border/50 bg-pi-surface/30'
      )}
    >
      {/* Subtle background gradient */}
      <div className={cn('absolute inset-0 opacity-[0.03]', bgGradient)} />

      <div className="relative flex items-center gap-2">
        <div className={cn(
          'w-7 h-7 rounded-lg flex items-center justify-center shrink-0',
          'bg-gradient-to-br',
          iconColor.includes('purple') ? 'from-purple-500/15 to-purple-500/5' :
          iconColor.includes('emerald') ? 'from-emerald-500/15 to-emerald-500/5' :
          iconColor.includes('blue') ? 'from-blue-500/15 to-blue-500/5' :
          iconColor.includes('orange') ? 'from-orange-500/15 to-orange-500/5' :
          iconColor.includes('indigo') ? 'from-indigo-500/15 to-indigo-500/5' :
          iconColor.includes('red') ? 'from-red-500/15 to-red-500/5' :
          iconColor.includes('amber') ? 'from-amber-500/15 to-amber-500/5' :
          iconColor.includes('cyan') ? 'from-cyan-500/15 to-cyan-500/5' :
          'from-pi-accent/15 to-pi-accent/5'
        )}>
          <Icon className={cn('w-3.5 h-3.5', iconColor)} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[9px] text-pi-text-dim uppercase tracking-wider font-medium">{label}</p>
          <p className={cn(
            'text-sm font-bold font-mono leading-tight',
            warn ? 'text-pi-danger' : 'text-pi-text'
          )}>
            {value}
          </p>
          {subValue && (
            <p className="text-[9px] text-pi-text-dim/60 mt-0.5">{subValue}</p>
          )}
        </div>
      </div>
    </motion.div>
  )
}

/* ─── Skeleton ──────────────────────────────────── */

function StatsSkeleton() {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 mb-2">
        <div className="w-3.5 h-3.5 rounded animate-skeleton" />
        <div className="w-20 h-3.5 rounded animate-skeleton" />
      </div>
      <div className="grid grid-cols-2 gap-1.5">
        {[1, 2, 3, 4].map(i => (
          <div key={i} className="h-16 rounded-lg animate-skeleton" style={{ animationDelay: `${i * 100}ms` }} />
        ))}
      </div>
    </div>
  )
}

/* ─── Component ─────────────────────────────────── */

export function BrainStats({ brainMeta, brainStatus, goals, className }: BrainStatsProps) {
  const stats = useMemo(() => {
    if (!brainMeta) return []
    const items: StatCardProps[] = [
      {
        icon: Sparkles, iconColor: 'text-purple-400',
        bgGradient: 'bg-gradient-to-br from-purple-500 to-purple-600',
        label: 'Thoughts', value: brainMeta.totalThoughts.toLocaleString(),
        subValue: `${costPerThought(brainMeta.totalCost, brainMeta.totalThoughts)} / thought`,
        index: 0,
      },
      {
        icon: DollarSign, iconColor: 'text-emerald-400',
        bgGradient: 'bg-gradient-to-br from-emerald-500 to-emerald-600',
        label: 'API Cost', value: formatCost(brainMeta.totalCost),
        index: 1,
      },
      {
        icon: Timer, iconColor: 'text-blue-400',
        bgGradient: 'bg-gradient-to-br from-blue-500 to-blue-600',
        label: 'Wake Interval', value: formatInterval(brainMeta.wakeInterval),
        index: 2,
      },
      {
        icon: Clock, iconColor: 'text-orange-400',
        bgGradient: 'bg-gradient-to-br from-orange-500 to-orange-600',
        label: 'Age', value: formatAge(brainMeta.birthTimestamp),
        index: 3,
      },
    ]

    // Tool calls card
    if (brainMeta.totalToolCalls !== undefined && brainMeta.totalToolCalls > 0) {
      items.push({
        icon: Wrench, iconColor: 'text-amber-400',
        bgGradient: 'bg-gradient-to-br from-amber-500 to-amber-600',
        label: 'Tool Calls', value: brainMeta.totalToolCalls.toLocaleString(),
        index: items.length,
      })
    }

    // Goal completion rate
    if (goals && goals.length > 0) {
      const completed = goals.filter(g => g.status === 'completed').length
      const pct = Math.round((completed / goals.length) * 100)
      items.push({
        icon: Target, iconColor: 'text-cyan-400',
        bgGradient: 'bg-gradient-to-br from-cyan-500 to-cyan-600',
        label: 'Goal Rate', value: `${pct}%`,
        subValue: `${completed}/${goals.length} completed`,
        index: items.length,
      })
    }

    if (brainMeta.dreamCount !== undefined && brainMeta.dreamCount > 0) {
      items.push({
        icon: Moon, iconColor: 'text-indigo-400',
        bgGradient: 'bg-gradient-to-br from-indigo-500 to-indigo-600',
        label: 'Dreams', value: brainMeta.dreamCount,
        index: items.length,
      })
    }

    if (brainMeta.consecutiveCrashes !== undefined && brainMeta.consecutiveCrashes > 0) {
      items.push({
        icon: AlertTriangle, iconColor: 'text-red-400',
        bgGradient: 'bg-gradient-to-br from-red-500 to-red-600',
        label: 'Crashes', value: brainMeta.consecutiveCrashes,
        warn: (brainMeta.consecutiveCrashes ?? 0) >= 2,
        subValue: (brainMeta.consecutiveCrashes ?? 0) >= 3 ? 'Auto-revert triggered!' : undefined,
        index: items.length,
      })
    }

    return items
  }, [brainMeta, goals])

  if (!brainMeta) return <StatsSkeleton />

  return (
    <div className={cn('', className)}>
      <div className="flex items-center gap-2 mb-2.5">
        <TrendingUp className="w-3.5 h-3.5 text-pi-accent" />
        <span className="text-[11px] font-bold text-pi-text uppercase tracking-wider">Brain Stats</span>
        <motion.span
          animate={brainStatus === 'running' ? { opacity: [0.3, 1, 0.3] } : {}}
          transition={{ duration: 2, repeat: Infinity }}
          className={cn(
            'w-1.5 h-1.5 rounded-full ml-auto',
            brainStatus === 'running' ? 'bg-emerald-500' :
            brainStatus === 'sleeping' ? 'bg-yellow-500' : 'bg-gray-500'
          )}
        />
      </div>

      <div className="grid grid-cols-2 gap-1.5">
        {stats.map(stat => (
          <StatCard key={stat.label} {...stat} />
        ))}
      </div>
    </div>
  )
}
