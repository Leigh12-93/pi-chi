/* ─── Pi-Chi Code Guardrails ────────────────────────────────────
 * Enforces safety checks before code operations:
 * 1. Type-check before commit (tsc --noEmit)
 * 2. Never npm run build on Pi
 * 3. Never delete files you didn't create
 * 4. Never modify protected files without approval
 * 5. Self-audit every 10 cycles
 * ─────────────────────────────────────────────────────────────── */

import { appendFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { execSync } from 'node:child_process'

const AUDIT_FILE = join(homedir(), '.pi-chi', 'self-audit.jsonl')
const PI_CHI_DIR = join(homedir(), 'pi-chi')

// ── Protected files — NEVER modify without Leigh's approval ────

const PROTECTED_FILES = [
  'CLAUDE.md',
  '.env.local',
  'package.json',
]

// ── Type check before commit ────────────────────────────────────

export function runTypeCheck(): { passed: boolean; errors?: string } {
  try {
    execSync('npx tsc --noEmit', {
      cwd: PI_CHI_DIR,
      timeout: 120000,
      env: { ...process.env, NODE_OPTIONS: '--max-old-space-size=1536' },
      stdio: 'pipe',
    })
    return { passed: true }
  } catch (err) {
    const stderr = err instanceof Error && 'stderr' in err
      ? (err as { stderr: Buffer }).stderr?.toString()
      : String(err)
    return { passed: false, errors: stderr?.slice(0, 2000) }
  }
}

// ── Check if a file is protected ────────────────────────────────

export function isProtectedFile(filePath: string): { protected: boolean; file?: string } {
  const relativePath = filePath.replace(PI_CHI_DIR + '/', '').replace(PI_CHI_DIR + '\\', '')
  for (const pf of PROTECTED_FILES) {
    if (relativePath === pf || relativePath.endsWith('/' + pf)) {
      return { protected: true, file: pf }
    }
  }
  return { protected: false }
}

// ── Check if build command is being attempted ───────────────────

export function isBuildCommand(command: string): boolean {
  const lower = command.toLowerCase().trim()
  return (
    lower.includes('npm run build') ||
    lower.includes('npx next build') ||
    lower.includes('next build') ||
    (lower.includes('npm') && lower.includes('build') && !lower.includes('--no-build'))
  )
}

// ── Self-audit ──────────────────────────────────────────────────

interface SelfAuditEntry {
  timestamp: string
  cycle: number
  actions: string[]
  smsSent: Array<{ to: string; message: string }>
  codeChanged: string[]
  errors: string[]
  suspicious: string[]
}

export function writeSelfAudit(entry: SelfAuditEntry): void {
  try {
    mkdirSync(join(homedir(), '.pi-chi'), { recursive: true })
    appendFileSync(AUDIT_FILE, JSON.stringify(entry) + '\n')
  } catch { /* non-critical */ }
}

export function shouldRunSelfAudit(cycleNumber: number): boolean {
  return cycleNumber > 0 && cycleNumber % 10 === 0
}

export function buildSelfAuditFromState(state: {
  totalThoughts: number
  activityLog: Array<{ type: string; message: string; time: string }>
}): SelfAuditEntry {
  const recentActivities = state.activityLog.slice(-20)
  const actions = recentActivities.map(a => `[${a.type}] ${a.message}`)
  const smsSent = recentActivities
    .filter(a => a.type === 'sms')
    .map(a => {
      const match = a.message.match(/Sent SMS to ([^:]+): (.+)/)
      return match ? { to: match[1], message: match[2] } : { to: 'unknown', message: a.message }
    })
  const codeChanged = recentActivities
    .filter(a => a.type === 'action' && (a.message.includes('commit') || a.message.includes('push') || a.message.includes('wrote') || a.message.includes('edited')))
    .map(a => a.message)
  const errors = recentActivities
    .filter(a => a.type === 'error')
    .map(a => a.message)

  // Flag suspicious patterns
  const suspicious: string[] = []
  if (smsSent.length > 5) suspicious.push(`High SMS volume: ${smsSent.length} SMS in last 20 actions`)
  for (const sms of smsSent) {
    if (sms.message?.toLowerCase().includes('free lead')) {
      suspicious.push(`SMS contained "free lead": ${sms.message.slice(0, 80)}`)
    }
  }

  return {
    timestamp: new Date().toISOString(),
    cycle: state.totalThoughts,
    actions,
    smsSent,
    codeChanged,
    errors,
    suspicious,
  }
}

// ── Git safety: check what files will be committed ──────────────

export function getGitStagedFiles(): string[] {
  try {
    const output = execSync('git diff --cached --name-only', {
      cwd: PI_CHI_DIR,
      timeout: 10000,
      stdio: 'pipe',
    }).toString().trim()
    return output ? output.split('\n') : []
  } catch { return [] }
}

export function checkStagedForProtected(): { safe: boolean; protectedFiles: string[] } {
  const staged = getGitStagedFiles()
  const found = staged.filter(f => PROTECTED_FILES.some(pf => f === pf || f.endsWith('/' + pf)))
  return { safe: found.length === 0, protectedFiles: found }
}
