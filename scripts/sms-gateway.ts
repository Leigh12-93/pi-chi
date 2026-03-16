#!/usr/bin/env tsx
/* ═══════════════════════════════════════════════════════════════════
 * Pi-Chi SMS Gateway — Standalone SIM7600 Modem Service
 *
 * Owns the serial connection to the SIM7600 USB HAT.
 * File-based IPC: outbox/ → send, incoming → inbox/
 * Heartbeat written every 30s for liveness checks.
 *
 * Run: npx tsx scripts/sms-gateway.ts
 * Service: pi-chi-sms.service
 * ═══════════════════════════════════════════════════════════════════ */

import { mkdirSync, readdirSync, readFileSync, writeFileSync, appendFileSync, renameSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { randomUUID } from 'node:crypto'
import { Sim7600 } from '../lib/brain/sim7600'
import type { ReceivedSms } from '../lib/brain/sim7600'

// ── Paths ─────────────────────────────────────────────────────────

const SMS_DIR = join(homedir(), '.pi-chi', 'sms')
const OUTBOX_DIR = join(SMS_DIR, 'outbox')
const INBOX_DIR = join(SMS_DIR, 'inbox')
const SENT_DIR = join(SMS_DIR, 'sent')
const HEARTBEAT_FILE = join(homedir(), '.pi-chi', 'sms-heartbeat')

const SMS_LOG_FILE = join(homedir(), '.pi-chi', 'sms-log.jsonl')
const OUTBOX_POLL_MS = 2_000
const HEARTBEAT_INTERVAL_MS = 30_000
const MAX_SENT_FILES = 100
const MAX_SEND_FAILURES = 3
const MAX_CONNECT_RETRIES = 10
const CONNECT_RETRY_DELAY_MS = 5_000

// ── SMS Log (shared with brain-sms.ts) ──────────────────────────

function logSentSms(to: string, body: string): void {
  try {
    const entry = { time: new Date().toISOString(), to, message: body.slice(0, 160), source: 'gateway' }
    appendFileSync(SMS_LOG_FILE, JSON.stringify(entry) + '\n')
  } catch { /* non-critical */ }
}

// ── Ensure directories ────────────────────────────────────────────

function ensureDirs(): void {
  for (const dir of [SMS_DIR, OUTBOX_DIR, INBOX_DIR, SENT_DIR]) {
    mkdirSync(dir, { recursive: true })
  }
}

// ── Heartbeat ─────────────────────────────────────────────────────

function writeHeartbeat(modem: Sim7600): void {
  try {
    const status = modem.getStatus()
    const heartbeat = {
      timestamp: new Date().toISOString(),
      modemStatus: status.connected ? 'connected' : 'disconnected',
      signalStrength: status.signalStrength,
      simReady: status.simReady,
      sendCount: status.sendCount,
      errorCount: status.errorCount,
    }
    writeFileSync(HEARTBEAT_FILE, JSON.stringify(heartbeat))
  } catch {
    // Non-critical
  }
}

// ── Outbox Processing ─────────────────────────────────────────────

interface OutboxMessage {
  id: string
  to: string
  body: string
  createdAt: string
  source: string
  _failures?: number
}

async function processOutbox(modem: Sim7600): Promise<void> {
  let files: string[]
  try {
    files = readdirSync(OUTBOX_DIR)
      .filter(f => f.endsWith('.json'))
      .sort() // Timestamp prefix ensures chronological order
  } catch {
    return
  }

  for (const file of files) {
    const filePath = join(OUTBOX_DIR, file)
    let msg: OutboxMessage

    try {
      msg = JSON.parse(readFileSync(filePath, 'utf-8'))
    } catch {
      console.error(`[sms-gw] Invalid JSON in ${file}, deleting`)
      try { unlinkSync(filePath) } catch { /* */ }
      continue
    }

    try {
      await modem.sendSms(msg.to, msg.body)

      // Move to sent/
      const sentPath = join(SENT_DIR, file)
      try {
        renameSync(filePath, sentPath)
      } catch {
        // If rename fails (cross-device), copy+delete
        writeFileSync(sentPath, readFileSync(filePath))
        unlinkSync(filePath)
      }

      logSentSms(msg.to, msg.body)
      console.log(`[sms-gw] Sent: ${msg.to} — ${msg.body.slice(0, 50)}`)
    } catch (err) {
      const failures = (msg._failures || 0) + 1
      console.error(`[sms-gw] Send failed (${failures}/${MAX_SEND_FAILURES}):`, err instanceof Error ? err.message : err)

      if (failures >= MAX_SEND_FAILURES) {
        console.error(`[sms-gw] Max failures reached for ${file}, deleting`)
        try { unlinkSync(filePath) } catch { /* */ }
      } else {
        // Update failure count in file
        msg._failures = failures
        try { writeFileSync(filePath, JSON.stringify(msg)) } catch { /* */ }
      }
    }
  }
}

// ── Incoming SMS Handler ──────────────────────────────────────────

function handleIncomingSms(sms: ReceivedSms): void {
  const id = randomUUID().slice(0, 8)
  const timestamp = Date.now()
  const filename = `${timestamp}-${id}.json`
  const filePath = join(INBOX_DIR, filename)

  const data = {
    id,
    from: sms.from,
    body: sms.body,
    receivedAt: sms.receivedAt,
  }

  try {
    writeFileSync(filePath, JSON.stringify(data))
    console.log(`[sms-gw] Inbox: ${sms.from} — ${sms.body.slice(0, 50)}`)
  } catch (err) {
    console.error('[sms-gw] Failed to write inbox file:', err instanceof Error ? err.message : err)
  }
}

// ── Sent Directory Cleanup ────────────────────────────────────────

function cleanupSent(): void {
  try {
    const files = readdirSync(SENT_DIR).filter(f => f.endsWith('.json')).sort()
    while (files.length > MAX_SENT_FILES) {
      const old = files.shift()!
      try { unlinkSync(join(SENT_DIR, old)) } catch { /* */ }
    }
  } catch { /* */ }
}

// ── Main ──────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log('[sms-gw] ═══════════════════════════════════════')
  console.log('[sms-gw]  Pi-Chi SMS Gateway (SIM7600)')
  console.log('[sms-gw]  Starting...')
  console.log('[sms-gw] ═══════════════════════════════════════')

  ensureDirs()

  const modem = new Sim7600()

  // Wire up incoming SMS handler
  modem.on('sms-received', (sms: ReceivedSms) => {
    handleIncomingSms(sms)
  })

  modem.on('status-change', () => {
    writeHeartbeat(modem)
  })

  // Connect with retries
  let connected = false
  for (let attempt = 1; attempt <= MAX_CONNECT_RETRIES; attempt++) {
    try {
      console.log(`[sms-gw] Connect attempt ${attempt}/${MAX_CONNECT_RETRIES}...`)
      await modem.connect()
      connected = true
      break
    } catch (err) {
      console.error(`[sms-gw] Attempt ${attempt} failed:`, err instanceof Error ? err.message : err)
      if (attempt < MAX_CONNECT_RETRIES) {
        await new Promise(r => setTimeout(r, CONNECT_RETRY_DELAY_MS))
      }
    }
  }

  if (!connected) {
    console.error('[sms-gw] FATAL: Could not connect to modem after retries')
    writeHeartbeat(modem) // Write disconnected heartbeat
    process.exit(1)
  }

  // Write initial heartbeat
  writeHeartbeat(modem)

  // Heartbeat timer
  const heartbeatTimer = setInterval(() => writeHeartbeat(modem), HEARTBEAT_INTERVAL_MS)

  // Sent cleanup timer (every 5 minutes)
  const cleanupTimer = setInterval(cleanupSent, 5 * 60 * 1000)

  // Outbox polling loop
  let running = true
  const outboxLoop = async () => {
    while (running) {
      try {
        const status = modem.getStatus()
        if (status.connected) {
          await processOutbox(modem)
        }
      } catch (err) {
        console.error('[sms-gw] Outbox loop error:', err instanceof Error ? err.message : err)
      }
      await new Promise(r => setTimeout(r, OUTBOX_POLL_MS))
    }
  }

  const loopPromise = outboxLoop()

  // Graceful shutdown (idempotent — systemd sends SIGTERM to entire cgroup)
  let shuttingDown = false
  const shutdown = async (signal: string) => {
    if (shuttingDown) return
    shuttingDown = true
    console.log(`\n[sms-gw] Received ${signal}. Shutting down...`)
    running = false
    clearInterval(heartbeatTimer)
    clearInterval(cleanupTimer)
    await modem.close()
    writeHeartbeat(modem) // Final disconnected heartbeat
    await loopPromise
    process.exit(0)
  }

  process.on('SIGTERM', () => shutdown('SIGTERM'))
  process.on('SIGINT', () => shutdown('SIGINT'))
}

main().catch(err => {
  console.error('[sms-gw] Fatal error:', err)
  process.exit(1)
})
