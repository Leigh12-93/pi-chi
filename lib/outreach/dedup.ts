/* ─── Outreach Dedup — Prevents duplicate SMS to providers ──────
 * Reads:  ~/.pi-chi/sms-audit.jsonl (all SMS audit entries)
 * Writes: ~/.pi-chi/outreach-dedup.jsonl (outreach-specific decisions)
 *
 * Rules:
 * 1. If phone contacted within last 7 days → SKIP
 * 2. If phone contacted 3+ times total   → SKIP (don't spam)
 * 3. Otherwise                            → CLEAR TO SEND
 * ─────────────────────────────────────────────────────────────── */

import { existsSync, readFileSync, appendFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'

const SMS_AUDIT_FILE = join(homedir(), '.pi-chi', 'sms-audit.jsonl')
const DEDUP_LOG_FILE = join(homedir(), '.pi-chi', 'outreach-dedup.jsonl')

const COOLDOWN_DAYS = 7
const MAX_CONTACTS = 3

interface SmsAuditEntry {
  timestamp: string
  to: string
  message: string
  action: 'sent' | 'blocked'
  reason: string
  source: string
}

export interface DedupDecision {
  timestamp: string
  phone: string
  provider_name: string
  decision: 'sent' | 'blocked'
  reason: string
  outreach_count: number
}

function normalizePhone(phone: string): string {
  let n = phone.replace(/[\s\-()]/g, '')
  if (n.startsWith('04') && n.length === 10) {
    n = '+61' + n.slice(1)
  }
  return n
}

function readAuditEntries(): SmsAuditEntry[] {
  if (!existsSync(SMS_AUDIT_FILE)) return []
  try {
    const raw = readFileSync(SMS_AUDIT_FILE, 'utf-8').trim()
    if (!raw) return []
    return raw.split('\n').map(line => {
      try { return JSON.parse(line) as SmsAuditEntry }
      catch { return null }
    }).filter((e): e is SmsAuditEntry => e !== null)
  } catch {
    return []
  }
}

function readDedupLog(): DedupDecision[] {
  if (!existsSync(DEDUP_LOG_FILE)) return []
  try {
    const raw = readFileSync(DEDUP_LOG_FILE, 'utf-8').trim()
    if (!raw) return []
    return raw.split('\n').map(line => {
      try { return JSON.parse(line) as DedupDecision }
      catch { return null }
    }).filter((e): e is DedupDecision => e !== null)
  } catch {
    return []
  }
}

export function logDedupDecision(decision: DedupDecision): void {
  try {
    mkdirSync(join(homedir(), '.pi-chi'), { recursive: true })
    appendFileSync(DEDUP_LOG_FILE, JSON.stringify(decision) + '\n')
  } catch { /* non-critical */ }
}

/**
 * Check if an outreach SMS can be sent to this phone number.
 * Returns { clear: true } if OK to send, or { clear: false, reason } if blocked.
 */
export function checkOutreachDedup(phone: string, _providerName: string): {
  clear: boolean
  reason: string
  outreachCount: number
} {
  const norm = normalizePhone(phone)
  const now = Date.now()
  const cooldownMs = COOLDOWN_DAYS * 24 * 60 * 60 * 1000

  // Count outreach contacts from both audit log and dedup log
  const auditEntries = readAuditEntries()
  const dedupEntries = readDedupLog()

  // Find all "sent" entries to this phone tagged as outreach
  const auditContacts = auditEntries.filter(e =>
    e.action === 'sent' &&
    normalizePhone(e.to) === norm &&
    (e.source.includes('outreach') || e.source === 'cron-outreach' || e.source === 'cron-outreach-v2')
  )

  const dedupSent = dedupEntries.filter(e =>
    e.decision === 'sent' &&
    normalizePhone(e.phone) === norm
  )

  // Total outreach count (dedup from both sources by timestamp proximity)
  const allContactTimestamps = [
    ...auditContacts.map(e => new Date(e.timestamp).getTime()),
    ...dedupSent.map(e => new Date(e.timestamp).getTime()),
  ]
  // Deduplicate timestamps within 5 minutes of each other
  const uniqueTimestamps: number[] = []
  for (const ts of allContactTimestamps.sort()) {
    if (uniqueTimestamps.length === 0 || ts - uniqueTimestamps[uniqueTimestamps.length - 1] > 5 * 60 * 1000) {
      uniqueTimestamps.push(ts)
    }
  }

  const totalContacts = uniqueTimestamps.length

  // Rule 2: Max contacts exceeded
  if (totalContacts >= MAX_CONTACTS) {
    return {
      clear: false,
      reason: `Already contacted ${totalContacts} times (max ${MAX_CONTACTS}). Don't spam.`,
      outreachCount: totalContacts,
    }
  }

  // Rule 1: Contacted within cooldown window
  const recentContact = uniqueTimestamps.find(ts => now - ts < cooldownMs)
  if (recentContact) {
    const daysAgo = Math.round((now - recentContact) / (24 * 60 * 60 * 1000) * 10) / 10
    return {
      clear: false,
      reason: `Contacted ${daysAgo} days ago (cooldown: ${COOLDOWN_DAYS} days). Wait for reply.`,
      outreachCount: totalContacts,
    }
  }

  // Clear to send
  return {
    clear: true,
    reason: `OK — ${totalContacts} prior contacts, none within ${COOLDOWN_DAYS} days`,
    outreachCount: totalContacts,
  }
}

/**
 * Convenience wrapper matching the requested interface.
 * Returns { canSend, reason, lastContactDate? }
 */
export function checkDuplicate(phone: string): {
  canSend: boolean
  reason: string
  lastContactDate?: Date
} {
  const norm = normalizePhone(phone)
  const result = checkOutreachDedup(phone, '')

  // Find most recent contact date
  const auditEntries = readAuditEntries()
  const dedupEntries = readDedupLog()
  const allTimestamps = [
    ...auditEntries
      .filter(e => e.action === 'sent' && normalizePhone(e.to) === norm &&
        (e.source.includes('outreach') || e.source === 'cron-outreach' || e.source === 'cron-outreach-v2'))
      .map(e => new Date(e.timestamp).getTime()),
    ...dedupEntries
      .filter(e => e.decision === 'sent' && normalizePhone(e.phone) === norm)
      .map(e => new Date(e.timestamp).getTime()),
  ].sort((a, b) => b - a)

  const lastContactDate = allTimestamps.length > 0 ? new Date(allTimestamps[0]) : undefined

  if (!result.clear) {
    const reason = result.outreachCount >= MAX_CONTACTS
      ? 'max_contacts_reached'
      : 'already_contacted_within_7_days'
    return { canSend: false, reason, lastContactDate }
  }

  return { canSend: true, reason: 'clear', lastContactDate }
}

/**
 * Write an outreach decision to the dedup log.
 */
export function writeDedup(
  phone: string,
  decision: 'sent' | 'blocked',
  reason: string,
  provider_name: string,
  outreach_count: number,
): void {
  logDedupDecision({
    timestamp: new Date().toISOString(),
    phone: normalizePhone(phone),
    provider_name,
    decision,
    reason,
    outreach_count,
  })
}
