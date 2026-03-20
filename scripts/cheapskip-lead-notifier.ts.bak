#!/usr/bin/env tsx
/* ═══════════════════════════════════════════════════════════════════
 * CheapSkip Lead Notifier — Polls Supabase for new leads,
 * matches to providers, sends SMS via Pi modem outbox.
 *
 * Run: npx tsx scripts/cheapskip-lead-notifier.ts
 * Service: cheapskip-lead-notifier.service
 * ═══════════════════════════════════════════════════════════════════ */

import { createClient } from '@supabase/supabase-js'
import { writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { randomUUID } from 'node:crypto'

// ── Config ─────────────────────────────────────────────────────────

const POLL_INTERVAL_MS = 60_000 // 60 seconds
const OUTBOX_DIR = join(homedir(), '.pi-chi', 'sms', 'outbox')
const LEIGH_PHONE = '+61451072948' // Leigh's number for owner notifications

// CheapSkip Supabase (separate from Pi-Chi's Supabase)
const SUPABASE_URL = (process.env.CHEAPSKIP_SUPABASE_URL || 'https://pocoystpkrdmobplazhd.supabase.co').trim()
const SUPABASE_KEY = (process.env.CHEAPSKIP_SUPABASE_SERVICE_ROLE_KEY || '').trim()

if (!SUPABASE_KEY) {
  console.error('FATAL: CHEAPSKIP_SUPABASE_SERVICE_ROLE_KEY not set')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

// ── SMS Helper ─────────────────────────────────────────────────────

function normalizePhone(phone: string): string | null {
  const digits = phone.replace(/[\s()\-]/g, '')
  if (digits.startsWith('1300') || digits.startsWith('1800')) return null
  if (digits.startsWith('04')) return '+61' + digits.slice(1)
  if (digits.startsWith('08')) return '+61' + digits.slice(1)
  if (digits.startsWith('+61')) return digits
  return null
}

function queueSms(to: string, message: string): void {
  mkdirSync(OUTBOX_DIR, { recursive: true })
  const id = randomUUID()
  const payload = JSON.stringify({ to, message: message.slice(0, 160) })
  writeFileSync(join(OUTBOX_DIR, `${id}.json`), payload)
  console.log(`  SMS queued → ${to.slice(0, 6)}...`)
}

// ── Main Loop ──────────────────────────────────────────────────────

async function processNewLeads(): Promise<void> {
  const { data: leads, error } = await supabase
    .from('quote_requests')
    .select('*')
    .eq('status', 'new')
    .order('created_at', { ascending: true })
    .limit(10)

  if (error) {
    console.error('Supabase query error:', error.message)
    return
  }

  if (!leads || leads.length === 0) return

  console.log(`Found ${leads.length} new lead(s)`)

  // Fetch active providers
  const { data: providers } = await supabase
    .from('providers')
    .select('*')
    .in('subscription_status', ['approved', 'active'])

  for (const lead of leads) {
    const suburb = (lead.suburb || '').toLowerCase().trim()
    const postcode = (lead.postcode || '').trim()
    const state = (lead.state || '').toLowerCase().trim()

    // Match providers by service area
    const matched = (providers || []).filter((p: Record<string, unknown>) => {
      const areas = (p.service_areas as string[]) || []
      return areas.some((area: string) => {
        const a = area.toLowerCase().trim()
        return (
          a === suburb ||
          a === postcode ||
          a === state ||
          suburb.includes(a) ||
          a.includes(suburb)
        )
      })
    })

    console.log(`Lead #${lead.id}: ${lead.customer_name} in ${lead.suburb} — ${matched.length} provider match(es)`)

    // Notify matched providers via SMS
    const notifiedNames: string[] = []
    for (const provider of matched) {
      const p = provider as Record<string, unknown>
      const phone = normalizePhone((p.phone as string) || '')
      if (!phone) continue

      const msg = [
        'New skip bin lead - CheapSkipBinsNearMe',
        `Customer: ${lead.customer_name}`,
        `Phone: ${lead.phone}`,
        lead.suburb ? `Area: ${lead.suburb}` : null,
        lead.bin_size ? `Size: ${lead.bin_size}` : null,
        'Call them ASAP!',
      ]
        .filter(Boolean)
        .join('\n')

      queueSms(phone, msg)
      notifiedNames.push(p.name as string)
    }

    // Notify Leigh of the new lead
    const ownerMsg = [
      `CheapSkip lead #${lead.id}!`,
      `${lead.customer_name} - ${lead.phone}`,
      `${lead.suburb || ''} ${lead.bin_size || ''}`,
      matched.length > 0
        ? `Sent to: ${notifiedNames.join(', ')}`
        : 'No provider match',
    ]
      .filter(Boolean)
      .join('\n')

    queueSms(LEIGH_PHONE, ownerMsg)

    // Update lead status
    const notes = [
      lead.notes,
      matched.length > 0
        ? `SMS sent to: ${notifiedNames.join(', ')}`
        : 'No provider matched service area',
    ]
      .filter(Boolean)
      .join('; ')

    await supabase
      .from('quote_requests')
      .update({
        status: matched.length > 0 ? 'distributed' : 'unmatched',
        notes,
      })
      .eq('id', lead.id)
  }
}

// ── Run ────────────────────────────────────────────────────────────

console.log('CheapSkip Lead Notifier started')
console.log(`Polling every ${POLL_INTERVAL_MS / 1000}s`)

// Initial poll
processNewLeads().catch(console.error)

// Recurring poll
setInterval(() => {
  processNewLeads().catch(console.error)
}, POLL_INTERVAL_MS)
