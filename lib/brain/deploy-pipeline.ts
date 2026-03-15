/* ─── Pi-Chi Deploy Pipeline — Full Autonomous Build/Deploy/Fix ── */

import { executeCommand } from '@/lib/tools/terminal-tools'
import { addActivity, getStateDir } from './brain-state'
import { enterStandbyDisplay, resumeDashboardDisplay } from './display-mode'
import { fixTypeErrors, fixBuildErrors } from './deploy-fix'
import { runHealthSweep, monitorRuntime, captureDeployVitals } from './deploy-health'
import { rollback } from './deploy-rollback'
import { recordDeploy, checkBuildAnomaly } from './deploy-history'
import { randomUUID } from 'node:crypto'
import { existsSync, writeFileSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'
import type { BrainState } from './brain-types'
import type { DeployRecord, DeployConfig, PipelineStep, ChangeClass } from './deploy-types'
import { DEFAULT_DEPLOY_CONFIG as defaultConfig } from './deploy-types'

const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms))

// ── Main entry point ─────────────────────────────────────────────

/**
 * Run the full deploy pipeline. Called after each brain cycle.
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

  try {
    // ── Step 2: Acquire deploy lock ─────────────────────────────
    if (existsSync(lockPath)) {
      addActivity(state, 'system', 'Deploy skipped: another deploy in progress')
      record.outcome = 'skipped'
      record.completedAt = new Date().toISOString()
      record.durationMs = Date.now() - new Date(record.timestamp).getTime()
      return record
    }
    writeFileSync(lockPath, `${process.pid}:${new Date().toISOString()}`, 'utf-8')

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

    // ── Step 5: Clean stale types ───────────────────────────────
    await executeCommand('rm -rf .next/types', { cwd, timeout: 5000 }).catch(() => {})

    // ── Step 6: Check for dependency changes ────────────────────
    const hasDepChanges = record.changedFiles.some(f =>
      f === 'package.json' || f === 'package-lock.json',
    )
    if (hasDepChanges) {
      const depStep = await installDependencies(cwd)
      record.steps.push(depStep)
      if (depStep.outcome === 'fail') {
        addActivity(state, 'error', 'Dependency install failed — reverting changes')
        await executeCommand('git checkout -- .', { cwd, timeout: 5000 }).catch(() => {})
        return finalize(record, 'reverted', state, config)
      }
    }

    // ── Step 7: Type check with auto-fix ────────────────────────
    const typeResult = await runTypeCheckWithFix(state, config, cwd, record)
    record.steps.push(typeResult.step)
    record.typeCheckTimeMs = typeResult.step.durationMs

    if (typeResult.step.outcome === 'fail') {
      addActivity(state, 'error', 'Type check + auto-fix exhausted — reverting changes')
      await executeCommand('git checkout -- .', { cwd, timeout: 5000 }).catch(() => {})
      return finalize(record, 'reverted', state, config)
    }

    // ── Step 8: Commit ──────────────────────────────────────────
    const commitStep = await commitChanges(cwd, record.changeClass)
    record.steps.push(commitStep)
    record.commitHash = commitStep.detail || null

    // ── Step 9: Build + deploy if dashboard/config changes ──────
    const needsBuild = ['dashboard', 'config', 'mixed', 'style-only'].includes(record.changeClass)

    if (needsBuild) {
      addActivity(state, 'system', `Building locally (${record.changeClass} changes)...`)

      // Stop dashboard + enter standby
      await executeCommand('sudo systemctl stop pi-chi-dashboard', { timeout: 15_000 })
      await enterStandbyDisplay('Building code changes...')

      try {
        // Backup current build
        await executeCommand(
          'test -d .next/standalone && cp -a .next/standalone .next/standalone.bak || true',
          { cwd, timeout: 30_000 },
        ).catch(() => {})

        // Build
        const buildStep = await runBuildWithFix(state, config, cwd, record)
        record.steps.push(buildStep)
        record.buildTimeMs = buildStep.durationMs

        if (buildStep.outcome === 'fail') {
          // Build failed even after fix attempts — rollback
          await resumeDashboardDisplay('Build failed — rolling back')
          await rollback(state, 2, cwd, record)
          return finalize(record, 'rolled-back', state, config)
        }
      } finally {
        await resumeDashboardDisplay('Build complete')
      }

      // Start dashboard
      await executeCommand('sudo systemctl start pi-chi-dashboard', { timeout: 15_000 })
      await sleep(5000) // Wait for startup

      // ── Step 10: Health sweep ───────────────────────────────────
      const healthResult = await runHealthSweep(config)
      record.steps.push(healthResult.step)
      record.healthResults = healthResult.results

      if (healthResult.step.outcome === 'fail') {
        addActivity(state, 'error', `Health sweep failed: ${healthResult.step.detail}`)
        await rollback(state, 2, cwd, record)
        return finalize(record, 'rolled-back', state, config)
      }

      // ── Step 11: Runtime monitoring ─────────────────────────────
      const runtimeResult = await monitorRuntime(config)
      record.steps.push(runtimeResult.step)
      record.runtimeErrors = runtimeResult.errors

      if (runtimeResult.step.outcome === 'fail') {
        addActivity(state, 'error', `Runtime errors detected: ${runtimeResult.step.detail}`)
        const restartOk = await rollback(state, 1, cwd, record)
        if (!restartOk) {
          await rollback(state, 2, cwd, record)
        }
        return finalize(record, 'rolled-back', state, config)
      }

      // ── Step 12: Post-deploy vitals ─────────────────────────────
      record.vitalsAfter = await captureDeployVitals()

      addActivity(state, 'system',
        `Deploy succeeded — build ${Math.round((record.buildTimeMs || 0) / 1000)}s, total ${Math.round((Date.now() - new Date(record.timestamp).getTime()) / 1000)}s`)
    } else {
      addActivity(state, 'system', `${record.changeClass} changes committed. No build needed.`)
    }

    // ── Step 13: Push to GitHub ───────────────────────────────────
    const pushStep = await pushToRemote(cwd)
    record.steps.push(pushStep)

    // ── Step 14: Anomaly detection ────────────────────────────────
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
    // Try cleanup first
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

// ── Dependency installation ──────────────────────────────────────

async function installDependencies(cwd: string): Promise<PipelineStep> {
  const start = Date.now()
  console.log('[deploy-pipeline] package.json changed — running npm ci...')

  const result = await executeCommand('npm ci --production=false', { cwd, timeout: 120_000 })
  if (result.exitCode !== 0) {
    // Fallback to npm install
    const fallback = await executeCommand('npm install', { cwd, timeout: 120_000 })
    return {
      name: 'install-deps',
      startedAt: new Date(start).toISOString(),
      outcome: fallback.exitCode === 0 ? 'pass' : 'fail',
      durationMs: Date.now() - start,
      detail: fallback.exitCode !== 0 ? (fallback.stderr || '').slice(0, 300) : undefined,
    }
  }

  return {
    name: 'install-deps',
    startedAt: new Date(start).toISOString(),
    outcome: 'pass',
    durationMs: Date.now() - start,
  }
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
    'npx tsc --noEmit --pretty 2>&1',
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
      : (await executeCommand('npx tsc --noEmit --pretty 2>&1', { cwd, timeout: config.typeCheckTimeoutMs })).stdout || ''

    const fix = await fixTypeErrors(state, freshErrors.trim(), i, config.maxTypeFixAttempts, cwd)
    record.fixAttempts.push(fix)

    // Clean stale types and re-check
    await executeCommand('rm -rf .next/types', { cwd, timeout: 5000 }).catch(() => {})
    const recheck = await executeCommand('npx tsc --noEmit --pretty 2>&1', { cwd, timeout: config.typeCheckTimeoutMs })

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

// ── Build with auto-fix ──────────────────────────────────────────

async function runBuildWithFix(
  state: BrainState,
  config: DeployConfig,
  cwd: string,
  record: DeployRecord,
): Promise<PipelineStep> {
  const start = Date.now()

  for (let attempt = 0; attempt <= config.maxBuildFixAttempts; attempt++) {
    console.log(`[deploy-pipeline] Build attempt ${attempt + 1}...`)
    const buildCmd = `NODE_OPTIONS="--max-old-space-size=${config.buildMaxHeapMb}" npm run build`
    const result = await executeCommand(buildCmd, { cwd, timeout: config.buildTimeoutMs })

    if (result.exitCode === 0) {
      return {
        name: 'build',
        startedAt: new Date(start).toISOString(),
        outcome: 'pass',
        durationMs: Date.now() - start,
        detail: attempt > 0 ? `Succeeded on attempt ${attempt + 1}` : undefined,
      }
    }

    // Try to fix if we have attempts remaining
    if (attempt < config.maxBuildFixAttempts) {
      const errors = (result.stderr || result.stdout || '').trim()
      addActivity(state, 'error', `Build failed — attempting fix: ${errors.slice(0, 150)}`)

      const fix = await fixBuildErrors(
        state, errors, attempt + 1, config.maxBuildFixAttempts, cwd, config,
      )
      record.fixAttempts.push(fix)

      if (fix.outcome === 'failed' || fix.outcome === 'crashed') break
    }
  }

  return {
    name: 'build',
    startedAt: new Date(start).toISOString(),
    outcome: 'fail',
    durationMs: Date.now() - start,
    detail: 'Build failed after all fix attempts',
  }
}

// ── Commit changes ───────────────────────────────────────────────

async function commitChanges(cwd: string, changeClass: ChangeClass): Promise<PipelineStep> {
  const start = Date.now()
  const msg = `pi-chi: ${changeClass} changes`

  await executeCommand(`git add -A && git commit -m "${msg}" --no-verify`, {
    cwd,
    timeout: 10_000,
  }).catch(() => {})

  // Get commit hash
  const hashResult = await executeCommand('git rev-parse HEAD', { cwd, timeout: 5000 })
  const hash = (hashResult.stdout || '').trim()

  return {
    name: 'commit',
    startedAt: new Date(start).toISOString(),
    outcome: 'pass',
    durationMs: Date.now() - start,
    detail: hash || undefined,
  }
}

// ── Push to remote ───────────────────────────────────────────────

async function pushToRemote(cwd: string): Promise<PipelineStep> {
  const start = Date.now()
  const result = await executeCommand('git push origin master 2>&1', { cwd, timeout: 30_000 })

  // Downgrade push failures to warning (local deploy already succeeded)
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

  // Record in state
  recordDeploy(state, record, config.maxDeployHistoryRecords)

  console.log(`[deploy-pipeline] Pipeline complete: ${outcome} in ${Math.round(record.durationMs / 1000)}s`)
  return record
}
