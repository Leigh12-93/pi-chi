/* ─── Pi-Chi Deploy History — Metrics, Timing & Anomaly Detection ─ */

import type { BrainState } from './brain-types'
import type { DeployRecord, DeployConfig } from './deploy-types'
import { addActivity } from './brain-state'

// ── Record management ────────────────────────────────────────────

/** Append a deploy record, capped at maxRecords */
export function recordDeploy(
  state: BrainState,
  record: DeployRecord,
  maxRecords: number,
): void {
  if (!state.deployHistory) state.deployHistory = []
  state.deployHistory.push(record)
  if (state.deployHistory.length > maxRecords) {
    state.deployHistory = state.deployHistory.slice(-maxRecords)
  }
}

// ── Build timing ─────────────────────────────────────────────────

/** Average build time from last N successful deploys (ms), or null if no data */
export function getAverageBuildTime(state: BrainState, recentCount = 10): number | null {
  const history = state.deployHistory || []
  const buildTimes = history
    .filter(d => d.outcome === 'success' && d.buildTimeMs !== null)
    .slice(-recentCount)
    .map(d => d.buildTimeMs as number)

  if (buildTimes.length === 0) return null
  return Math.round(buildTimes.reduce((a, b) => a + b, 0) / buildTimes.length)
}

/** Average type-check time from last N successful deploys (ms) */
export function getAverageTypeCheckTime(state: BrainState, recentCount = 10): number | null {
  const history = state.deployHistory || []
  const times = history
    .filter(d => d.outcome === 'success' && d.typeCheckTimeMs !== null)
    .slice(-recentCount)
    .map(d => d.typeCheckTimeMs as number)

  if (times.length === 0) return null
  return Math.round(times.reduce((a, b) => a + b, 0) / times.length)
}

/** Check if a build time is anomalously slow */
export function isBuildTimeAnomaly(
  buildTimeMs: number,
  state: BrainState,
  multiplier = 2.0,
): boolean {
  const avg = getAverageBuildTime(state)
  if (!avg) return false
  return buildTimeMs > avg * multiplier
}

// ── Pattern analysis ─────────────────────────────────────────────

export interface DeployPatternAnalysis {
  totalDeploys: number
  successRate: number
  avgBuildTimeMs: number | null
  avgTypeCheckTimeMs: number | null
  avgTotalTimeMs: number | null
  fragileFiles: string[]
  autoFixSuccessRate: number
  rollbackFrequency: number
  trend: 'improving' | 'stable' | 'degrading'
}

/** Analyze deploy history for patterns and learning */
export function analyzeDeployPatterns(state: BrainState): DeployPatternAnalysis {
  const history = state.deployHistory || []
  if (history.length === 0) {
    return {
      totalDeploys: 0, successRate: 0, avgBuildTimeMs: null,
      avgTypeCheckTimeMs: null, avgTotalTimeMs: null, fragileFiles: [],
      autoFixSuccessRate: 0, rollbackFrequency: 0, trend: 'stable',
    }
  }

  const successful = history.filter(d => d.outcome === 'success')
  const successRate = Math.round((successful.length / history.length) * 100)

  // Fragile files: appear in 3+ failed deploys
  const failedFiles = new Map<string, number>()
  for (const deploy of history.filter(d => d.outcome !== 'success')) {
    for (const file of deploy.changedFiles) {
      failedFiles.set(file, (failedFiles.get(file) || 0) + 1)
    }
  }
  const fragileFiles = [...failedFiles.entries()]
    .filter(([, count]) => count >= 3)
    .map(([file]) => file)

  // Auto-fix success rate
  const deploysWithFixes = history.filter(d => d.fixAttempts.length > 0)
  const fixedDeploys = deploysWithFixes.filter(d => d.outcome === 'success')
  const autoFixSuccessRate = deploysWithFixes.length > 0
    ? Math.round((fixedDeploys.length / deploysWithFixes.length) * 100) : 0

  // Rollback frequency
  const rollbackCount = history.filter(d => d.rollbackLevel !== null).length
  const rollbackFrequency = Math.round((rollbackCount / history.length) * 100)

  // Trend: compare last 10 vs previous 10
  const recent = history.slice(-10)
  const older = history.slice(-20, -10)
  const recentRate = recent.filter(d => d.outcome === 'success').length / recent.length
  const olderRate = older.length > 0
    ? older.filter(d => d.outcome === 'success').length / older.length
    : recentRate
  const trend = recentRate > olderRate + 0.1 ? 'improving'
    : recentRate < olderRate - 0.1 ? 'degrading' : 'stable'

  return {
    totalDeploys: history.length,
    successRate,
    avgBuildTimeMs: getAverageBuildTime(state),
    avgTypeCheckTimeMs: getAverageTypeCheckTime(state),
    avgTotalTimeMs: history.length > 0
      ? Math.round(history.reduce((a, d) => a + d.durationMs, 0) / history.length)
      : null,
    fragileFiles,
    autoFixSuccessRate,
    rollbackFrequency,
    trend,
  }
}

/** Check if a file has historically caused deploy failures */
export function isFragileFile(state: BrainState, filePath: string): boolean {
  const history = state.deployHistory || []
  let failCount = 0
  for (const deploy of history.filter(d => d.outcome !== 'success')) {
    if (deploy.changedFiles.includes(filePath)) failCount++
  }
  return failCount >= 3
}

/** Run anomaly detection on a completed deploy record */
export function checkBuildAnomaly(
  state: BrainState,
  record: DeployRecord,
  config: DeployConfig,
): void {
  if (!record.buildTimeMs) return
  const avg = getAverageBuildTime(state)
  if (!avg) return

  if (record.buildTimeMs > avg * config.anomalyThresholdMultiplier) {
    const ratio = (record.buildTimeMs / avg).toFixed(1)
    const msg = `Build took ${Math.round(record.buildTimeMs / 1000)}s — ${ratio}x slower than avg (${Math.round(avg / 1000)}s)`
    addActivity(state, 'system', msg)
    record.lessons.push(`Anomaly: ${msg}`)
  }
}

/** Format deploy stats as a brief string for the brain prompt context */
export function formatDeployStats(state: BrainState): string {
  const analysis = analyzeDeployPatterns(state)
  if (analysis.totalDeploys === 0) return 'No deploys yet'

  const parts: string[] = [
    `${analysis.totalDeploys} deploys`,
    `${analysis.successRate}% success`,
  ]
  if (analysis.avgBuildTimeMs) {
    parts.push(`avg build ${Math.round(analysis.avgBuildTimeMs / 1000)}s`)
  }
  if (analysis.fragileFiles.length > 0) {
    parts.push(`${analysis.fragileFiles.length} fragile files`)
  }
  parts.push(`trend: ${analysis.trend}`)
  return parts.join(', ')
}
