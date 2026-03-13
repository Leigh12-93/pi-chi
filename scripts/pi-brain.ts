#!/usr/bin/env tsx
/* ═══════════════════════════════════════════════════════════════════
 * Pi-Chi Autonomous Brain
 *
 * A standalone Node.js process that runs continuously on the Pi.
 * Wakes on intervals, gathers context, calls Claude API, executes
 * tools, records everything, and grows.
 *
 * Run: npx tsx scripts/pi-brain.ts
 * Or:  npm run brain
 * ═══════════════════════════════════════════════════════════════════ */

import { generateText, stepCountIs } from 'ai'
import { anthropic } from '@ai-sdk/anthropic'
import { loadBrainState, saveBrainState, addActivity } from '../lib/brain/brain-state'
import { buildBrainPrompt, buildContextMessage } from '../lib/brain/brain-prompt'
import { createBrainTools } from '../lib/brain/brain-tools'
import { executeCommand } from '../lib/tools/terminal-tools'
import type { SystemVitalsSnapshot, BrainState } from '../lib/brain/brain-types'

// ── Constants ─────────────────────────────────────────────────────

const MIN_WAKE_MS = 60 * 1000        // 1 minute
const MAX_WAKE_MS = 60 * 60 * 1000   // 1 hour
const DEFAULT_WAKE_MS = 5 * 60 * 1000 // 5 minutes

// Cost per 1M tokens (Sonnet 4)
const INPUT_COST_PER_M = 3
const OUTPUT_COST_PER_M = 15
const DAILY_BUDGET = parseFloat(process.env.BRAIN_DAILY_BUDGET || '10')

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
  // Simple daily check: reset tracking isn't persistent, so we approximate
  // by checking if total cost growth today exceeds budget
  return state.totalApiCost > DAILY_BUDGET * (state.totalThoughts > 0 ? Math.ceil(state.totalThoughts / 288) : 1)
}

// ── Brain Cycle ───────────────────────────────────────────────────

async function brainCycle(): Promise<void> {
  const state = loadBrainState()
  const isFirstBoot = state.totalThoughts === 0

  state.totalThoughts++
  state.lastWakeAt = new Date().toISOString()

  console.log(`[pi-brain] Cycle #${state.totalThoughts} starting...`)

  // Check daily budget
  if (isDailyBudgetExceeded(state)) {
    console.log(`[pi-brain] Daily budget exceeded ($${state.totalApiCost.toFixed(2)}). Sleeping.`)
    addActivity(state, 'system', `Budget exceeded — skipping cycle`)
    saveBrainState(state)
    return
  }

  // Gather system vitals
  const vitals = await gatherVitals()

  // Build prompt and context
  const activeGoals = state.goals.filter(g => g.status === 'active')
  const systemPrompt = buildBrainPrompt(state, vitals)
  const contextMessage = buildContextMessage(state, vitals, activeGoals)

  // Create tools (they get a reference to state for live updates)
  const tools = createBrainTools(state)

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
      await sendSms(state, `Pi-Chi is alive! I just woke up for the first time on this Raspberry Pi. I'll explore my environment and let you know what I find. - Pi-Chi`)
    }

  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err)
    console.error(`[pi-brain] API error:`, errMsg)
    addActivity(state, 'error', `Brain cycle failed: ${errMsg.slice(0, 200)}`)
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
  console.log('[pi-brain]  Pi-Chi Autonomous Brain')
  console.log('[pi-brain]  Awakening...')
  console.log('[pi-brain] ═══════════════════════════════════════')

  // Verify API key
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('[pi-brain] FATAL: ANTHROPIC_API_KEY not set in environment')
    process.exit(1)
  }

  // Initial state check
  const initialState = loadBrainState()
  console.log(`[pi-brain] Birth: ${initialState.birthTimestamp}`)
  console.log(`[pi-brain] Total thoughts: ${initialState.totalThoughts}`)
  console.log(`[pi-brain] Wake interval: ${initialState.wakeIntervalMs / 60000} minutes`)
  console.log(`[pi-brain] Goals: ${initialState.goals.length} (${initialState.goals.filter(g => g.status === 'active').length} active)`)
  console.log(`[pi-brain] Memories: ${initialState.memories.length}`)
  console.log(`[pi-brain] API cost so far: $${initialState.totalApiCost.toFixed(3)}`)
  console.log('')

  // Main loop
  while (true) {
    try {
      await brainCycle()
    } catch (err) {
      console.error('[pi-brain] Unexpected error in main loop:', err)
      // Save error to state
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
