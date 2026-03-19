#!/usr/bin/env tsx
/* ═══════════════════════════════════════════════════════════════════
 * SMS HTTP API — Accepts POST /send with Bearer token auth
 * Writes messages to the sms-gateway outbox for delivery via SIM7600.
 *
 * Run: npx tsx scripts/sms-http-api.ts
 * Service: pi-chi-sms-api.service
 * Port: 3002 (default, or SMS_API_PORT env var)
 *
 * POST /send
 *   Headers: Authorization: Bearer <API_KEY>
 *   Body: { "to": "+61412345678", "message": "Hello" }
 *   Returns: { "ok": true, "id": "<uuid>" }
 * ═══════════════════════════════════════════════════════════════════ */

import { createServer, IncomingMessage, ServerResponse } from 'node:http'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { randomUUID } from 'node:crypto'

const PORT = parseInt(process.env.SMS_API_PORT || '3002', 10)
const API_KEY = process.env.SMS_API_KEY?.trim()

if (!API_KEY) {
  console.error('FATAL: SMS_API_KEY environment variable is required')
  process.exit(1)
}

const OUTBOX_DIR = join(homedir(), '.pi-chi', 'sms', 'outbox')
mkdirSync(OUTBOX_DIR, { recursive: true })

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (c: Buffer) => chunks.push(c))
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')))
    req.on('error', reject)
  })
}

function json(res: ServerResponse, status: number, data: Record<string, unknown>) {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  })
  res.end(JSON.stringify(data))
}

const server = createServer(async (req, res) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    json(res, 204, {})
    return
  }

  // Health check
  if (req.method === 'GET' && req.url === '/health') {
    json(res, 200, { ok: true, service: 'sms-http-api' })
    return
  }

  // Only POST /send
  if (req.method !== 'POST' || req.url !== '/send') {
    json(res, 404, { ok: false, error: 'Not found. Use POST /send' })
    return
  }

  // Auth check
  const auth = req.headers.authorization
  if (!auth || auth !== `Bearer ${API_KEY}`) {
    json(res, 401, { ok: false, error: 'Unauthorized' })
    return
  }

  try {
    const raw = await readBody(req)
    const body = JSON.parse(raw) as { to?: string; message?: string }

    if (!body.to || !body.message) {
      json(res, 400, { ok: false, error: '"to" and "message" are required' })
      return
    }

    // Normalize phone number
    const to = body.to.replace(/[\s\-()]/g, '')
    if (!/^\+?\d{8,15}$/.test(to)) {
      json(res, 400, { ok: false, error: 'Invalid phone number format' })
      return
    }

    const id = randomUUID()
    const smsPayload = {
      id,
      to,
      body: body.message.slice(0, 1600), // cap at ~10 SMS segments
      createdAt: new Date().toISOString(),
      source: 'http-api',
    }

    writeFileSync(join(OUTBOX_DIR, `${id}.json`), JSON.stringify(smsPayload, null, 2))

    console.log(`[SMS-API] Queued SMS to ${to} (${id})`)
    json(res, 200, { ok: true, id })
  } catch (err) {
    console.error('[SMS-API] Error:', err)
    json(res, 500, { ok: false, error: 'Internal server error' })
  }
})

server.listen(PORT, '0.0.0.0', () => {
  console.log(`[SMS-API] Listening on http://0.0.0.0:${PORT}`)
  console.log(`[SMS-API] Outbox: ${OUTBOX_DIR}`)
})
