/* ─── Pi-Chi Deploy Pipeline — Commit + Push + Restart (NO BUILD)
 *
 * The Pi does NOT have enough RAM to build. Building happens on
 * Windows via `npm run deploy` or Vercel auto-deploys from git push.
 *
 * This pipeline: detect changes → type-check → commit → push → restart.
 * ─────────────────────────────────────────────────────────────── */

import { executeCommand } from '@/lib/tools/terminal-tools'
import { addActivity, getStateDir } from './brain-state'
import { fixTypeErrors } from './deploy-fix'
import { captureDeployVitals } from './deploy-health'
import { recordDeploy, checkBuildAnomaly } from './deploy-history'
import { randomUUID } from 'node:crypto'
import { existsSync, writeFileSync, unlinkSync, statSync } from 'node:fs'
import { join } from 'node:path'
import type { BrainState } from './brain-types'
import type { DeployRecord, DeployConfig, PipelineStep, ChangeClass } from './deploy-types'
import { DEFAULT_DEPLOY_CONFIG as defaultConfig } from './deploy-types'

// ── Main entry point ─────────────────────────────────────────────

/**
 * Run the deploy pipeline. Called after each brain cycle.
 * NO builds. Only: detect → type-check → commit → push → restart dashboard.
 * Returns null if no changes detected, or a DeployRecord with outcome.
 */
export async function runDeployPipeline(
  state: BrainState,
  configOverrides?: Partial<DeployConfig>,
): Promise<DeployRecord | null> {
  const config: DeployConfig = { ...defaultConfig, ...configOverrides }
  const cwd = config.piChiDir

  // ── Step 1: Detect changes ──────────────────────────────────
  const diffResult = await executeCommand('git diff --name-only HEAD', { cwd, timeout: 5000 })
  const changedFiles = (diffResult.stdout || '').trim()
  if (!changedFiles) return null // No changes, nothing to deploy

  const record = createEmptyRecord(changedFiles.split('\n'))
  const lockPath = join(getStateDir(), 'deploy.lock')

  // ── Step 2: Acquire deploy lock (with stale-lock recovery)
  if (existsSync(lockPath)) {
    const STALE_LOCK_MS = 10 * 60 * 1000 // 10 minutes
    try {
      const lockAge = Date.now() - statSync(lockPath).mtimeMs
      if (lockAge > STALE_LOCK_MS) {
        unlinkSync(lockPath)
        addActivity(state, 'system', `Cleared stale deploy lock (${Math.round(lockAge / 60000)}min old)`)
      } else {
        addActivity(state, 'system', 'Deploy skipped: another deploy in progress')
        record.outcome = 'skipped'
        record.completedAt = new Date().toISOString()
        record.durationMs = Date.now() - new Date(record.timestamp).getTime()
        return record
      }
    } catch {
      // Lock file vanished between check and stat — proceed
    }
  }
  writeFileSync(lockPath, `${process.pid}:${new Date().toISOString()}`, 'utf-8')

  try {

    // ── Step 3: Preflight checks ────────────────────────────────
    const preflight = await runPreflightChecks(config)
    record.steps.push(preflight.step)
    record.vitalsBefore = preflight.vitals

    if (preflight.step.outcome === 'fail') {
      return finalize(record, 'skipped', state, config)
    }

    // ── Step 4: Classify changes ────────────────────────────────
    record.changeClass = classifyChanges(record.changedFiles)
    console.log(`[deploy-pipeline] Changes classified as: ${record.changeClass} (${record.changedFiles.length} files)`)

    // ── Step 5: Type check with auto-fix ────────────────────────
    // Clean stale types first (safe — only removes type cache, not build output)
    await executeCommand('rm -rf .next/types', { cwd, timeout: 5000 }).catch(() => {})

    const typeResult = await runTypeCheckWithFix(state, config, cwd, record)
    record.steps.push(typeResult.step)
    record.typeCheckTimeMs = typeResult.step.durationMs

    if (typeResult.step.outcome === 'fail') {
      addActivity(state, 'error', 'Type check + auto-fix exhausted — reverting changes')
      await executeCommand('git checkout -- .', { cwd, timeout: 5000 }).catch(() => {})
      return finalize(record, 'reverted', state, config)
    }

    // ── Step 6: Commit ──────────────────────────────────────────
    const commitStep = await commitChanges(cwd, record.changeClass)
    record.steps.push(commitStep)

    const buildId = commitStep.detail && commitStep.detail !== 'no-hash' ? commitStep.detail : null
    record.commitHash = buildId
    if (!buildId) {
      const fallbackHash = await executeCommand('git rev-parse HEAD', { cwd, timeout: 5000 })
      record.commitHash = (fallbackHash.stdout || '').trim().slice(0, 40) || null
    }

    // ── Step 7: Push to GitHub ──────────────────────────────────
    // Vercel auto-deploys from git push — this IS the deploy mechanism
    const pushStep = await pushToRemote(cwd)
    record.steps.push(pushStep)

    // ── Step 8: Restart dashboard if brain-lib/brain-script changed
    const needsRestart = ['brain-lib', 'brain-script', 'config'].includes(record.changeClass)
    if (needsRestart) {
      const restartStep = await restartDashboard(cwd)
      record.steps.push(restartStep)
    }

    addActivity(state, 'system',
      `Deploy: ${record.changeClass} changes committed + pushed (${record.changedFiles.length} files)`)

    // ── Step 9: Anomaly detection ───────────────────────────────
    checkBuildAnomaly(state, record, config)

    return finalize(record, 'success', state, config)

  } finally {
    // Always release deploy lock
    try { unlinkSync(lockPath) } catch { /* already cleaned */ }
  }
}

// ── Preflight checks ─────────────────────────────────────────────

async function runPreflightChecks(config: DeployConfig): Promise<{
  step: PipelineStep
  vitals: import('./deploy-types').DeployVitals | null
}> {
  const start = Date.now()
  const vitals = await captureDeployVitals()

  // Check disk space
  if (vitals.diskFreeMb !== null && vitals.diskFreeMb < config.minDiskFreeMb) {
    await executeCommand('npm cache clean --force 2>/dev/null', { timeout: 30_000 }).catch(() => {})
    await executeCommand('sudo journalctl --vacuum-size=50M 2>/dev/null', { timeout: 10_000 }).catch(() => {})

    const recheckVitals = await captureDeployVitals()
    if (recheckVitals.diskFreeMb !== null && recheckVitals.diskFreeMb < config.minDiskFreeMb) {
      return {
        step: {
          name: 'preflight',
          startedAt: new Date(start).toISOString(),
          outcome: 'fail',
          durationMs: Date.now() - start,
          detail: `Disk too low: ${recheckVitals.diskFreeMb}MB free (need ${config.minDiskFreeMb}MB)`,
        },
        vitals: recheckVitals,
      }
    }
  }

  // Check temperature
  if (vitals.tempCelsius !== null && vitals.tempCelsius > config.maxTempCelsius) {
    return {
      step: {
        name: 'preflight',
        startedAt: new Date(start).toISOString(),
        outcome: 'fail',
        durationMs: Date.now() - start,
        detail: `Temperature too high: ${vitals.tempCelsius}°C (max ${config.maxTempCelsius}°C)`,
      },
      vitals,
    }
  }

  return {
    step: {
      name: 'preflight',
      startedAt: new Date(start).toISOString(),
      outcome: 'pass',
      durationMs: Date.now() - start,
    },
    vitals,
  }
}

// ── Change classification ────────────────────────────────────────

function classifyChanges(files: string[]): ChangeClass {
  const isDashboard = files.some(f =>
    (f.startsWith('app/') || f.startsWith('components/') || f.startsWith('hooks/'))
    && !f.startsWith('scripts/'),
  )
  const isLib = files.some(f => f.startsWith('lib/') && !f.startsWith('lib/brain/'))
  const isBrainLib = files.some(f => f.startsWith('lib/brain/'))
  const isBrainScript = files.some(f => f.startsWith('scripts/pi-brain'))
  const isConfig = files.some(f =>
    f === 'package.json' || f === 'package-lock.json'
    || f.startsWith('next.config') || f.startsWith('tsconfig'),
  )
  const isStyleOnly = files.every(f => f.endsWith('.css'))
  const isDocs = files.every(f => f.endsWith('.md'))
  const isTools = files.some(f => f.includes('tools/'))

  if (isDocs) return 'docs'
  if (isStyleOnly) return 'style-only'
  if (isTools && !isDashboard && !isLib) return 'tools'
  if (isBrainScript && !isDashboard && !isLib) return 'brain-script'
  if (isBrainLib && !isDashboard && !isLib && !isBrainScript) return 'brain-lib'
  if (isConfig) return 'config'
  if (isDashboard || isLib) return 'dashboard'
  return 'mixed'
}

// ── Type check with auto-fix loop ────────────────────────────────

async function runTypeCheckWithFix(
  state: BrainState,
  config: DeployConfig,
  cwd: string,
  record: DeployRecord,
): Promise<{ step: PipelineStep }> {
  const start = Date.now()

  console.log('[deploy-pipeline] Running type check...')
  const tsc = await executeCommand(
    'NODE_OPTIONS="" npx tsc --noEmit --pretty 2>&1',
    { cwd, timeout: config.typeCheckTimeoutMs },
  )

  if (tsc.exitCode === 0) {
    return {
      step: {
        name: 'type-check',
        startedAt: new Date(start).toISOString(),
        outcome: 'pass',
        durationMs: Date.now() - start,
      },
    }
  }

  // Auto-fix loop
  const initialErrors = (tsc.stdout || tsc.stderr || '').trim()
  addActivity(state, 'error', `Type check failed — auto-fixing: ${initialErrors.slice(0, 150)}`)

  for (let i = 1; i <= config.maxTypeFixAttempts; i++) {
    console.log(`[deploy-pipeline] Type auto-fix attempt ${i}/${config.maxTypeFixAttempts}...`)

    const freshErrors = i === 1 ? initialErrors
      : (await executeCommand('NODE_OPTIONS="" npx tsc --noEmit --pretty 2>&1', { cwd, timeout: config.typeCheckTimeoutMs })).stdout || ''

    const fix = await fixTypeErrors(state, freshErrors.trim(), i, config.maxTypeFixAttempts, cwd)
    record.fixAttempts.push(fix)

    await executeCommand('rm -rf .next/types', { cwd, timeout: 5000 }).catch(() => {})
    const recheck = await executeCommand('NODE_OPTIONS="" npx tsc --noEmit --pretty 2>&1', { cwd, timeout: config.typeCheckTimeoutMs })

    if (recheck.exitCode === 0) {
      addActivity(state, 'system', `Auto-fixed type errors on attempt ${i}`)
      return {
        step: {
          name: 'type-check',
          startedAt: new Date(start).toISOString(),
          outcome: 'pass',
          durationMs: Date.now() - start,
          detail: `Fixed on attempt ${i}`,
        },
      }
    }
  }

  return {
    step: {
      name: 'type-check',
      startedAt: new Date(start).toISOString(),
      outcome: 'fail',
      durationMs: Date.now() - start,
      detail: initialErrors.slice(0, 500),
    },
  }
}

// ── Commit changes ───────────────────────────────────────────────

async function commitChanges(cwd: string, changeClass: ChangeClass): Promise<PipelineStep> {
  const start = Date.now()
  const msg = `pi-chi: ${changeClass} changes`

  const preHash = await executeCommand('git rev-parse HEAD', { cwd, timeout: 5000 })
  const preCommitHash = (preHash.stdout || '').trim()

  const commitResult = await executeCommand(`git add -A && git commit -m "${msg}" --no-verify`, {
    cwd,
    timeout: 10_000,
  })

  const postHash = await executeCommand('git rev-parse HEAD', { cwd, timeout: 5000 })
  const postCommitHash = (postHash.stdout || '').trim()

  const commitSucceeded = commitResult.exitCode === 0 && postCommitHash && postCommitHash !== preCommitHash
  const hash = postCommitHash || preCommitHash || null

  if (!commitSucceeded) {
    const reason = commitResult.exitCode !== 0
      ? (commitResult.stderr || commitResult.stdout || 'unknown error').slice(0, 200)
      : 'Hash unchanged — commit may not have created a new revision'
    console.log(`[deploy-pipeline] Commit issue: ${reason}`)
  }

  return {
    name: 'commit',
    startedAt: new Date(start).toISOString(),
    outcome: commitSucceeded ? 'pass' : 'warn',
    durationMs: Date.now() - start,
    detail: hash || 'no-hash',
  }
}

// ── Push to remote ───────────────────────────────────────────────

async function pushToRemote(cwd: string): Promise<PipelineStep> {
  const start = Date.now()
  const result = await executeCommand('git push origin master 2>&1', { cwd, timeout: 30_000 })

  const outcome = result.exitCode === 0 ? 'pass' as const : 'warn' as const
  if (result.exitCode !== 0) {
    console.log('[deploy-pipeline] Git push failed (non-critical) — will retry next cycle')
  }

  return {
    name: 'push',
    startedAt: new Date(start).toISOString(),
    outcome,
    durationMs: Date.now() - start,
    detail: outcome === 'warn' ? 'Push deferred: network or auth issue' : undefined,
  }
}

// ── Restart dashboard service (no build) ─────────────────────────

async function restartDashboard(cwd: string): Promise<PipelineStep> {
  const start = Date.now()
  const result = await executeCommand('sudo systemctl restart pi-chi-dashboard', { cwd, timeout: 15_000 })

  return {
    name: 'restart-dashboard',
    startedAt: new Date(start).toISOString(),
    outcome: result.exitCode === 0 ? 'pass' : 'warn',
    durationMs: Date.now() - start,
    detail: result.exitCode !== 0 ? 'Dashboard restart failed — may need manual intervention' : undefined,
  }
}

// ── Record helpers ───────────────────────────────────────────────

function createEmptyRecord(changedFiles: string[]): DeployRecord {
  return {
    id: randomUUID(),
    timestamp: new Date().toISOString(),
    completedAt: '',
    durationMs: 0,
    changedFiles,
    changeClass: 'mixed',
    steps: [],
    fixAttempts: [],
    outcome: 'skipped',
    rollbackLevel: null,
    commitHash: null,
    buildTimeMs: null,
    typeCheckTimeMs: null,
    healthResults: [],
    runtimeErrors: [],
    vitalsBefore: null,
    vitalsAfter: null,
    lessons: [],
  }
}

function finalize(
  record: DeployRecord,
  outcome: DeployRecord['outcome'],
  state: BrainState,
  config: DeployConfig,
): DeployRecord {
  record.outcome = outcome
  record.completedAt = new Date().toISOString()
  record.durationMs = Date.now() - new Date(record.timestamp).getTime()

  recordDeploy(state, record, config.maxDeployHistoryRecords)

  console.log(`[deploy-pipeline] Pipeline complete: ${outcome} in ${Math.round(record.durationMs / 1000)}s`)
  return record
}
