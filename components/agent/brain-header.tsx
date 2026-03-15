'use client'

import { useMemo, useEffect, useState } from 'react'
import {
  Brain, Clock, RefreshCw, Settings, Sparkles,
  Target, Zap, Search, Rocket, Wrench, Activity,
} from 'lucide-react'
import type { SystemVitals } from '@/lib/agent-types'
import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'
import type { BrainMetaExtended } from '@/hooks/use-agent-state'
import type { DashboardSummary, Mission } from '@/lib/brain/domain-types'

/* ─── Props ─────────────────────────────────────── */

interface BrainHeaderProps {
  brainStatus: 'running' | 'sleeping' | 'not-running' | 'error'
  brainMeta: BrainMetaExtended | null
  vitals?: SystemVitals | null
  lastFetchedAt?: number | null
  summary?: DashboardSummary | null
  onRefresh?: () => void
  onSettingsOpen?: () => void
  className?: string
}

/* ─── Helpers ───────────────────────────────────── */

function formatCost(cost: number): string {
  return cost < 0.01 ? '<$0.01' : `$${cost.toFixed(2)}`
}

function formatCurrency(val: number): string {
  if (val >= 1_000_000) return `$${(val / 1_000_000).toFixed(1)}M`
  if (val >= 1_000) return `$${(val / 1_000).toFixed(1)}K`
  return `$${val.toFixed(0)}`
}

const missionIcons: Record<Mission['type'], React.ElementType> = {
  maintain: Wrench,
  grow: Zap,
  explore: Search,
  launch: Rocket,
  'self-improve': Sparkles,
}

const phaseTone: Record<NonNullable<DashboardSummary['cyclePhase']>, string> = {
  idle: 'text-pi-text-dim bg-pi-surface/60 border-pi-border',
  planning: 'text-cyan-400 bg-cyan-500/10 border-cyan-500/20',
  executing: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
  responding: 'text-pi-accent bg-pi-accent/10 border-pi-accent/20',
  sleeping: 'text-yellow-400 bg-yellow-500/10 border-yellow-500/20',
  offline: 'text-gray-400 bg-gray-500/10 border-gray-500/20',
  error: 'text-red-400 bg-red-500/10 border-red-500/20',
}

/* ─── Component ─────────────────────────────────── */

export function BrainHeader({
  brainStatus, brainMeta, lastFetchedAt, summary,
  onRefresh, onSettingsOpen, className,
}: BrainHeaderProps) {
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
    return { remaining, label: `${mins}:${secs.toString().padStart(2, '0')}` }
  }, [brainMeta?.lastWakeAt, brainMeta?.wakeInterval, now])

  const statusConfig = useMemo(() => ({
    running: { label: 'Awake', color: 'bg-emerald-500', glow: 'shadow-[0_0_8px_rgba(52,211,153,0.4)]' },
    sleeping: { label: 'Sleeping', color: 'bg-yellow-500', glow: '' },
    'not-running': { label: 'Offline', color: 'bg-gray-500', glow: '' },
    error: { label: 'Error', color: 'bg-red-500', glow: 'shadow-[0_0_8px_rgba(239,68,68,0.4)]' },
  }), [])

  const status = statusConfig[brainStatus]
  const mission = summary?.currentMission
  const MissionIcon = mission ? missionIcons[mission.type] || Target : null
  const portfolioProgress = summary && summary.portfolioValue !== null
    ? Math.min(100, (summary.portfolioValue / summary.portfolioTarget) * 100)
    : null

  // Staleness
  const staleness = useMemo(() => {
    if (!lastFetchedAt) return null
    const ageSec = Math.floor((now - lastFetchedAt) / 1000)
    if (ageSec < 10) return null
    const label = ageSec < 60 ? `${ageSec}s ago` : `${Math.floor(ageSec / 60)}m ago`
    const level = ageSec > 120 ? 'stale' : ageSec > 30 ? 'warn' : 'ok'
    return { label, level }
  }, [lastFetchedAt, now])

  return (
    <div className={cn('hero-band', brainStatus === 'running' && 'hero-band-live', className)}>
      {/* Identity + status */}
      <div className="flex items-center gap-2 shrink-0">
        <div className="relative">
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
            <span className="text-sm font-bold text-pi-text">{name}</span>
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
        </div>
      </div>

      {/* Current mission — desktop only */}
      <div className="hidden md:flex items-center gap-2 min-w-0 flex-1 mx-4">
        {mission && MissionIcon ? (
          <div className="flex items-center gap-2 min-w-0">
            <span className="mission-badge" data-type={mission.type}>
              <MissionIcon className="w-2.5 h-2.5" />
              {mission.type}
            </span>
            {summary && (
              <span className={cn('inline-flex items-center rounded-full border px-1.5 py-px text-[8px] font-semibold', phaseTone[summary.cyclePhase])}>
                {summary.cyclePhase}
              </span>
            )}
            <span className="text-[11px] font-medium text-pi-text truncate max-w-[300px]">
              {mission.title}
            </span>
          </div>
        ) : (
          <span className="text-[10px] text-pi-text-dim italic">No active mission</span>
        )}
        {summary?.nowDoing && (
          <div className="hidden lg:flex min-w-0 items-center gap-1.5 rounded-full border border-pi-border/50 bg-pi-surface/40 px-2 py-1">
            <Activity className="h-3 w-3 text-pi-accent" />
            <span className="max-w-[320px] truncate text-[10px] text-pi-text-dim">{summary.nowDoing}</span>
          </div>
        )}
      </div>

      {/* Now doing — mobile only */}
        {summary?.nowDoing && (
        <div className="flex md:hidden items-center min-w-0 flex-1 mx-2">
          <p className="text-[10px] text-pi-text-dim truncate">{summary.nowDoing}</p>
        </div>
      )}

      {/* Right side: portfolio bar + wake countdown + actions */}
      <div className="flex items-center gap-3 shrink-0 ml-auto">
        {summary?.topOpportunity && (
          <div className="hidden xl:flex items-center gap-1 rounded-full border border-pi-border/50 bg-pi-surface/40 px-2 py-1 text-[9px] text-pi-text-dim">
            <Target className="h-3 w-3 text-pi-accent" />
            <span className="max-w-[180px] truncate">{summary.topOpportunity.title}</span>
          </div>
        )}

        {/* Portfolio progress mini */}
        {summary && (
          <div className="hidden sm:flex flex-col items-end gap-0.5 min-w-[100px]">
            <div className="flex items-center gap-1.5 w-full justify-end">
              <span className="text-[9px] text-pi-text-dim font-medium">
                {summary.portfolioValue !== null ? formatCurrency(summary.portfolioValue) : 'Unknown'}
              </span>
              <span className="text-[8px] text-pi-text-dim/50">/</span>
              <span className="text-[9px] text-pi-text-dim font-medium">
                {formatCurrency(summary.portfolioTarget)}
              </span>
            </div>
            <div className="w-full portfolio-bar" style={{ height: '4px' }}>
              <div className="portfolio-bar-fill" style={{ width: `${portfolioProgress ?? 0}%` }} />
            </div>
          </div>
        )}

        {/* Wake countdown */}
        {countdown && countdown.remaining > 0 ? (
          <div className="flex items-center gap-1 text-[10px]" title="Next cycle">
            <Clock className="w-3 h-3 text-orange-400" />
            <span className="font-mono font-semibold text-pi-text">{countdown.label}</span>
          </div>
        ) : countdown ? (
          <div className="flex items-center gap-1 text-[10px] text-emerald-400" title="Cycle due">
            <Clock className="w-3 h-3" />
            <span className="font-mono font-semibold">now</span>
          </div>
        ) : null}

        {/* Cost chip */}
        {brainMeta && (
          <span className={cn(
            'text-[9px] font-mono px-1.5 py-0.5 rounded-full',
            brainMeta.totalCost > 8 ? 'text-red-400 bg-red-500/10' : 'text-pi-text-dim bg-pi-surface/50'
          )} title={`API cost: $${brainMeta.totalCost.toFixed(2)}`}>
            {formatCost(brainMeta.totalCost)}
          </span>
        )}

        {/* Thoughts */}
        {brainMeta && (
          <div className="hidden sm:flex items-center gap-1 text-[9px] text-pi-text-dim" title="Thoughts">
            <Sparkles className="w-2.5 h-2.5 text-purple-400" />
            <span className="font-mono">{brainMeta.totalThoughts.toLocaleString()}</span>
          </div>
        )}

        {/* Staleness */}
        {staleness && (
          <span className={cn(
            'text-[9px] font-mono px-1.5 py-0.5 rounded-full',
            staleness.level === 'stale' ? 'text-red-400 bg-red-500/10' :
            staleness.level === 'warn' ? 'text-yellow-400 bg-yellow-500/10' :
            'text-pi-text-dim'
          )}>
            {staleness.level === 'stale' ? 'Stale' : staleness.label}
          </span>
        )}

        {summary?.lastEventLabel && (
          <div className="hidden xl:flex items-center gap-1 rounded-full border border-pi-border/40 bg-pi-surface/40 px-2 py-1">
            <span className="h-1.5 w-1.5 rounded-full bg-pi-accent animate-pulse" />
            <span className="max-w-[180px] truncate text-[9px] text-pi-text-dim">{summary.lastEventLabel}</span>
          </div>
        )}
        {summary?.attentionNeeded?.length ? (
          <div className="hidden lg:flex items-center gap-1 rounded-full border border-red-500/20 bg-red-500/8 px-2 py-1">
            <span className="h-1.5 w-1.5 rounded-full bg-red-400" />
            <span className="text-[9px] font-medium text-red-300">
              {summary.attentionNeeded.length} attention item{summary.attentionNeeded.length === 1 ? '' : 's'}
            </span>
          </div>
        ) : null}

        {/* Actions */}
        {onRefresh && (
          <button
            onClick={onRefresh}
            className="p-1 rounded-lg text-pi-text-dim hover:text-pi-accent hover:bg-pi-accent/10 transition-all"
            title="Refresh"
            aria-label="Refresh brain state"
          >
            <RefreshCw className="w-3 h-3" />
          </button>
        )}
        {onSettingsOpen && (
          <button
            onClick={onSettingsOpen}
            className="p-1 rounded-lg text-pi-text-dim hover:text-pi-accent hover:bg-pi-accent/10 transition-all"
            title="Settings"
            aria-label="Open settings"
          >
            <Settings className="w-3 h-3" />
          </button>
        )}
      </div>
    </div>
  )
}
