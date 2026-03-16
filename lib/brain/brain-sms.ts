/* ─── Pi-Chi Brain — SMS Gateway with Rate Limiting ──────────── */

import { execFile } from 'node:child_process'
import { platform } from 'node:os'
import { readFileSync, appendFileSync, writeFileSync, existsSync, statSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { randomUUID } from 'node:crypto'
import type { BrainState } from './brain-types'
import { addActivity, getAdelaideDate } from './brain-state'
import { checkSmsGuardrails } from './sms-guardrails'

const MAX_SMS_PER_HOUR = 10
const MAX_SMS_PER_DAY = 50
const MIN_SMS_INTERVAL_MS = 2 * 60 * 1000 // 2 minutes
const SMS_LOG_FILE = join(homedir(), '.pi-chi', 'sms-log.jsonl')
const SMS_LOG_MAX_BYTES = 100 * 1024 // 100KB

// ── Modem Gateway IPC paths ─────────────────────────────────────

const SMS_DIR = join(homedir(), '.pi-chi', 'sms')
const OUTBOX_DIR = join(SMS_DIR, 'outbox')
const HEARTBEAT_FILE = join(homedir(), '.pi-chi', 'sms-heartbeat')
const MODEM_HEARTBEAT_MAX_AGE_MS = 2 * 60 * 1000 // 2 minutes

interface SmsLogEntry {
  time: string
  to: string
  message: string
  source: string // 'brain' | 'chat' | 'gateway'
}

interface SmsResult {
  success: boolean
  message: string
  rateLimited?: boolean
}

// ── Persistent SMS log ───────────────────────────────────────────

function getSmsLogEntries(): SmsLogEntry[] {
  if (!existsSync(SMS_LOG_FILE)) return []
  try {
    const raw = readFileSync(SMS_LOG_FILE, 'utf-8').trim()
    if (!raw) return []
    return raw.split('\n').map(line => {
      try { return JSON.parse(line) as SmsLogEntry }
      catch { return null }
    }).filter((e): e is SmsLogEntry => e !== null)
  } catch {
    return []
  }
}

function appendSmsLog(entry: SmsLogEntry): void {
  try {
    appendFileSync(SMS_LOG_FILE, JSON.stringify(entry) + '\n')
  } catch { /* non-critical */ }
}

function rotateSmsLog(): void {
  try {
    if (!existsSync(SMS_LOG_FILE)) return
    const size = statSync(SMS_LOG_FILE).size
    if (size <= SMS_LOG_MAX_BYTES) return

    // Keep only today's entries
    const today = getAdelaideDate()
    const entries = getSmsLogEntries()
    const todayEntries = entries.filter(e => e.time.startsWith(today))
    writeFileSync(SMS_LOG_FILE, todayEntries.map(e => JSON.stringify(e)).join('\n') + (todayEntries.length > 0 ? '\n' : ''))
  } catch { /* non-critical */ }
}

// ── Modem Gateway (file-based IPC) ───────────────────────────────

export function isModemGatewayAlive(): boolean {
  try {
    if (!existsSync(HEARTBEAT_FILE)) return false
    const raw = readFileSync(HEARTBEAT_FILE, 'utf-8')
    const heartbeat = JSON.parse(raw) as { timestamp: string; modemStatus: string }
    if (heartbeat.modemStatus !== 'connected') return false
    const age = Date.now() - new Date(heartbeat.timestamp).getTime()
    return age < MODEM_HEARTBEAT_MAX_AGE_MS
  } catch {
    return false
  }
}

export function queueModemSms(to: string, body: string): void {
  mkdirSync(OUTBOX_DIR, { recursive: true })
  const id = randomUUID().slice(0, 8)
  const timestamp = Date.now()
  const filename = `${timestamp}-${id}.json`
  const data = { id, to, body, createdAt: new Date().toISOString(), source: 'brain' }
  writeFileSync(join(OUTBOX_DIR, filename), JSON.stringify(data))
}

// ── Deduplication ────────────────────────────────────────────────

const DEDUP_WINDOW_MS = 60 * 60 * 1000 // 1 hour — won't resend same to+body within this window
const SIMILARITY_THRESHOLD = 0.85 // 85% char overlap = "same message"

function normalizeForDedup(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]/g, '').trim()
}

function similarity(a: string, b: string): number {
  const na = normalizeForDedup(a)
  const nb = normalizeForDedup(b)
  if (!na || !nb) return 0
  if (na === nb) return 1
  const longer = na.length >= nb.length ? na : nb
  const shorter = na.length < nb.length ? na : nb
  if (longer.length === 0) return 1
  // Simple overlap: count matching chars at same position
  let matches = 0
  for (let i = 0; i < shorter.length; i++) {
    if (shorter[i] === longer[i]) matches++
  }
  return matches / longer.length
}

export function isDuplicateSms(to: string, body: string): { duplicate: boolean; reason?: string } {
  const now = Date.now()
  const cutoff = now - DEDUP_WINDOW_MS
  const entries = getSmsLogEntries()
  const recent = entries.filter(e => new Date(e.time).getTime() > cutoff && e.to === to)

  for (const entry of recent) {
    const sim = similarity(entry.message, body)
    if (sim >= SIMILARITY_THRESHOLD) {
      const minsAgo = Math.round((now - new Date(entry.time).getTime()) / 60000)
      return {
        duplicate: true,
        reason: `Similar SMS to ${to} sent ${minsAgo}m ago (${Math.round(sim * 100)}% match): "${entry.message.slice(0, 60)}"`
      }
    }
  }
  return { duplicate: false }
}

// ── Unified SMS queue (used by brain + chat) ─────────────────────

export function queueSmsChecked(to: string, body: string, source: string, isOutreach: boolean = false): { queued: boolean; message: string } {
  // Sanitize
  const clean = body
    .replace(/[\r\n]+/g, ' ')
    .replace(/[^\x20-\x7E]/g, '')
    .trim()
    .slice(0, 160)
  if (!clean) return { queued: false, message: 'Empty message after sanitization' }

  // ── GUARDRAILS CHECK (added cycle 229) ──
  const guardrail = checkSmsGuardrails(to, clean, source, isOutreach)
  if (!guardrail.allowed) {
    console.log(`[brain-sms] GUARDRAIL BLOCKED: ${guardrail.reason}`)
    return { queued: false, message: guardrail.reason }
  }

  // Dedup check
  const dedup = isDuplicateSms(to, clean)
  if (dedup.duplicate) {
    console.log(`[brain-sms] BLOCKED duplicate: ${dedup.reason}`)
    return { queued: false, message: `Duplicate blocked: ${dedup.reason}` }
  }

  // Queue to modem outbox
  mkdirSync(OUTBOX_DIR, { recursive: true })
  const id = randomUUID().slice(0, 8)
  const timestamp = Date.now()
  const filename = `${timestamp}-${id}.json`
  const data = { id, to, body: clean, createdAt: new Date().toISOString(), source }
  writeFileSync(join(OUTBOX_DIR, filename), JSON.stringify(data))

  // Log immediately (don't wait for gateway confirmation)
  appendSmsLog({ time: new Date().toISOString(), to, message: clean, source })

  console.log(`[brain-sms] Queued SMS to ${to} via ${source}: ${clean.slice(0, 60)}`)
  return { queued: true, message: `SMS queued to ${to}: ${clean.slice(0, 50)}...` }
}

// ── Rate limit checks ────────────────────────────────────────────

export function canSendSms(state: BrainState): { allowed: boolean; reason?: string } {
  const now = Date.now()

  // Check daily limit (Adelaide timezone)
  const today = getAdelaideDate()
  if (state.smsTodayDate === today && state.smsTodayCount >= MAX_SMS_PER_DAY) {
    return { allowed: false, reason: `Daily SMS limit reached (${MAX_SMS_PER_DAY}/day)` }
  }

  // Check minimum interval
  if (state.lastSmsAt) {
    const elapsed = now - new Date(state.lastSmsAt).getTime()
    if (elapsed < MIN_SMS_INTERVAL_MS) {
      const waitMins = Math.ceil((MIN_SMS_INTERVAL_MS - elapsed) / 60000)
      return { allowed: false, reason: `Too soon — wait ${waitMins} more minutes` }
    }
  }

  // Check hourly limit from persistent SMS log (survives state resets)
  const oneHourAgo = now - 60 * 60 * 1000
  const logEntries = getSmsLogEntries()
  const recentSms = logEntries.filter(e => new Date(e.time).getTime() > oneHourAgo)
  if (recentSms.length >= MAX_SMS_PER_HOUR) {
    return { allowed: false, reason: `Hourly SMS limit reached (${MAX_SMS_PER_HOUR}/hour)` }
  }

  return { allowed: true }
}

export async function sendSms(state: BrainState, message: string): Promise<SmsResult> {
  const check = canSendSms(state)
  if (!check.allowed) {
    return { success: false, message: check.reason!, rateLimited: true }
  }

  // Sanitize message — single line, no newlines, max 300 chars
  const clean = message.replace(/[\r\n]+/g, ' ').trim().slice(0, 300)
  if (!clean) {
    return { success: false, message: 'Empty message' }
  }

  const recipient = process.env.SMS_RECIPIENT || 'leigh'

  // Resolve phone number for modem (needs full E.164)
  const recipientPhone = recipient === 'leigh' ? '+61481274420'
    : recipient === 'simone' ? '+61457556023'
    : recipient.startsWith('+') ? recipient
    : null

  // Guardrails check
  const effectiveTo = recipientPhone || recipient
  const guardrail = checkSmsGuardrails(effectiveTo, clean, 'brain-sendSms')
  if (!guardrail.allowed) {
    return { success: false, message: guardrail.reason, rateLimited: true }
  }

  // Dedup check before any send attempt
  const dedup = isDuplicateSms(effectiveTo, clean)
  if (dedup.duplicate) {
    return { success: false, message: `Blocked: ${dedup.reason}`, rateLimited: true }
  }

  try {
    // 1. Try SIM7600 modem gateway first (zero cost, 2-way)
    if (recipientPhone && isModemGatewayAlive()) {
      try {
        queueModemSms(recipientPhone, clean)
        recordSmsSent(state, recipientPhone, clean, 'brain')
        return { success: true, message: `SMS queued via modem to ${recipient}` }
      } catch (modemErr) {
        console.log(`[brain-sms] Modem queue failed, falling back: ${modemErr instanceof Error ? modemErr.message : modemErr}`)
      }
    }

    // 2. Fall back to HTTP gateway (if configured)
    const gatewayUrl = process.env.SMS_GATEWAY_URL
    if (gatewayUrl) {
      const res = await fetch(gatewayUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipient, message: clean }),
      })
      if (res.ok) {
        recordSmsSent(state, effectiveTo, clean, 'brain-http')
        return { success: true, message: `SMS sent to ${recipient} via HTTP gateway` }
      }
    }

    // 3. Fall back to bash script
    const scriptPath = process.env.SMS_GATEWAY_SCRIPT || (
      platform() === 'win32'
        ? 'C:/Users/leigh/scripts/sms.sh'
        : '/home/pi/scripts/sms.sh'
    )

    await new Promise<void>((resolve, reject) => {
      const shell = platform() === 'win32' ? 'bash' : '/bin/bash'
      execFile(shell, [scriptPath, recipient, clean], { timeout: 30000 }, (err, _stdout, stderr) => {
        if (err) reject(new Error(stderr || err.message))
        else resolve()
      })
    })

    recordSmsSent(state, effectiveTo, clean, 'brain-script')
    return { success: true, message: `SMS sent to ${recipient} via script` }
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err)
    addActivity(state, 'error', `SMS failed: ${errMsg}`)
    return { success: false, message: `SMS failed: ${errMsg}` }
  }
}

function recordSmsSent(state: BrainState, to: string, message: string, source: string): void {
  const today = getAdelaideDate()
  state.lastSmsAt = new Date().toISOString()
  state.smsCount++
  if (state.smsTodayDate !== today) {
    state.smsTodayDate = today
    state.smsTodayCount = 1
  } else {
    state.smsTodayCount++
  }
  addActivity(state, 'sms', `Sent SMS to ${to}: ${message.slice(0, 80)}`)

  // Persist to SMS log file (survives state resets)
  appendSmsLog({ time: new Date().toISOString(), to, message: message.slice(0, 160), source })
  rotateSmsLog()
}
