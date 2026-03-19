'use client'

import { useState, useEffect, useCallback } from 'react'
import { Globe, Server, CheckCircle2, AlertCircle, Clock, Activity } from 'lucide-react'
import { cn } from '@/lib/utils'

/* ─── Types ─────────────────────────────────── */

interface TimelinePoint {
  ts: string
  ok: boolean
  ms: number
}

interface ServiceSummary {
  name: string
  uptimePct: number
  avgMs: number
  lastOk: boolean
  lastMs: number
  timeline: TimelinePoint[]
}

interface UptimeData {
  services: ServiceSummary[]
  overallUptime: number
  totalChecks: number
  window: string
}

/* ─── Service grouping ──────────────────────── */

const EXTERNAL_PREFIXES = ['CheapSkipBins', 'BinHireAU', 'Bonkr', 'AussieSMS']
const INFRA_PREFIXES = ['Supabase', 'Pi-Chi']

function getGroup(name: string): 'external' | 'infra' | 'other' {
  if (EXTERNAL_PREFIXES.some(p => name.startsWith(p))) return 'external'
  if (INFRA_PREFIXES.some(p => name.startsWith(p))) return 'infra'
  return 'other'
}

/* ─── Timeline bar ──────────────────────────── */

function TimelineBar({ timeline }: { timeline: TimelinePoint[] }) {
  if (timeline.length === 0) return null

  return (
    <div className="flex items-center gap-px" title="Last 4 hours (newest right)">
      {timeline.map((point, i) => (
        <div
          key={i}
          title={`${new Date(point.ts).toLocaleTimeString()} — ${point.ok ? `${point.ms}ms` : 'DOWN'}`}
          className={cn(
            'h-3 rounded-[1px] flex-1 min-w-[2px] max-w-[6px] transition-colors',
            point.ok ? 'bg-emerald-500/80' : 'bg-red-500/80'
          )}
        />
      ))}
    </div>
  )
}

/* ─── Service row ───────────────────────────── */

function ServiceRow({ service }: { service: ServiceSummary }) {
  const upColor = service.uptimePct >= 99 ? 'text-emerald-400'
    : service.uptimePct >= 95 ? 'text-amber-400'
    : 'text-red-400'

  return (
    <div className="px-3 py-1.5 hover:bg-pi-surface/30 transition-colors">
      <div className="flex items-center gap-1.5 mb-1">
        {/* Status dot */}
        <div className={cn(
          'w-1.5 h-1.5 rounded-full shrink-0',
          service.lastOk ? 'bg-emerald-500' : 'bg-red-500 animate-pulse'
        )} />

        {/* Name */}
        <span className="text-[10px] text-pi-text font-medium flex-1 truncate min-w-0">
          {service.name}
        </span>

        {/* Uptime % */}
        <span className={cn('text-[9px] font-mono font-semibold shrink-0', upColor)}>
          {service.uptimePct.toFixed(1)}%
        </span>

        {/* Avg ms */}
        <span className="text-[9px] font-mono text-pi-text-dim shrink-0 w-14 text-right">
          {service.avgMs}ms avg
        </span>
      </div>

      {/* Timeline */}
      <div className="pl-3">
        <TimelineBar timeline={service.timeline} />
      </div>
    </div>
  )
}

/* ─── Group section ─────────────────────────── */

function ServiceGroup({
  label,
  icon: Icon,
  services,
}: {
  label: string
  icon: React.ElementType
  services: ServiceSummary[]
}) {
  if (services.length === 0) return null
  const groupUptime = services.length > 0
    ? services.reduce((sum, s) => sum + s.uptimePct, 0) / services.length
    : 0
  const allOk = services.every(s => s.lastOk)

  return (
    <div className="border-b border-pi-border/50 last:border-b-0">
      {/* Group header */}
      <div className="flex items-center gap-1.5 px-3 py-1 bg-pi-surface/20">
        <Icon className="w-3 h-3 text-pi-text-dim" />
        <span className="text-[9px] font-bold uppercase tracking-[0.12em] text-pi-text-dim flex-1">
          {label}
        </span>
        {allOk
          ? <CheckCircle2 className="w-3 h-3 text-emerald-500" />
          : <AlertCircle className="w-3 h-3 text-red-400" />
        }
        <span className={cn(
          'text-[9px] font-mono font-semibold',
          groupUptime >= 99 ? 'text-emerald-400' : groupUptime >= 95 ? 'text-amber-400' : 'text-red-400'
        )}>
          {groupUptime.toFixed(1)}%
        </span>
      </div>

      {/* Service rows */}
      {services.map(service => (
        <ServiceRow key={service.name} service={service} />
      ))}
    </div>
  )
}

/* ─── Main component ────────────────────────── */

export function UptimePanel() {
  const [data, setData] = useState<UptimeData | null>(null)
  const [loading, setLoading] = useState(true)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch('/api/uptime', { signal: AbortSignal.timeout(10_000) })
      if (res.ok) {
        const json = await res.json() as UptimeData
        setData(json)
        setLastUpdated(new Date())
      }
    } catch {
      // Silent fail — stale data stays visible
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
    const timer = setInterval(fetchData, 60_000)
    return () => clearInterval(timer)
  }, [fetchData])

  // Group services
  const external = data?.services.filter(s => getGroup(s.name) === 'external') ?? []
  const infra = data?.services.filter(s => getGroup(s.name) === 'infra') ?? []
  const other = data?.services.filter(s => getGroup(s.name) === 'other') ?? []

  return (
    <div className="flex flex-col">
      {/* Header */}
      <div className="flex items-center gap-1.5 px-3 py-2.5 border-b border-pi-border">
        <Activity className="w-3.5 h-3.5 text-pi-accent" />
        <span className="text-xs font-bold text-pi-text">Site Uptime</span>

        {data && (
          <div className="ml-auto flex items-center gap-2">
            {/* Overall uptime badge */}
            <span className={cn(
              'text-[9px] font-mono font-bold px-1.5 py-0.5 rounded-full border',
              data.overallUptime >= 99
                ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20'
                : data.overallUptime >= 95
                  ? 'text-amber-400 bg-amber-500/10 border-amber-500/20'
                  : 'text-red-400 bg-red-500/10 border-red-500/20'
            )}>
              {data.overallUptime.toFixed(1)}%
            </span>
            {/* Window */}
            <span className="text-[9px] text-pi-text-dim font-mono">
              {data.window}
            </span>
          </div>
        )}
      </div>

      {/* Loading state */}
      {loading && (
        <div className="flex items-center justify-center py-8 text-pi-text-dim">
          <div className="w-4 h-4 border-2 border-pi-accent/30 border-t-pi-accent rounded-full animate-spin mr-2" />
          <span className="text-[10px]">Loading uptime data…</span>
        </div>
      )}

      {/* No data */}
      {!loading && (!data || data.services.length === 0) && (
        <div className="flex flex-col items-center justify-center py-8 text-pi-text-dim gap-2">
          <Clock className="w-6 h-6 opacity-30" />
          <span className="text-[10px]">No health check history found</span>
          <span className="text-[9px] opacity-60">~/.pi-chi/health-checks/history.jsonl</span>
        </div>
      )}

      {/* Service groups */}
      {!loading && data && data.services.length > 0 && (
        <div className="divide-y divide-pi-border/30">
          <ServiceGroup label="External" icon={Globe} services={external} />
          <ServiceGroup label="Infrastructure" icon={Server} services={infra} />
          {other.length > 0 && (
            <ServiceGroup label="Other" icon={Activity} services={other} />
          )}
        </div>
      )}

      {/* Footer — last updated + total checks */}
      {!loading && data && (
        <div className="flex items-center justify-between px-3 py-1.5 border-t border-pi-border/50 bg-pi-surface/20">
          <span className="text-[9px] text-pi-text-dim font-mono">
            {data.totalChecks} checks
          </span>
          {lastUpdated && (
            <span className="text-[9px] text-pi-text-dim font-mono">
              updated {lastUpdated.toLocaleTimeString()}
            </span>
          )}
        </div>
      )}
    </div>
  )
}
