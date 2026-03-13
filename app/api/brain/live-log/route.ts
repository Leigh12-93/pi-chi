/* ─── Claude Code Live Log — Stream Pi-Chi's build output ────── */

import { NextResponse } from 'next/server'
import { readFileSync, existsSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'

const LOG_FILE = join(homedir(), '.pi-chi', 'claude-code-live.log')
const MAX_BYTES = 50_000 // Return last 50KB max

export async function GET(req: Request) {
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
