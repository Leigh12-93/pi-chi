#!/usr/bin/env tsx

import { createClient } from '@supabase/supabase-js'
import { writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { randomUUID } from 'node:crypto'

// ── Config ─────────────────────────────────────────────────────────

const POLL_INTERVAL_MS = 60_000 // 60 seconds
const OUTBOX_DIR = join(homedir(), '.pi-chi', 'sms', 'outbox')
const LEIGH_PHONE = '+61481274420'

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

function cleanSms(msg: string): string {
  return msg
    .replace(/\u00b3/g, '3')    // m3 (cubic)
    .replace(/\u00b2/g, '2')    // m2 (square)
    .replace(/[\u201c\u201d]/g, '"')  // smart quotes
    .replace(/[\u2013\u2014]/g, '-')  // dashes
    .replace(/\u2026/g, '...')        // ellipsis
    .replace(/\u00a0/g, ' ')          // non-breaking space
    .replace(/[^\x20-\x7E\n]/g, '') // strip remaining non-ASCII
    .replace(/ {2,}/g, ' ')           // collapse spaces
    .trim()
}

function queueSms(to: string, message: string): void {
  mkdirSync(OUTBOX_DIR, { recursive: true })
  const id = randomUUID()
  const clean = cleanSms(message).slice(0, 459) // max 3 SMS segments
  const payload = JSON.stringify({ to, message: clean })
  writeFileSync(join(OUTBOX_DIR, `${id}.json`), payload)
  console.log(`  SMS queued to ${to.slice(0, 8)}...`)
}

// ── Process new leads ──────────────────────────────────────────────

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

  // Fetch active providers from skip_providers (has service_postcodes + radius data)
  const { data: providers } = await supabase
    .from('skip_providers')
    .select('id, business_name, contact_name, phone, service_areas, service_postcodes, bin_sizes')
    .in('status', ['active', 'approved'])

  for (const lead of leads) {
    // Skip test/bot leads — don't waste provider SMS on fake leads
    const testNames = ['test', 'healthcheck bot', 'pipeline test', 'flow test', 'api test']
    const nameLC = (lead.customer_name || '').toLowerCase().trim()
    const isTestLead = testNames.some(t => nameLC.includes(t)) || lead.phone === '0400000000'
    if (isTestLead) {
      console.log(`Lead #${lead.id}: "${lead.customer_name}" — TEST lead, skipping distribution`)
      await supabase.from('quote_requests').update({ status: 'test' }).eq('id', lead.id)
      continue
    }

    const suburb = (lead.suburb || '').toLowerCase().trim()
    const postcode = (lead.postcode || '').trim()
    const state = (lead.state || '').toLowerCase().trim()
    const binSize = (lead.bin_size || '').trim()

    const matched = (providers || []).filter((p: Record<string, unknown>) => {
      // Bin size filter
      const sizes = (p.bin_sizes as string[] | null) || []
      if (sizes.length > 0 && binSize) {
        const targetNum = parseFloat(binSize)
        if (!sizes.some(s => Math.abs(parseFloat(s) - targetNum) <= 1)) return false
      }

      // Postcode match — most accurate (radius-based signup)
      const postcodes = (p.service_postcodes as string[] | null) || []
      if (postcodes.length > 0 && postcode && postcodes.includes(postcode)) return true

      // Fallback: service area string match (legacy providers)
      const areas = (p.service_areas as string[]) || []
      return areas.some((area: string) => {
        const a = area.toLowerCase().trim()
        return a === suburb || a === postcode || a === state ||
          suburb.includes(a) || a.includes(suburb)
      })
    })

    console.log(`Lead #${lead.id}: ${lead.customer_name} in ${lead.suburb} (${postcode}) — ${matched.length} match(es)`)

    const notifiedNames: string[] = []
    const size = (lead.bin_size || '').replace(/\u00b3/g, '3').replace(/\u00b2/g, '2')
    for (const provider of matched) {
      const p = provider as Record<string, unknown>
      const phone = normalizePhone((p.phone as string) || '')
      if (!phone) continue

      // Send teaser only — provider must reply YES to get full details
      const teaser = cleanSms(
        `CheapSkipBins: New lead in ${lead.suburb || lead.state || 'your area'} - ${size || 'skip bin'}. Reply YES to get customer details. $2/lead.`
      )
      queueSms(phone, teaser)

      // Record distribution so inbound YES handler can find it
      await supabase
        .from('lead_distributions')
        .insert({
          lead_id: lead.id,
          provider_id: p.id,
          status: 'sent',
          teaser_sent_at: new Date().toISOString(),
        })

      notifiedNames.push(p.business_name as string)
    }

    const ownerMsg = [
      `CheapSkip lead #${lead.id}!`,
      `${lead.customer_name} - ${lead.phone}`,
      `${lead.suburb || ''}${lead.state ? ', ' + lead.state : ''} ${size}`.trim(),
      matched.length > 0 ? `Sent to: ${notifiedNames.join(', ')}` : 'No provider match',
    ].filter(Boolean).join('\n')

    queueSms(LEIGH_PHONE, ownerMsg)

    const notes = [
      lead.notes,
      matched.length > 0
        ? `SMS sent to: ${notifiedNames.join(', ')}`
        : 'No provider matched service area',
    ].filter(Boolean).join('; ')

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

processNewLeads().catch(console.error)
setInterval(() => processNewLeads().catch(console.error), POLL_INTERVAL_MS)
