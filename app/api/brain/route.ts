/* ─── Brain State API — Dashboard ↔ Brain Bridge ─────────────── */

import { NextResponse } from 'next/server'
import { existsSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { randomUUID } from 'node:crypto'
import { loadBrainState, saveBrainState, addActivity, getStatePath } from '@/lib/brain/brain-state'
import { requireBrainAuth } from '@/lib/brain/brain-auth'
import { readDisplayState } from '@/lib/brain/display-mode'
import { rateLimit } from '@/lib/rate-limit'

const getLimit = rateLimit('brain-get', 60, 60_000)    // 60 req/min
const postLimit = rateLimit('brain-post', 10, 60_000)   // 10 req/min
const HEARTBEAT_FILE = join(homedir(), '.pi-chi', 'heartbeat')

export async function GET(req: Request) {
  // Auth check
  const authErr = requireBrainAuth(req)
  if (authErr) return authErr

  const ip = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || '127.0.0.1'
  const rl = getLimit(ip)
  if (!rl.ok) return NextResponse.json({ error: 'Rate limited' }, { status: 429 })

  try {
    if (!existsSync(getStatePath())) {
      return NextResponse.json({ status: 'not-running', state: null, displayMode: readDisplayState() })
    }

    const state = loadBrainState()

    // Determine if brain is actively running — check heartbeat file (Phase 3.4)
    let isAlive = false
    try {
      if (existsSync(HEARTBEAT_FILE)) {
        const hbMtime = statSync(HEARTBEAT_FILE).mtimeMs
        isAlive = Date.now() - hbMtime < 90_000 // stale if >90s
      }
    } catch { /* fallback to old method */ }
    if (!isAlive) {
      // Fallback: check lastWakeAt
      const lastWake = state.lastWakeAt ? new Date(state.lastWakeAt).getTime() : 0
      const intervalMs = state.wakeIntervalMs || 300000
      isAlive = Date.now() - lastWake < intervalMs * 3
    }

    return NextResponse.json({
      status: isAlive ? 'running' : 'sleeping',
      state,
      displayMode: readDisplayState(),
    })
  } catch (err) {
    return NextResponse.json(
      { status: 'error', error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

export async function POST(req: Request) {
  // Auth check
  const authErr = requireBrainAuth(req)
  if (authErr) return authErr

  const ip = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || '127.0.0.1'
  const rl = postLimit(ip)
  if (!rl.ok) return NextResponse.json({ error: 'Rate limited' }, { status: 429 })

  try {
    if (!existsSync(getStatePath())) {
      return NextResponse.json(
        { error: 'Brain state not found — brain service may not be running' },
        { status: 404 }
      )
    }

    const { type, data } = await req.json()
    const state = loadBrainState()

    if (type === 'inject-goal') {
      state.goals.push({
        id: randomUUID(),
        title: data.title,
        status: 'active',
        priority: data.priority || 'medium',
        horizon: data.horizon || 'medium',
        reasoning: `Injected by owner via dashboard`,
        tasks: (data.tasks || []).map((t: string) => ({
          id: randomUUID(),
          title: t,
          status: 'pending',
        })),
        createdAt: new Date().toISOString(),
      })
      addActivity(state, 'system', `Owner injected goal: ${data.title}`)
      saveBrainState(state)
      return NextResponse.json({ ok: true, action: 'goal-injected' })
    }

    if (type === 'inject-message') {
      // Write to both activityLog (for brain context) and chatMessages (for chat UI)
      addActivity(state, 'system', `Owner: ${data.message}`)
      if (!state.chatMessages) state.chatMessages = []
      state.chatMessages.push({
        id: randomUUID(),
        from: 'owner',
        message: data.message,
        timestamp: new Date().toISOString(),
        read: false,
      })
      // Lower brain's loneliness when owner communicates
      if (state.mood) {
        state.mood.loneliness = Math.max(0, (state.mood.loneliness || 50) - 20)
      }
      saveBrainState(state)
      return NextResponse.json({ ok: true, action: 'message-injected' })
    }

    if (type === 'mark-chat-read') {
      // Mark brain's messages as read by owner
      if (state.chatMessages) {
        for (const msg of state.chatMessages) {
          if (msg.from === 'brain' && !msg.read) {
            msg.read = true
          }
        }
        saveBrainState(state)
      }
      return NextResponse.json({ ok: true, action: 'chat-marked-read' })
    }

    if (type === 'update-setting') {
      if (data.wakeIntervalMs !== undefined) {
        const interval = Math.max(60000, Math.min(3600000, Number(data.wakeIntervalMs)))
        state.wakeIntervalMs = interval
        addActivity(state, 'system', `Owner changed wake interval to ${interval / 60000}m`)
      }
      saveBrainState(state)
      return NextResponse.json({ ok: true, action: 'setting-updated' })
    }

    if (type === 'update-goal') {
      const goal = state.goals.find((g: { id: string }) => g.id === data.goalId)
      if (!goal) return NextResponse.json({ error: 'Goal not found' }, { status: 404 })
      if (data.title !== undefined) goal.title = data.title
      if (data.priority !== undefined) goal.priority = data.priority
      if (data.status !== undefined) goal.status = data.status
      addActivity(state, 'system', `Owner updated goal: ${goal.title}`)
      saveBrainState(state)
      return NextResponse.json({ ok: true, action: 'goal-updated' })
    }

    if (type === 'delete-goal') {
      const idx = state.goals.findIndex((g: { id: string }) => g.id === data.goalId)
      if (idx === -1) return NextResponse.json({ error: 'Goal not found' }, { status: 404 })
      const removed = state.goals.splice(idx, 1)
      addActivity(state, 'system', `Owner deleted goal: ${removed[0].title}`)
      saveBrainState(state)
      return NextResponse.json({ ok: true, action: 'goal-deleted' })
    }

    return NextResponse.json({ error: `Unknown type: ${type}` }, { status: 400 })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
