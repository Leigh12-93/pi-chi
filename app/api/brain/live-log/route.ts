/* ─── Claude Code Live Log — Stream Pi-Chi's build output ────── */

import { NextResponse } from 'next/server'
import { readFileSync, existsSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { requireBrainAuth } from '@/lib/brain/brain-auth'
import { rateLimit } from '@/lib/rate-limit'

const LOG_FILE = join(homedir(), '.pi-chi', 'claude-code-live.log')
const MAX_BYTES = 50_000 // Return last 50KB max

const logLimit = rateLimit('brain-live-log', 30, 60_000) // 30 req/min

export async function GET(req: Request) {
  // Auth check
  const authErr = requireBrainAuth(req)
  if (authErr) return authErr

  const ip = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || '127.0.0.1'
  const rl = logLimit(ip)
  if (!rl.ok) return NextResponse.json({ error: 'Rate limited' }, { status: 429 })

  try {
    if (!existsSync(LOG_FILE)) {
      return NextResponse.json({ active: false, content: '', size: 0 })
    }

    const stat = statSync(LOG_FILE)
    const url = new URL(req.url)
    const sinceSize = parseInt(url.searchParams.get('since') || '0', 10)

    // If file hasn't grown since last check, return empty
    if (stat.size <= sinceSize) {
      return NextResponse.json({ active: true, content: '', size: stat.size, unchanged: true })
    }

    const raw = readFileSync(LOG_FILE, 'utf-8')
    const content = raw.length > MAX_BYTES ? raw.slice(-MAX_BYTES) : raw

    // Check if Claude Code is still running
    const isActive = !content.includes('=== Claude Code finished')

    return NextResponse.json({
      active: isActive,
      content,
      size: stat.size,
    })
  } catch (err) {
    return NextResponse.json(
      { active: false, content: '', error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
