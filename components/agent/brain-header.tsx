'use client'

import { useMemo, useState, useEffect } from 'react'
import {
  Brain, Clock, DollarSign, Timer, Sparkles,
  Moon, AlertTriangle, Play,
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '@/lib/utils'

/* ─── Props ─────────────────────────────────────── */

interface BrainHeaderProps {
  brainStatus: 'running' | 'sleeping' | 'not-running' | 'error'
  brainMeta: {
    totalThoughts: number
    totalCost: number
    wakeInterval: number
    lastThought?: string
    name?: string
    birthTimestamp?: string
    dreamCount?: number
    consecutiveCrashes?: number
    lastWakeAt?: string
  } | null
  className?: string
}

/* ─── Helpers ───────────────────────────────────── */

function formatUptime(birthTimestamp?: string): string {
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

function formatCost(cost: number): string {
  return cost < 0.01 ? '<$0.01' : `$${cost.toFixed(2)}`
}

function formatInterval(ms: number): string {
  const mins = Math.round(ms / 60000)
  return mins < 60 ? `${mins}m` : `${Math.floor(mins / 60)}h ${mins % 60}m`
}

/* ─── Stat chip ─────────────────────────────────── */

function StatChip({ icon: Icon, iconColor, value, label, warn }: {
  icon: React.ElementType
  iconColor: string
  value: string | number
  label: string
  warn?: boolean
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -5 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        'flex items-center gap-1.5 px-2 py-1 rounded-lg transition-all',
        'bg-pi-surface/50 border border-pi-border/50',
        'hover:border-pi-accent/20 hover:bg-pi-surface',
        warn && 'border-pi-danger/30 bg-red-500/5'
      )}
      title={label}
    >
      <Icon className={cn('w-3 h-3', iconColor)} />
      <span className={cn('text-[10px] font-mono font-semibold', warn ? 'text-pi-danger' : 'text-pi-text')}>
        {value}
      </span>
    </motion.div>
  )
}

/* ─── Component ─────────────────────────────────── */

export function BrainHeader({ brainStatus, brainMeta, className }: BrainHeaderProps) {
  const name = brainMeta?.name || 'Pi-Chi'

  // Countdown timer — ticks every second
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])

  const countdown = useMemo(() => {
    if (!brainMeta?.lastWakeAt || !brainMeta.wakeInterval) return null
    const nextWake = new Date(brainMeta.lastWakeAt).getTime() + brainMeta.wakeInterval
    const remaining = Math.max(0, nextWake - now)
    const mins = Math.floor(remaining / 60000)
    const secs = Math.floor((remaining % 60000) / 1000)
    return { remaining, mins, secs, label: `${mins}:${secs.toString().padStart(2, '0')}` }
  }, [brainMeta?.lastWakeAt, brainMeta?.wakeInterval, now])

  const lastRunAgo = useMemo(() => {
    if (!brainMeta?.lastWakeAt) return null
    const diffMs = now - new Date(brainMeta.lastWakeAt).getTime()
    if (diffMs < 60000) return `${Math.floor(diffMs / 1000)}s ago`
    if (diffMs < 3600000) return `${Math.floor(diffMs / 60000)}m ago`
    return `${Math.floor(diffMs / 3600000)}h ${Math.floor((diffMs % 3600000) / 60000)}m ago`
  }, [brainMeta?.lastWakeAt, now])

  const statusConfig = useMemo(() => ({
    running: { label: 'Awake', color: 'bg-emerald-500', glow: 'shadow-[0_0_8px_rgba(52,211,153,0.4)]', textColor: 'text-emerald-500' },
    sleeping: { label: 'Sleeping', color: 'bg-yellow-500', glow: '', textColor: 'text-yellow-500' },
    'not-running': { label: 'Offline', color: 'bg-gray-500', glow: '', textColor: 'text-gray-500' },
    error: { label: 'Error', color: 'bg-red-500', glow: 'shadow-[0_0_8px_rgba(239,68,68,0.4)]', textColor: 'text-red-500' },
  }), [])

  const status = statusConfig[brainStatus]

  return (
    <div className={cn(
      'flex items-center gap-3 px-3 md:px-4 py-2 border-b border-pi-border',
      'bg-gradient-to-r from-pi-panel via-pi-bg to-pi-panel',
      className
    )}>
      {/* Identity */}
      <div className="flex items-center gap-2.5 min-w-0 shrink-0">
        <div className="relative">
          {/* Brain icon with animated glow */}
          <motion.div
            animate={brainStatus === 'running' ? {
              boxShadow: [
                '0 0 0 0 rgba(0,212,255,0)',
                '0 0 12px 4px rgba(0,212,255,0.15)',
                '0 0 0 0 rgba(0,212,255,0)',
              ],
            } : {}}
            transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' }}
            className="w-8 h-8 rounded-full bg-gradient-to-br from-pi-accent/15 to-purple-500/15 border border-pi-accent/25 flex items-center justify-center"
          >
            <Brain className={cn(
              'w-4 h-4',
              brainStatus === 'running' ? 'text-pi-accent' :
              brainStatus === 'sleeping' ? 'text-yellow-500' :
              'text-pi-text-dim'
            )} />
          </motion.div>

          {/* Status dot */}
          <motion.span
            animate={brainStatus === 'running' ? { scale: [1, 1.4, 1] } : {}}
            transition={{ duration: 2, repeat: Infinity }}
            className={cn(
              'absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-pi-panel',
              status.color, status.glow
            )}
          />
        </div>

        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-sm font-bold text-pi-text truncate">{name}</span>
            <span className={cn(
              'text-[9px] px-1.5 py-px rounded-full font-semibold border shrink-0',
              brainStatus === 'running' ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' :
              brainStatus === 'sleeping' ? 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20' :
              brainStatus === 'error' ? 'bg-red-500/10 text-red-500 border-red-500/20' :
              'bg-gray-500/10 text-gray-500 border-gray-500/20'
            )}>
              {status.label}
            </span>
          </div>
          {brainMeta?.lastThought && (
            <p className="text-[10px] text-pi-text-dim truncate max-w-[180px] md:max-w-[350px] italic leading-tight mt-0.5">
              &ldquo;{brainMeta.lastThought.slice(0, 80)}{brainMeta.lastThought.length > 80 ? '...' : ''}&rdquo;
            </p>
          )}
        </div>
      </div>

      {/* Stats — responsive */}
      <div className="hidden sm:flex items-center gap-1.5 ml-auto shrink-0 flex-wrap justify-end">
        <AnimatePresence>
          {brainMeta && (
            <>
              <StatChip icon={Sparkles} iconColor="text-purple-400" value={brainMeta.totalThoughts.toLocaleString()} label="Total thoughts" />
              <StatChip icon={DollarSign} iconColor="text-emerald-400" value={formatCost(brainMeta.totalCost)} label="API cost" />
              <StatChip icon={Timer} iconColor="text-blue-400" value={formatInterval(brainMeta.wakeInterval)} label="Wake interval" />
              {lastRunAgo && (
                <StatChip icon={Play} iconColor="text-cyan-400" value={lastRunAgo} label="Last cycle" />
              )}
              {countdown && countdown.remaining > 0 ? (
                <StatChip icon={Clock} iconColor="text-orange-400" value={countdown.label} label="Next cycle in" />
              ) : countdown ? (
                <StatChip icon={Clock} iconColor="text-emerald-400" value="now" label="Cycle due" />
              ) : (
                <StatChip icon={Clock} iconColor="text-orange-400" value={formatUptime(brainMeta.birthTimestamp)} label="Age" />
              )}
              {brainMeta.dreamCount !== undefined && brainMeta.dreamCount > 0 && (
                <StatChip icon={Moon} iconColor="text-indigo-400" value={brainMeta.dreamCount} label="Dreams" />
              )}
              {brainMeta.consecutiveCrashes !== undefined && brainMeta.consecutiveCrashes > 0 && (
                <StatChip icon={AlertTriangle} iconColor="text-red-400" value={brainMeta.consecutiveCrashes} label="Crashes" warn />
              )}
            </>
          )}
        </AnimatePresence>
      </div>

      {/* Mobile: compact stats */}
      <div className="flex sm:hidden items-center gap-2 ml-auto shrink-0">
        {brainMeta && (
          <>
            {countdown && countdown.remaining > 0 ? (
              <div className="flex items-center gap-1 text-[9px] text-pi-text-dim" title="Next cycle">
                <Clock className="w-2.5 h-2.5 text-orange-400" />
                <span className="font-mono font-semibold text-pi-text">{countdown.label}</span>
              </div>
            ) : countdown ? (
              <div className="flex items-center gap-1 text-[9px] text-emerald-400" title="Cycle due">
                <Clock className="w-2.5 h-2.5" />
                <span className="font-mono font-semibold">now</span>
              </div>
            ) : null}
            <div className="flex items-center gap-1 text-[9px] text-pi-text-dim" title="Thoughts">
              <Sparkles className="w-2.5 h-2.5 text-purple-400" />
              <span className="font-mono">{brainMeta.totalThoughts}</span>
            </div>
            <div className="flex items-center gap-1 text-[9px] text-pi-text-dim" title="Cost">
              <DollarSign className="w-2.5 h-2.5 text-emerald-400" />
              <span className="font-mono">{formatCost(brainMeta.totalCost)}</span>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
