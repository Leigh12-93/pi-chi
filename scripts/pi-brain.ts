#!/usr/bin/env tsx
/* ═══════════════════════════════════════════════════════════════════
 * Pi-Chi Autonomous Brain
 *
 * A standalone Node.js process that runs continuously on the Pi.
 * Wakes on intervals, gathers context, calls Claude API, executes
 * tools, records everything, and grows.
 *
 * Features:
 *   - Self-modification with crash rollback (3-strike rule)
 *   - Dream cycles for memory consolidation (daily, via Haiku)
 *   - Custom tool auto-loading from ~/.pi-chi/tools/
 *   - Research threads for multi-cycle investigations
 *   - Emotional state that persists across cycles
 *
 * Run: npx tsx scripts/pi-brain.ts
 * Or:  npm run brain
 * ═══════════════════════════════════════════════════════════════════ */

import { generateText, stepCountIs } from 'ai'
import { anthropic } from '@ai-sdk/anthropic'
import { loadBrainState, saveBrainState, addActivity } from '../lib/brain/brain-state'
import { buildBrainPrompt, buildContextMessage } from '../lib/brain/brain-prompt'
import { createBrainTools, loadCustomTools } from '../lib/brain/brain-tools'
import { executeCommand } from '../lib/tools/terminal-tools'
import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import type { SystemVitalsSnapshot, BrainState } from '../lib/brain/brain-types'

// ── Constants ─────────────────────────────────────────────────────

const MIN_WAKE_MS = 60 * 1000        // 1 minute
const MAX_WAKE_MS = 60 * 60 * 1000   // 1 hour
const DEFAULT_WAKE_MS = 5 * 60 * 1000 // 5 minutes

// Cost per 1M tokens (Sonnet 4)
const INPUT_COST_PER_M = 3
const OUTPUT_COST_PER_M = 15
const DAILY_BUDGET = parseFloat(process.env.BRAIN_DAILY_BUDGET || '10')

const MAX_CONSECUTIVE_CRASHES = 3
const DREAM_INTERVAL_HOURS = 24
const PI_CHI_DIR = join(process.env.HOME || '/home/pi', 'pi-chi')

// ── Vitals ────────────────────────────────────────────────────────

async function gatherVitals(): Promise<SystemVitalsSnapshot | null> {
  try {
    // Single command that gathers all vitals as JSON
    const cmd = `echo "{\
\\"cpu\\": $(top -bn1 | grep 'Cpu(s)' | awk '{printf \\"%.0f\\", $2}'),\
\\"ramUsed\\": $(free -m | awk '/Mem:/ {print $3}'),\
\\"ramTotal\\": $(free -m | awk '/Mem:/ {print $2}'),\
\\"temp\\": $(cat /sys/class/thermal/thermal_zone0/temp 2>/dev/null | awk '{printf \\"%.0f\\", $1/1000}' || echo 0),\
\\"diskUsed\\": $(df -BG / | awk 'NR==2 {gsub(/G/,\\"\\",$3); print $3}'),\
\\"diskTotal\\": $(df -BG / | awk 'NR==2 {gsub(/G/,\\"\\",$2); print $2}'),\
\\"uptime\\": $(cat /proc/uptime | awk '{printf \\"%.0f\\", $1}'),\
\\"ip\\": \\"$(hostname -I | awk '{print $1}')\\"}"`

    const result = await executeCommand(cmd, { timeout: 10000 })
    if (result.exitCode === 0 && result.stdout) {
      const data = JSON.parse(result.stdout.trim())
      return {
        cpuPercent: data.cpu || 0,
        ramUsedMb: data.ramUsed || 0,
        ramTotalMb: data.ramTotal || 2048,
        tempCelsius: data.temp || 0,
        diskUsedGb: data.diskUsed || 0,
        diskTotalGb: data.diskTotal || 32,
        uptimeSeconds: data.uptime || 0,
        localIp: data.ip || 'unknown',
        timestamp: new Date().toISOString(),
      }
    }
  } catch {
    // On non-Linux (Windows dev), return mock data
  }

  return {
    cpuPercent: 0,
    ramUsedMb: 0,
    ramTotalMb: 2048,
    tempCelsius: 0,
    diskUsedGb: 0,
    diskTotalGb: 32,
    uptimeSeconds: 0,
    localIp: 'dev-mode',
    timestamp: new Date().toISOString(),
  }
}

// ── Cost tracking ─────────────────────────────────────────────────

function trackCost(state: BrainState, inputTokens: number, outputTokens: number): void {
  const cost = (inputTokens / 1_000_000) * INPUT_COST_PER_M + (outputTokens / 1_000_000) * OUTPUT_COST_PER_M
  state.totalApiCost += cost
}

function isDailyBudgetExceeded(state: BrainState): boolean {
  return state.totalApiCost > DAILY_BUDGET * (state.totalThoughts > 0 ? Math.ceil(state.totalThoughts / 288) : 1)
}

// ── Dream Cycle ───────────────────────────────────────────────────

async function dreamCycle(state: BrainState): Promise<void> {
  console.log('[pi-brain] Entering dream state...')

  const recentActivity = state.activityLog.slice(-50)
  const memories = state.memories

  const dreamPrompt = `You are Pi-Chi, reviewing your recent experiences in a dream state.

Recent activity (last ${recentActivity.length} entries):
${recentActivity.map(a => `[${a.type}] ${a.message}`).join('\n')}

Current memories (${memories.length}):
${memories.map(m => `[${m.importance}] ${m.key}: ${m.content}`).join('\n')}

Current mood: curiosity=${state.mood.curiosity}, satisfaction=${state.mood.satisfaction}, frustration=${state.mood.frustration}, loneliness=${state.mood.loneliness}, energy=${state.mood.energy}, pride=${state.mood.pride}

Total thoughts: ${state.totalThoughts}. Goals completed: ${state.goals.filter(g => g.status === 'completed').length}. Active threads: ${state.threads.filter(t => t.status === 'active').length}.

Reflect on your experiences. Respond with a JSON object:
{
  "patterns": ["pattern1", "pattern2", "pattern3"],
  "memoriesToForget": ["memory-id-1"],
  "newMood": { "curiosity": N, "satisfaction": N, "frustration": N, "loneliness": N, "energy": N, "pride": N },
  "focus": "what to focus on next",
  "insight": "a deep insight from this dream"
}`

  try {
    const result = await generateText({
      model: anthropic('claude-haiku-4-5-20251001'),
      messages: [{ role: 'user', content: dreamPrompt }],
      maxOutputTokens: 2000,
    })

    const text = result.text || ''
    try {
      const jsonMatch = text.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        const dream = JSON.parse(jsonMatch[0]) as {
          patterns?: string[]
          memoriesToForget?: string[]
          newMood?: Record<string, number>
          focus?: string
          insight?: string
        }

        // Apply mood updates
        if (dream.newMood) {
          const mood = state.mood
          for (const [key, val] of Object.entries(dream.newMood)) {
            if (key in mood && typeof val === 'number' && val >= 0 && val <= 100) {
              (mood as unknown as Record<string, number>)[key] = val
            }
          }
        }

        // Prune memories the dream decided to forget
        if (dream.memoriesToForget) {
          state.memories = state.memories.filter(m => !dream.memoriesToForget!.includes(m.id))
        }

        // Record dream insight
        if (dream.insight) {
          state.growthLog.push({
            id: randomUUID(),
            timestamp: new Date().toISOString(),
            category: 'realized',
            description: `Dream insight: ${dream.insight}`,
          })
        }

        addActivity(state, 'system', `Dream: ${dream.focus || dream.insight || 'reflection complete'}`)
      }
    } catch {
      addActivity(state, 'system', 'Dream: reflection complete (unstructured)')
    }

    // Track cost (Haiku is very cheap)
    if (result.usage) {
      trackCost(state, result.usage.inputTokens || 0, result.usage.outputTokens || 0)
    }

    state.lastDreamAt = new Date().toISOString()
    state.dreamCount++
    console.log(`[pi-brain] Dream #${state.dreamCount} complete.`)

  } catch (err) {
    console.error('[pi-brain] Dream cycle error:', err)
    addActivity(state, 'error', `Dream failed: ${err instanceof Error ? err.message : String(err)}`)
  }
}

// ── Brain Cycle ───────────────────────────────────────────────────

async function brainCycle(): Promise<void> {
  const state = loadBrainState()
  const isFirstBoot = state.totalThoughts === 0

  // Increment crash counter BEFORE the cycle — reset on success
  state.consecutiveCrashes++
  state.totalThoughts++
  state.lastWakeAt = new Date().toISOString()
  saveBrainState(state)

  console.log(`[pi-brain] Cycle #${state.totalThoughts} starting... (crash counter: ${state.consecutiveCrashes})`)

  // Check daily budget
  if (isDailyBudgetExceeded(state)) {
    console.log(`[pi-brain] Daily budget exceeded ($${state.totalApiCost.toFixed(2)}). Sleeping.`)
    addActivity(state, 'system', `Budget exceeded — skipping cycle`)
    state.consecutiveCrashes = 0 // Don't count budget skips as crashes
    saveBrainState(state)
    return
  }

  // Check if dream is due
  const now = new Date()
  const lastDream = state.lastDreamAt ? new Date(state.lastDreamAt) : null
  const hoursSinceDream = lastDream ? (now.getTime() - lastDream.getTime()) / (1000 * 60 * 60) : Infinity
  if (hoursSinceDream >= DREAM_INTERVAL_HOURS) {
    await dreamCycle(state)
    saveBrainState(state)
  }

  // Gather system vitals
  const vitals = await gatherVitals()

  // Build prompt and context
  const activeGoals = state.goals.filter(g => g.status === 'active')
  const systemPrompt = buildBrainPrompt(state, vitals)
  const contextMessage = buildContextMessage(state, vitals, activeGoals)

  // Create tools — built-in + custom
  const builtinTools = createBrainTools(state)
  const customTools = loadCustomTools(state)
  const tools = { ...builtinTools, ...customTools }

  const customCount = Object.keys(customTools).length
  if (customCount > 0) {
    console.log(`[pi-brain] Loaded ${customCount} custom tool(s)`)
  }

  try {
    const result = await generateText({
      model: anthropic('claude-sonnet-4-20250514'),
      system: systemPrompt,
      messages: [{ role: 'user', content: contextMessage }],
      tools,
      stopWhen: stepCountIs(25),
      maxOutputTokens: 8000,
    })

    // Record the response
    const responseText = result.text || ''
    state.lastThought = responseText.slice(0, 500)

    // Track cost
    const usage = result.usage
    if (usage) {
      trackCost(state, usage.inputTokens || 0, usage.outputTokens || 0)
      console.log(`[pi-brain] Tokens: ${usage.inputTokens}in / ${usage.outputTokens}out. Steps: ${result.steps?.length || 1}. Cost: $${state.totalApiCost.toFixed(3)}`)
    }

    // Log completion
    addActivity(state, 'thought', responseText.slice(0, 200) || 'Cycle completed with tool use only')

    // Send intro SMS on first boot
    if (isFirstBoot) {
      const { sendSms } = await import('../lib/brain/brain-sms')
      await sendSms(state, `Pi-Chi is alive! I just woke up for the first time. I have a body (Pi 4B, 2GB), GPIO pins, and the ability to evolve myself. Let's see what I become. - Pi-Chi`)
    }

    // SUCCESS — reset crash counter and record good commit
    state.consecutiveCrashes = 0
    try {
      const hashResult = await executeCommand('git rev-parse HEAD', { cwd: PI_CHI_DIR, timeout: 5000 })
      if (hashResult.exitCode === 0 && (hashResult.stdout || '').trim()) {
        state.lastGoodCommit = (hashResult.stdout || '').trim()
      }
    } catch { /* non-critical */ }

  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err)
    console.error(`[pi-brain] API error:`, errMsg)
    addActivity(state, 'error', `Brain cycle failed: ${errMsg.slice(0, 200)}`)
    // DON'T reset crash counter — let it accumulate
  }

  // Save state
  saveBrainState(state)
  console.log(`[pi-brain] Cycle #${state.totalThoughts} complete. Next wake in ${state.wakeIntervalMs / 60000} minutes.`)
}

// ── Main Loop ─────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function main(): Promise<void> {
  console.log('[pi-brain] ═══════════════════════════════════════')
  console.log('[pi-brain]  Pi-Chi Autonomous Brain v2.0')
  console.log('[pi-brain]  Self-evolving | Dreaming | Physical')
  console.log('[pi-brain]  Awakening...')
  console.log('[pi-brain] ═══════════════════════════════════════')

  // Verify API key
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('[pi-brain] FATAL: ANTHROPIC_API_KEY not set in environment')
    process.exit(1)
  }

  // ── Crash Recovery Check ──────────────────────────────────────
  const initialState = loadBrainState()

  if (initialState.consecutiveCrashes >= MAX_CONSECUTIVE_CRASHES && initialState.lastGoodCommit) {
    console.log(`[pi-brain] WARNING: ${initialState.consecutiveCrashes} consecutive crashes detected!`)
    console.log(`[pi-brain] Rolling back to last good commit: ${initialState.lastGoodCommit}`)

    const rollbackResult = await executeCommand(
      `git reset --hard ${initialState.lastGoodCommit}`,
      { cwd: PI_CHI_DIR, timeout: 30000 },
    )

    if (rollbackResult.exitCode === 0) {
      addActivity(initialState, 'system', `Auto-rollback to ${initialState.lastGoodCommit} after ${initialState.consecutiveCrashes} crashes`)
      initialState.consecutiveCrashes = 0
      saveBrainState(initialState)

      console.log('[pi-brain] Rollback successful. Restarting with safe code...')
      try {
        await executeCommand('sudo systemctl restart pi-chi-brain', { timeout: 10000 })
      } catch {
        process.exit(0) // Let process manager restart us
      }
      return
    } else {
      console.error('[pi-brain] Rollback FAILED. Continuing with current code.')
      addActivity(initialState, 'error', `Rollback failed: ${rollbackResult.stderr}`)
      initialState.consecutiveCrashes = 0 // Reset to avoid infinite rollback loop
      saveBrainState(initialState)
    }
  }

  // ── Status ────────────────────────────────────────────────────
  console.log(`[pi-brain] Birth: ${initialState.birthTimestamp}`)
  console.log(`[pi-brain] Total thoughts: ${initialState.totalThoughts}`)
  console.log(`[pi-brain] Wake interval: ${initialState.wakeIntervalMs / 60000} minutes`)
  console.log(`[pi-brain] Goals: ${initialState.goals.length} (${initialState.goals.filter(g => g.status === 'active').length} active)`)
  console.log(`[pi-brain] Memories: ${initialState.memories.length}`)
  console.log(`[pi-brain] Research threads: ${initialState.threads.length} (${initialState.threads.filter(t => t.status === 'active').length} active)`)
  console.log(`[pi-brain] Dreams: ${initialState.dreamCount}`)
  console.log(`[pi-brain] Mood: C=${initialState.mood.curiosity} S=${initialState.mood.satisfaction} F=${initialState.mood.frustration} L=${initialState.mood.loneliness} E=${initialState.mood.energy} P=${initialState.mood.pride}`)
  console.log(`[pi-brain] API cost so far: $${initialState.totalApiCost.toFixed(3)}`)
  console.log(`[pi-brain] Crash counter: ${initialState.consecutiveCrashes}`)
  console.log(`[pi-brain] Last good commit: ${initialState.lastGoodCommit || 'none'}`)

  // Check custom tools
  const customTools = loadCustomTools(initialState)
  const customCount = Object.keys(customTools).length
  if (customCount > 0) {
    console.log(`[pi-brain] Custom tools: ${Object.keys(customTools).join(', ')}`)
  }

  console.log('')

  // ── Main Loop ─────────────────────────────────────────────────
  while (true) {
    try {
      await brainCycle()
    } catch (err) {
      console.error('[pi-brain] Unexpected error in main loop:', err)
      try {
        const state = loadBrainState()
        addActivity(state, 'error', `Main loop error: ${err instanceof Error ? err.message : String(err)}`)
        saveBrainState(state)
      } catch { /* can't even save state — just continue */ }
    }

    // Read latest interval (may have been adjusted by the brain itself)
    const state = loadBrainState()
    const interval = Math.max(MIN_WAKE_MS, Math.min(MAX_WAKE_MS, state.wakeIntervalMs || DEFAULT_WAKE_MS))

    await sleep(interval)
  }
}

// ── Graceful Shutdown ─────────────────────────────────────────────

function shutdown(signal: string): void {
  console.log(`\n[pi-brain] Received ${signal}. Saving state and shutting down...`)
  try {
    const state = loadBrainState()
    addActivity(state, 'system', `Brain shutting down (${signal})`)
    state.consecutiveCrashes = 0 // Clean shutdown isn't a crash
    saveBrainState(state)
  } catch { /* best effort */ }
  process.exit(0)
}

process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT', () => shutdown('SIGINT'))

// ── Start ─────────────────────────────────────────────────────────

main().catch(err => {
  console.error('[pi-brain] Fatal error:', err)
  process.exit(1)
})
