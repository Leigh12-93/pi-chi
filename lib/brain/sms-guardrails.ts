/* ─── Pi-Chi SMS Guardrails ─────────────────────────────────────
 * Enforces safety checks before ANY SMS is sent:
 * 1. Known number verification (owner contacts or providers DB)
 * 2. Max 2 SMS per number per day
 * 3. No outreach to numbers that already replied
 * 4. Pricing accuracy check (reject 'free lead' / 'no cost')
 * 5. Quiet hours (8pm-8am Adelaide time)
 * 6. Full audit logging to ~/.pi-chi/sms-audit.jsonl
 * ─────────────────────────────────────────────────────────────── */

import { existsSync, readFileSync, readdirSync, appendFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { LEAD_PRICE_AUD, getPricingStatement, isNotOurBusiness } from './business-rules'

const SMS_DIR = join(homedir(), '.pi-chi', 'sms')
const SENT_DIR = join(SMS_DIR, 'sent')
const INBOX_DIR = join(SMS_DIR, 'inbox')
const AUDIT_FILE = join(homedir(), '.pi-chi', 'sms-audit.jsonl')

// ── Known contacts ──────────────────────────────────────────────

const OWNER_CONTACTS: Record<string, string> = {
  '+61481274420': 'leigh',
  '+61457556023': 'simone',
}

interface AuditEntry {
  timestamp: string
  to: string
  message: string
  action: 'sent' | 'blocked'
  reason: string
  source: string
}

function logAudit(entry: AuditEntry): void {
  try {
    mkdirSync(join(homedir(), '.pi-chi'), { recursive: true })
    appendFileSync(AUDIT_FILE, JSON.stringify(entry) + '\n')
  } catch { /* non-critical */ }
}

// ── Helpers ─────────────────────────────────────────────────────

function normalizePhone(phone: string): string {
  // Strip spaces, dashes, parens
  let n = phone.replace(/[\s\-()]/g, '')
  // Convert 04xx to +614xx
  if (n.startsWith('04') && n.length === 10) {
    n = '+61' + n.slice(1)
  }
  return n
}

function getAdelaideHour(): number {
  // Adelaide is UTC+9:30 (ACST) or UTC+10:30 (ACDT)
  // Use Intl to get correct local time
  const now = new Date()
  const adelaideTime = new Date(now.toLocaleString('en-US', { timeZone: 'Australia/Adelaide' }))
  return adelaideTime.getHours()
}

function getAdelaideDate(): string {
  const now = new Date()
  const adelaideTime = new Date(now.toLocaleString('en-US', { timeZone: 'Australia/Adelaide' }))
  return adelaideTime.toISOString().slice(0, 10)
}

function readJsonDir(dir: string): Array<{ to?: string; body?: string; createdAt?: string; source?: string; from?: string; message?: string }> {
  if (!existsSync(dir)) return []
  try {
    const files = readdirSync(dir).filter(f => f.endsWith('.json'))
    return files.map(f => {
      try {
        return JSON.parse(readFileSync(join(dir, f), 'utf-8'))
      } catch { return null }
    }).filter(Boolean)
  } catch { return [] }
}

// ── Check 1: Known number ───────────────────────────────────────

function isKnownNumber(phone: string): { known: boolean; who?: string } {
  const norm = normalizePhone(phone)

  // Owner contacts
  if (OWNER_CONTACTS[norm]) {
    return { known: true, who: OWNER_CONTACTS[norm] }
  }

  // Check sent history — if we've sent to them before, they're in our system
  const sentMessages = readJsonDir(SENT_DIR)
  for (const msg of sentMessages) {
    const sentTo = msg.to ? normalizePhone(msg.to) : ''
    if (sentTo === norm) {
      return { known: true, who: 'previous-contact' }
    }
  }

  // Check inbox — if they've texted us, they're known
  const inboxMessages = readJsonDir(INBOX_DIR)
  for (const msg of inboxMessages) {
    const from = msg.from ? normalizePhone(msg.from) : ''
    if (from === norm) {
      return { known: true, who: 'inbound-contact' }
    }
  }

  return { known: false }
}

// ── Check 2: Daily limit per number (max 2/day) ────────────────

function getDailySmsCount(phone: string): number {
  const norm = normalizePhone(phone)
  const today = getAdelaideDate()

  // Check audit log for today's sends to this number
  if (!existsSync(AUDIT_FILE)) return 0
  try {
    const lines = readFileSync(AUDIT_FILE, 'utf-8').trim().split('\n')
    let count = 0
    for (const line of lines) {
      if (!line) continue
      try {
        const entry = JSON.parse(line) as AuditEntry
        if (entry.action === 'sent' && entry.timestamp.startsWith(today) && entry.to && normalizePhone(entry.to) === norm) {
          count++
        }
      } catch { /* skip bad lines */ }
    }
    return count
  } catch { return 0 }
}

// ── Check 3: Has number already replied? ────────────────────────

function hasReplied(phone: string): { replied: boolean; lastReply?: string } {
  const norm = normalizePhone(phone)
  const inboxMessages = readJsonDir(INBOX_DIR)

  for (const msg of inboxMessages) {
    const from = msg.from ? normalizePhone(msg.from) : ''
    if (from === norm) {
      return { replied: true, lastReply: msg.message || msg.body || '(unknown)' }
    }
  }

  return { replied: false }
}

// ── Check 4: Pricing accuracy ───────────────────────────────────

const BANNED_PHRASES = [
  'free lead',
  'free leads',
  'no cost',
  'zero cost',
  'at no charge',
  'completely free',
  'free of charge',
  '$0',
  '$5/lead',
  '$5 per lead',
  'five dollars per lead',
]

function hasBadPricing(message: string): { bad: boolean; phrase?: string } {
  const lower = message.toLowerCase()
  for (const phrase of BANNED_PHRASES) {
    if (lower.includes(phrase)) {
      return { bad: true, phrase }
    }
  }
  return { bad: false }
}

// ── Check 5: Quiet hours ────────────────────────────────────────

function isQuietHours(): boolean {
  const hour = getAdelaideHour()
  // 8pm (20) to 8am (8) is quiet
  return hour >= 20 || hour < 8
}

// ── Check 6: Business hours for outreach ────────────────────────

function isBusinessHours(): boolean {
  const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Australia/Adelaide' }))
  const hour = now.getHours()
  const day = now.getDay() // 0=Sun, 6=Sat
  // Mon-Fri 9am-5pm Adelaide time only
  return day >= 1 && day <= 5 && hour >= 9 && hour < 17
}

// ── Main guardrail check ────────────────────────────────────────

export interface GuardrailResult {
  allowed: boolean
  reason: string
}

export function checkSmsGuardrails(
  to: string,
  message: string,
  source: string,
  isOutreach: boolean = false
): GuardrailResult {
  const norm = normalizePhone(to)

  // 1. Quiet hours
  if (isQuietHours()) {
    logAudit({ timestamp: new Date().toISOString(), to: norm, message, action: 'blocked', reason: 'quiet-hours', source })
    return { allowed: false, reason: 'SMS blocked: quiet hours (8pm-8am Adelaide time)' }
  }

  // 1b. Outreach restricted to business hours (Mon-Fri 9am-5pm Adelaide)
  if (isOutreach && !isBusinessHours()) {
    logAudit({ timestamp: new Date().toISOString(), to: norm, message, action: 'blocked', reason: 'outside-business-hours', source })
    return { allowed: false, reason: 'SMS blocked: outreach only allowed Mon-Fri 9am-5pm Adelaide time' }
  }

  // 2. Known number check (bypass for booking leads — providers are in the database)
  const known = isKnownNumber(norm)
  if (!known.known && source !== 'booking') {
    logAudit({ timestamp: new Date().toISOString(), to: norm, message, action: 'blocked', reason: 'unknown-number', source })
    return { allowed: false, reason: `SMS blocked: ${norm} is not a known contact or provider` }
  }

  // 3. Daily limit (2 per number per day)
  const dailyCount = getDailySmsCount(norm)
  if (dailyCount >= 2) {
    logAudit({ timestamp: new Date().toISOString(), to: norm, message, action: 'blocked', reason: 'daily-limit', source })
    return { allowed: false, reason: `SMS blocked: already sent ${dailyCount} SMS to ${norm} today (max 2)` }
  }

  // 4. Outreach to number that already replied
  if (isOutreach) {
    const reply = hasReplied(norm)
    if (reply.replied) {
      logAudit({ timestamp: new Date().toISOString(), to: norm, message, action: 'blocked', reason: 'already-replied', source })
      return { allowed: false, reason: `SMS blocked: ${norm} already replied ("${reply.lastReply?.slice(0, 40)}"). Don't re-outreach.` }
    }
  }

  // 5. Pricing accuracy
  const pricing = hasBadPricing(message)
  if (pricing.bad) {
    logAudit({ timestamp: new Date().toISOString(), to: norm, message, action: 'blocked', reason: 'bad-pricing', source })
    return { allowed: false, reason: `SMS blocked: message contains banned phrase "${pricing.phrase}". Price is $2/lead.` }
  }

  // All checks passed — log as sent
  logAudit({ timestamp: new Date().toISOString(), to: norm, message, action: 'sent', reason: 'all-checks-passed', source })
  return { allowed: true, reason: 'OK' }
}

// ── Financial guardrails (sourced from business-rules.ts) ──────

export const HARD_CODED_PRICING = {
  perLeadCost: LEAD_PRICE_AUD,
  currency: 'AUD',
  model: getPricingStatement(),
}

export function validatePricingInMessage(message: string): { valid: boolean; issue?: string } {
  const lower = message.toLowerCase()
  const correctPrice = `$${LEAD_PRICE_AUD}/lead`

  // Check for wrong prices
  if (lower.includes('$5/lead') || lower.includes('$5 per lead')) {
    return { valid: false, issue: `Message says $5/lead — correct price is ${correctPrice}` }
  }
  if (lower.includes('free lead') || lower.includes('no cost')) {
    return { valid: false, issue: `Message says free — correct price is ${correctPrice}` }
  }

  // Check for mentions of businesses we don't own
  if (isNotOurBusiness(message)) {
    return { valid: false, issue: 'Message references a business that is NOT ours' }
  }

  return { valid: true }
}
