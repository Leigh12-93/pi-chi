/* ─── Pi-Chi Deploy Health — Sweep & Runtime Monitoring ────────── */

import { executeCommand } from '@/lib/tools/terminal-tools'
import type { DeployConfig, PipelineStep, HealthCheckResult, RuntimeError, DeployVitals } from './deploy-types'

const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms))

// ── Health endpoints ─────────────────────────────────────────────

const HEALTH_ENDPOINTS = [
  { path: '/api/vitals', name: 'Liveness' },
  { path: '/api/brain',  name: 'Brain State' },
  { path: '/api/health', name: 'DB + Config' },
]

/** Hit all health endpoints with retries. All must return 2xx. */
export async function runHealthSweep(
  config: DeployConfig,
): Promise<{ step: PipelineStep; results: HealthCheckResult[] }> {
  const start = Date.now()
  const results: HealthCheckResult[] = []

  for (let retry = 0; retry < config.healthCheckRetries; retry++) {
    if (retry > 0) await sleep(config.healthCheckIntervalMs)

    let allPassed = true
    for (const ep of HEALTH_ENDPOINTS) {
      const checkStart = Date.now()
      const result = await executeCommand(
        `curl -sf -o /dev/null -w '%{http_code}' http://localhost:3333${ep.path}`,
        { timeout: 10_000 },
      )

      const statusStr = (result.stdout || '').trim()
      const status = parseInt(statusStr, 10)
      const ok = result.exitCode === 0 && !isNaN(status) && status >= 200 && status < 300

      results.push({
        endpoint: ep.path,
        status: isNaN(status) ? null : status,
        ok,
        latencyMs: Date.now() - checkStart,
      })

      if (!ok) allPassed = false
    }

    if (allPassed) {
      return {
        step: {
          name: 'health-sweep',
          startedAt: new Date(start).toISOString(),
          outcome: 'pass',
          durationMs: Date.now() - start,
        },
        results,
      }
    }
  }

  const failedEndpoints = results
    .filter(r => !r.ok)
    .map(r => `${r.endpoint}:${r.status ?? 'timeout'}`)
    .join(', ')

  return {
    step: {
      name: 'health-sweep',
      startedAt: new Date(start).toISOString(),
      outcome: 'fail',
      durationMs: Date.now() - start,
      detail: `Failed after ${config.healthCheckRetries} retries: ${failedEndpoints}`,
    },
    results,
  }
}

// ── Runtime monitoring ───────────────────────────────────────────

/** Monitor journalctl for errors after deploy (waits runtimeMonitorMs then checks) */
export async function monitorRuntime(
  config: DeployConfig,
): Promise<{ step: PipelineStep; errors: RuntimeError[] }> {
  const start = Date.now()
  const errors: RuntimeError[] = []

  // Wait monitoring period
  await sleep(config.runtimeMonitorMs)

  // Check journalctl for errors
  const seconds = Math.ceil(config.runtimeMonitorMs / 1000) + 10
  const result = await executeCommand(
    `journalctl -u pi-chi-dashboard --since "${seconds} seconds ago" --no-pager --output=short-iso 2>/dev/null | grep -iE "error|fatal|crash|OOM|killed|unhandled|SIGKILL|SIGABRT" || true`,
    { timeout: 10_000 },
  )

  const lines = (result.stdout || '').trim().split('\n').filter(Boolean)
  for (const line of lines) {
    // Skip grep "no match" empty output
    if (line.length < 5) continue
    errors.push({
      timestamp: extractTimestamp(line),
      severity: classifyJournalLine(line),
      message: line.slice(0, 300),
      source: 'pi-chi-dashboard',
    })
  }

  // Also verify the service is still running
  const activeCheck = await executeCommand('systemctl is-active pi-chi-dashboard', { timeout: 3000 })
  const isActive = (activeCheck.stdout || '').trim() === 'active'
  if (!isActive) {
    errors.push({
      timestamp: new Date().toISOString(),
      severity: 'critical',
      message: 'Dashboard service is not active after deploy',
      source: 'deploy-monitor',
    })
  }

  const hasCritical = errors.some(e => e.severity === 'critical')

  return {
    step: {
      name: 'runtime-monitor',
      startedAt: new Date(start).toISOString(),
      outcome: hasCritical ? 'fail' : errors.length > 0 ? 'warn' : 'pass',
      durationMs: Date.now() - start,
      detail: hasCritical
        ? `${errors.length} runtime errors (${errors.filter(e => e.severity === 'critical').length} critical)`
        : undefined,
    },
    errors,
  }
}

// ── Deploy vitals snapshot ───────────────────────────────────────

/** Capture a lightweight vitals snapshot for before/after comparison */
export async function captureDeployVitals(): Promise<DeployVitals> {
  const vitals: DeployVitals = {
    cpuPercent: null,
    ramUsedMb: null,
    ramTotalMb: null,
    diskFreeMb: null,
    tempCelsius: null,
    timestamp: new Date().toISOString(),
  }

  try {
    // CPU (1-second sample)
    const cpu = await executeCommand(
      "top -bn1 | grep 'Cpu(s)' | awk '{print $2}' 2>/dev/null || echo 0",
      { timeout: 5000 },
    )
    const cpuVal = parseFloat((cpu.stdout || '').trim())
    if (!isNaN(cpuVal)) vitals.cpuPercent = Math.round(cpuVal)

    // RAM
    const mem = await executeCommand("free -m | awk '/Mem:/ {print $3, $2}'", { timeout: 3000 })
    const [used, total] = (mem.stdout || '').trim().split(' ').map(Number)
    if (!isNaN(used)) vitals.ramUsedMb = used
    if (!isNaN(total)) vitals.ramTotalMb = total

    // Disk
    const disk = await executeCommand("df -BM --output=avail / | tail -1 | tr -d 'M '", { timeout: 3000 })
    const diskVal = parseInt((disk.stdout || '').trim(), 10)
    if (!isNaN(diskVal)) vitals.diskFreeMb = diskVal

    // Temperature
    const temp = await executeCommand(
      "cat /sys/class/thermal/thermal_zone0/temp 2>/dev/null || echo 0",
      { timeout: 2000 },
    )
    const tempVal = parseInt((temp.stdout || '').trim(), 10)
    if (!isNaN(tempVal) && tempVal > 0) vitals.tempCelsius = Math.round(tempVal / 1000)
  } catch {
    // Non-critical — return partial vitals
  }

  return vitals
}

// ── Helpers ──────────────────────────────────────────────────────

function classifyJournalLine(line: string): RuntimeError['severity'] {
  const lower = line.toLowerCase()
  if (/oom|killed|sigkill|sigabrt|fatal|crash/.test(lower)) return 'critical'
  if (/error|unhandled/.test(lower)) return 'error'
  return 'warning'
}

function extractTimestamp(line: string): string {
  // journalctl --output=short-iso format: 2026-03-15T10:30:00+1030 hostname ...
  const match = line.match(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/)
  return match ? match[0] : new Date().toISOString()
}
