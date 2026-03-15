/* ─── Pi-Chi Deploy Rollback — Graduated Recovery (L1-L4) ─────── */

import { executeCommand } from '@/lib/tools/terminal-tools'
import { addActivity } from './brain-state'
import { enterStandbyDisplay, resumeDashboardDisplay } from './display-mode'
import type { BrainState } from './brain-types'
import type { DeployRecord, RollbackLevel } from './deploy-types'

const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms))

/**
 * Execute a rollback at the specified level. Each level escalates to the next on failure.
 * L1: Restart service | L2: Restore .bak | L3: Revert commit + rebuild | L4: Nuclear reset + SMS
 */
export async function rollback(
  state: BrainState,
  level: RollbackLevel,
  cwd: string,
  record: DeployRecord,
): Promise<boolean> {
  record.rollbackLevel = level
  addActivity(state, 'error', `Deploy rollback triggered (Level ${level})`)
  console.log(`[deploy-rollback] Starting Level ${level} rollback`)

  switch (level) {
    case 1: return rollbackLevel1(state, cwd, record)
    case 2: return rollbackLevel2(state, cwd, record)
    case 3: return rollbackLevel3(state, cwd, record)
    case 4: return rollbackLevel4(state, cwd, record)
    default: return false
  }
}

/** L1: Just restart the dashboard service (handles transient issues) */
async function rollbackLevel1(
  state: BrainState,
  _cwd: string,
  record: DeployRecord,
): Promise<boolean> {
  addActivity(state, 'system', 'Rollback L1: Restarting dashboard service...')

  await executeCommand('sudo systemctl restart pi-chi-dashboard', { timeout: 15_000 })
  await sleep(5000)

  const check = await executeCommand(
    'curl -sf -o /dev/null -w \'%{http_code}\' http://localhost:3333/api/vitals',
    { timeout: 10_000 },
  )
  const ok = check.exitCode === 0
  addActivity(state, ok ? 'system' : 'error',
    `Rollback L1: ${ok ? 'Service restarted successfully' : 'Service still failing'}`)

  if (!ok) {
    record.rollbackLevel = 2
    return rollbackLevel2(state, _cwd, record)
  }
  return true
}

/** L2: Restore the previous build artifact (.next/standalone.bak) */
async function rollbackLevel2(
  state: BrainState,
  cwd: string,
  record: DeployRecord,
): Promise<boolean> {
  addActivity(state, 'system', 'Rollback L2: Restoring previous build artifact...')

  // Check backup exists
  const backupCheck = await executeCommand(
    `test -d "${cwd}/.next/standalone.bak"`,
    { timeout: 3000 },
  )
  if (backupCheck.exitCode !== 0) {
    addActivity(state, 'error', 'Rollback L2: No backup available — escalating to L3')
    record.rollbackLevel = 3
    return rollbackLevel3(state, cwd, record)
  }

  await executeCommand('sudo systemctl stop pi-chi-dashboard', { timeout: 15_000 })
  await executeCommand(
    `rm -rf "${cwd}/.next/standalone" && mv "${cwd}/.next/standalone.bak" "${cwd}/.next/standalone"`,
    { timeout: 30_000 },
  )
  await executeCommand('sudo systemctl start pi-chi-dashboard', { timeout: 15_000 })
  await sleep(5000)

  const check = await executeCommand(
    'curl -sf -o /dev/null -w \'%{http_code}\' http://localhost:3333/api/vitals',
    { timeout: 10_000 },
  )
  const ok = check.exitCode === 0
  addActivity(state, ok ? 'system' : 'error',
    `Rollback L2: ${ok ? 'Previous build restored' : 'Restore failed — escalating to L3'}`)

  if (!ok) {
    record.rollbackLevel = 3
    return rollbackLevel3(state, cwd, record)
  }
  return true
}

/** L3: Revert last commit and rebuild from source */
async function rollbackLevel3(
  state: BrainState,
  cwd: string,
  record: DeployRecord,
): Promise<boolean> {
  addActivity(state, 'system', 'Rollback L3: Reverting last commit and rebuilding...')

  await executeCommand('git reset --hard HEAD~1', { cwd, timeout: 10_000 })
  await executeCommand('sudo systemctl stop pi-chi-dashboard', { timeout: 15_000 })

  await enterStandbyDisplay('Emergency rebuild after rollback')
  try {
    const build = await executeCommand(
      'NODE_OPTIONS="--max-old-space-size=1536" npm run build',
      { cwd, timeout: 600_000 },
    )
    if (build.exitCode !== 0) {
      addActivity(state, 'error', 'Rollback L3: Rebuild failed — escalating to L4')
      record.rollbackLevel = 4
      return rollbackLevel4(state, cwd, record)
    }
  } finally {
    await resumeDashboardDisplay('Emergency rebuild complete')
  }

  await executeCommand('sudo systemctl start pi-chi-dashboard', { timeout: 15_000 })
  await sleep(5000)

  const check = await executeCommand(
    'curl -sf -o /dev/null -w \'%{http_code}\' http://localhost:3333/api/vitals',
    { timeout: 10_000 },
  )
  const ok = check.exitCode === 0
  addActivity(state, ok ? 'system' : 'error',
    `Rollback L3: ${ok ? 'Reverted and rebuilt successfully' : 'Still failing — escalating to L4'}`)

  if (!ok) {
    record.rollbackLevel = 4
    return rollbackLevel4(state, cwd, record)
  }
  return true
}

/** L4: Nuclear — reset to lastGoodCommit, full npm ci + rebuild, SMS owner */
async function rollbackLevel4(
  state: BrainState,
  cwd: string,
  _record: DeployRecord,
): Promise<boolean> {
  addActivity(state, 'error', 'Rollback L4 (NUCLEAR): Resetting to last known good commit...')

  if (!state.lastGoodCommit) {
    addActivity(state, 'error', 'Rollback L4: No lastGoodCommit — manual intervention required')
    await smsOwnerAlert(state, 'Pi-Chi ALERT: Deploy failed at all rollback levels. No good commit to restore. Manual intervention required.')
    return false
  }

  await executeCommand(`git reset --hard ${state.lastGoodCommit}`, { cwd, timeout: 30_000 })
  await executeCommand('sudo systemctl stop pi-chi-dashboard', { timeout: 15_000 })

  await enterStandbyDisplay('Nuclear rollback — full rebuild')
  try {
    await executeCommand('npm ci', { cwd, timeout: 120_000 })
    await executeCommand(
      'NODE_OPTIONS="--max-old-space-size=1536" npm run build',
      { cwd, timeout: 600_000 },
    )
  } finally {
    await resumeDashboardDisplay('Nuclear rollback complete')
  }

  await executeCommand('sudo systemctl start pi-chi-dashboard', { timeout: 15_000 })
  await sleep(5000)

  const check = await executeCommand(
    'curl -sf -o /dev/null -w \'%{http_code}\' http://localhost:3333/api/vitals',
    { timeout: 10_000 },
  )
  const ok = check.exitCode === 0
  addActivity(state, ok ? 'system' : 'error',
    `Rollback L4: ${ok ? `Restored to ${state.lastGoodCommit.slice(0, 8)}` : 'CRITICAL: Even lastGoodCommit failed'}`)

  if (!ok) {
    await smsOwnerAlert(state,
      `Pi-Chi CRITICAL: All rollback levels failed. Dashboard is DOWN. Last attempt: ${state.lastGoodCommit.slice(0, 8)}`)
  }

  return ok
}

// ── Helpers ──────────────────────────────────────────────────────

async function smsOwnerAlert(state: BrainState, message: string): Promise<void> {
  try {
    const { sendSms } = await import('./brain-sms')
    await sendSms(state, message)
  } catch (err) {
    console.error('[deploy-rollback] SMS alert failed:', err)
  }
}
