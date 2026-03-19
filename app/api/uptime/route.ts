import { NextResponse } from 'next/server'
import { readFile } from 'fs/promises'
import { existsSync } from 'fs'

export const dynamic = 'force-dynamic'

/* ─── Types ─────────────────────────────────── */

interface HealthCheckEntry {
  ts: string
  ok: boolean
  healthy: number
  total: number
  times?: Record<string, { ms: number; ok: boolean }>
}

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

interface UptimeResponse {
  services: ServiceSummary[]
  overallUptime: number
  totalChecks: number
  window: string
}

/* ─── Constants ─────────────────────────────── */

const HISTORY_FILE = `${process.env.HOME ?? '/home/pi'}/.pi-chi/health-checks/history.jsonl`
const MAX_ENTRIES = 288   // 24h at 5min intervals
const TIMELINE_ENTRIES = 48 // 4h at 5min intervals

/* ─── Service grouping ──────────────────────── */

// Order services: External group first, Infrastructure group second
const SERVICE_ORDER: string[] = [
  // External group
  'CheapSkipBins - Site',
  'CheapSkipBins - Chat API',
  'CheapSkipBins - Suburbs API',
  'BinHireAU - Site',
  'BinHireAU - Chat API',
  'Bonkr - Site',
  'AussieSMS - Site',
  // Infrastructure group
  'Supabase - CheapSkipBins',
  'Pi-Chi Dashboard',
  'Pi-Chi Brain API',
  'Pi-Chi Vitals API',
]

/* ─── GET /api/uptime ───────────────────────── */

export async function GET() {
  if (!existsSync(HISTORY_FILE)) {
    return NextResponse.json(
      { services: [], overallUptime: 0, totalChecks: 0, window: '0h' },
      { headers: { 'Cache-Control': 'no-store, max-age=0' } }
    )
  }

  let raw: string
  try {
    raw = await readFile(HISTORY_FILE, 'utf-8')
  } catch {
    return NextResponse.json(
      { services: [], overallUptime: 0, totalChecks: 0, window: '0h' },
      { headers: { 'Cache-Control': 'no-store, max-age=0' } }
    )
  }

  // Parse JSONL, cap at last MAX_ENTRIES lines
  const lines = raw.trim().split('\n').filter(Boolean)
  const cappedLines = lines.slice(-MAX_ENTRIES)

  const entries: HealthCheckEntry[] = []
  for (const line of cappedLines) {
    try {
      const obj = JSON.parse(line) as HealthCheckEntry
      if (obj.ts && typeof obj.ok === 'boolean') {
        entries.push(obj)
      }
    } catch {
      // Skip malformed lines
    }
  }

  if (entries.length === 0) {
    return NextResponse.json(
      { services: [], overallUptime: 0, totalChecks: 0, window: '0h' },
      { headers: { 'Cache-Control': 'no-store, max-age=0' } }
    )
  }

  // Build per-service data
  const serviceData: Record<string, { ok: boolean; ms: number; ts: string }[]> = {}

  for (const entry of entries) {
    if (!entry.times) continue
    for (const [name, data] of Object.entries(entry.times)) {
      if (!serviceData[name]) serviceData[name] = []
      serviceData[name].push({ ok: data.ok, ms: data.ms, ts: entry.ts })
    }
  }

  // Derive window label from oldest entry
  const oldest = new Date(entries[0].ts)
  const newest = new Date(entries[entries.length - 1].ts)
  const windowHours = Math.round((newest.getTime() - oldest.getTime()) / 3_600_000)
  const windowLabel = `${Math.max(1, windowHours)}h`

  // Build service summaries
  const serviceNames = Object.keys(serviceData)

  // Sort by SERVICE_ORDER then alphabetical for unknown names
  serviceNames.sort((a, b) => {
    const ai = SERVICE_ORDER.indexOf(a)
    const bi = SERVICE_ORDER.indexOf(b)
    if (ai !== -1 && bi !== -1) return ai - bi
    if (ai !== -1) return -1
    if (bi !== -1) return 1
    return a.localeCompare(b)
  })

  const services: ServiceSummary[] = serviceNames.map(name => {
    const points = serviceData[name]
    const okCount = points.filter(p => p.ok).length
    const uptimePct = points.length > 0 ? Math.round((okCount / points.length) * 1000) / 10 : 0
    const msValues = points.filter(p => p.ms > 0).map(p => p.ms)
    const avgMs = msValues.length > 0 ? Math.round(msValues.reduce((a, b) => a + b, 0) / msValues.length) : 0
    const last = points[points.length - 1]
    const timeline = points.slice(-TIMELINE_ENTRIES).map(p => ({
      ts: p.ts,
      ok: p.ok,
      ms: p.ms,
    }))

    return {
      name,
      uptimePct,
      avgMs,
      lastOk: last?.ok ?? false,
      lastMs: last?.ms ?? 0,
      timeline,
    }
  })

  // Overall uptime = average of per-service uptimes
  const overallUptime = services.length > 0
    ? Math.round((services.reduce((sum, s) => sum + s.uptimePct, 0) / services.length) * 10) / 10
    : 0

  const response: UptimeResponse = {
    services,
    overallUptime,
    totalChecks: entries.length,
    window: windowLabel,
  }

  return NextResponse.json(response, {
    headers: { 'Cache-Control': 'no-store, max-age=0' },
  })
}
