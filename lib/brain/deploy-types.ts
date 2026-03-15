/* ─── Pi-Chi Deploy Pipeline — Type Definitions ──────────────── */

// ── Pipeline step outcome ────────────────────────────────────────

export interface PipelineStep {
  name: string
  startedAt: string
  outcome: 'pass' | 'fail' | 'warn' | 'skip'
  durationMs: number
  detail?: string
}

// ── Fix attempt record ───────────────────────────────────────────

export interface FixAttempt {
  type: 'type-error' | 'build-error' | 'missing-dep' | 'runtime-error'
  attempt: number
  maxAttempts: number
  errors: string
  outcome: 'fixed' | 'partial' | 'failed' | 'crashed'
  durationMs: number
  timestamp: string
}

// ── Health check result ──────────────────────────────────────────

export interface HealthCheckResult {
  endpoint: string
  status: number | null
  ok: boolean
  latencyMs: number
}

// ── Runtime error from journalctl ────────────────────────────────

export interface RuntimeError {
  timestamp: string
  severity: 'critical' | 'error' | 'warning'
  message: string
  source: string
}

// ── Deploy vitals snapshot ───────────────────────────────────────

export interface DeployVitals {
  cpuPercent: number | null
  ramUsedMb: number | null
  ramTotalMb: number | null
  diskFreeMb: number | null
  tempCelsius: number | null
  timestamp: string
}

// ── Change classification ────────────────────────────────────────

export type ChangeClass =
  | 'dashboard'
  | 'brain-script'
  | 'brain-lib'
  | 'config'
  | 'style-only'
  | 'tools'
  | 'docs'
  | 'mixed'

// ── Rollback levels ──────────────────────────────────────────────

export type RollbackLevel = 1 | 2 | 3 | 4

// ── Deploy record (persisted in BrainState.deployHistory) ────────

export interface DeployRecord {
  id: string
  timestamp: string
  completedAt: string
  durationMs: number
  changedFiles: string[]
  changeClass: ChangeClass
  steps: PipelineStep[]
  fixAttempts: FixAttempt[]
  outcome: 'success' | 'rolled-back' | 'reverted' | 'skipped'
  rollbackLevel: RollbackLevel | null
  commitHash: string | null
  buildTimeMs: number | null
  typeCheckTimeMs: number | null
  healthResults: HealthCheckResult[]
  runtimeErrors: RuntimeError[]
  vitalsBefore: DeployVitals | null
  vitalsAfter: DeployVitals | null
  lessons: string[]
}

// ── Pipeline configuration ───────────────────────────────────────

export interface DeployConfig {
  piChiDir: string
  maxTypeFixAttempts: number
  maxBuildFixAttempts: number
  typeCheckTimeoutMs: number
  buildTimeoutMs: number
  buildMaxHeapMb: number
  healthCheckRetries: number
  healthCheckIntervalMs: number
  runtimeMonitorMs: number
  minDiskFreeMb: number
  maxTempCelsius: number
  maxDeployHistoryRecords: number
  anomalyThresholdMultiplier: number
}

// ── Default config ───────────────────────────────────────────────

export const DEFAULT_DEPLOY_CONFIG: DeployConfig = {
  piChiDir: '/home/pi/pi-chi',
  maxTypeFixAttempts: 2,
  maxBuildFixAttempts: 1,
  typeCheckTimeoutMs: 90_000,
  buildTimeoutMs: 600_000,
  buildMaxHeapMb: 1536,
  healthCheckRetries: 5,
  healthCheckIntervalMs: 5_000,
  runtimeMonitorMs: 60_000,
  minDiskFreeMb: 500,
  maxTempCelsius: 80,
  maxDeployHistoryRecords: 30,
  anomalyThresholdMultiplier: 2.0,
}

// deploy test: 2026-03-15T14:28:53.959Z
