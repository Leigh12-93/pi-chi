'use client'

import { useRef, useEffect, useCallback, useState, useMemo } from 'react'
import {
  Target, Briefcase, Heart, Cpu, Activity,
  BookOpen, BrainCircuit,
  Zap, AlertTriangle, CheckCircle2, Wifi, Brain, Radar,
  Moon, Circle, ListChecks, RotateCcw, Pause, Play,
} from 'lucide-react'
import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'
import type { DashboardSummary } from '@/lib/brain/domain-types'
import type { SystemVitals, FeedItem } from '@/lib/agent-types'
import type { MoodState } from '@/lib/brain/brain-types'
import type { MoodSnapshot } from '@/hooks/use-agent-state' // used in props
import type { ActivityEntry } from '@/lib/agent-types'
import { useFeedItems } from '@/hooks/use-feed-items'

/* ─── Props ────────────────────────────────────── */

interface ContextRailProps {
  summary: DashboardSummary
  vitals?: SystemVitals | null
  devMode?: boolean
  mood?: MoodState | null
  moodHistory: MoodSnapshot[]
  activity: ActivityEntry[]
  agentStatus: 'idle' | 'thinking' | 'executing' | 'error'
  brainStatus: 'running' | 'sleeping' | 'not-running' | 'error'
  onOpenDrawer?: (_section: string) => void
  className?: string
}

/* ─── Icon registry (lucide key → component) ──── */

const iconMap: Record<string, React.ElementType> = {
  Cpu, Target, Zap, Brain, AlertTriangle, CheckCircle2,
  Activity, Wifi, Heart, Briefcase, Radar, BrainCircuit,
  Moon, Circle, ListChecks, RotateCcw,
}

function getIcon(key: string): React.ElementType {
  return iconMap[key] || Activity
}

/* ─── Tone color map ───────────────────────────── */

const toneBg: Record<string, string> = {
  neutral:  '',
  positive: 'bg-emerald-500/5',
  warning:  'bg-orange-900/10',
  critical: 'bg-red-500/8',
  accent:   'bg-pi-accent/5',
}

/* ─── Scroll constants ─────────────────────────── */

const SCROLL_SPEED = 0.2        // px per frame (~12px/sec at 60fps)
const HOVER_RESUME_MS = 4000    // resume after hover ends

/* ─── Feed Item Row ────────────────────────────── */

function FeedRow({ item, isNew }: { item: FeedItem; isNew: boolean }) {
  const Icon = getIcon(item.icon)

  const row = (
    <div
      className={cn(
        'flex items-start gap-2 px-3 py-1.5 transition-colors group',
        'hover:bg-pi-surface/40',
        toneBg[item.tone || 'neutral'],
      )}
    >
      {/* Icon */}
      <div className="relative mt-0.5 shrink-0">
        <Icon className={cn('w-3 h-3', item.color)} />
        {item.tone === 'critical' && (
          <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse" />
        )}
      </div>

      {/* Time */}
      <span className="text-[9px] text-pi-text-dim/40 font-mono shrink-0 mt-px min-w-[32px]">
        {item.displayTime}
      </span>

      {/* Content */}
      <div className="min-w-0 flex-1">
        <span className={cn(
          'text-[11px] leading-relaxed block',
          item.tone === 'critical' ? 'text-red-300' :
          item.tone === 'positive' ? 'text-emerald-300' :
          item.tone === 'accent' ? 'text-pi-accent' :
          item.tone === 'warning' ? 'text-orange-300' :
          'text-pi-text',
        )}>
          {item.headline}
        </span>
        {item.detail && (
          <span className="text-[9px] text-pi-text-dim/50 block truncate">
            {item.detail}
          </span>
        )}
      </div>
    </div>
  )

  if (isNew) {
    return (
      <motion.div
        initial={{ opacity: 0, x: -8, scale: 0.97 }}
        animate={{ opacity: 1, x: 0, scale: 1 }}
        transition={{ type: 'spring', stiffness: 500, damping: 30 }}
      >
        {row}
      </motion.div>
    )
  }

  return row
}

/* ─── Main Component ───────────────────────────── */

export function ContextRail({
  summary, vitals, mood,
  activity, brainStatus, onOpenDrawer, className,
}: ContextRailProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const firstCopyRef = useRef<HTMLDivElement>(null)
  const rafRef = useRef<number | null>(null)
  const pausedRef = useRef(false)
  const pauseTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const autoScrollRef = useRef(true)
  const [autoScrollEnabled, setAutoScrollEnabled] = useState(true)
  const scrollPosRef = useRef(0) // sub-pixel accumulator
  const prevItemCountRef = useRef(0)

  // Keep ref in sync with state
  useEffect(() => { autoScrollRef.current = autoScrollEnabled }, [autoScrollEnabled])

  // Build feed items
  const feedItems = useFeedItems({
    activity,
    summary,
    mood,
    vitals,
    brainStatus,
  })

  // Track which items are "new" (last 3 added)
  const newItemIds = useMemo(() => {
    if (feedItems.length <= prevItemCountRef.current) return new Set<string>()
    const newOnes = feedItems.slice(prevItemCountRef.current)
    return new Set(newOnes.slice(-3).map(i => i.id))
  }, [feedItems])

  useEffect(() => {
    prevItemCountRef.current = feedItems.length
  }, [feedItems.length])

  /* ─── Smooth infinite scroll ─────────────────── */

  useEffect(() => {
    const tick = () => {
      const el = scrollRef.current
      const firstCopy = firstCopyRef.current
      if (!el || !firstCopy || pausedRef.current || !autoScrollRef.current) {
        rafRef.current = requestAnimationFrame(tick)
        return
      }

      const copyHeight = firstCopy.offsetHeight
      if (copyHeight <= 0) {
        rafRef.current = requestAnimationFrame(tick)
        return
      }

      // Advance sub-pixel position
      scrollPosRef.current += SCROLL_SPEED

      // Seamless wrap: when we've scrolled past the first copy, subtract
      // its height so we snap back without any visual jump
      if (scrollPosRef.current >= copyHeight) {
        scrollPosRef.current -= copyHeight
      }

      el.scrollTop = scrollPosRef.current
      rafRef.current = requestAnimationFrame(tick)
    }

    // Sync accumulator with current scroll position
    if (scrollRef.current) {
      scrollPosRef.current = scrollRef.current.scrollTop
    }

    rafRef.current = requestAnimationFrame(tick)
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      if (pauseTimeoutRef.current) clearTimeout(pauseTimeoutRef.current)
    }
  }, []) // stable — never recreated

  // Pause on hover/touch
  const handleInteractionStart = useCallback(() => {
    pausedRef.current = true
    if (pauseTimeoutRef.current) clearTimeout(pauseTimeoutRef.current)
  }, [])

  const handleInteractionEnd = useCallback(() => {
    // Sync accumulator to wherever user scrolled manually
    if (scrollRef.current) {
      scrollPosRef.current = scrollRef.current.scrollTop
    }
    pauseTimeoutRef.current = setTimeout(() => {
      pausedRef.current = false
    }, HOVER_RESUME_MS)
  }, [])

  /* ─── Render ─────────────────────────────────── */

  return (
    <div className={cn('h-full flex flex-col bg-pi-panel border-l border-pi-border alive-panel context-rail-shell', className)}>

      {/* ─── Sticky header ─── */}
      <div className="sticky top-0 z-10 flex items-center justify-between px-3 py-2 border-b border-pi-border bg-pi-panel/95 backdrop-blur-sm">
        <div className="flex items-center gap-2">
          <Activity className="w-3.5 h-3.5 text-pi-accent" />
          <span className="text-xs font-bold text-pi-text tracking-wide uppercase">Ops Feed</span>
          <span className="text-[10px] text-pi-text-dim font-mono bg-pi-surface px-1.5 py-0.5 rounded-full">
            {feedItems.length}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setAutoScrollEnabled(s => !s)}
            className={cn(
              'p-1 rounded-lg transition-all',
              autoScrollEnabled ? 'text-pi-text-dim hover:text-pi-text' : 'text-yellow-500 bg-yellow-500/10'
            )}
            title={autoScrollEnabled ? 'Pause auto-scroll' : 'Resume auto-scroll'}
          >
            {autoScrollEnabled ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}
          </button>
          <span className="flex items-center gap-1 text-[10px] text-pi-text-dim">
            <motion.span
              animate={{ opacity: [0.4, 1, 0.4] }}
              transition={{ duration: 2, repeat: Infinity }}
              className="w-1.5 h-1.5 rounded-full bg-emerald-500"
            />
            Live
          </span>
        </div>
      </div>

      {/* ─── Feed content ─── */}
      <div
        ref={scrollRef}
        onMouseEnter={handleInteractionStart}
        onMouseLeave={handleInteractionEnd}
        onTouchStart={handleInteractionStart}
        onTouchEnd={handleInteractionEnd}
        className="flex-1 overflow-y-auto scrollbar-none"
      >
        {feedItems.length === 0 ? (
          /* Empty state */
          <div className="flex flex-col items-center justify-center h-full text-pi-text-dim py-12">
            <motion.div
              animate={{ rotate: [0, 5, -5, 0] }}
              transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
            >
              <BrainCircuit className="w-10 h-10 mb-3 opacity-15" />
            </motion.div>
            <p className="text-xs font-medium">Waiting for brain</p>
            <p className="text-[10px] mt-1 text-center max-w-[200px]">
              Events will stream here as the brain operates.
            </p>
          </div>
        ) : (
          <>
            {/* First copy of feed items */}
            <div ref={firstCopyRef} className="py-1">
              {feedItems.map(item => (
                <FeedRow key={item.id} item={item} isNew={newItemIds.has(item.id)} />
              ))}
            </div>

            {/* Second copy for seamless infinite loop */}
            <div className="py-1" aria-hidden="true">
              {feedItems.map(item => (
                <FeedRow key={`clone-${item.id}`} item={item} isNew={false} />
              ))}
            </div>
          </>
        )}
      </div>

      {/* ─── Sticky footer: drawer quick-access ─── */}
      {onOpenDrawer && (
        <div className="sticky bottom-0 z-10 border-t border-pi-border bg-pi-panel/95 backdrop-blur-sm px-2 py-2">
          <div className="flex items-center justify-around gap-1">
            <DrawerButton icon={Target} label="Mission" onClick={() => onOpenDrawer('mission')} />
            <DrawerButton icon={Heart} label="Mood" onClick={() => onOpenDrawer('mood')} />
            <DrawerButton icon={Cpu} label="Vitals" onClick={() => onOpenDrawer('vitals')} />
            <DrawerButton icon={ListChecks} label="Queue" onClick={() => onOpenDrawer('queue')} />
            <DrawerButton icon={BookOpen} label="Mind" onClick={() => onOpenDrawer('mind')} />
          </div>
        </div>
      )}
    </div>
  )
}

/* ─── Drawer Button ────────────────────────────── */

function DrawerButton({
  label,
  icon: Icon,
  onClick,
}: {
  label: string
  icon: React.ElementType
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className="flex flex-col items-center gap-1 rounded-lg px-2 py-1.5 text-[9px] text-pi-text-dim transition-all hover:bg-pi-surface hover:text-pi-text min-w-[44px]"
      title={label}
    >
      <Icon className="h-3.5 w-3.5 text-pi-accent" />
      <span className="font-medium">{label}</span>
    </button>
  )
}
