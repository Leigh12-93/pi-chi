/* ─── Pi-Chi Brain — SMS via Gammu (SIM7600 modem) ───────────── */

import { execFile } from 'node:child_process'
import { readFileSync, appendFileSync, writeFileSync, existsSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import type { BrainState } from './brain-types'
import { addActivity, getAdelaideDate, pushDisplayEvent } from './brain-state'
import { checkSmsGuardrails } from './sms-guardrails'

const MAX_SMS_PER_HOUR = 10
const MAX_SMS_PER_DAY = 50
const MIN_SMS_INTERVAL_MS = 2 * 60 * 1000 // 2 minutes
const SMS_LOG_FILE = join(homedir(), '.pi-chi', 'sms-log.jsonl')
const SMS_LOG_MAX_BYTES = 100 * 1024 // 100KB
const GAMMU_TIMEOUT_MS = 30_000

interface SmsLogEntry {
  time: string
  to: string
  message: string
  source: string // 'brain' | 'chat' | 'outreach'
}

interface SmsResult {
  success: boolean
  message: string
  rateLimited?: boolean
}

interface ReceivedSms {
  from: string
  text: string
  date: string
  location: number
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
    const today = getAdelaideDate()
    const entries = getSmsLogEntries()
    const todayEntries = entries.filter(e => e.time.startsWith(today))
    writeFileSync(SMS_LOG_FILE, todayEntries.map(e => JSON.stringify(e)).join('\n') + (todayEntries.length > 0 ? '\n' : ''))
  } catch { /* non-critical */ }
}

// ── Gammu — send SMS directly via modem ──────────────────────────

function gammuSend(to: string, body: string): Promise<{ success: boolean; output: string }> {
  return new Promise((resolve) => {
    execFile('gammu', ['sendsms', 'TEXT', to, '-text', body, '-autolen', '1'], { timeout: GAMMU_TIMEOUT_MS }, (err, stdout, stderr) => {
      const output = (stdout + '\n' + stderr).trim()
      if (err) {
        resolve({ success: false, output: output || err.message })
      } else {
        resolve({ success: output.includes('OK'), output })
      }
    })
  })
}

// ── Gammu — check modem is reachable ─────────────────────────────

export function isModemAvailable(): Promise<boolean> {
  return new Promise((resolve) => {
    execFile('gammu', ['identify'], { timeout: 10_000 }, (err) => {
      resolve(!err)
    })
  })
}

// ── Gammu — read all inbox SMS ───────────────────────────────────

export function readInboxSms(): Promise<ReceivedSms[]> {
  return new Promise((resolve) => {
    execFile('gammu', ['--getallsms'], { timeout: GAMMU_TIMEOUT_MS }, (err, stdout) => {
      if (err) { resolve([]); return }
      const messages: ReceivedSms[] = []
      const blocks = stdout.split(/^Location /m)
      for (const block of blocks) {
        if (!block.trim()) continue
        const locMatch = block.match(/^(\d+)/)
        const fromMatch = block.match(/Remote number\s*:\s*"([^"]+)"/)
        const dateMatch = block.match(/Sent\s*:\s*(.+)/)
        // Extract user data (text after the last header line)
        const lines = block.split('\n')
        const textLines: string[] = []
        let pastHeaders = false
        for (const line of lines) {
          if (pastHeaders) {
            textLines.push(line)
          } else if (line.trim() === '' && fromMatch) {
            pastHeaders = true
          }
        }
        const text = textLines.join('\n').trim()
        if (fromMatch && text) {
          messages.push({
            location: locMatch ? parseInt(locMatch[1]) : 0,
            from: fromMatch[1],
            text,
            date: dateMatch ? dateMatch[1].trim() : '',
          })
        }
      }
      resolve(messages)
    })
  })
}

// ── Deduplication ────────────────────────────────────────────────

const DEDUP_WINDOW_MS = 60 * 60 * 1000 // 1 hour
const SIMILARITY_THRESHOLD = 0.85

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

// ── Unified SMS send (used by brain + chat + outreach) ───────────

export async function queueSmsChecked(to: string, body: string, source: string, isOutreach: boolean = false): Promise<{ queued: boolean; message: string }> {
  // Sanitize
  const clean = body
    .replace(/[\r\n]+/g, ' ')
    .replace(/[^\x20-\x7E]/g, '')
    .trim()
    .slice(0, 600)
  if (!clean) return { queued: false, message: 'Empty message after sanitization' }

  // Guardrails
  const guardrail = checkSmsGuardrails(to, clean, source, isOutreach)
  if (!guardrail.allowed) {
    console.log(`[brain-sms] GUARDRAIL BLOCKED: ${guardrail.reason}`)
    return { queued: false, message: guardrail.reason }
  }

  // Dedup
  const dedup = isDuplicateSms(to, clean)
  if (dedup.duplicate) {
    console.log(`[brain-sms] BLOCKED duplicate: ${dedup.reason}`)
    return { queued: false, message: `Duplicate blocked: ${dedup.reason}` }
  }

  // Send via gammu
  pushDisplayEvent('sms_sending', clean, { to, source })
  const result = await gammuSend(to, clean)
  if (!result.success) {
    console.log(`[brain-sms] Gammu send failed: ${result.output}`)
    pushDisplayEvent('sms_fail', result.output, { to, source })
    return { queued: false, message: `Gammu send failed: ${result.output}` }
  }

  appendSmsLog({ time: new Date().toISOString(), to, message: clean, source })
  pushDisplayEvent('sms_sent', clean, { to, source })
  console.log(`[brain-sms] Sent SMS to ${to} via gammu (${source}): ${clean.slice(0, 60)}`)
  return { queued: true, message: `SMS sent to ${to}: ${clean.slice(0, 50)}...` }
}

// ── Rate limit checks ────────────────────────────────────────────

export function canSendSms(state: BrainState): { allowed: boolean; reason?: string } {
  const now = Date.now()

  const today = getAdelaideDate()
  if (state.smsTodayDate === today && state.smsTodayCount >= MAX_SMS_PER_DAY) {
    return { allowed: false, reason: `Daily SMS limit reached (${MAX_SMS_PER_DAY}/day)` }
  }

  if (state.lastSmsAt) {
    const elapsed = now - new Date(state.lastSmsAt).getTime()
    if (elapsed < MIN_SMS_INTERVAL_MS) {
      const waitMins = Math.ceil((MIN_SMS_INTERVAL_MS - elapsed) / 60000)
      return { allowed: false, reason: `Too soon — wait ${waitMins} more minutes` }
    }
  }

  const oneHourAgo = now - 60 * 60 * 1000
  const logEntries = getSmsLogEntries()
  const recentSms = logEntries.filter(e => new Date(e.time).getTime() > oneHourAgo)
  if (recentSms.length >= MAX_SMS_PER_HOUR) {
    return { allowed: false, reason: `Hourly SMS limit reached (${MAX_SMS_PER_HOUR}/hour)` }
  }

  return { allowed: true }
}

// ── Main send function (brain → owner) ───────────────────────────

export async function sendSms(state: BrainState, message: string): Promise<SmsResult> {
  const check = canSendSms(state)
  if (!check.allowed) {
    return { success: false, message: check.reason!, rateLimited: true }
  }

  const clean = message.replace(/[\r\n]+/g, ' ').trim().slice(0, 600)
  if (!clean) {
    return { success: false, message: 'Empty message' }
  }

  const recipient = process.env.SMS_RECIPIENT || 'leigh'

  const recipientPhone = recipient === 'leigh' ? '+61481274420'
    : recipient === 'simone' ? '+61457556023'
    : recipient.startsWith('+') ? recipient
    : null

  if (!recipientPhone) {
    return { success: false, message: `Cannot resolve phone for "${recipient}"` }
  }

  const guardrail = checkSmsGuardrails(recipientPhone, clean, 'brain-sendSms')
  if (!guardrail.allowed) {
    return { success: false, message: guardrail.reason, rateLimited: true }
  }

  const dedup = isDuplicateSms(recipientPhone, clean)
  if (dedup.duplicate) {
    return { success: false, message: `Blocked: ${dedup.reason}`, rateLimited: true }
  }

  try {
    pushDisplayEvent('sms_sending', clean, { to: recipientPhone, source: 'brain' })
    const result = await gammuSend(recipientPhone, clean)
    if (!result.success) {
      pushDisplayEvent('sms_fail', result.output, { to: recipientPhone, source: 'brain' })
      addActivity(state, 'error', `SMS failed (gammu): ${result.output}`)
      return { success: false, message: `Gammu failed: ${result.output}` }
    }

    pushDisplayEvent('sms_sent', clean, { to: recipientPhone, source: 'brain' })
    recordSmsSent(state, recipientPhone, clean, 'brain')
    return { success: true, message: `SMS sent to ${recipient} via gammu` }
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
  appendSmsLog({ time: new Date().toISOString(), to, message: message.slice(0, 600), source })
  rotateSmsLog()
}
