/* ─── Brain State API — Dashboard ↔ Brain Bridge ─────────────── */

import { NextResponse } from 'next/server'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { randomUUID } from 'node:crypto'

const STATE_FILE = join(homedir(), '.pi-chi', 'brain-state.json')

export async function GET() {
  try {
    if (!existsSync(STATE_FILE)) {
      return NextResponse.json({ status: 'not-running', state: null })
    }

    const raw = readFileSync(STATE_FILE, 'utf-8')
    const state = JSON.parse(raw)

    // Determine if brain is actively running
    const lastWake = state.lastWakeAt ? new Date(state.lastWakeAt).getTime() : 0
    const intervalMs = state.wakeIntervalMs || 300000
    const isAlive = Date.now() - lastWake < intervalMs * 3 // Consider alive if woke within 3x the interval

    return NextResponse.json({
      status: isAlive ? 'running' : 'sleeping',
      state,
    })
  } catch (err) {
    return NextResponse.json(
      { status: 'error', error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

export async function POST(req: Request) {
  try {
    if (!existsSync(STATE_FILE)) {
      return NextResponse.json(
        { error: 'Brain state not found — brain service may not be running' },
        { status: 404 }
      )
    }

    const { type, data } = await req.json()
    const raw = readFileSync(STATE_FILE, 'utf-8')
    const state = JSON.parse(raw)

    if (type === 'inject-goal') {
      state.goals.push({
        id: randomUUID(),
        title: data.title,
        status: 'active',
        priority: data.priority || 'medium',
        reasoning: `Injected by owner via dashboard`,
        tasks: (data.tasks || []).map((t: string) => ({
          id: randomUUID(),
          title: t,
          status: 'pending',
        })),
        createdAt: new Date().toISOString(),
      })
      state.activityLog.push({
        id: randomUUID(),
        time: new Date().toISOString(),
        type: 'system',
        message: `Owner injected goal: ${data.title}`,
      })
      writeFileSync(STATE_FILE, JSON.stringify(state, null, 2))
      return NextResponse.json({ ok: true, action: 'goal-injected' })
    }

    if (type === 'inject-message') {
      state.activityLog.push({
        id: randomUUID(),
        time: new Date().toISOString(),
        type: 'system',
        message: `Owner: ${data.message}`,
      })
      writeFileSync(STATE_FILE, JSON.stringify(state, null, 2))
      return NextResponse.json({ ok: true, action: 'message-injected' })
    }

    return NextResponse.json({ error: `Unknown type: ${type}` }, { status: 400 })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
