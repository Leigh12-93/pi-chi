import { existsSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { NextResponse } from 'next/server'
import { loadBrainState, getStatePath } from '@/lib/brain/brain-state'
import { requireBrainAuth } from '@/lib/brain/brain-auth'
import { getDisplayStatePath, readDisplayState } from '@/lib/brain/display-mode'
import { rateLimit } from '@/lib/rate-limit'

const streamLimit = rateLimit('brain-stream', 12, 60_000)
const HEARTBEAT_FILE = join(homedir(), '.pi-chi', 'heartbeat')
const STREAM_POLL_MS = 2_500
const HEARTBEAT_MS = 15_000

function getBrainStatus(): 'running' | 'sleeping' | 'not-running' {
  if (!existsSync(getStatePath())) return 'not-running'

  const state = loadBrainState()
  let isAlive = false
  try {
    if (existsSync(HEARTBEAT_FILE)) {
      const hbMtime = statSync(HEARTBEAT_FILE).mtimeMs
      isAlive = Date.now() - hbMtime < 90_000
    }
  } catch { /* ignore */ }

  if (!isAlive) {
    const lastWake = state.lastWakeAt ? new Date(state.lastWakeAt).getTime() : 0
    const intervalMs = state.wakeIntervalMs || 300000
    isAlive = Date.now() - lastWake < intervalMs * 3
  }

  return isAlive ? 'running' : 'sleeping'
}

function getSignature(status: string): string {
  const stateMtime = existsSync(getStatePath()) ? statSync(getStatePath()).mtimeMs : 0
  const heartbeatMtime = existsSync(HEARTBEAT_FILE) ? statSync(HEARTBEAT_FILE).mtimeMs : 0
  const displayMtime = existsSync(getDisplayStatePath()) ? statSync(getDisplayStatePath()).mtimeMs : 0
  return `${status}:${stateMtime}:${heartbeatMtime}:${displayMtime}`
}

function buildPayload() {
  if (!existsSync(getStatePath())) {
    return { status: 'not-running' as const, state: null }
  }

  return {
    status: getBrainStatus(),
    state: loadBrainState(),
    displayMode: readDisplayState(),
  }
}

function buildDeltaPayload() {
  if (!existsSync(getStatePath())) {
    return { status: 'not-running' as const, hasState: false }
  }

  const state = loadBrainState()
  const latestActivity = state.activityLog.at(-1) ?? null
  const latestChat = state.chatMessages.at(-1) ?? null

  return {
    status: getBrainStatus(),
    hasState: true,
    counts: {
      activity: state.activityLog.length,
      chat: state.chatMessages.length,
      goals: state.goals.length,
    },
    goals: state.goals.map(goal => ({
      id: goal.id,
      title: goal.title,
      status: goal.status,
      priority: goal.priority,
      reasoning: goal.reasoning,
      tasks: (goal.tasks || []).map(task => ({
        id: task.id,
        title: task.title,
        status: task.status,
        result: task.result,
      })),
      createdAt: goal.createdAt,
    })),
    mood: state.mood ?? null,
    latestActivity: latestActivity ? {
      id: latestActivity.id,
      time: latestActivity.time,
      type: latestActivity.type,
      message: latestActivity.message,
    } : null,
    latestChat: latestChat ? {
      id: latestChat.id,
      from: latestChat.from,
      message: latestChat.message,
      timestamp: latestChat.timestamp,
      read: latestChat.read,
      clientMessageId: latestChat.clientMessageId,
    } : null,
    currentMission: state.currentMission ?? null,
    currentCycle: state.currentCycle ?? null,
    recentCycles: (state.workCycles || []).slice(-6),
    opportunities: state.opportunities || [],
    stretchGoals: state.stretchGoals || [],
    displayMode: readDisplayState(),
    meta: {
      totalThoughts: state.totalThoughts,
      totalApiCost: state.totalApiCost,
      totalToolCalls: state.totalToolCalls,
      wakeIntervalMs: state.wakeIntervalMs,
      lastThought: state.lastThought,
      name: state.name,
      birthTimestamp: state.birthTimestamp,
      dreamCount: state.dreamCount,
      consecutiveCrashes: state.consecutiveCrashes,
      lastWakeAt: state.lastWakeAt,
      smsCount: state.smsCount,
      smsTodayCount: state.smsTodayCount,
      lastSmsAt: state.lastSmsAt,
      personalityTraits: state.personalityTraits,
      lastDreamAt: state.lastDreamAt,
      lastSelfEditAt: state.lastSelfEditAt,
    },
  }
}

function formatSse(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
}

export async function GET(req: Request) {
  const authErr = requireBrainAuth(req)
  if (authErr) return authErr

  const ip = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || '127.0.0.1'
  const rl = streamLimit(ip)
  if (!rl.ok) return NextResponse.json({ error: 'Rate limited' }, { status: 429 })

  const encoder = new TextEncoder()

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false
      let lastHeartbeatAt = Date.now()
      let lastSignature = ''
      let lastDeltaSignature = ''

      const sendSnapshot = () => {
        const payload = buildPayload()
        lastSignature = getSignature(payload.status)
        controller.enqueue(encoder.encode(formatSse('brain-state', payload)))
        const deltaPayload = buildDeltaPayload()
        lastDeltaSignature = JSON.stringify(deltaPayload)
      }

      const sendDelta = () => {
        const payload = buildDeltaPayload()
        const nextDeltaSignature = JSON.stringify(payload)
        if (nextDeltaSignature === lastDeltaSignature) return
        lastDeltaSignature = nextDeltaSignature
        controller.enqueue(encoder.encode(formatSse('brain-delta', payload)))
      }

      const tick = () => {
        if (closed) return
        try {
          const status = getBrainStatus()
          const nextSignature = getSignature(status)
          if (nextSignature !== lastSignature) {
            lastSignature = nextSignature
            sendDelta()
            return
          }

          if (Date.now() - lastHeartbeatAt >= HEARTBEAT_MS) {
            lastHeartbeatAt = Date.now()
            controller.enqueue(encoder.encode(`: keepalive ${Date.now()}\n\n`))
          }
        } catch (error) {
          if (!closed) {
            try {
              controller.enqueue(encoder.encode(formatSse('brain-error', {
                error: error instanceof Error ? error.message : 'Stream failure',
              })))
            } catch {
              // Stream already closed — stop ticking
              closed = true
            }
          }
        }
      }

      sendSnapshot()
      const intervalId = setInterval(tick, STREAM_POLL_MS)

      req.signal.addEventListener('abort', () => {
        closed = true
        clearInterval(intervalId)
        controller.close()
      })
    },
    cancel() {
      // noop; abort handler above owns cleanup
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  })
}
