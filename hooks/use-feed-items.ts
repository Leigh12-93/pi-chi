'use client'

import { useMemo, useRef } from 'react'
import type { FeedItem } from '@/lib/agent-types'
import type { ActivityEntry, SystemVitals } from '@/lib/agent-types'
import type { DashboardSummary } from '@/lib/brain/domain-types'
import type { MoodState } from '@/lib/brain/brain-types'

/* ─── Icon/color maps ──────────────────────────── */

const activityIconMap: Record<ActivityEntry['type'], { icon: string; color: string }> = {
  system:  { icon: 'Cpu',            color: 'text-cyan-500' },
  goal:    { icon: 'Target',         color: 'text-pi-accent' },
  action:  { icon: 'Zap',            color: 'text-yellow-500' },
  decision:{ icon: 'Brain',          color: 'text-purple-500' },
  error:   { icon: 'AlertTriangle',  color: 'text-red-500' },
  success: { icon: 'CheckCircle2',   color: 'text-emerald-500' },
  gpio:    { icon: 'Activity',       color: 'text-orange-500' },
  network: { icon: 'Wifi',           color: 'text-blue-500' },
}

const toneFromActivityType: Record<ActivityEntry['type'], FeedItem['tone']> = {
  system:   'neutral',
  goal:     'accent',
  action:   'neutral',
  decision: 'accent',
  error:    'critical',
  success:  'positive',
  gpio:     'neutral',
  network:  'neutral',
}

/* ─── Helpers ──────────────────────────────────── */

function fmtTime(ts: number): string {
  const d = new Date(ts)
  return d.toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit', hour12: false })
}

function parseEntryTime(timeStr: string): number {
  // Activity entries have time like "14:32" — parse as today
  const [h, m] = timeStr.split(':').map(Number)
  if (isNaN(h) || isNaN(m)) return Date.now()
  const d = new Date()
  d.setHours(h, m, 0, 0)
  return d.getTime()
}

/* ─── Hook ─────────────────────────────────────── */

interface UseFeedItemsParams {
  activity: ActivityEntry[]
  summary: DashboardSummary
  mood: MoodState | null | undefined
  vitals: SystemVitals | null | undefined
  brainStatus: 'running' | 'sleeping' | 'not-running' | 'error'
}

const MAX_FEED_ITEMS = 200

export function useFeedItems({
  activity, summary, mood, vitals, brainStatus,
}: UseFeedItemsParams): FeedItem[] {

  // Track previous values for change detection
  const prevMissionRef = useRef<string | null>(null)
  const prevMoodRef = useRef<MoodState | null>(null)
  const prevBrainStatusRef = useRef<string>('')
  const prevQueueRef = useRef<string>('')
  const prevVitalsRef = useRef<string>('')

  // Accumulated event items (mission changes, mood shifts, status changes)
  const eventItemsRef = useRef<FeedItem[]>([])

  return useMemo(() => {
    const items: FeedItem[] = []
    const now = Date.now()

    // ── 1. Activity entries (last 50) ──
    const recentActivity = activity.slice(-50)
    for (const entry of recentActivity) {
      const mapping = activityIconMap[entry.type] || activityIconMap.action
      const ts = parseEntryTime(entry.time)
      items.push({
        id: `act-${entry.id}`,
        kind: 'activity',
        timestamp: ts,
        displayTime: entry.time,
        icon: mapping.icon,
        color: mapping.color,
        headline: entry.message,
        tone: toneFromActivityType[entry.type] || 'neutral',
      })
    }

    // ── 2. Mission changes ──
    const missionId = summary.currentMission?.id ?? null
    if (missionId && missionId !== prevMissionRef.current) {
      prevMissionRef.current = missionId
      eventItemsRef.current.push({
        id: `mission-${missionId}-${now}`,
        kind: 'mission',
        timestamp: now,
        displayTime: fmtTime(now),
        icon: 'Target',
        color: 'text-pi-accent',
        headline: `Mission: ${summary.currentMission!.title}`,
        detail: summary.currentMission!.progressLabel,
        tone: 'accent',
      })
    } else if (!missionId) {
      prevMissionRef.current = null
    }

    // ── 3. Work queue items (now/blocked only) ──
    const queueKey = summary.workQueue
      .filter(q => q.status === 'now' || q.status === 'blocked')
      .map(q => `${q.id}:${q.status}`)
      .join(',')
    if (queueKey && queueKey !== prevQueueRef.current) {
      prevQueueRef.current = queueKey
      for (const qi of summary.workQueue.filter(q => q.status === 'now' || q.status === 'blocked')) {
        const isBlocked = qi.status === 'blocked'
        eventItemsRef.current.push({
          id: `queue-${qi.id}-${now}`,
          kind: 'queue',
          timestamp: now,
          displayTime: fmtTime(now),
          icon: isBlocked ? 'AlertTriangle' : 'ListChecks',
          color: isBlocked ? 'text-red-500' : 'text-yellow-500',
          headline: `${isBlocked ? 'Blocked' : 'Active'}: ${qi.label}`,
          tone: isBlocked ? 'warning' : 'neutral',
        })
      }
    }

    // ── 4. Cycle completions ──
    if (summary.lastCycle) {
      items.push({
        id: `cycle-${summary.lastCycle.id}`,
        kind: 'cycle-complete',
        timestamp: now - 1000, // slightly in the past
        displayTime: fmtTime(now - 1000),
        icon: 'CheckCircle2',
        color: 'text-emerald-500',
        headline: `Cycle complete: ${summary.lastCycle.title}`,
        detail: summary.lastCycle.outcome,
        tone: 'positive',
      })
    }
    for (const cycle of summary.recentCycles.slice(0, 3)) {
      items.push({
        id: `rcycle-${cycle.id}`,
        kind: 'cycle-complete',
        timestamp: now - 60000, // older
        displayTime: fmtTime(now - 60000),
        icon: 'RotateCcw',
        color: 'text-pi-text-dim',
        headline: `Cycle: ${cycle.title}`,
        detail: cycle.outcome,
        tone: 'neutral',
      })
    }

    // ── 5. Mood shifts (>15 points change) ──
    if (mood && prevMoodRef.current) {
      const dims = ['curiosity', 'satisfaction', 'frustration', 'loneliness', 'energy', 'pride'] as const
      for (const dim of dims) {
        const delta = mood[dim] - prevMoodRef.current[dim]
        if (Math.abs(delta) > 15) {
          const direction = delta > 0 ? 'surged' : 'dropped'
          eventItemsRef.current.push({
            id: `mood-${dim}-${now}`,
            kind: 'mood-shift',
            timestamp: now,
            displayTime: fmtTime(now),
            icon: 'Heart',
            color: delta > 0 ? 'text-pink-500' : 'text-pink-400',
            headline: `${dim.charAt(0).toUpperCase() + dim.slice(1)} ${direction}: ${mood[dim]}%`,
            tone: dim === 'frustration' ? (delta > 0 ? 'warning' : 'positive') : (delta > 0 ? 'positive' : 'neutral'),
          })
        }
      }
    }
    prevMoodRef.current = mood ? { ...mood } : null

    // ── 6. Attention items ──
    for (const attn of summary.attentionNeeded) {
      items.push({
        id: `attn-${attn.id}`,
        kind: 'attention',
        timestamp: now - 500,
        displayTime: fmtTime(now),
        icon: 'AlertTriangle',
        color: attn.level === 'critical' ? 'text-red-500' : attn.level === 'warn' ? 'text-amber-500' : 'text-blue-400',
        headline: attn.message,
        tone: attn.level === 'critical' ? 'critical' : attn.level === 'warn' ? 'warning' : 'neutral',
      })
    }

    // ── 7. Top opportunity ──
    if (summary.topOpportunity) {
      items.push({
        id: `opp-${summary.topOpportunity.id}`,
        kind: 'opportunity',
        timestamp: now - 2000,
        displayTime: fmtTime(now),
        icon: 'Radar',
        color: 'text-violet-500',
        headline: `Opportunity: ${summary.topOpportunity.title}`,
        detail: `${summary.topOpportunity.stage} · ${summary.topOpportunity.confidence}% confidence`,
        tone: 'accent',
      })
    }

    // ── 8. Portfolio ──
    if (summary.portfolioValue !== null) {
      const pct = summary.portfolioTarget > 0
        ? Math.round((summary.portfolioValue / summary.portfolioTarget) * 100)
        : 0
      items.push({
        id: 'portfolio-current',
        kind: 'portfolio',
        timestamp: now - 3000,
        displayTime: fmtTime(now),
        icon: 'Briefcase',
        color: 'text-emerald-500',
        headline: `Portfolio: $${summary.portfolioValue.toLocaleString()} (${pct}% of target)`,
        detail: summary.topBusiness ? `Top: ${summary.topBusiness.name}` : undefined,
        tone: pct >= 80 ? 'positive' : pct >= 40 ? 'neutral' : 'warning',
      })
    }

    // ── 9. Vitals (compact, change-sensitive) ──
    if (vitals) {
      const vitalsKey = `${Math.round(vitals.cpuPercent)}-${Math.round(vitals.cpuTemp)}-${Math.round(vitals.ramUsedMb)}`
      if (vitalsKey !== prevVitalsRef.current) {
        prevVitalsRef.current = vitalsKey
        const isHot = vitals.cpuTemp > 70
        const isHighCpu = vitals.cpuPercent > 80
        const isHighRam = vitals.ramTotalMb > 0 && (vitals.ramUsedMb / vitals.ramTotalMb) > 0.85
        const tone: FeedItem['tone'] = (isHot || isHighCpu || isHighRam) ? 'warning' : 'neutral'
        items.push({
          id: `vitals-${now}`,
          kind: 'vitals',
          timestamp: now - 4000,
          displayTime: fmtTime(now),
          icon: 'Cpu',
          color: tone === 'warning' ? 'text-amber-500' : 'text-cyan-500',
          headline: `CPU ${Math.round(vitals.cpuPercent)}% · ${Math.round(vitals.cpuTemp)}°C · RAM ${Math.round(vitals.ramUsedMb)}MB`,
          tone,
        })
      }
    }

    // ── 10. Background events ──
    for (const evt of summary.backgroundEvents) {
      const toneMap: Record<string, FeedItem['tone']> = {
        thinking: 'neutral', action: 'accent', result: 'positive', warning: 'warning',
      }
      items.push({
        id: `bg-${evt.id}`,
        kind: 'background',
        timestamp: new Date(evt.at).getTime() || now - 5000,
        displayTime: fmtTime(new Date(evt.at).getTime() || now),
        icon: evt.tone === 'warning' ? 'AlertTriangle' : evt.tone === 'action' ? 'Zap' : 'Activity',
        color: evt.tone === 'warning' ? 'text-amber-500' : evt.tone === 'action' ? 'text-yellow-500' : 'text-cyan-400',
        headline: evt.label,
        tone: toneMap[evt.tone] || 'neutral',
      })
    }

    // ── 11. Brain status changes ──
    if (brainStatus !== prevBrainStatusRef.current && prevBrainStatusRef.current) {
      eventItemsRef.current.push({
        id: `status-${brainStatus}-${now}`,
        kind: 'status',
        timestamp: now,
        displayTime: fmtTime(now),
        icon: brainStatus === 'running' ? 'BrainCircuit' : brainStatus === 'sleeping' ? 'Moon' : brainStatus === 'error' ? 'AlertTriangle' : 'Circle',
        color: brainStatus === 'running' ? 'text-emerald-500' : brainStatus === 'sleeping' ? 'text-indigo-400' : brainStatus === 'error' ? 'text-red-500' : 'text-pi-text-dim',
        headline: `Brain ${brainStatus === 'not-running' ? 'offline' : brainStatus}`,
        tone: brainStatus === 'error' ? 'critical' : brainStatus === 'running' ? 'positive' : 'neutral',
      })
    }
    prevBrainStatusRef.current = brainStatus

    // ── Merge accumulated event items ──
    // Keep only last 50 event items to prevent unbounded growth
    if (eventItemsRef.current.length > 50) {
      eventItemsRef.current = eventItemsRef.current.slice(-50)
    }
    items.push(...eventItemsRef.current)

    // ── Sort by timestamp ascending, cap at MAX ──
    items.sort((a, b) => a.timestamp - b.timestamp)
    return items.slice(-MAX_FEED_ITEMS)

  }, [activity, summary, mood, vitals, brainStatus])
}
