'use client'

import { useState, useEffect, useMemo } from 'react'
import { BarChart3, TrendingUp, DollarSign, Target } from 'lucide-react'
import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'
import type { AnalyticsSnapshot } from '@/lib/brain/brain-types'

/* ─── Types ─────────────────────────────────────── */

interface AnalyticsPanelProps {
  className?: string
}

interface DayBucket {
  date: string
  label: string
  cost: number
  count: number
  avgCuriosity: number
  avgSatisfaction: number
}

/* ─── Helpers ───────────────────────────────────── */

function bucketByDay(snapshots: AnalyticsSnapshot[]): DayBucket[] {
  const map = new Map<string, { cost: number; count: number; curiosity: number[]; satisfaction: number[] }>()

  for (const s of snapshots) {
    const date = s.timestamp.slice(0, 10) // YYYY-MM-DD
    const bucket = map.get(date) || { cost: 0, count: 0, curiosity: [], satisfaction: [] }
    bucket.cost += s.apiCost
    bucket.count += 1
    bucket.curiosity.push(s.mood.curiosity)
    bucket.satisfaction.push(s.mood.satisfaction)
    map.set(date, bucket)
  }

  const days: DayBucket[] = []
  for (const [date, data] of map) {
    const avg = (arr: number[]) => arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0
    days.push({
      date,
      label: new Date(date + 'T00:00:00').toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric' }),
      cost: data.cost,
      count: data.count,
      avgCuriosity: Math.round(avg(data.curiosity)),
      avgSatisfaction: Math.round(avg(data.satisfaction)),
    })
  }

  return days.sort((a, b) => a.date.localeCompare(b.date))
}

function formatCost(cost: number): string {
  return cost < 0.01 ? '<$0.01' : `$${cost.toFixed(2)}`
}

/* ─── SVG Bar Chart ─────────────────────────────── */

function BarChartSVG({ data, color, label }: { data: { label: string; value: number }[]; color: string; label: string }) {
  if (data.length === 0) return null

  const maxVal = Math.max(...data.map(d => d.value), 0.01)
  const barWidth = 100 / data.length
  const barPad = barWidth * 0.2
  const chartH = 60
  const labelH = 14

  return (
    <svg
      viewBox={`0 0 100 ${chartH + labelH}`}
      width="100%"
      preserveAspectRatio="xMidYMid meet"
      className="block"
      role="img"
      aria-label={label}
    >
      {data.map((d, i) => {
        const barH = maxVal > 0 ? (d.value / maxVal) * (chartH - 4) : 0
        const x = i * barWidth + barPad / 2
        const w = barWidth - barPad

        return (
          <g key={i}>
            {/* Bar */}
            <rect
              x={x}
              y={chartH - barH}
              width={w}
              height={Math.max(barH, 1)}
              rx={1.5}
              fill={color}
              opacity={0.8}
            >
              <title>{`${d.label}: ${d.value}`}</title>
            </rect>
            {/* Label */}
            <text
              x={x + w / 2}
              y={chartH + labelH - 2}
              textAnchor="middle"
              fill="currentColor"
              className="text-pi-text-dim"
              fontSize={3.2}
              opacity={0.5}
            >
              {d.label}
            </text>
          </g>
        )
      })}
    </svg>
  )
}

/* ─── SVG Line Chart ────────────────────────────── */

function LineChartSVG({
  lines,
  labels,
  chartLabel,
}: {
  lines: { values: number[]; color: string; label: string }[]
  labels: string[]
  chartLabel: string
}) {
  if (labels.length < 2) return null

  const chartW = 100
  const chartH = 50
  const labelH = 14
  const padX = 2
  const padY = 4
  const innerW = chartW - padX * 2
  const innerH = chartH - padY * 2

  const allValues = lines.flatMap(l => l.values)
  const maxVal = Math.max(...allValues, 1)
  const minVal = Math.min(...allValues, 0)
  const range = maxVal - minVal || 1

  function toPoints(values: number[]): string {
    return values
      .map((v, i) => {
        const x = padX + (i / (values.length - 1)) * innerW
        const y = padY + innerH - ((v - minVal) / range) * innerH
        return `${x},${y}`
      })
      .join(' ')
  }

  return (
    <svg
      viewBox={`0 0 ${chartW} ${chartH + labelH}`}
      width="100%"
      preserveAspectRatio="xMidYMid meet"
      className="block"
      role="img"
      aria-label={chartLabel}
    >
      {/* Grid lines */}
      {[0, 0.25, 0.5, 0.75, 1].map(pct => {
        const y = padY + innerH - pct * innerH
        return (
          <line
            key={pct}
            x1={padX}
            y1={y}
            x2={chartW - padX}
            y2={y}
            stroke="currentColor"
            className="text-pi-border"
            strokeWidth={0.3}
            opacity={0.3}
          />
        )
      })}

      {/* Lines */}
      {lines.map((line, li) => (
        <polyline
          key={li}
          points={toPoints(line.values)}
          fill="none"
          stroke={line.color}
          strokeWidth={1.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity={0.85}
        >
          <title>{line.label}</title>
        </polyline>
      ))}

      {/* Dots on latest point */}
      {lines.map((line, li) => {
        const lastIdx = line.values.length - 1
        const x = padX + (lastIdx / (line.values.length - 1)) * innerW
        const y = padY + innerH - ((line.values[lastIdx] - minVal) / range) * innerH
        return (
          <circle key={`dot-${li}`} cx={x} cy={y} r={1.8} fill={line.color} />
        )
      })}

      {/* X-axis labels */}
      {labels.map((lbl, i) => {
        const x = padX + (i / (labels.length - 1)) * innerW
        return (
          <text
            key={i}
            x={x}
            y={chartH + labelH - 2}
            textAnchor="middle"
            fill="currentColor"
            className="text-pi-text-dim"
            fontSize={3.2}
            opacity={0.5}
          >
            {lbl}
          </text>
        )
      })}
    </svg>
  )
}

/* ─── Stat Number Card ──────────────────────────── */

function StatNumber({
  icon: Icon,
  iconColor,
  label,
  value,
  sub,
  index,
}: {
  icon: React.ElementType
  iconColor: string
  label: string
  value: string | number
  sub?: string
  index: number
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ delay: index * 0.06, type: 'spring', stiffness: 500, damping: 30 }}
      className="p-2.5 rounded-lg border border-pi-border/50 bg-pi-surface/30"
    >
      <div className="flex items-center gap-1.5 mb-1">
        <Icon className={cn('w-3 h-3', iconColor)} />
        <span className="text-[9px] text-pi-text-dim uppercase tracking-wider font-medium">{label}</span>
      </div>
      <p className="text-sm font-bold font-mono text-pi-text leading-tight">{value}</p>
      {sub && <p className="text-[9px] text-pi-text-dim/60 mt-0.5">{sub}</p>}
    </motion.div>
  )
}

/* ─── Legend ─────────────────────────────────────── */

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1 text-[9px] text-pi-text-dim">
      <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: color }} />
      {label}
    </span>
  )
}

/* ─── Component ─────────────────────────────────── */

export function AnalyticsPanel({ className }: AnalyticsPanelProps) {
  const [snapshots, setSnapshots] = useState<AnalyticsSnapshot[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function fetchAnalytics() {
      try {
        const res = await fetch('/api/brain/analytics?days=7')
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const data = await res.json()
        if (!cancelled) {
          setSnapshots(data.snapshots || [])
          setError(null)
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load analytics')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    fetchAnalytics()
    return () => { cancelled = true }
  }, [])

  const days = useMemo(() => bucketByDay(snapshots), [snapshots])

  const goalStats = useMemo(() => {
    if (snapshots.length === 0) return { active: 0, completed: 0, total: 0 }
    const latest = snapshots[snapshots.length - 1]
    return {
      active: latest.activeGoals,
      completed: latest.completedGoals,
      total: latest.activeGoals + latest.completedGoals,
    }
  }, [snapshots])

  const totalCost = useMemo(() => {
    if (snapshots.length === 0) return 0
    return snapshots[snapshots.length - 1].cumulativeCost
  }, [snapshots])

  const costChartData = useMemo(
    () => days.map(d => ({ label: d.label, value: parseFloat(d.cost.toFixed(4)) })),
    [days]
  )

  const activityChartData = useMemo(
    () => days.map(d => ({ label: d.label, value: d.count })),
    [days]
  )

  const moodLines = useMemo(() => {
    if (days.length < 2) return null
    return {
      lines: [
        { values: days.map(d => d.avgCuriosity), color: '#a855f7', label: 'Curiosity' },
        { values: days.map(d => d.avgSatisfaction), color: '#10b981', label: 'Satisfaction' },
      ],
      labels: days.map(d => d.label),
    }
  }, [days])

  /* ─── Loading / Error ──────────────────────────── */

  if (loading) {
    return (
      <div className={cn('', className)}>
        <div className="flex items-center gap-2 mb-3">
          <div className="w-3.5 h-3.5 rounded animate-skeleton" />
          <div className="w-24 h-3.5 rounded animate-skeleton" />
        </div>
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-20 rounded-lg animate-skeleton" style={{ animationDelay: `${i * 100}ms` }} />
          ))}
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className={cn('', className)}>
        <div className="flex items-center gap-2 mb-3">
          <BarChart3 className="w-3.5 h-3.5 text-pi-accent" />
          <span className="text-[11px] font-bold text-pi-text uppercase tracking-wider">Analytics</span>
        </div>
        <div className="p-3 rounded-lg bg-red-500/5 border border-red-500/20 text-[10px] text-red-400">
          {error}
        </div>
      </div>
    )
  }

  if (snapshots.length === 0) {
    return (
      <div className={cn('', className)}>
        <div className="flex items-center gap-2 mb-3">
          <BarChart3 className="w-3.5 h-3.5 text-pi-accent" />
          <span className="text-[11px] font-bold text-pi-text uppercase tracking-wider">Analytics</span>
        </div>
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col items-center justify-center py-6 text-pi-text-dim"
        >
          <BarChart3 className="w-8 h-8 mb-2 opacity-20" />
          <p className="text-xs font-medium">No data yet</p>
          <p className="text-[10px] mt-1 text-center max-w-[180px]">
            Analytics snapshots will appear here as the brain runs.
          </p>
        </motion.div>
      </div>
    )
  }

  return (
    <div className={cn('', className)}>
      {/* Header */}
      <div className="flex items-center gap-2 mb-4 sm:mb-3">
        <BarChart3 className="w-4 h-4 sm:w-3.5 sm:h-3.5 text-pi-accent" />
        <span className="text-[12px] sm:text-[11px] font-bold text-pi-text uppercase tracking-wider">Analytics</span>
        <span className="text-[9px] text-pi-text-dim bg-pi-surface px-1.5 py-0.5 rounded-full font-mono ml-auto">
          7d
        </span>
      </div>

      {/* Goal completion cards */}
      <div className="grid grid-cols-3 gap-1.5 mb-3">
        <StatNumber
          icon={Target}
          iconColor="text-cyan-400"
          label="Active"
          value={goalStats.active}
          index={0}
        />
        <StatNumber
          icon={Target}
          iconColor="text-emerald-400"
          label="Done"
          value={goalStats.completed}
          index={1}
        />
        <StatNumber
          icon={DollarSign}
          iconColor="text-amber-400"
          label="Total Cost"
          value={formatCost(totalCost)}
          index={2}
        />
      </div>

      {/* Cost per day bar chart */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2, type: 'spring', stiffness: 400, damping: 25 }}
        className="mb-3 p-2.5 rounded-lg border border-pi-border/50 bg-pi-surface/30"
      >
        <div className="flex items-center gap-1.5 mb-2">
          <DollarSign className="w-3 h-3 text-emerald-400" />
          <span className="text-[10px] font-medium text-pi-text">Cost per Day</span>
        </div>
        <BarChartSVG data={costChartData} color="#10b981" label="Cost per day" />
      </motion.div>

      {/* Mood trends line chart */}
      {moodLines && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3, type: 'spring', stiffness: 400, damping: 25 }}
          className="mb-3 p-2.5 rounded-lg border border-pi-border/50 bg-pi-surface/30"
        >
          <div className="flex items-center gap-1.5 mb-2">
            <TrendingUp className="w-3 h-3 text-purple-400" />
            <span className="text-[10px] font-medium text-pi-text">Mood Trends</span>
            <div className="flex items-center gap-2 ml-auto">
              <LegendDot color="#a855f7" label="Curiosity" />
              <LegendDot color="#10b981" label="Satisfaction" />
            </div>
          </div>
          <LineChartSVG
            lines={moodLines.lines}
            labels={moodLines.labels}
            chartLabel="Mood trends: curiosity and satisfaction"
          />
        </motion.div>
      )}

      {/* Activity volume bar chart */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4, type: 'spring', stiffness: 400, damping: 25 }}
        className="p-2.5 rounded-lg border border-pi-border/50 bg-pi-surface/30"
      >
        <div className="flex items-center gap-1.5 mb-2">
          <BarChart3 className="w-3 h-3 text-blue-400" />
          <span className="text-[10px] font-medium text-pi-text">Activity Volume</span>
          <span className="text-[9px] text-pi-text-dim ml-auto font-mono">
            {snapshots.length} snapshots
          </span>
        </div>
        <BarChartSVG data={activityChartData} color="#3b82f6" label="Snapshots per day" />
      </motion.div>
    </div>
  )
}
