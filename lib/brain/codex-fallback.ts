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

function parseRetryAfter(reason: string): string | null {
  const direct = reason.match(/resets?\s+([A-Z][a-z]{2}\s+\d{1,2},\s+\d{1,2}:\d{2}(?:am|pm))/i)
  if (direct) {
    const year = new Date().getFullYear()
    const dt = new Date(`${direct[1]} ${year}`)
    if (!Number.isNaN(dt.getTime())) return dt.toISOString()
  }

  const timeOnly = reason.match(/resets?\s+(\d{1,2}:\d{2}(?:am|pm))/i)
  if (timeOnly) {
    const now = new Date()
    const m = timeOnly[1].match(/(\d{1,2}):(\d{2})(am|pm)/i)
    if (m) {
      let hour = Number(m[1]) % 12
      const minute = Number(m[2])
      if (m[3].toLowerCase() === 'pm') hour += 12
      const dt = new Date(now)
      dt.setHours(hour, minute, 0, 0)
      if (dt.getTime() <= now.getTime()) dt.setDate(dt.getDate() + 1)
      return dt.toISOString()
    }
  }

  return null
}

export function setFallbackActive(reason: string) {
  try {
    const retryAfter = parseRetryAfter(reason)
    writeFileSync(FALLBACK_FLAG, JSON.stringify({
      since: new Date().toISOString(),
      reason,
      retryAfter,
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

export function getFallbackInfo(): { since: string; reason: string; retryAfter?: string | null } | null {
  try {
    if (!existsSync(FALLBACK_FLAG)) return null
    return JSON.parse(readFileSync(FALLBACK_FLAG, 'utf-8')) as { since: string; reason: string; retryAfter?: string | null }
  } catch {
    return null
  }
}

export function isClaudeUnavailableText(text: string): boolean {
  return /(does not have access|please login|unauthorized|not logged|401|oauth|auth status unavailable|must use the claude\.ai max oauth account|hit your limit|usage limit|rate limit|resets?\s+\d|out of extra usage)/i.test(text)
}


export function shouldProbeClaudeNow(): boolean {
  const info = getFallbackInfo()
  if (!info?.retryAfter) return true
  const retryAt = Date.parse(info.retryAfter)
  if (Number.isNaN(retryAt)) return true
  return Date.now() >= retryAt
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
