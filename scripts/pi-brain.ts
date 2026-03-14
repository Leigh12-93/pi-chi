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
import { loadBrainState, saveBrainState, addActivity, getStateDir } from '../lib/brain/brain-state'
import { appendSnapshot } from '../lib/brain/analytics'
import { checkAchievements } from '../lib/brain/achievements'
import { getSeedPrompt, buildDynamicSystemPrompt, buildContextMessage } from '../lib/brain/brain-prompt'
import { createBrainTools, loadCustomTools, resetHttpRequestCounter } from '../lib/brain/brain-tools'
import { executeCommand } from '../lib/tools/terminal-tools'
import { randomUUID } from 'node:crypto'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import type { SystemVitalsSnapshot, BrainState, CostBreakdown } from '../lib/brain/brain-types'

// ── Constants ─────────────────────────────────────────────────────

const MIN_WAKE_MS = 60 * 1000        // 1 minute
const MAX_WAKE_MS = 60 * 60 * 1000   // 1 hour
const DEFAULT_WAKE_MS = 5 * 60 * 1000 // 5 minutes

// Cost per 1M tokens (Sonnet 4)
const INPUT_COST_PER_M = 3
const OUTPUT_COST_PER_M = 15
const DAILY_BUDGET = parseFloat(process.env.BRAIN_DAILY_BUDGET || '25')

const MAX_CONSECUTIVE_CRASHES = 3
const DREAM_INTERVAL_HOURS = 24
const PI_CHI_DIR = join(process.env.HOME || '/home/pi', 'pi-chi')
const HEARTBEAT_FILE = join(homedir(), '.pi-chi', 'heartbeat')
const WATCHDOG_TIMEOUT_MS = 20 * 60 * 1000 // 20 minutes

// ── Retry helper for transient API errors ─────────────────────────

function isTransientError(err: unknown): boolean {
  if (!err) return false
  const status = (err as { status?: number }).status
  if (status === 429 || status === 503 || status === 502) return true
  const msg = err instanceof Error ? err.message : String(err)
  return /timeout|ECONNRESET|ENOTFOUND|ETIMEDOUT|fetch failed/i.test(msg)
}

async function callWithRetry<T>(fn: () => Promise<T>, maxRetries = 2): Promise<T> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn()
    } catch (err) {
      if (!isTransientError(err) || attempt === maxRetries) throw err
      const delay = 1000 * Math.pow(2, attempt) // 1s, 2s
      console.log(`[brain] Transient error, retry ${attempt + 1}/${maxRetries} in ${delay}ms`)
      await new Promise(r => setTimeout(r, delay))
    }
  }
  throw new Error('unreachable')
}

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

function trackCost(
  state: BrainState,
  inputTokens: number,
  outputTokens: number,
  source: keyof CostBreakdown = 'brain',
  inputRate: number = INPUT_COST_PER_M,
  outputRate: number = OUTPUT_COST_PER_M,
): void {
  const cost = (inputTokens / 1_000_000) * inputRate + (outputTokens / 1_000_000) * outputRate
  state.totalApiCost += cost
  state.dailyCost += cost
  if (state.costBreakdown) {
    state.costBreakdown[source] += cost
  }
}

function isDailyBudgetExceeded(state: BrainState): boolean {
  return state.dailyCost > DAILY_BUDGET
}

// ── JSON Extraction ──────────────────────────────────────────────

/** Robustly extract a JSON object from text that may contain markdown, prose, or multiple objects */
function extractJson(text: string): Record<string, unknown> | null {
  // 1. Try direct parse (clean JSON response)
  try {
    const parsed = JSON.parse(text.trim())
    if (typeof parsed === 'object' && parsed !== null) return parsed
  } catch { /* not clean JSON */ }

  // 2. Try markdown code block extraction (```json ... ``` or ``` ... ```)
  const codeBlockMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/)
  if (codeBlockMatch) {
    try {
      const parsed = JSON.parse(codeBlockMatch[1].trim())
      if (typeof parsed === 'object' && parsed !== null) return parsed
    } catch { /* not valid JSON in code block */ }
  }

  // 3. Balanced-brace matching (find first complete { ... } pair)
  const startIdx = text.indexOf('{')
  if (startIdx === -1) return null
  let depth = 0
  let inString = false
  let escape = false
  for (let i = startIdx; i < text.length; i++) {
    const ch = text[i]
    if (escape) { escape = false; continue }
    if (ch === '\\') { escape = true; continue }
    if (ch === '"') { inString = !inString; continue }
    if (inString) continue
    if (ch === '{') depth++
    if (ch === '}') {
      depth--
      if (depth === 0) {
        try {
          return JSON.parse(text.slice(startIdx, i + 1))
        } catch {
          return null
        }
      }
    }
  }
  return null
}

// ── Mood Decay (Phase 4.1) ────────────────────────────────────────

function decayMood(state: BrainState, vitals: SystemVitalsSnapshot | null): void {
  const m = state.mood

  // Loneliness: increases if no owner chat
  const lastOwnerChat = state.chatMessages
    .filter(c => c.from === 'owner')
    .slice(-1)[0]
  if (lastOwnerChat) {
    const hoursSinceChat = (Date.now() - new Date(lastOwnerChat.timestamp).getTime()) / (1000 * 60 * 60)
    if (hoursSinceChat > 48) m.loneliness = Math.min(100, m.loneliness + 5)
    else if (hoursSinceChat > 12) m.loneliness = Math.min(100, m.loneliness + 2)
  } else {
    m.loneliness = Math.min(100, m.loneliness + 2)
  }

  // Frustration: naturally cools toward 0
  m.frustration = Math.max(0, m.frustration - 1)

  // Satisfaction: drifts toward 40 (neutral)
  if (m.satisfaction > 40) m.satisfaction = Math.max(40, m.satisfaction - 0.5)
  else if (m.satisfaction < 40) m.satisfaction = Math.min(40, m.satisfaction + 0.5)

  // Energy: blend with RAM availability (30% current + 70% RAM%)
  if (vitals && vitals.ramTotalMb > 0) {
    const ramPct = ((vitals.ramTotalMb - vitals.ramUsedMb) / vitals.ramTotalMb) * 100
    m.energy = Math.round(m.energy * 0.3 + ramPct * 0.7)
  }

  // Clamp all values
  for (const key of Object.keys(m) as Array<keyof typeof m>) {
    m[key] = Math.max(0, Math.min(100, Math.round(m[key])))
  }
}

// ── Adaptive Wake Interval (Phase 4.6) ──────────────────────────

function computeAdaptiveInterval(state: BrainState): number {
  // Unread messages → responsive (1 min)
  const hasUnread = state.chatMessages.some(m => m.from === 'owner' && !m.read)
  if (hasUnread) return 1 * 60 * 1000

  // Recent errors → back off (15 min)
  const recentErrors = state.activityLog
    .filter(e => e.type === 'error')
    .filter(e => Date.now() - new Date(e.time).getTime() < 30 * 60 * 1000)
  if (recentErrors.length >= 3) return 15 * 60 * 1000

  // Active goals + good energy → working mode (3 min)
  const activeGoals = state.goals.filter(g => g.status === 'active')
  if (activeGoals.length > 0 && state.mood.energy > 30) return 3 * 60 * 1000

  // No goals, no messages → idle mode (10 min)
  return 10 * 60 * 1000
}

// ── Disk Space Check (Phase 3.6) ────────────────────────────────

async function checkDiskSpace(state: BrainState): Promise<void> {
  try {
    const result = await executeCommand(
      "df / | awk 'NR==2 {print $5}' | tr -d '%'",
      { timeout: 5000 },
    )
    if (result.exitCode !== 0 || !result.stdout) return
    const usedPct = parseInt(result.stdout.trim(), 10)
    if (isNaN(usedPct)) return

    if (usedPct > 95) {
      addActivity(state, 'error', `CRITICAL: Disk ${usedPct}% full!`)
      // Send SMS alert
      const { sendSms } = await import('../lib/brain/brain-sms')
      await sendSms(state, `Pi-Chi ALERT: Disk ${usedPct}% full! Running cleanup.`)
      // Cleanup
      await executeCommand('npm cache clean --force 2>/dev/null; sudo journalctl --vacuum-size=50M 2>/dev/null', { timeout: 30000 })
    } else if (usedPct > 90) {
      addActivity(state, 'system', `Disk warning: ${usedPct}% full — running cleanup`)
      await executeCommand('npm cache clean --force 2>/dev/null; sudo journalctl --vacuum-size=50M 2>/dev/null', { timeout: 30000 })
    }
  } catch { /* non-critical */ }
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

Reflect on your experiences. Also review memories for consolidation — identify memories older than 30 days with low access counts that could be merged into summaries.

Respond with a JSON object:
{
  "patterns": ["pattern1", "pattern2", "pattern3"],
  "memoriesToForget": ["memory-id-1"],
  "consolidatedMemories": [{"replaceIds": ["id1", "id2"], "key": "merged key", "content": "consolidated summary", "importance": "medium"}],
  "newMood": { "curiosity": N, "satisfaction": N, "frustration": N, "loneliness": N, "energy": N, "pride": N },
  "focus": "what to focus on next",
  "insight": "a deep insight from this dream"
}`

  try {
    const result = await generateText({
      model: anthropic('claude-sonnet-4-20250514'),
      messages: [{ role: 'user', content: dreamPrompt }],
      maxOutputTokens: 4000,
    })

    const text = result.text || ''
    try {
      const dream = extractJson(text) as {
        patterns?: string[]
        memoriesToForget?: string[]
        consolidatedMemories?: Array<{
          replaceIds: string[]
          key: string
          content: string
          importance: string
        }>
        newMood?: Record<string, number>
        focus?: string
        insight?: string
      } | null
      if (dream) {

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

        // Consolidate memories (Phase 4.5)
        if (dream.consolidatedMemories) {
          for (const c of dream.consolidatedMemories) {
            if (!c.replaceIds?.length || !c.key || !c.content) continue
            // Remove old memories being consolidated
            state.memories = state.memories.filter(m => !c.replaceIds.includes(m.id))
            // Add consolidated memory
            const validImportance = ['critical', 'high', 'medium', 'low'].includes(c.importance)
              ? c.importance as 'critical' | 'high' | 'medium' | 'low'
              : 'medium'
            state.memories.push({
              id: randomUUID(),
              key: c.key.slice(0, 100),
              content: c.content.slice(0, 500),
              importance: validImportance,
              createdAt: new Date().toISOString(),
              accessCount: 0,
            })
          }
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

    // Track cost (Sonnet for dreams)
    if (result.usage) {
      trackCost(state, result.usage.inputTokens || 0, result.usage.outputTokens || 0, 'dream')
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

  state.totalThoughts++
  state.lastWakeAt = new Date().toISOString()
  saveBrainState(state)

  console.log(`[pi-brain] Cycle #${state.totalThoughts} starting... (crash counter: ${state.consecutiveCrashes})`)

  // Check daily budget (using dailyCost field reset at Adelaide midnight)
  if (isDailyBudgetExceeded(state)) {
    console.log(`[pi-brain] Daily budget exceeded ($${state.dailyCost.toFixed(2)}/$${DAILY_BUDGET}). Sleeping.`)
    addActivity(state, 'system', `Budget exceeded — skipping cycle ($${state.dailyCost.toFixed(2)}/$${DAILY_BUDGET})`)
    state.consecutiveCrashes = 0 // Don't count budget skips as crashes
    saveBrainState(state)
    return
  }
  // Budget warning at 80%
  const budgetPct = (state.dailyCost / DAILY_BUDGET) * 100
  if (budgetPct >= 80) {
    const lastWarning = state.activityLog.findLast(
      e => e.type === 'system' && e.message.startsWith('Budget warning:')
    )
    const sixHoursAgo = Date.now() - 6 * 60 * 60 * 1000
    if (!lastWarning || new Date(lastWarning.time).getTime() < sixHoursAgo) {
      addActivity(state, 'system', `Budget warning: ${budgetPct.toFixed(0)}% used ($${state.dailyCost.toFixed(2)}/$${DAILY_BUDGET})`)
    }
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

  // Mood decay (Phase 4.1)
  decayMood(state, vitals)

  // Temperature throttling (Phase 4.7)
  if (vitals && vitals.tempCelsius > 0) {
    if (vitals.tempCelsius > 80) {
      console.log(`[pi-brain] THERMAL: ${vitals.tempCelsius}°C — skipping cycle`)
      addActivity(state, 'system', `Thermal skip: ${vitals.tempCelsius}°C > 80°C`)
      state.consecutiveCrashes = 0
      saveBrainState(state)
      return
    }
    if (vitals.tempCelsius > 75) {
      const throttled = Math.max(state.wakeIntervalMs, 15 * 60 * 1000)
      if (throttled > state.wakeIntervalMs) {
        state.wakeIntervalMs = throttled
        addActivity(state, 'system', `Thermal throttle: ${vitals.tempCelsius}°C — interval → 15min`)
      }
    }
  }

  // Disk space monitoring (Phase 3.6)
  await checkDiskSpace(state)

  // Build prompt and context (split for prompt caching)
  const activeGoals = state.goals.filter(g => g.status === 'active')
  const seedPrompt = getSeedPrompt()
  const dynamicSystemPrompt = buildDynamicSystemPrompt(state)
  const contextMessage = buildContextMessage(state, vitals, activeGoals)

  // Create tools — built-in + custom
  const builtinTools = createBrainTools(state)
  const customTools = loadCustomTools(state)
  const tools = { ...builtinTools, ...customTools }

  const customCount = Object.keys(customTools).length
  if (customCount > 0) {
    console.log(`[pi-brain] Loaded ${customCount} custom tool(s)`)
  }

  // Reset per-cycle counters
  resetHttpRequestCounter()

  try {
    const result = await callWithRetry(() => generateText({
      model: anthropic('claude-sonnet-4-20250514'),
      system: [
        // Static seed — cached across cycles (90% discount on cache hits)
        {
          role: 'system' as const,
          content: seedPrompt,
          providerOptions: {
            anthropic: { cacheControl: { type: 'ephemeral' } },
          },
        },
        // Dynamic per-cycle: memories, capabilities, evolved wisdom
        {
          role: 'system' as const,
          content: dynamicSystemPrompt,
        },
      ],
      messages: [{ role: 'user', content: contextMessage }],
      tools,
      stopWhen: stepCountIs(50),
      maxOutputTokens: 16000,
      abortSignal: AbortSignal.timeout(120_000),
    }))

    // Record the response
    const responseText = result.text || ''
    state.lastThought = responseText.slice(0, 500)

    // Track cost (brain source) — check for cache metrics
    const usage = result.usage
    if (usage) {
      trackCost(state, usage.inputTokens || 0, usage.outputTokens || 0, 'brain')

      // Log cache hit metrics from provider metadata
      const providerMeta = result.providerMetadata?.anthropic as Record<string, number> | undefined
      const cacheCreation = providerMeta?.cacheCreationInputTokens || 0
      const cacheRead = providerMeta?.cacheReadInputTokens || 0
      const cacheInfo = cacheCreation > 0
        ? ` (cache CREATED: ${cacheCreation} tokens)`
        : cacheRead > 0
          ? ` (cache HIT: ${cacheRead} tokens saved)`
          : ''

      console.log(`[pi-brain] Tokens: ${usage.inputTokens}in / ${usage.outputTokens}out. Steps: ${result.steps?.length || 1}. Cost: $${state.totalApiCost.toFixed(3)} (today: $${state.dailyCost.toFixed(3)})${cacheInfo}`)
    }

    // Log completion
    addActivity(state, 'thought', responseText.slice(0, 200) || 'Cycle completed with tool use only')

    // Send intro SMS on first boot
    if (isFirstBoot) {
      try {
        const { sendSms } = await import('../lib/brain/brain-sms')
        await sendSms(state, `Pi-Chi is alive! I just woke up for the first time. I have a body (Pi 4B, 2GB), GPIO pins, and the ability to evolve myself. Let's see what I become. - Pi-Chi`)
      } catch (smsErr) {
        console.error('[brain] SMS send failed:', smsErr instanceof Error ? smsErr.message : smsErr)
      }
    }

    // Mark owner chat messages as read (brain has seen them this cycle)
    if (state.chatMessages) {
      for (const msg of state.chatMessages) {
        if (msg.from === 'owner' && !msg.read) {
          msg.read = true
        }
      }
    }

    // Post-cycle build check — DISABLED: Pi ARM CPU cannot build Next.js reliably.
    // Builds must be done remotely and deployed via SCP. Source changes are committed
    // but the dashboard uses the pre-built .next from the last remote build.
    let dashboardStopped = false
    try {
      const diffResult = await executeCommand('git diff --name-only HEAD', { cwd: PI_CHI_DIR, timeout: 5000 })
      const changedFiles = (diffResult.stdout || '').trim()
      if (changedFiles && (changedFiles.includes('.ts') || changedFiles.includes('.tsx') || changedFiles.includes('.css'))) {
        console.log('[pi-brain] Source files changed — skipping build (ARM CPU cannot build Next.js). Changes committed but dashboard uses pre-built .next.')
        addActivity(state, 'system', 'Source files changed. Build skipped (ARM limitation). Dashboard unchanged until remote rebuild.')
        // Git commit changes but do NOT build — ARM CPU limitation
        await executeCommand('git add -A && git commit -m "pi-chi: source changes (build pending remote)" --no-verify', { cwd: PI_CHI_DIR, timeout: 10000 }).catch(() => {})
      }
    } catch (buildErr) {
      console.error('[pi-brain] Build check error:', buildErr)
    } finally {
      // Guarantee dashboard comes back up regardless of what happened (Phase 3.5)
      try {
        const dashCheck = await executeCommand('systemctl is-active pi-chi-dashboard', { timeout: 3000 })
        if ((dashCheck.stdout || '').trim() !== 'active') {
          console.log('[pi-brain] Dashboard not active — restarting...')
          await executeCommand('sudo systemctl start pi-chi-dashboard', { cwd: PI_CHI_DIR, timeout: 15000 })
        }
      } catch {
        // Last resort
        if (dashboardStopped) {
          await executeCommand('sudo systemctl start pi-chi-dashboard', { cwd: PI_CHI_DIR, timeout: 15000 }).catch(() => {})
        }
      }
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
    // Only count non-transient errors toward crash counter (avoids rollback from API hiccups)
    if (!isTransientError(err)) {
      state.consecutiveCrashes++
    }
  }

  // ── Post-cycle: Analytics snapshot ──────────────────────────────
  try {
    appendSnapshot(state)
  } catch (err) {
    console.error('[pi-brain] Analytics snapshot error:', err)
  }

  // ── Post-cycle: Achievement check ─────────────────────────────
  try {
    const newAchievements = checkAchievements(state)
    if (newAchievements.length > 0) {
      for (const a of newAchievements) {
        if (!state.achievements) state.achievements = []
        state.achievements.push(a)
        addActivity(state, 'system', `Achievement unlocked: ${a.title}`)
        console.log(`[pi-brain] Achievement unlocked: ${a.title}`)
      }
    }
  } catch (err) {
    console.error('[pi-brain] Achievement check error:', err)
  }

  // ── Post-cycle: State backup every 100 cycles ─────────────────
  if (state.totalThoughts % 100 === 0) {
    try {
      const { copyFileSync, existsSync: exists, unlinkSync: unlink, readdirSync } = await import('node:fs')
      const stateDir = getStateDir()
      const backupName = `brain-state-backup-${new Date().toISOString().slice(0, 10)}.json`
      const backupPath = join(stateDir, backupName)
      const statePath = join(stateDir, 'brain-state.json')
      if (exists(statePath)) {
        copyFileSync(statePath, backupPath)
        console.log(`[pi-brain] State backup: ${backupName}`)
        // Keep only last 5 backups
        const backups = readdirSync(stateDir)
          .filter(f => f.startsWith('brain-state-backup-') && f.endsWith('.json'))
          .sort()
        while (backups.length > 5) {
          const old = backups.shift()!
          try { unlink(join(stateDir, old)) } catch { /* */ }
        }
      }
    } catch (err) {
      console.error('[pi-brain] State backup error:', err)
    }
  }

  // ── Post-cycle: Execute due schedules ─────────────────────────
  if (state.schedules && state.schedules.length > 0) {
    for (const sched of state.schedules) {
      if (!sched.enabled) continue
      const cyclesSinceLast = state.totalThoughts - (sched.lastRunCycle || 0)
      if (cyclesSinceLast >= sched.intervalCycles) {
        sched.lastRunCycle = state.totalThoughts
        addActivity(state, 'system', `Scheduled: ${sched.name} — ${sched.instruction.slice(0, 100)}`)
      }
    }
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

  // Global error handlers — prevent unhandled rejections from crashing the process
  process.on('unhandledRejection', (reason) => {
    console.error('[brain] Unhandled rejection:', reason)
    // Don't exit — log and continue
  })

  process.on('uncaughtException', (err) => {
    console.error('[brain] Uncaught exception:', err)
    process.exit(1) // Must exit — state is unknown
  })

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
      // Watchdog timeout (Phase 3.7) — kill stuck cycles after 10 minutes
      await Promise.race([
        brainCycle(),
        new Promise<void>((_, reject) =>
          setTimeout(() => reject(new Error('Brain cycle watchdog timeout (20min)')), WATCHDOG_TIMEOUT_MS),
        ),
      ])
    } catch (err) {
      console.error('[pi-brain] Unexpected error in main loop:', err)
      try {
        const state = loadBrainState()
        addActivity(state, 'error', `Main loop error: ${err instanceof Error ? err.message : String(err)}`)
        saveBrainState(state)
      } catch { /* can't even save state — just continue */ }
    }

    // Adaptive wake interval (Phase 4.6)
    const state = loadBrainState()
    const adaptiveMs = computeAdaptiveInterval(state)
    // Brain can override via adjust_schedule, but adaptive provides a floor/ceiling
    const manualMs = state.wakeIntervalMs || DEFAULT_WAKE_MS
    // Use the shorter of adaptive and manual (brain can still extend via adjust_schedule)
    const interval = Math.max(MIN_WAKE_MS, Math.min(MAX_WAKE_MS, Math.min(adaptiveMs, manualMs)))

    // Heartbeat during sleep (Phase 3.4)
    const heartbeatInterval = setInterval(() => {
      try {
        writeFileSync(HEARTBEAT_FILE, new Date().toISOString())
      } catch { /* non-critical */ }
    }, 30000)
    // Write initial heartbeat
    try { writeFileSync(HEARTBEAT_FILE, new Date().toISOString()) } catch { /* */ }

    await sleep(interval)
    clearInterval(heartbeatInterval)
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
