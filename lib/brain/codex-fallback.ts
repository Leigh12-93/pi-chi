/**
 * Codex CLI fallback — used when Claude auth/rate-limits fail.
 * Uses `codex exec --sandbox danger-full-access` with the same prompt file.
 * Auth: ~/.codex/auth.json (pushed from Windows every 4h via push-creds.sh)
 */
import { executeCommand } from '../tools/terminal-tools'
import type { ExecuteResult } from '../tools/terminal-tools'
import { writeFileSync, existsSync, unlinkSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'

const DATA_DIR = join(homedir(), 'data')
const CODEX_AUTH = join(homedir(), '.codex', 'auth.json')
const FALLBACK_FLAG = join(DATA_DIR, 'codex-fallback-active.flag')
const FALLBACK_LOG = join(DATA_DIR, 'codex-fallback.log')

function flog(msg: string) {
  const ts = new Date().toISOString().slice(0, 19).replace('T', ' ')
  const line = `[${ts}] ${msg}\n`
  process.stdout.write('[codex-fallback] ' + msg + '\n')
  try { writeFileSync(FALLBACK_LOG, line, { flag: 'a' }) } catch { /* non-critical */ }
}

export function hasCodexAuth(): boolean {
  return existsSync(CODEX_AUTH)
}

export function isFallbackActive(): boolean {
  return existsSync(FALLBACK_FLAG)
}

export function setFallbackActive(reason: string) {
  try {
    writeFileSync(FALLBACK_FLAG, JSON.stringify({
      since: new Date().toISOString(),
      reason,
    }, null, 2), 'utf-8')
    flog(`Fallback ACTIVATED: ${reason}`)
  } catch { /* non-critical */ }
}

export function clearFallback() {
  try {
    if (existsSync(FALLBACK_FLAG)) {
      unlinkSync(FALLBACK_FLAG)
      flog('Fallback CLEARED — Claude restored')
    }
  } catch { /* non-critical */ }
}

export function getFallbackInfo(): { since: string; reason: string } | null {
  try {
    if (!existsSync(FALLBACK_FLAG)) return null
    return JSON.parse(readFileSync(FALLBACK_FLAG, 'utf-8')) as { since: string; reason: string }
  } catch {
    return null
  }
}

export function isClaudeUnavailableText(text: string): boolean {
  return /(does not have access|please login|unauthorized|not logged|401|oauth|auth status unavailable|must use the claude\.ai max oauth account|hit your limit|usage limit|rate limit|resets?\s+\d|out of extra usage)/i.test(text)
}

export async function probeClaudeHealth(): Promise<boolean> {
  try {
    const r = await executeCommand(
      'claude auth status --output json 2>/dev/null || claude auth status --json 2>/dev/null || claude auth status 2>/dev/null',
      { timeout: 12_000 },
    )
    const out = `${r.stdout || ''}\n${r.stderr || ''}`.trim()
    if (!out) return false
    if (isClaudeUnavailableText(out)) return false
    if (/claude\.ai|oauth|max/i.test(out)) return true

    const tokenCheck = await executeCommand(
      `python3 -c "import json,time; c=json.load(open('/home/pi/.claude/.credentials.json')); ea=c['claudeAiOauth']['expiresAt']/1000; print('ok' if ea > time.time()+300 else 'expired')" 2>/dev/null`,
      { timeout: 5_000 },
    )
    return (tokenCheck.stdout || '').trim() === 'ok'
  } catch {
    return false
  }
}

export async function runCodexPrompt(options: {
  promptPath: string
  cwd: string
  maxTurns: number
  timeoutSeconds: number
  liveLogPath?: string
}): Promise<ExecuteResult> {
  const { promptPath, cwd, timeoutSeconds, liveLogPath } = options
  const kill = 30
  flog(`Running Codex exec (timeout=${timeoutSeconds}s) on ${promptPath}`)

  const pipeline = `cat "${promptPath}" | timeout --kill-after=${kill} ${timeoutSeconds} codex exec --skip-git-repo-check --sandbox danger-full-access -`
  const cmd = !liveLogPath
    ? `${pipeline} 2>&1`
    : [
        `echo '=== Codex started at '$(date)' ===' > "${liveLogPath}"`,
        `${pipeline} 2>&1 | tee -a "${liveLogPath}"`,
        `echo '=== Codex finished at '$(date)' (exit: '$?') ===' >> "${liveLogPath}"`,
      ].join(' && ')

  return executeCommand(cmd, {
    cwd,
    timeout: (timeoutSeconds + kill + 10) * 1000,
  })
}
