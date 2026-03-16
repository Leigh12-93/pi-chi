/* ─── SMS Log API ─────────────────────────────────────────── */

import { NextResponse } from 'next/server'
import { readdir, readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'

export const dynamic = 'force-dynamic'

const SMS_DIR = join(homedir(), '.pi-chi', 'sms')
const INBOX_DIR = join(SMS_DIR, 'inbox')
const SENT_DIR = join(SMS_DIR, 'sent')
const HEARTBEAT_FILE = join(homedir(), '.pi-chi', 'sms-heartbeat')

interface NormalizedSMS {
  id: string
  direction: 'in' | 'out'
  number: string
  body: string
  timestamp: string
  source?: string
}

async function readJsonFiles(dir: string): Promise<Record<string, unknown>[]> {
  if (!existsSync(dir)) return []
  const files = await readdir(dir)
  const jsonFiles = files.filter(f => f.endsWith('.json'))
  const results: Record<string, unknown>[] = []
  for (const file of jsonFiles) {
    try {
      const raw = await readFile(join(dir, file), 'utf-8')
      results.push(JSON.parse(raw))
    } catch {
      // skip malformed files
    }
  }
  return results
}

export async function GET() {
  try {
    const [inboxRaw, sentRaw] = await Promise.all([
      readJsonFiles(INBOX_DIR),
      readJsonFiles(SENT_DIR),
    ])

    const messages: NormalizedSMS[] = []

    for (const msg of inboxRaw) {
      messages.push({
        id: (msg.id as string) || crypto.randomUUID(),
        direction: 'in',
        number: (msg.from as string) || 'unknown',
        body: (msg.body as string) || '',
        timestamp: (msg.receivedAt as string) || new Date().toISOString(),
        source: (msg.source as string) || undefined,
      })
    }

    for (const msg of sentRaw) {
      messages.push({
        id: (msg.id as string) || crypto.randomUUID(),
        direction: 'out',
        number: (msg.to as string) || 'unknown',
        body: (msg.body as string) || '',
        timestamp: (msg.createdAt as string) || new Date().toISOString(),
        source: (msg.source as string) || undefined,
      })
    }

    // Sort newest first
    messages.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())

    // Read modem heartbeat
    let modem: Record<string, unknown> | null = null
    try {
      if (existsSync(HEARTBEAT_FILE)) {
        const raw = await readFile(HEARTBEAT_FILE, 'utf-8')
        modem = JSON.parse(raw)
      }
    } catch {
      // ignore
    }

    return NextResponse.json({ messages, modem }, {
      headers: { 'Cache-Control': 'no-store' },
    })
  } catch (err) {
    return NextResponse.json(
      { error: 'Failed to load SMS log', detail: String(err) },
      { status: 500, headers: { 'Cache-Control': 'no-store' } },
    )
  }
}
