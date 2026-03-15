'use client'

import { useRef, useEffect, useCallback, useState, useMemo } from 'react'
import {
  Activity, BrainCircuit, Cpu, Heart, Zap,
  AlertTriangle, CheckCircle2, Wifi, Brain, Radar,
  Moon, Circle, ListChecks, RotateCcw, Pause, Play,
  Target, Briefcase, BookOpen, Radio as Radio, Syringe,
  ArrowRight,
  ChevronDown, ChevronUp,
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '@/lib/utils'
import type { DashboardSummary } from '@/lib/brain/domain-types'
import type { SystemVitals, FeedItem, ActivityEntry } from '@/lib/agent-types'
import type { MoodState } from '@/lib/brain/brain-types'
import type { MoodSnapshot } from '@/hooks/use-agent-state'
import { useFeedItems } from '@/hooks/use-feed-items'

/* ─── Props ────────────────────────────────────── */

interface UnifiedOpsPanelProps {
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

/* ─── Icon registry ────────────────────────────── */

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

/* ─── Brain status config ──────────────────────── */

const brainStatusConfig = {
  running:     { label: 'Awake',   color: 'text-emerald-400', dot: 'bg-emerald-500', pulse: true },
  sleeping:    { label: 'Asleep',  color: 'text-indigo-400',  dot: 'bg-indigo-500',  pulse: false },
  'not-running': { label: 'Offline', color: 'text-pi-text-dim', dot: 'bg-gray-500',   pulse: false },
  error:       { label: 'Error',   color: 'text-red-400',     dot: 'bg-red-500',     pulse: true },
}

/* ─── Section Header ───────────────────────────── */

function SectionHeader({
  icon: Icon, label, accent, children, collapsible, collapsed, onToggle,
}: {
  icon: React.ElementType
  label: string
  accent?: string
  children?: React.ReactNode
  collapsible?: boolean
  collapsed?: boolean
  onToggle?: () => void
}) {
  return (
    <div
      className={cn(
        'flex items-center justify-between px-3 py-1.5',
        collapsible && 'cursor-pointer hover:bg-pi-surface/30 transition-colors',
      )}
      onClick={collapsible ? onToggle : undefined}
    >
      <div className="flex items-center gap-1.5">
        <Icon className={cn('w-3 h-3', accent || 'text-pi-accent')} />
        <span className="text-[9px] font-bold uppercase tracking-[0.14em] text-pi-text-dim">{label}</span>
      </div>
      <div className="flex items-center gap-1.5">
        {children}
        {collapsible && (
          collapsed
            ? <ChevronDown className="w-3 h-3 text-pi-text-dim/50" />
            : <ChevronUp className="w-3 h-3 text-pi-text-dim/50" />
        )}
      </div>
    </div>
  )
}

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
      <div className="relative mt-0.5 shrink-0">
        <Icon className={cn('w-3 h-3', item.color)} />
        {item.tone === 'critical' && (
          <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse" />
        )}
      </div>
      <span className="text-[9px] text-pi-text-dim/40 font-mono shrink-0 mt-px min-w-[32px]">
        {item.displayTime}
      </span>
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

/* ─── Scroll constants ─────────────────────────── */

const SCROLL_SPEED = 0.2
const HOVER_RESUME_MS = 4000

/* ─── Radio Widget ────────────────────────────── */

function RadioWidget() {
  const [icecast, setIcecast] = useState<{ title: string; genre: string; listeners: number; online: boolean }>({
    title: '', genre: '', listeners: 0, online: false,
  })

  useEffect(() => {
    const poll = async () => {
      try {
        const res = await fetch('/api/radio?icecast=true')
        const data = await res.json()
        if (data && !data.error) setIcecast(data)
      } catch { /* ignore */ }
    }
    poll()
    const interval = setInterval(poll, 15_000)
    return () => clearInterval(interval)
  }, [])

  return (
    <div className="border-b border-pi-border">
      <SectionHeader icon={Radio} label="Radio" accent="text-emerald-400">
        {icecast.online ? (
          <div className="flex items-center gap-1.5">
            <motion.span
              animate={{ scale: [1, 1.2, 1] }}
              transition={{ duration: 1.5, repeat: Infinity }}
              className="w-1.5 h-1.5 rounded-full bg-red-500"
            />
            <span className="text-[9px] text-pi-text-dim font-mono">
              {icecast.listeners} listener{icecast.listeners !== 1 ? 's' : ''}
            </span>
          </div>
        ) : (
          <span className="text-[9px] text-pi-text-dim/50">offline</span>
        )}
      </SectionHeader>
      {icecast.online && icecast.title && (
        <div className="px-3 pb-1.5">
          <p className="text-[10px] text-pi-text truncate pl-4">
            {icecast.title}
          </p>
          {icecast.genre && (
            <p className="text-[9px] text-pi-text-dim/60 truncate pl-4 font-mono">
              {icecast.genre}
            </p>
          )}
        </div>
      )}
    </div>
  )
}

/* ─── Injections Widget ───────────────────────── */

function InjectionsWidget() {
  const [injections, setInjections] = useState<{
    pending: number
    items: { id: number; type: string; priority: number }[]
  }>({ pending: 0, items: [] })

  useEffect(() => {
    const poll = async () => {
      try {
        const res = await fetch('/api/radio/library?tab=injections')
        const data = await res.json()
        if (data?.injections) {
          const pending = data.injections.filter((i: { status: string }) => i.status === 'pending')
          setInjections({
            pending: pending.length,
            items: pending.slice(0, 3).map((i: { id: number; item_type: string; priority: number }) => ({
              id: i.id, type: i.item_type, priority: i.priority,
            })),
          })
        }
      } catch { /* ignore */ }
    }
    poll()
    const interval = setInterval(poll, 30_000)
    return () => clearInterval(interval)
  }, [])

  if (injections.pending === 0) return null

  return (
    <div className="border-b border-pi-border">
      <SectionHeader icon={Syringe} label="Injections" accent="text-amber-400">
        <span className="text-[9px] font-bold text-amber-400 bg-amber-400/10 px-1.5 py-0.5 rounded-full">
          {injections.pending}
        </span>
      </SectionHeader>
      <div className="px-3 pb-1.5">
        {injections.items.map(item => (
          <p key={item.id} className="text-[9px] text-pi-text-dim pl-4 font-mono truncate">
            #{item.id} {item.type} {item.priority >= 500 ? '⚡ urgent' : ''}
          </p>
        ))}
      </div>
    </div>
  )
}

/* ─── Main Component ───────────────────────────── */

export function UnifiedOpsPanel({
  summary, vitals, mood,
  activity, brainStatus, onOpenDrawer, className,
}: UnifiedOpsPanelProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const firstCopyRef = useRef<HTMLDivElement>(null)
  const rafRef = useRef<number | null>(null)
  const pausedRef = useRef(false)
  const pauseTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const autoScrollRef = useRef(true)
  const [autoScrollEnabled, setAutoScrollEnabled] = useState(true)
  const scrollPosRef = useRef(0)
  const prevItemCountRef = useRef(0)

  // Collapsible sections
  const [vitalsCollapsed, setVitalsCollapsed] = useState(false)

  useEffect(() => { autoScrollRef.current = autoScrollEnabled }, [autoScrollEnabled])

  const feedItems = useFeedItems({ activity, summary, mood, vitals, brainStatus })

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

      scrollPosRef.current += SCROLL_SPEED
      if (scrollPosRef.current >= copyHeight) {
        scrollPosRef.current -= copyHeight
      }

      el.scrollTop = scrollPosRef.current
      rafRef.current = requestAnimationFrame(tick)
    }

    if (scrollRef.current) {
      scrollPosRef.current = scrollRef.current.scrollTop
    }

    rafRef.current = requestAnimationFrame(tick)
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      if (pauseTimeoutRef.current) clearTimeout(pauseTimeoutRef.current)
    }
  }, [])

  const handleInteractionStart = useCallback(() => {
    pausedRef.current = true
    if (pauseTimeoutRef.current) clearTimeout(pauseTimeoutRef.current)
  }, [])

  const handleInteractionEnd = useCallback(() => {
    if (scrollRef.current) {
      scrollPosRef.current = scrollRef.current.scrollTop
    }
    pauseTimeoutRef.current = setTimeout(() => {
      pausedRef.current = false
    }, HOVER_RESUME_MS)
  }, [])

  /* ─── Derived data ──────────────────────────── */

  const bs = brainStatusConfig[brainStatus]
  const ramPct = vitals && vitals.ramTotalMb > 0
    ? Math.round((vitals.ramUsedMb / vitals.ramTotalMb) * 100)
    : null
  const diskPct = vitals && vitals.diskTotalGb > 0
    ? Math.round((vitals.diskUsedGb / vitals.diskTotalGb) * 100)
    : null

  // Mood emoji
  const moodEmoji = mood
    ? mood.frustration > 60 ? '😤'
    : mood.satisfaction > 70 ? '😊'
    : mood.curiosity > 70 ? '🧐'
    : mood.energy < 30 ? '😴'
    : mood.loneliness > 60 ? '🥺'
    : mood.pride > 70 ? '🏆'
    : '🤖'
    : null

  /* ─── Render ─────────────────────────────────── */

  return (
    <div className={cn('h-full flex flex-col bg-pi-panel border-l border-pi-border alive-panel', className)}>

      {/* ═══ Autonomy Status (always visible top) ═══ */}
      <div
        className="px-3 py-2.5 border-b border-pi-border bg-pi-panel/95 backdrop-blur-sm cursor-pointer hover:bg-pi-surface/20 transition-colors"
        onClick={() => onOpenDrawer?.('mission')}
      >
        <div className="flex items-center gap-2">
          <motion.div
            animate={
              summary.cyclePhase === 'executing' || summary.cyclePhase === 'responding'
                ? { scale: [1, 1.1, 1] }
                : undefined
            }
            transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
            className="rounded-lg border border-pi-accent/20 bg-pi-accent/10 p-1.5"
          >
            <BrainCircuit className="h-3.5 w-3.5 text-pi-accent" />
          </motion.div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="text-[9px] font-semibold uppercase tracking-[0.14em] text-pi-accent">Autonomy</span>
              <span className="rounded-full border border-pi-border bg-pi-surface/50 px-1.5 py-px text-[8px] text-pi-text-dim">
                {summary.cyclePhase}
              </span>
              <div className="flex items-center gap-1 ml-auto">
                <span className={cn('w-1.5 h-1.5 rounded-full', bs.dot, bs.pulse && 'animate-pulse')} />
                <span className={cn('text-[9px] font-medium', bs.color)}>{bs.label}</span>
              </div>
            </div>
            <p className="mt-0.5 truncate text-[11px] font-semibold text-pi-text">{summary.nowDoing || 'Idle'}</p>
          </div>
        </div>
        {summary.autonomyReason && (
          <p className="mt-1 pl-8 truncate text-[9px] text-pi-text-dim">
            Why: {summary.autonomyReason}
          </p>
        )}
      </div>

      {/* ═══ Quick Stats Row ═══ */}
      <div className="flex items-center gap-px border-b border-pi-border bg-pi-surface/30">
        {/* Mission */}
        {summary.currentMission && (
          <button
            onClick={() => onOpenDrawer?.('mission')}
            className="flex-1 flex items-center gap-1 px-2 py-1.5 text-[9px] text-pi-text-dim hover:bg-pi-surface/50 transition-colors truncate"
            title={summary.currentMission.title}
          >
            <Target className="w-3 h-3 text-pi-accent shrink-0" />
            <span className="truncate">{summary.currentMission.title}</span>
          </button>
        )}
        {/* Mood */}
        {moodEmoji && (
          <button
            onClick={() => onOpenDrawer?.('mood')}
            className="px-2 py-1.5 text-[10px] hover:bg-pi-surface/50 transition-colors"
            title={`Mood: ${mood?.satisfaction ?? 0}% satisfaction`}
          >
            {moodEmoji}
          </button>
        )}
        {/* Next up */}
        {summary.nextUp && (
          <div className="flex items-center gap-1 px-2 py-1.5 text-[9px] text-pi-text-dim truncate">
            <ArrowRight className="w-3 h-3 text-emerald-400 shrink-0" />
            <span className="truncate">{summary.nextUp}</span>
          </div>
        )}
      </div>

      {/* ═══ Vitals Card ═══ */}
      {vitals && (
        <div className="border-b border-pi-border">
          <SectionHeader
            icon={Cpu}
            label="Vitals"
            accent="text-cyan-500"
            collapsible
            collapsed={vitalsCollapsed}
            onToggle={() => setVitalsCollapsed(v => !v)}
          >
            {/* Always-visible mini stats */}
            <div className="flex items-center gap-2 text-[9px] font-mono text-pi-text-dim">
              <span className={cn(vitals.cpuPercent > 80 && 'text-amber-500')}>
                {Math.round(vitals.cpuPercent)}%
              </span>
              <span className={cn(vitals.cpuTemp > 70 ? 'text-red-400' : vitals.cpuTemp > 55 ? 'text-amber-400' : 'text-pi-text-dim')}>
                {Math.round(vitals.cpuTemp)}°
              </span>
            </div>
          </SectionHeader>

          <AnimatePresence>
            {!vitalsCollapsed && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.15 }}
                className="overflow-hidden"
              >
                <div className="px-3 pb-2 grid grid-cols-2 gap-x-3 gap-y-1">
                  <VitalBar label="CPU" value={vitals.cpuPercent} warn={80} crit={95} />
                  {ramPct !== null && <VitalBar label="RAM" value={ramPct} warn={85} crit={95} suffix={`${Math.round(vitals.ramUsedMb)}/${Math.round(vitals.ramTotalMb)}MB`} />}
                  <VitalBar label="Temp" value={vitals.cpuTemp} max={100} warn={65} crit={80} suffix={`${Math.round(vitals.cpuTemp)}°C`} />
                  {diskPct !== null && <VitalBar label="Disk" value={diskPct} warn={80} crit={90} suffix={`${diskPct}%`} />}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      {/* ═══ Attention Items ═══ */}
      {summary.attentionNeeded.length > 0 && (
        <div className="border-b border-pi-border px-3 py-1.5">
          {summary.attentionNeeded.slice(0, 3).map(attn => (
            <div key={attn.id} className="flex items-start gap-1.5 py-0.5">
              <AlertTriangle className={cn(
                'w-3 h-3 mt-0.5 shrink-0',
                attn.level === 'critical' ? 'text-red-500' : attn.level === 'warn' ? 'text-amber-500' : 'text-blue-400'
              )} />
              <span className={cn(
                'text-[10px] leading-relaxed',
                attn.level === 'critical' ? 'text-red-300' : attn.level === 'warn' ? 'text-orange-300' : 'text-pi-text-dim'
              )}>
                {attn.message}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* ═══ Radio Status ═══ */}
      <RadioWidget />

      {/* ═══ Injection Queue ═══ */}
      <InjectionsWidget />

      {/* ═══ Live Feed Header ═══ */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-pi-border bg-pi-panel/80">
        <div className="flex items-center gap-1.5">
          <Activity className="w-3 h-3 text-pi-accent" />
          <span className="text-[9px] font-bold uppercase tracking-[0.14em] text-pi-text-dim">Live Feed</span>
          <span className="text-[9px] text-pi-text-dim font-mono bg-pi-surface px-1 py-px rounded-full">
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
          <span className="flex items-center gap-1 text-[9px] text-pi-text-dim">
            <motion.span
              animate={{ opacity: [0.4, 1, 0.4] }}
              transition={{ duration: 2, repeat: Infinity }}
              className="w-1.5 h-1.5 rounded-full bg-emerald-500"
            />
            Live
          </span>
        </div>
      </div>

      {/* ═══ Live Feed Content (scrolling) ═══ */}
      <div
        ref={scrollRef}
        onMouseEnter={handleInteractionStart}
        onMouseLeave={handleInteractionEnd}
        onTouchStart={handleInteractionStart}
        onTouchEnd={handleInteractionEnd}
        className="flex-1 overflow-y-auto scrollbar-none"
      >
        {feedItems.length === 0 ? (
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
            <div ref={firstCopyRef} className="py-1">
              {feedItems.map(item => (
                <FeedRow key={item.id} item={item} isNew={newItemIds.has(item.id)} />
              ))}
            </div>
            <div className="py-1" aria-hidden="true">
              {feedItems.map(item => (
                <FeedRow key={`clone-${item.id}`} item={item} isNew={false} />
              ))}
            </div>
          </>
        )}
      </div>

      {/* ═══ Drawer Quick-Access Footer ═══ */}
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

/* ─── Vital Bar ───────────────────────────────── */

function VitalBar({
  label, value, max = 100, warn, crit, suffix,
}: {
  label: string
  value: number
  max?: number
  warn: number
  crit: number
  suffix?: string
}) {
  const pct = Math.min(100, (value / max) * 100)
  const color = value >= crit ? 'bg-red-500' : value >= warn ? 'bg-amber-500' : 'bg-emerald-500'

  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[8px] text-pi-text-dim font-mono w-7 shrink-0">{label}</span>
      <div className="flex-1 h-1.5 bg-pi-surface rounded-full overflow-hidden">
        <motion.div
          className={cn('h-full rounded-full', color)}
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
        />
      </div>
      <span className="text-[8px] text-pi-text-dim font-mono w-14 text-right shrink-0">
        {suffix || `${Math.round(value)}%`}
      </span>
    </div>
  )
}

/* ─── Drawer Button ───────────────────────────── */

function DrawerButton({
  label, icon: Icon, onClick,
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
