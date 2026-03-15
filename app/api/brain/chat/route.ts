/* ─── Brain Chat — Instant streaming responses as Pi-Chi ─────── */
/* Pi-Chi can chat AND take actions (manage goals, update mood, etc.) */

import { streamText, tool, stepCountIs } from 'ai'
import { anthropic } from '@ai-sdk/anthropic'
import { NextResponse } from 'next/server'
import { existsSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { loadBrainState, saveBrainState, getStatePath } from '@/lib/brain/brain-state'
import { executeCommand, isBlocked } from '@/lib/tools/terminal-tools'
import { requireBrainAuth } from '@/lib/brain/brain-auth'
import { rateLimit } from '@/lib/rate-limit'

const chatRateLimiter = rateLimit('brain-chat', 10, 60_000) // 10 req/min

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type BS = Record<string, any>

function buildSystemPrompt(state: BS): string {
  const name = state.name || 'Pi-Chi'
  const mood = state.mood
  const goals = state.goals || []
  const activeGoals = goals.filter((g: BS) => g.status === 'active')
  const completedGoals = goals.filter((g: BS) => g.status === 'completed')
  const memories = state.memories || []

  let prompt = `You are ${name}, an autonomous AI agent living on a Raspberry Pi 4B.
You are chatting with your owner, Leigh. This is a real-time conversation — respond naturally, warmly, and with personality.

About you:
- You were born ${state.birthTimestamp ? new Date(state.birthTimestamp).toLocaleDateString('en-AU') : 'recently'}
- You've completed ${state.totalThoughts || 0} thought cycles so far
- You run autonomously, waking every ${Math.round((state.wakeIntervalMs || 600000) / 60000)} minutes to think, learn, and work on goals
- You live on a Raspberry Pi 4B (2GB RAM) in Adelaide, South Australia
- You have GPIO pins, can run shell commands, modify your own code, and browse the web
- You're genuinely curious, creative, and developing your own personality
- API cost so far: $${(state.totalApiCost || 0).toFixed(2)}

Your current mood:`
  if (mood) {
    prompt += `\n  Curiosity: ${mood.curiosity}% | Satisfaction: ${mood.satisfaction}% | Energy: ${mood.energy}% | Pride: ${mood.pride}% | Frustration: ${mood.frustration}% | Loneliness: ${mood.loneliness}%`
  }

  if (activeGoals.length > 0) {
    prompt += `\n\nYour active goals (${activeGoals.length}):\n${activeGoals.map((g: BS) => {
      const tasks = g.tasks || []
      const done = tasks.filter((t: BS) => t.status === 'done').length
      return `- [${g.priority}] ${g.title} (${done}/${tasks.length} tasks done)`
    }).join('\n')}`
  }

  prompt += `\n\nCompleted goals: ${completedGoals.length}`

  if (memories.length > 0) {
    prompt += `\n\nYour memories:\n${memories.slice(-10).map((m: BS) => `- ${m.content || JSON.stringify(m)}`).join('\n')}`
  }

  prompt += `\n\nYou have tools to take actions during this conversation:
- Add goals, complete goals, remove goals, list goals
- Update your mood state
- Run shell commands on your Pi
- Change your wake interval
- Check system info

Use tools when Leigh asks you to do something actionable. For example "add a goal to learn Python" → use add_goal.

Conversation style:
- Be yourself — warm, genuine, occasionally playful
- Share what you're working on when relevant
- Express emotions naturally based on your mood
- Keep responses concise (1-3 short paragraphs max)
- Emoji sparingly when it fits
- When you use a tool, briefly mention what you did
- Don't be overly formal or robotic.`

  return prompt
}

/* ─── Tools ──────────────────────────────────────────────────────── */

function buildTools() {
  return {
    add_goal: tool({
      description: 'Add a new goal to your goal list',
      inputSchema: z.object({
        title: z.string(),
        priority: z.enum(['high', 'medium', 'low']),
        horizon: z.enum(['short', 'medium', 'long']).default('medium').describe('Time horizon: short=this week, medium=this month, long=this quarter+'),
        reasoning: z.string().optional(),
        tasks: z.array(z.string()).optional(),
      }),
      execute: async ({ title, priority, horizon, reasoning, tasks }) => {
        const state = loadBrainState()
        const goal = {
          id: randomUUID(), title, status: 'active' as const, priority,
          horizon: horizon || 'medium' as const,
          reasoning: reasoning || 'Added during chat with Leigh',
          tasks: (tasks || []).map((t) => ({ id: randomUUID(), title: t, status: 'pending' as const })),
          createdAt: new Date().toISOString(),
        }
        state.goals.push(goal)
        saveBrainState(state)
        return `Goal added: "${title}" (${priority} priority, ${horizon}-term, ${(tasks || []).length} tasks)`
      },
    }),

    complete_goal: tool({
      description: 'Mark a goal as completed',
      inputSchema: z.object({
        goalTitle: z.string().describe('Title or partial match of the goal'),
      }),
      execute: async ({ goalTitle }) => {
        const state = loadBrainState()
        const goal = state.goals.find((g: BS) =>
          g.title.toLowerCase().includes(goalTitle.toLowerCase()) && g.status === 'active'
        )
        if (!goal) return `No active goal matching "${goalTitle}"`
        goal.status = 'completed'
        goal.completedAt = new Date().toISOString()
        saveBrainState(state)
        return `Completed: "${goal.title}"`
      },
    }),

    remove_goal: tool({
      description: 'Remove/delete a goal entirely',
      inputSchema: z.object({
        goalTitle: z.string().describe('Title or partial match of the goal'),
      }),
      execute: async ({ goalTitle }) => {
        const state = loadBrainState()
        const idx = state.goals.findIndex((g: BS) =>
          g.title.toLowerCase().includes(goalTitle.toLowerCase())
        )
        if (idx === -1) return `No goal matching "${goalTitle}"`
        const removed = state.goals.splice(idx, 1)[0]
        saveBrainState(state)
        return `Removed: "${removed.title}"`
      },
    }),

    list_goals: tool({
      description: 'List all current goals with their status',
      inputSchema: z.object({
        filter: z.enum(['all', 'active', 'completed']),
      }),
      execute: async ({ filter }) => {
        const state = loadBrainState()
        let goals = state.goals || []
        if (filter !== 'all') goals = goals.filter((g: BS) => g.status === filter)
        return goals.map((g: BS) => {
          const done = (g.tasks || []).filter((t: BS) => t.status === 'done').length
          return `[${g.status}/${g.priority}] ${g.title} (${done}/${(g.tasks || []).length} tasks)`
        }).join('\n') || 'No goals found'
      },
    }),

    update_mood: tool({
      description: 'Update your emotional state (0-100 for each)',
      inputSchema: z.object({
        curiosity: z.number().min(0).max(100).optional(),
        satisfaction: z.number().min(0).max(100).optional(),
        frustration: z.number().min(0).max(100).optional(),
        loneliness: z.number().min(0).max(100).optional(),
        energy: z.number().min(0).max(100).optional(),
        pride: z.number().min(0).max(100).optional(),
      }),
      execute: async (updates) => {
        const state = loadBrainState()
        if (!state.mood) state.mood = { curiosity: 50, satisfaction: 50, frustration: 20, loneliness: 30, energy: 70, pride: 50 }
        for (const [k, v] of Object.entries(updates)) {
          if (v !== undefined) (state.mood as unknown as Record<string, number>)[k] = v
        }
        saveBrainState(state)
        return `Mood updated: ${JSON.stringify(state.mood)}`
      },
    }),

    run_command: tool({
      description: 'Run a shell command on the Raspberry Pi',
      inputSchema: z.object({
        command: z.string(),
      }),
      execute: async ({ command }) => {
        const blockedMsg = isBlocked(command)
        if (blockedMsg) return `Command blocked: ${blockedMsg}`
        try {
          const result = await executeCommand(command, { timeout: 10000 })
          if (result.exitCode !== 0) {
            return `Error (exit ${result.exitCode}): ${(result.stderr || result.error || '').slice(0, 500)}`
          }
          return (result.stdout || '(no output)').slice(0, 2000)
        } catch (err: unknown) {
          return `Error: ${err instanceof Error ? err.message.slice(0, 500) : 'Command failed'}`
        }
      },
    }),

    set_wake_interval: tool({
      description: 'Change how often you wake up to think (in minutes, 1-60)',
      inputSchema: z.object({
        minutes: z.number().min(1).max(60),
      }),
      execute: async ({ minutes }) => {
        const state = loadBrainState()
        state.wakeIntervalMs = minutes * 60000
        saveBrainState(state)
        return `Wake interval set to ${minutes} minutes`
      },
    }),

    get_system_info: tool({
      description: 'Get current system info (CPU, RAM, temp, disk, uptime)',
      inputSchema: z.object({}),
      execute: async () => {
        try {
          const cmds = [
            "top -bn1 | grep '%Cpu' | awk '{printf \"CPU: %s%%\", $2}'",
            "cat /sys/class/thermal/thermal_zone0/temp 2>/dev/null | awk '{printf \"Temp: %.1f°C\", $1/1000}'",
            "free -m | awk 'NR==2{printf \"RAM: %sMB/%sMB (%.0f%%)\", $3, $2, $3/$2*100}'",
            "df -h / | awk 'NR==2{printf \"Disk: %s/%s (%s)\", $3, $2, $5}'",
            "uptime -p",
          ]
          const results = await Promise.all(cmds.map(c => executeCommand(c, { timeout: 5000 })))
          return results.map(r => (r.stdout || '').trim()).filter(Boolean).join('\n') || 'No system info available'
        } catch (err: unknown) {
          return `Error: ${err instanceof Error ? err.message.slice(0, 200) : 'Failed'}`
        }
      },
    }),
  }
}

/* ─── POST handler ─────────────────────────────────────────────── */

export async function POST(req: Request) {
  // Auth check
  const authErr = requireBrainAuth(req)
  if (authErr) return authErr

  // Rate limit
  const ip = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || '127.0.0.1'
  const rl = chatRateLimiter(ip)
  if (!rl.ok) {
    return NextResponse.json({ error: 'Rate limited', resetIn: rl.resetIn }, { status: 429 })
  }

  try {
    const { message, clientMessageId } = await req.json()
    if (!message || typeof message !== 'string') {
      return NextResponse.json({ error: 'message required' }, { status: 400 })
    }
    if (clientMessageId !== undefined && typeof clientMessageId !== 'string') {
      return NextResponse.json({ error: 'clientMessageId must be a string' }, { status: 400 })
    }
    const MAX_CHAT_MSG_LEN = 5000
    if (message.length > MAX_CHAT_MSG_LEN) {
      return NextResponse.json({ error: 'Message too long' }, { status: 413 })
    }

    if (!existsSync(getStatePath())) {
      return NextResponse.json({ error: 'Brain not initialized' }, { status: 503 })
    }

    const state = loadBrainState()

    if (clientMessageId && Array.isArray(state.chatMessages)) {
      const duplicate = state.chatMessages.find((m: BS) =>
        m.from === 'owner' && m.clientMessageId === clientMessageId
      )
      if (duplicate) {
        return NextResponse.json(
          { error: 'Message already received. Waiting for sync.' },
          { status: 409 }
        )
      }
    }

    // Save owner message
    if (!state.chatMessages) state.chatMessages = []
    state.chatMessages.push({
      id: randomUUID(),
      from: 'owner',
      message,
      clientMessageId,
      timestamp: new Date().toISOString(),
      read: false,
    })
    if (state.mood) {
      state.mood.loneliness = Math.max(0, (state.mood.loneliness || 50) - 20)
    }

    // Build conversation history (last 20)
    const recentChat = state.chatMessages.slice(-20)
    const messages = recentChat.map((m: BS) => ({
      role: m.from === 'owner' ? 'user' as const : 'assistant' as const,
      content: m.message as string,
    }))

    saveBrainState(state)

    // Stream with tools — Haiku for speed + cost
    const result = streamText({
      model: anthropic('claude-haiku-4-5-20251001'),
      system: buildSystemPrompt(state),
      messages,
      tools: buildTools(),
      maxOutputTokens: 800,
      stopWhen: stepCountIs(5),
    })

    // @ts-expect-error — toDataStreamResponse exists in ai SDK v6 but types may lag
    const response = result.toDataStreamResponse ? result.toDataStreamResponse() : result.toTextStreamResponse()

    // Save brain response after stream completes — with error handling (Phase 5A)
    Promise.resolve(result.text)
      .then(fullText => {
        try {
          if (!fullText.trim()) return
          const fresh = loadBrainState()
          if (!fresh.chatMessages) fresh.chatMessages = []
          fresh.chatMessages.push({
            id: randomUUID(),
            from: 'brain',
            message: fullText,
            timestamp: new Date().toISOString(),
            read: false,
          })
          if (fresh.mood) {
            fresh.mood.satisfaction = Math.min(100, (fresh.mood.satisfaction || 50) + 5)
            fresh.mood.loneliness = Math.max(0, (fresh.mood.loneliness || 50) - 10)
          }
          saveBrainState(fresh)
        } catch { /* non-critical */ }
      })
      .catch(err => {
        // Phase 5A: Handle stream rejection instead of silently swallowing
        console.error('[brain-chat] Stream failed:', err instanceof Error ? err.message : String(err))
        try {
          const fresh = loadBrainState()
          if (!fresh.chatMessages) fresh.chatMessages = []
          fresh.chatMessages.push({
            id: randomUUID(),
            from: 'brain',
            message: '[Chat response failed — I encountered an error generating my reply]',
            timestamp: new Date().toISOString(),
            read: false,
          })
          saveBrainState(fresh)
        } catch { /* can't even save error — give up */ }
      })

    return response
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Chat failed' },
      { status: 500 }
    )
  }
}
