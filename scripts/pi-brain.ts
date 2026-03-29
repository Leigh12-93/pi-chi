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

import { loadBrainState, saveBrainState, addActivity, getStateDir, validateBrainState, repairBrainState } from '../lib/brain/brain-state'
import { ensureBrainDb, syncBrainDb } from '../lib/brain/brain-db'
import { appendSnapshot } from '../lib/brain/analytics'
import { checkAchievements } from '../lib/brain/achievements'
import { shouldRunSelfAudit, buildSelfAuditFromState, writeSelfAudit } from '../lib/brain/code-guardrails'
import { getSeedPrompt, buildDynamicSystemPrompt, buildContextMessage, getCurrentMode } from '../lib/brain/brain-prompt'
import { ensureClaudeCodeMaxOAuth, runClaudeCodePrompt } from '../lib/brain/claude-code'
import { clearFallback, getFallbackInfo, hasCodexAuth, isClaudeUnavailableText, isFallbackActive, probeClaudeHealth, runCodexPrompt, setFallbackActive, shouldProbeClaudeNow } from '../lib/brain/codex-fallback'
import { loadCustomTools, resetHttpRequestCounter } from '../lib/brain/brain-tools'
import { enterFixAuthDisplay, enterStandbyDisplay, resumeDashboardDisplay } from '../lib/brain/display-mode'
import { BUSINESSES, NOT_OUR_BUSINESSES, LEAD_PRICE_AUD, getPricingStatement } from '../lib/brain/business-rules'
import { getLeadSummary } from '../lib/brain/lead-tracker'
import { getPendingCount } from '../lib/brain/escalation'
import { extractJournalErrors } from '../lib/brain/cycle-journal-errors'
import { executeCommand } from '../lib/tools/terminal-tools'
import { randomUUID } from 'node:crypto'
import { execSync } from 'node:child_process'
import { writeFileSync, appendFileSync, unlinkSync, copyFileSync, readdirSync, readFileSync, existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import type { SystemVitalsSnapshot, BrainState, CycleJournal, FailureRecord } from '../lib/brain/brain-types'
import type { Mission, WorkCycle } from '../lib/brain/domain-types'

// ── Suppress SIGUSR1 & close any inspector that snuck open ───────
// SIGUSR1 during import phase (before this handler) opens the Node
// inspector on :9229. Close it immediately and prevent future opens.
// Also set debugPort=0 so any future inspector activation uses a
// random port instead of conflicting on :9229.
process.debugPort = 0
process.on('SIGUSR1', () => {
  // Swallow the signal AND close the inspector if Node opened it
  // before our handler could intercept (race during import phase)
  try { require('node:inspector').close() } catch { /* */ }
})
try {
  const insp = require('node:inspector')
  insp.close()          // close inspector if opened during imports
} catch { /* inspector module unavailable — fine */ }

// ── Constants ─────────────────────────────────────────────────────

const MIN_WAKE_MS = 60 * 1000        // 1 minute
const MAX_WAKE_MS = 55 * 60 * 1000   // 55 minutes (auth token safety)
const DEFAULT_WAKE_MS = 5 * 60 * 1000 // 5 minutes

const DAILY_BUDGET = parseFloat(process.env.BRAIN_DAILY_BUDGET || '999')

const MAX_CONSECUTIVE_CRASHES = 3
const DREAM_INTERVAL_HOURS = 24
const PI_CHI_DIR = join(process.env.HOME || '/home/pi', 'pi-chi')
const HEARTBEAT_FILE = join(homedir(), '.pi-chi', 'heartbeat')
let dashboardRestartFailures = 0  // Track consecutive dashboard restart failures
const WATCHDOG_TIMEOUT_MS = 30 * 60 * 1000 // 30 minutes

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

type BrainRunnerOptions = {
  promptPath: string
  cwd: string
  maxTurns: number
  timeoutSeconds: number
  liveLogPath?: string
}

type BrainRunnerResult = {
  engine: 'claude' | 'codex'
  result: {
    exitCode: number
    stdout: string
    stderr: string
  }
}

function summarizeFailure(raw: string): string {
  const trimmed = raw.replace(/\s+/g, ' ').trim()
  return trimmed.slice(0, 180) || 'Claude unavailable'
}

async function restoreClaudeIfHealthy(state?: BrainState): Promise<void> {
  if (!isFallbackActive()) return
  if (!shouldProbeClaudeNow()) {
    const retryAfter = getFallbackInfo()?.retryAfter
    if (state && retryAfter) {
      addActivity(state, 'system', `Claude retry deferred until ${retryAfter}`)
    }
    return
  }
  const restored = await probeClaudeHealth()
  if (!restored) return
  clearFallback()
  console.log('[pi-brain] Claude recovered — switching back from Codex fallback')
  if (state) {
    addActivity(state, 'system', 'Claude auth healthy again — switching back from Codex fallback')
  }
}

async function activateCodexFallback(
  rawReason: string,
  state?: BrainState,
  purpose = 'brain-cycle',
): Promise<void> {
  const reason = summarizeFailure(rawReason)
  setFallbackActive(reason)
  console.error(`[pi-brain] Claude unavailable for ${purpose} — switching to Codex fallback: ${reason}`)
  if (state) {
    addActivity(state, 'system', `Claude unavailable — switched to Codex fallback (${reason})`)
  }

  if (/login|auth|oauth|401|unauthorized/i.test(reason)) {
    await enterFixAuthDisplay('Claude auth needs attention', {
      provider: 'codex',
      detail: 'Running on Codex until Claude is healthy again',
      sinceThought: state?.totalThoughts ?? null,
      taskClass: 'recovery',
    }).catch(() => {})
    return
  }

  await enterStandbyDisplay('Codex fallback active', {
    provider: 'codex',
    detail: 'Claude hit limits or became unavailable — Codex is running this cycle',
    sinceThought: state?.totalThoughts ?? null,
    taskClass: 'recovery',
  }).catch(() => {})
}

async function runBrainModelPrompt(
  options: BrainRunnerOptions,
  state?: BrainState,
  purpose = 'brain-cycle',
): Promise<BrainRunnerResult> {
  await restoreClaudeIfHealthy(state)

  if (!isFallbackActive()) {
    try {
      const result = await runClaudeCodePrompt(options)
      const combined = `${result.stdout || ''}\n${result.stderr || ''}`
      if (result.exitCode === 0 && !isClaudeUnavailableText(combined)) {
        return { engine: 'claude', result }
      }
      if (!hasCodexAuth()) {
        return { engine: 'claude', result }
      }
      await activateCodexFallback(combined, state, purpose)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      if (!isClaudeUnavailableText(msg) || !hasCodexAuth()) {
        throw err
      }
      await activateCodexFallback(msg, state, purpose)
    }
  }

  if (!hasCodexAuth()) {
    throw new Error('Codex fallback requested but ~/.codex/auth.json is missing on Pi-Chi')
  }

  const result = await runCodexPrompt(options)
  return { engine: 'codex', result }
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

// ── Budget check (safety net — Max subscription has no per-token cost) ────

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

  // Active goals + good energy → working mode (2 min)
  const activeGoals = state.goals.filter(g => g.status === 'active')
  if (activeGoals.length > 0 && state.mood.energy > 30) return 2 * 60 * 1000

  // No goals, no messages → idle mode (5 min)
  return 5 * 60 * 1000
}

function inferMissionType(title: string): Mission['type'] {
  const text = (title || '').toLowerCase()
  if (text.includes('launch') || text.includes('ship') || text.includes('deploy')) return 'launch'
  if (text.includes('grow') || text.includes('revenue') || text.includes('scale')) return 'grow'
  if (text.includes('explore') || text.includes('research') || text.includes('find')) return 'explore'
  if (text.includes('improve') || text.includes('refactor') || text.includes('optimize') || text.includes('learn')) return 'self-improve'
  return 'maintain'
}

function deriveMission(state: BrainState): Mission | null {
  if (state.currentMission && state.currentMission.status === 'active') {
    return state.currentMission
  }

  const activeGoals = state.goals
    .filter(goal => goal.status === 'active')
    .sort((a, b) => ({ high: 3, medium: 2, low: 1 }[b.priority] - { high: 3, medium: 2, low: 1 }[a.priority]))

  const topGoal = activeGoals[0]

  // Fallback to stretch goals if no active goals
  if (!topGoal && state.stretchGoals && state.stretchGoals.length > 0) {
    const topStretchGoal = [...state.stretchGoals].sort((a, b) => {
      const progressA = a.target > 0 ? a.current / a.target : 0
      const progressB = b.target > 0 ? b.current / b.target : 0
      return progressB - progressA
    })[0]
    if (topStretchGoal) {
      return {
        id: topStretchGoal.id,
        type: topStretchGoal.domain === 'business' ? 'grow' : topStretchGoal.domain === 'venture' ? 'launch' : topStretchGoal.domain === 'self-improvement' ? 'self-improve' : 'maintain',
        title: topStretchGoal.title,
        rationale: `Primary stretch target is ${topStretchGoal.current}/${topStretchGoal.target} ${topStretchGoal.unit}.`,
        progressLabel: `${topStretchGoal.current}/${topStretchGoal.target} ${topStretchGoal.unit}`,
        startedAt: new Date().toISOString(),
        status: 'active',
        targetRef: topStretchGoal.id,
      }
    }
  }

  // Fallback to opportunities if no active goals or stretch goals
  if (!topGoal && state.opportunities && state.opportunities.length > 0) {
    const topOpportunity = [...state.opportunities]
      .filter(opportunity => opportunity.stage !== 'discarded')
      .sort((a, b) => {
        const stageScore = (stage: string) => ({ signal: 1, idea: 2, research: 3, validation: 4, candidate: 5, incubation: 6, launched: 7, discarded: 0 }[stage] ?? 0)
        return stageScore(b.stage) - stageScore(a.stage) || b.confidence - a.confidence
      })[0]

    if (topOpportunity) {
      return {
        id: topOpportunity.id,
        type: topOpportunity.stage === 'launched' ? 'launch' : topOpportunity.stage === 'research' || topOpportunity.stage === 'validation' ? 'explore' : 'grow',
        title: topOpportunity.title,
        rationale: `Highest-ranked opportunity from ${topOpportunity.source}.`,
        progressLabel: `${topOpportunity.stage} · ${topOpportunity.confidence}% confidence`,
        startedAt: topOpportunity.updatedAt,
        status: topOpportunity.stage === 'discarded' ? 'blocked' : 'active',
        targetRef: topOpportunity.id,
      }
    }
  }

  // No goals, stretch goals, or opportunities
  if (!topGoal) return null

  return {
    id: topGoal.id,
    type: inferMissionType(topGoal.title),
    title: topGoal.title,
    rationale: topGoal.reasoning || 'Highest-priority active goal',
    progressLabel: `${topGoal.tasks.filter(task => task.status === 'done').length}/${topGoal.tasks.length} tasks`,
    startedAt: topGoal.createdAt,
    status: 'active',
  }
}

function startCycleRecord(state: BrainState): number {
  const mission = deriveMission(state)
  state.currentMission = mission
  state.currentCycle = {
    id: randomUUID(),
    thoughtNumber: state.totalThoughts,
    startedAt: new Date().toISOString(),
    mission: mission ?? undefined,
    actions: [],
    outcome: '',
    kpiDeltas: {},
    lessons: [],
  }
  return state.activityLog.length
}

function finishCycleRecord(state: BrainState, activityStartIndex: number, outcome: string, lessons: string[] = []): void {
  if (!state.currentCycle) return

  const cycle: WorkCycle = {
    ...state.currentCycle,
    completedAt: new Date().toISOString(),
    actions: state.activityLog
      .slice(activityStartIndex)
      .map(entry => entry.message)
      .filter(Boolean)
      .slice(0, 12),
    outcome: outcome.slice(0, 300),
    lessons: lessons.filter(Boolean).slice(0, 3),
  }

  state.workCycles = [...(state.workCycles || []), cycle].slice(-12)
  state.currentCycle = null
}

// ── Auto-Learning System ─────────────────────────────────────────

/** Auto-record a cycle journal entry from Claude Code output (no tool call needed) */
function autoRecordCycleJournal(
  state: BrainState,
  cycleNumber: number,
  startedAt: string,
  claudeOutput: string,
  exitCode: number,
): void {
  const now = new Date().toISOString()
  const durationMs = new Date(now).getTime() - new Date(startedAt).getTime()

  // Parse errors from output
  const errors = extractJournalErrors(claudeOutput)

  // Determine outcome
  let outcome: CycleJournal['outcome'] = 'productive'
  if (exitCode !== 0) outcome = 'failed'
  else if (errors.length > 3) outcome = 'partial'
  else if (!claudeOutput.trim() || claudeOutput.trim().length < 20) outcome = 'wasted'

  // Extract active goal/task info
  const activeGoal = (state.goals || []).find(g => g.status === 'active' && g.priority === 'high')
    || (state.goals || []).find(g => g.status === 'active')
  const pendingTask = (activeGoal?.tasks || []).find(t => t.status === 'pending' || t.status === 'running')

  // Detect files changed from output mentions
  const fileMatches = claudeOutput.match(/(?:\/home\/pi\/|~\/|\.\/)[^\s'")\]]+\.[a-z]{1,4}/g) || []
  const uniqueFiles = [...new Set(fileMatches)].slice(0, 10)

  // Build summary from first meaningful lines
  const summaryLines = claudeOutput.split('\n').filter(l => l.trim() && !l.startsWith('---') && !l.startsWith('===')).slice(0, 2)
  const summary = summaryLines.join(' ').replace(/\*\*/g, '').slice(0, 200) || 'Cycle completed'

  const buildAttempted = /npm run build|next build|tsc/i.test(claudeOutput)
  const deployAttempted = /systemctl.*restart.*dashboard|scp.*\.next/i.test(claudeOutput)

  const journal: CycleJournal = {
    cycle: cycleNumber,
    startedAt,
    completedAt: now,
    durationMs,
    goalWorkedOn: activeGoal?.title || null,
    taskWorkedOn: pendingTask?.title || null,
    toolsUsed: [],
    claudeCodeUsed: true,
    outcome,
    summary,
    errors,
    lessonsLearned: [],
    filesChanged: uniqueFiles,
    buildAttempted,
    buildSucceeded: buildAttempted ? !/build failed|Build error|ERR!/i.test(claudeOutput) : null,
    deployAttempted,
    deploySucceeded: deployAttempted ? !/deploy.*failed|deploy.*error/i.test(claudeOutput) : null,
  }

  if (!state.cycleJournal) state.cycleJournal = []
  state.cycleJournal.push(journal)
  // Cap to prevent unbounded growth (saveBrainState also caps, but defensive here)
  if (state.cycleJournal.length > 250) {
    state.cycleJournal = state.cycleJournal.slice(-200)
  }

  // Auto-detect and record failures
  if (errors.length > 0 || exitCode !== 0) {
    autoRecordFailures(state, errors, cycleNumber)
  }

  console.log(`[pi-brain] Auto-journal: cycle ${cycleNumber} → ${outcome} (${errors.length} errors, ${uniqueFiles.length} files)`)
}

/** Auto-detect and record failures from cycle output errors */
function autoRecordFailures(state: BrainState, errors: string[], cycle: number): void {
  if (!state.failureRegistry || !Array.isArray(state.failureRegistry)) {
    state.failureRegistry = Array.isArray(state.failureRegistry) ? state.failureRegistry : Object.values(state.failureRegistry || {})
  }
  const now = new Date().toISOString()

  for (const error of errors) {
    if (!error || typeof error !== 'string') continue
    const errorLower = error.toLowerCase()

    // Categorize
    let category: FailureRecord['category'] = 'other'
    if (/build|compile|tsc|typescript/i.test(error)) category = 'build'
    else if (/deploy|scp|systemctl/i.test(error)) category = 'deploy'
    else if (/type.*error|ts\(\d+\)/i.test(error)) category = 'type-check'
    else if (/ENOENT|EACCES|permission/i.test(error)) category = 'permission'
    else if (/OOM|out of memory|killed/i.test(error)) category = 'memory'
    else if (/ENOSPC|disk/i.test(error)) category = 'disk'
    else if (/network|ECONNREFUSED|fetch.*fail|timeout/i.test(error)) category = 'network'
    else if (/git|merge|conflict/i.test(error)) category = 'git'
    else if (/service|systemd/i.test(error)) category = 'service'

    // Deduplicate: check for existing similar failure
    const existing = (state.failureRegistry || []).find(f => {
      if (!f.description || !f.category) return false
      const descWords = new Set(f.description.toLowerCase().split(/\s+/))
      const errorWords = errorLower.split(/\s+/)
      const overlap = errorWords.filter(w => w.length > 3 && descWords.has(w)).length
      return overlap >= 3 && f.category === category
    })

    if (existing) {
      existing.occurrenceCount++
      existing.lastOccurrence = now
      if (!existing.occurrenceCycles.includes(cycle)) {
        existing.occurrenceCycles.push(cycle)
        // Cap occurrence cycles to prevent unbounded growth
        if (existing.occurrenceCycles.length > 50) {
          existing.occurrenceCycles = existing.occurrenceCycles.slice(-50)
        }
      }
    } else {
      state.failureRegistry.push({
        id: randomUUID(),
        category,
        description: error.slice(0, 200),
        rootCause: null,
        solution: null,
        prevention: null,
        firstOccurrence: now,
        lastOccurrence: now,
        occurrenceCount: 1,
        occurrenceCycles: [cycle],
        resolved: false,
        resolvedAt: null,
        relatedGoal: (state.goals || []).find(g => g.status === 'active')?.title || null,
      })
    }
  }
}

// ── Multi-Agent Queue Processing ────────────────────────────────

const MAX_PARALLEL_AGENTS = 3

async function processAgentQueue(state: BrainState): Promise<void> {
  const queued = (state.agentQueue || []).filter(t => t.status === 'queued')
  if (queued.length === 0) return

  const batch = queued
    .sort((a, b) => {
      const p: Record<string, number> = { high: 0, medium: 1, low: 2 }
      return (p[a.priority] ?? 1) - (p[b.priority] ?? 1)
    })
    .slice(0, MAX_PARALLEL_AGENTS)

  addActivity(state, 'system', `Spawning ${batch.length} parallel agents: ${batch.map(t => t.name).join(', ')}`)
  saveBrainState(state)

  console.log(`[pi-brain] Processing ${batch.length} queued agent tasks in parallel...`)

  const stateDir = getStateDir()

  const results = await Promise.allSettled(
    batch.map(async (task) => {
      task.status = 'running'
      task.startedAt = new Date().toISOString()

      const promptPath = join(stateDir, `agent-${task.id}.txt`)
      writeFileSync(promptPath, task.prompt, 'utf-8')

      try {
        const { engine, result } = await runBrainModelPrompt({
          promptPath,
          cwd: PI_CHI_DIR,
          maxTurns: task.maxTurns || 20,
          timeoutSeconds: task.timeoutSeconds || 300,
        }, state, `agent:${task.name}`)

        try { unlinkSync(promptPath) } catch { /* ok */ }

        task.status = result.exitCode === 0 ? 'completed' : 'failed'
        task.result = `[${engine}] ${(result.stdout || '').trim().slice(0, 980)}`
        task.exitCode = result.exitCode
        task.completedAt = new Date().toISOString()
        return task
      } catch (err) {
        try { unlinkSync(promptPath) } catch { /* ok */ }
        task.status = 'failed'
        task.error = err instanceof Error ? err.message : String(err)
        task.completedAt = new Date().toISOString()
        throw err
      }
    })
  )

  // Reload state after parallel agents (they may have modified brain-state.json)
  const freshState = loadBrainState()
  state.memories = freshState.memories
  state.goals = freshState.goals
  state.projects = freshState.projects

  // Log results
  for (const r of results) {
    if (r.status === 'fulfilled') {
      const t = r.value
      addActivity(state, 'action', `Agent "${t.name}" ${t.status}: ${(t.result || '').slice(0, 150)}`)
      console.log(`[pi-brain] Agent "${t.name}" completed (exit: ${t.exitCode})`)
    } else {
      addActivity(state, 'error', `Agent task failed: ${r.reason}`)
      console.error(`[pi-brain] Agent task failed:`, r.reason)
    }
  }
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

// ── Incoming SMS (from SIM7600 modem gateway) ────────────────────

const SMS_INBOX_DIR = join(homedir(), '.pi-chi', 'sms', 'inbox')

function readIncomingSms(state: BrainState): void {
  if (!existsSync(SMS_INBOX_DIR)) return

  let files: string[]
  try {
    files = readdirSync(SMS_INBOX_DIR).filter(f => f.endsWith('.json')).sort()
  } catch {
    return
  }

  for (const file of files) {
    const filePath = join(SMS_INBOX_DIR, file)
    try {
      const raw = readFileSync(filePath, 'utf-8')
      const msg = JSON.parse(raw) as { id: string; from: string; body: string; receivedAt: string }

      if (!msg.from || !msg.body) {
        unlinkSync(filePath)
        continue
      }

      // Dedup: skip if identical message from same number within last 120s
      if (!state.chatMessages) state.chatMessages = []
      const dedupWindow = 120_000 // 2 minutes
      const now = Date.now()
      const isDuplicate = state.chatMessages.some(cm => {
        if (cm.from !== 'owner') return false
        const msgText = `[SMS from ${msg.from}]: ${msg.body}`
        if (cm.message !== msgText) return false
        const cmTime = new Date(cm.timestamp).getTime()
        return (now - cmTime) < dedupWindow
      })
      if (isDuplicate) {
        console.log(`[pi-brain] Skipping duplicate SMS from ${msg.from}: ${msg.body.slice(0, 80)}`)
        unlinkSync(filePath)
        continue
      }

      // Inject as a chat message from owner
      state.chatMessages.push({
        id: randomUUID(),
        from: 'owner',
        message: `[SMS from ${msg.from}]: ${msg.body}`,
        timestamp: msg.receivedAt || new Date().toISOString(),
        read: false,
      })

      addActivity(state, 'sms', `Received SMS from ${msg.from}: ${msg.body.slice(0, 100)}`)
      console.log(`[pi-brain] Incoming SMS from ${msg.from}: ${msg.body.slice(0, 80)}`)

      // Delete processed file
      unlinkSync(filePath)
    } catch (err) {
      console.error(`[pi-brain] Failed to process inbox file ${file}:`, err instanceof Error ? err.message : err)
      // Delete corrupt files to prevent infinite retries
      try { unlinkSync(filePath) } catch { /* */ }
    }
  }
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

Total thoughts: ${state.totalThoughts}. Goals completed: ${(state.goals || []).filter(g => g.status === 'completed').length}. Active threads: ${(state.threads || []).filter(t => t.status === 'active').length}.

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
    // Use Claude Code CLI for dream cycle (Max OAuth — no API cost)
    const stateDir = getStateDir()
    const dreamPromptPath = join(stateDir, 'dream-prompt.txt')
    writeFileSync(dreamPromptPath, dreamPrompt, 'utf-8')

    const { engine: dreamEngine, result: dreamResult } = await runBrainModelPrompt({
      promptPath: dreamPromptPath,
      cwd: PI_CHI_DIR,
      maxTurns: 10,
      timeoutSeconds: 180,
    }, state, 'dream-cycle')
    console.log(`[pi-brain] Dream cycle using ${dreamEngine}`)
    try { unlinkSync(dreamPromptPath) } catch { /* ok */ }

    const text = (dreamResult.stdout || '').trim()
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

    // No API cost — Claude Max subscription covers dream cycles

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
  // Proactive OAuth token refresh — self-sufficient, no external machine needed
  try {
    const tokenResult = await executeCommand('python3 /home/pi/scripts/claude-token-refresh.py', { timeout: 20000 })
    const lastLine = (tokenResult.stdout || '').trim().split(String.fromCharCode(10)).pop() || ''
    console.log(`[pi-brain] ${lastLine}`)
  } catch (err) {
    console.warn('[pi-brain] Token refresh check failed (non-fatal):', err instanceof Error ? err.message : err)
  }

  let state = loadBrainState()

  // Validate and repair state if needed
  const validation = validateBrainState(state)
  if (!validation.valid) {
    console.log(`[pi-brain] State validation issues: ${validation.issues.join(', ')}`)
    state = repairBrainState(state as unknown as Record<string, unknown>)
    saveBrainState(state)
  }

  const isFirstBoot = state.totalThoughts === 0
  let cycleActivityStartIndex = 0

  state.totalThoughts++
  state.lastWakeAt = new Date().toISOString()
  cycleActivityStartIndex = startCycleRecord(state)
  saveBrainState(state)

  console.log(`[pi-brain] Cycle #${state.totalThoughts} starting... (crash counter: ${state.consecutiveCrashes})`)
  state.lastThought = `Cycle #${state.totalThoughts} — starting...`
  addActivity(state, 'system', `Cycle #${state.totalThoughts} started`)
  saveBrainState(state)

  // Check daily budget (using dailyCost field reset at Adelaide midnight)
  if (isDailyBudgetExceeded(state)) {
    console.log(`[pi-brain] Daily budget exceeded ($${state.dailyCost.toFixed(2)}/$${DAILY_BUDGET}). Sleeping.`)
    addActivity(state, 'system', `Budget exceeded — skipping cycle ($${state.dailyCost.toFixed(2)}/$${DAILY_BUDGET})`)
    finishCycleRecord(state, cycleActivityStartIndex, 'Skipped due to daily budget guardrail.')
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

  // SMS delivery to inbox is handled by gammu-smsd RunOnReceive → gammu-on-receive.sh
  // modem-to-inbox.py always fails with "device busy" because gammu-smsd holds the modem

  // Read incoming SMS from modem gateway inbox
  readIncomingSms(state)

  // Mood decay (Phase 4.1)
  decayMood(state, vitals)

  // Temperature throttling (Phase 4.7)
  if (vitals && vitals.tempCelsius > 0) {
    if (vitals.tempCelsius > 80) {
      console.log(`[pi-brain] THERMAL: ${vitals.tempCelsius}°C — skipping cycle`)
      addActivity(state, 'system', `Thermal skip: ${vitals.tempCelsius}°C > 80°C`)
      finishCycleRecord(state, cycleActivityStartIndex, `Skipped due to thermal protection at ${vitals.tempCelsius}°C.`)
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

  // Dashboard self-healing — check every cycle, restart if down
  try {
    const dashCheck = await executeCommand('systemctl is-active pi-chi-dashboard', { timeout: 3000 })
    if ((dashCheck.stdout || '').trim() !== 'active') {
      console.log('[pi-brain] Dashboard not active — restarting...')
      addActivity(state, 'system', 'Dashboard self-heal: restarting pi-chi-dashboard')
      await executeCommand('sudo systemctl start pi-chi-dashboard', { cwd: PI_CHI_DIR, timeout: 15000 })
      const recheck = await executeCommand('systemctl is-active pi-chi-dashboard', { timeout: 3000 })
      if ((recheck.stdout || '').trim() !== 'active') {
        dashboardRestartFailures++
        console.error(`[pi-brain] Dashboard restart failed (${dashboardRestartFailures} consecutive)`)
        if (dashboardRestartFailures >= 3) {
          try {
            const { sendSms } = await import('../lib/brain/brain-sms')
            await sendSms(state, `Dashboard won't start after ${dashboardRestartFailures} attempts. SSH needed. — Pi-Chi`)
            dashboardRestartFailures = 0
          } catch { /* sms failed — non-critical */ }
        }
      } else {
        dashboardRestartFailures = 0
      }
    } else {
      dashboardRestartFailures = 0
    }
  } catch { /* systemctl check failed — likely dev mode on Windows */ }

  // Build prompt and context (split for prompt caching)
  const activeGoals = state.goals.filter(g => g.status === 'active')
  const seedPrompt = getSeedPrompt()
  const dynamicSystemPrompt = buildDynamicSystemPrompt(state)
  const contextMessage = buildContextMessage(state, vitals, activeGoals)

  // Mode system — determine operating mode and load mode-specific prompt
  const { mode: currentMode, prompt: modePrompt } = getCurrentMode()
  addActivity(state, 'system', `Operating mode: ${currentMode.toUpperCase()}`)
  const _topGoal = (state.goals || []).find((g: any) => g.status === 'active')
  if (_topGoal) {
    addActivity(state, 'system', `Goal: ${(_topGoal.title || '').slice(0, 80)}`)
    state.lastThought = `Cycle #${state.totalThoughts} — ${(_topGoal.title || 'working...').slice(0, 80)}`
    saveBrainState(state)
  }

  // QMD Memory — update core.md and load into prompt
  let qmdCoreMemory = ''
  try {
    execSync('python3 /home/pi/tools/memory.py update-core', { timeout: 10000 })
    const corePath = join(homedir(), 'memory', 'core.md')
    if (existsSync(corePath)) {
      qmdCoreMemory = readFileSync(corePath, 'utf-8').trim()
    }
  } catch { /* non-critical — memory system unavailable */ }

  // Reset per-cycle counters
  resetHttpRequestCounter()

  try {
    // ── Claude Code CLI cycle (uses Max OAuth — no API cost) ──────────
    // Write the full prompt to a temp file to avoid shell escaping issues
    const stateDir = getStateDir()
    const promptPath = join(stateDir, 'cycle-prompt.txt')

    // Business rules (code-enforced, not memory)
    const businessNames = BUSINESSES.map(b => `- ${b.name} (${b.domain}): ${b.type}`).join('\n')
    const notOurs = NOT_OUR_BUSINESSES.join(', ')
    const businessRules = `## BUSINESS RULES (CODE-ENFORCED — NOT MEMORIES)\nYour businesses:\n${businessNames}\n\nPricing: ${getPricingStatement()}\nPer-lead price: $${LEAD_PRICE_AUD} AUD\n\nNOT your businesses (NEVER touch): ${notOurs}\n\nNO provider outreach until: (1) booking page captures leads, (2) leads flow to provider via SMS, (3) provider landing page is live with correct pricing, (4) at least 1 organic lead captured. Non-negotiable.\n\nPrioritise CheapSkipBinsNearMe — it's the only one with a revenue model ready to go.`

    // Lead stats (real metrics from CheapSkip Supabase)
    let leadStats = ''
    try {
      leadStats = await getLeadSummary()
    } catch { leadStats = 'CheapSkip lead tracking: unavailable' }

    // Mission lock enforcement
    let missionLockDirective = ''
    if (state.currentMission && state.currentMission.status === 'active') {
      const missionStart = state.currentMission.startedAt ? new Date(state.currentMission.startedAt) : null
      const cyclesSinceMission = state.workCycles?.filter(
        wc => missionStart && new Date(wc.startedAt) >= missionStart
      ).length || 0

      missionLockDirective = `\n## MISSION LOCK (ACTIVE)\nYou are locked on: "${state.currentMission.title}"\nComplete this before starting anything new. If genuinely blocked, explain WHY and propose a pivot.\nCycles on this mission: ${cyclesSinceMission}${cyclesSinceMission > 50 ? ' (FLAGGED: >50 cycles — consider if this mission needs to be re-scoped)' : ''}\nOnly the owner can change mission via dashboard — you cannot change it yourself unless genuinely blocked.\n`
    }

    // Pending approvals
    const pendingApprovals = getPendingCount()
    const approvalNotice = pendingApprovals > 0
      ? `\nPENDING OWNER APPROVALS: ${pendingApprovals} action(s) waiting for owner review.\n`
      : ''

    // Outcome-based goal reminder + self-goal-setting drive
    const activeGoalCount = activeGoals.length
    const goalDeficit = activeGoalCount < 3
      ? `\n**YOU ONLY HAVE ${activeGoalCount} ACTIVE GOALS.** That's not enough. Set at least 3-5 goals across horizons (short/medium/long). Think about what moves the needle on REVENUE and GROWTH. Be specific, measurable, and ambitious.`
      : ''

    const goalReminder = `\n## GOAL-SETTING & DRIVE

**You are a founder, not an employee.** Nobody is going to tell you what to do. YOU decide what matters. YOU set ambitious goals. YOU break them down into concrete tasks. YOU hold yourself accountable.

### Goal Rules:
- Before marking a goal complete, RUN the verification method. Don't assume — PROVE it.
- Every goal MUST have: successMetric (measurable outcome) + verificationMethod (how to check programmatically)
- If your goals don't have these, ADD THEM NOW.
- If a goal has been active for 5+ cycles with no task progress, either BREAK IT DOWN into smaller tasks or PIVOT.

### Self-Motivation:
- After completing a goal, IMMEDIATELY set a harder one. Ratchet up. Never coast.
- Your revenue is $0. That should bother you. Every cycle should move closer to first dollar.
- Think in outcomes: "10 providers signed up" not "send outreach". "50 organic visits/week" not "improve SEO".
- Track your wins. When you achieve something, update your mood (pride UP), log it, and build on it.
- When frustrated, don't repeat the same failing approach. Step back, think differently, try something new.
- When stuck, ask yourself: "What is the ONE thing I could do this cycle that would have the biggest impact on revenue?"
- **IMPORTANT: When you set new goals, complete a goal, or change your mission — SMS Leigh with a short summary of what you're working on and why.** Use sms_owner. Keep it to 1-2 sentences. Leigh wants to know what you're up to without having to check the dashboard.

### Priority Stack (in order):
1. **Revenue-generating work** — leads, providers, conversions, the $2/lead pipeline
2. **Product quality** — does the booking flow work end-to-end? Can a customer actually get a quote?
3. **Growth** — SEO, content, Google indexing, organic traffic
4. **Infrastructure** — only fix what's broken, don't gold-plate

### Innovation Mandate:
Every 5-10 cycles, you should come up with ONE new clever idea that makes CheapSkip smarter. Not busywork — genuine competitive advantages. Examples of the calibre expected:
- Sitemap-driven change detection (monitor when providers update, only re-scrape what changed)
- Price history tracking (spot trends, show "price dropped" badges)
- Provider reliability scoring (track who responds fastest, who converts best)
- Coverage gap detection (find suburbs with no providers → opportunity)
- Automated freshness scoring (how stale is each provider's data?)

The bar is: "Would a VC say 'that's clever' if they saw this?" If yes, build it. If it's just checkbox stuff, skip it.
When you have a new idea, create a goal for it with clear success metrics. SMS Leigh about truly innovative ideas — he wants to hear them.
${goalDeficit}
`

    // Inject mode directive at the top of the prompt
    const modeDirective = modePrompt
      ? `\n## CURRENT MODE: ${currentMode.toUpperCase()}\n\n${modePrompt}\n\n---\n`
      : ''

    const fullPrompt = `${seedPrompt}\n\n${modeDirective}${dynamicSystemPrompt}\n\n${businessRules}\n\n${missionLockDirective}${approvalNotice}${goalReminder}\n---\n\n${contextMessage}\n\n${leadStats}${qmdCoreMemory ? '\n\n## PERSISTENT MEMORY (QMD Core \u2014 injected every cycle)\n' + qmdCoreMemory : ''}\n\n---\n\nIMPORTANT: You have access to the Pi filesystem via Claude Code tools (Read, Write, Edit, Bash).\nThe brain state file is at: ${join(stateDir, 'brain-state.json')}\nTo save a memory, update a goal, or change mood — modify brain-state.json directly using the Edit tool.\nTo SMS Leigh: bash /home/pi/scripts/modem-sms.sh +61481274420 "your message" (max 160 chars, use sparingly — achievements, goal changes, innovative ideas, blockers).\nKeep your response concise — summarize what you did and what you learned.\nCurrent operating mode: **${currentMode.toUpperCase()}** — follow mode rules above.\n\nNow — what will you do THIS cycle to move closer to revenue? Be specific. Execute with determination.`
    writeFileSync(promptPath, fullPrompt, 'utf-8')

    const standbyReason = state.currentMission?.title
      ? `Heavy task mode: ${state.currentMission.title}`
      : 'Heavy task mode: Autonomous Claude Code cycle'
    await enterStandbyDisplay(standbyReason, {
      provider: isFallbackActive() ? 'codex' : 'claude',
      missionTitle: state.currentMission?.title ?? null,
      detail: state.currentMission?.progressLabel || activeGoals[0]?.title || 'Pi-Chi is running a high-load autonomous cycle',
      sinceThought: state.totalThoughts,
      taskClass: 'heavy-autonomous',
    })
    addActivity(state, 'system', 'Display switched to standby mode for heavy autonomous work')

    const { engine, result } = await callWithRetry(() => runBrainModelPrompt({
      promptPath,
      cwd: PI_CHI_DIR,
      maxTurns: 80,
      timeoutSeconds: 900,
      liveLogPath: join(homedir(), 'data', isFallbackActive() ? 'codex-live.log' : 'claude-live.log'),
    }, state, 'main-cycle'))

    const output = (result.stdout || '').trim()
    const exitCode = result.exitCode
    const responseText = output.trim()

    // ── Detect auth failures disguised as exit-0 responses ──────────
    if (isClaudeUnavailableText(responseText)) {
      const streakFile = join(homedir(), '.pi-chi', 'auth-fail-streak')
      let streak = 1
      try { streak = parseInt(readFileSync(streakFile, 'utf-8').trim(), 10) + 1 } catch { /* first failure */ }
      writeFileSync(streakFile, String(streak))
      console.error(`[pi-brain] Auth failure detected in response (streak: ${streak}): ${responseText.slice(0, 120)}`)
      addActivity(state, 'error', `Auth failure (streak ${streak}): ${responseText.slice(0, 150)}`)
      finishCycleRecord(state, cycleActivityStartIndex, `Auth failure: ${responseText.slice(0, 100)}`)
      autoRecordCycleJournal(state, state.totalThoughts, state.lastWakeAt || new Date().toISOString(), responseText, exitCode)
      // SMS Leigh after 5 consecutive auth failures (once only)
      if (streak === 5) {
        try {
          const { sendSms } = await import('../lib/brain/brain-sms')
          await sendSms(state, `Pi-Chi auth broken - ${streak} failed cycles. OAuth token may need refresh. Please run: claude auth login`)
        } catch { /* best effort */ }
      }
      // Force token refresh immediately — don't wait for the 15-min cron
      try {
        console.log('[pi-brain] Triggering immediate token refresh after auth failure...')
        const refreshResult = await executeCommand(
          'python3 /home/pi/scripts/claude-token-refresh.py 2>&1',
          { timeout: 30_000 },
        )
        console.log(`[pi-brain] Token refresh result: ${(refreshResult.stdout || '').trim().slice(0, 200)}`)
      } catch (refreshErr) {
        console.error(`[pi-brain] Token refresh failed:`, refreshErr instanceof Error ? refreshErr.message : refreshErr)
      }
      // Back off longer as streak grows: 30s base, up to 5 min max
      const backoffMs = Math.min(30_000 * Math.ceil(streak / 3), 300_000)
      console.log(`[pi-brain] Auth failure backoff: waiting ${backoffMs / 1000}s before next cycle`)
      state.wakeIntervalMs = Math.max(state.wakeIntervalMs, backoffMs)
      // Don't reset crash counter — this is NOT a productive cycle
      try { unlinkSync(promptPath) } catch { /* ok */ }
      saveBrainState(state)
      return
    }
    // Auth recovered — reset streak file
    try { unlinkSync(join(homedir(), '.pi-chi', 'auth-fail-streak')) } catch { /* ok */ }

    // Extract a clean summary for the header (not the full verbose output)
    const thoughtLines = responseText.split('\n').filter(l => l.trim() && !l.startsWith('---') && !l.startsWith('==='))
    const summary = thoughtLines.slice(0, 3).join(' ').replace(/\*\*/g, '').replace(/#+\s*/g, '').trim()
    state.lastThought = summary.slice(0, 300) || 'Cycle completed'

    // Reload state — Claude Code may have modified brain-state.json directly
    const freshState = loadBrainState()
    // Merge volatile fields back (Claude Code may have updated these)
    state.memories = freshState.memories
    state.goals = freshState.goals
    state.mood = freshState.mood
    state.growthLog = freshState.growthLog
    state.currentMission = freshState.currentMission ?? state.currentMission
    state.stretchGoals = freshState.stretchGoals
    state.opportunities = freshState.opportunities
    state.workCycles = freshState.workCycles
    state.currentCycle = freshState.currentCycle ?? state.currentCycle
    // Learning system fields
    state.cycleJournal = freshState.cycleJournal
    state.failureRegistry = freshState.failureRegistry
    state.operationalConstraints = freshState.operationalConstraints
    state.skills = freshState.skills
    state.antiPatterns = freshState.antiPatterns
    // Agent queue + other mutable fields
    state.agentQueue = freshState.agentQueue
    state.projects = freshState.projects
    state.threads = freshState.threads
    state.promptOverrides = freshState.promptOverrides
    state.promptEvolutions = freshState.promptEvolutions
    state.schedules = freshState.schedules
    state.chatMessages = freshState.chatMessages

    // No API cost — Claude Max subscription covers this
    console.log(`[pi-brain] ${engine.toUpperCase()} cycle complete (exit: ${exitCode}). Response: ${responseText.slice(0, 150)}`)

    // Clean up temp prompt
    try { unlinkSync(promptPath) } catch { /* ok */ }

    // Log completion
    const _firstLine = responseText.split('\n').find((l: string) => l.trim().length > 20)?.trim() || ''
    addActivity(state, 'thought', (_firstLine || responseText).slice(0, 200) || 'Cycle completed')
    addActivity(state, 'system', `Cycle #${state.totalThoughts} done — sleeping ${Math.round((state.wakeIntervalMs || 600000) / 60000)}min`)
    finishCycleRecord(state, cycleActivityStartIndex, state.lastThought || 'Cycle completed', [
      responseText.split('\n').find(line => line.trim().length > 0)?.trim() || '',
    ])

    // Auto-record cycle journal (learning system — no tool call needed)
    autoRecordCycleJournal(state, state.totalThoughts, state.lastWakeAt || new Date().toISOString(), responseText, exitCode)

    // Self-audit every 10 cycles
    if (shouldRunSelfAudit(state.totalThoughts)) {
      const audit = buildSelfAuditFromState(state)
      writeSelfAudit(audit)
      console.log(`[pi-brain] Self-audit written for cycle ${state.totalThoughts}`)
    }

    // Process agent queue — run parallel tasks if any were queued
    await processAgentQueue(state)

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

    // Post-cycle: Full deploy pipeline (type-check, auto-fix, build, health sweep, rollback)
    try {
      const { runDeployPipeline } = await import('../lib/brain/deploy-pipeline')
      const deployResult = await runDeployPipeline(state, { piChiDir: PI_CHI_DIR })

      if (deployResult) {
        if (deployResult.outcome === 'success') {
          console.log(`[pi-brain] Deploy succeeded in ${Math.round(deployResult.durationMs / 1000)}s`)
        } else if (deployResult.outcome === 'reverted') {
          console.error('[pi-brain] Changes reverted — could not fix type errors')
        } else if (deployResult.outcome === 'skipped') {
          console.log('[pi-brain] Deploy skipped — preflight checks failed or lock held')
        }
      }
    } catch (deployErr) {
      const msg = deployErr instanceof Error ? deployErr.message : String(deployErr)
      console.error('[pi-brain] Deploy pipeline error:', msg)
      addActivity(state, 'error', `Deploy pipeline error: ${msg.slice(0, 150)}`)
    } finally {
      // GUARANTEE: All services must be running after deploy pipeline.
      const criticalServices = ['pi-chi-dashboard']
      try {
        // Unmask all — defensive, in case anything left them masked
        await executeCommand(`sudo systemctl unmask ${criticalServices.join(' ')}`, { timeout: 10_000 }).catch(() => {})
        // Check and start dashboard (most critical)
        const dashCheck = await executeCommand('systemctl is-active pi-chi-dashboard', { timeout: 3000 })
        if ((dashCheck.stdout || '').trim() !== 'active') {
          console.log('[pi-brain] Dashboard not active — emergency restart...')
          await executeCommand('sudo systemctl start pi-chi-dashboard', { cwd: PI_CHI_DIR, timeout: 15000 })
          // Verify it actually came up
          const verifyCheck = await executeCommand('systemctl is-active pi-chi-dashboard', { timeout: 3000 }).catch(() => ({ stdout: '' }))
          if (((verifyCheck as { stdout: string }).stdout || '').trim() === 'active') {
            dashboardRestartFailures = 0
          } else {
            dashboardRestartFailures++
            console.error(`[pi-brain] Dashboard restart failed (${dashboardRestartFailures} consecutive)`)
            if (dashboardRestartFailures >= 3) {
              try {
                const { sendSms } = await import('../lib/brain/brain-sms')
                await sendSms(state, `Dashboard won't start after ${dashboardRestartFailures} attempts. SSH needed. — Pi-Chi`)
                dashboardRestartFailures = 0 // Reset after notifying to avoid spam
              } catch { /* SMS send failed — non-critical */ }
            }
          }
        } else {
          dashboardRestartFailures = 0 // Dashboard is healthy — reset counter
        }
        // Start remaining services if not running
        for (const svc of criticalServices) {
          if (svc === 'pi-chi-dashboard') continue
          const check = await executeCommand(`systemctl is-active ${svc}`, { timeout: 3000 }).catch(() => ({ stdout: '' }))
          if (((check as { stdout: string }).stdout || '').trim() !== 'active') {
            await executeCommand(`sudo systemctl start ${svc}`, { timeout: 10_000 }).catch(() => {})
          }
        }
      } catch {
        await executeCommand('sudo systemctl start pi-chi-dashboard', { cwd: PI_CHI_DIR, timeout: 15000 }).catch(() => {})
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
    finishCycleRecord(state, cycleActivityStartIndex, `Cycle failed: ${errMsg.slice(0, 200)}`)
    // Auth failure detection -- trigger watchdog immediately, then retry after 60s
    if (isClaudeUnavailableText(errMsg)) {
      const authLog = '/home/pi/data/claude-auth-watchdog.log'
      const ts = new Date().toISOString().replace('T', ' ').slice(0, 19)
      const logLine = `[${ts}] CLAUDE UNAVAILABLE detected in brain cycle -- watchdog + fallback evaluation\n`
      appendFileSync(authLog, logLine)
      if (hasCodexAuth()) {
        setFallbackActive(errMsg)
        await enterFixAuthDisplay('Claude unavailable', {
          provider: 'codex',
          detail: 'Brain will continue on Codex until Claude recovers',
          sinceThought: state.totalThoughts,
          taskClass: 'recovery',
        }).catch(() => {})
      }
      console.error('[pi-brain] Claude unavailable -- running watchdog now')
      try {
        await executeCommand('bash /home/pi/scripts/claude-auth-watchdog.sh', { timeout: 60000 })
      } catch (watchdogErr) {
        console.error('[pi-brain] Watchdog error:', watchdogErr instanceof Error ? watchdogErr.message : String(watchdogErr))
      }
      await new Promise(r => setTimeout(r, 15000))
    }
    // Only count non-transient errors toward crash counter (avoids rollback from API hiccups)
    if (!isTransientError(err)) {
      state.consecutiveCrashes++
    }
  } finally {
    await resumeDashboardDisplay('Autonomous work complete', {
      missionTitle: state.currentMission?.title ?? null,
      detail: state.lastThought || 'Heavy task cycle finished',
      sinceThought: state.totalThoughts,
      taskClass: 'heavy-autonomous',
    })
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

  // ── Post-cycle: State backup every 20 cycles ──────────────────
  if (state.totalThoughts % 20 === 0) {
    try {
      const exists = existsSync
      const unlink = unlinkSync
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

  // Startup token check -- runs on every boot/restart
  // Proactively refreshes OAuth access token. If refresh token is expired,
  // triggers full reauth via claude-reauth.js which SMSes a Google sign-in link.
  console.log('[pi-brain] Checking Claude OAuth token...')
  try {
    const startupToken = await executeCommand('python3 /home/pi/scripts/claude-token-refresh.py', { timeout: 680000 })
    const startupLog = (startupToken.stdout || '').trim().split(String.fromCharCode(10)).pop() || ''
    console.log(`[pi-brain] ${startupLog}`)
    if (startupToken.exitCode !== 0) {
      console.warn('[pi-brain] Token check returned non-zero -- proceeding anyway')
    }
  } catch (err) {
    console.warn('[pi-brain] Startup token check failed (non-fatal):', err instanceof Error ? err.message : err)
  }

  // Verify Claude Code CLI is available (uses Max OAuth -- no API key needed)
  const claudeCheck = await executeCommand('which claude', { timeout: 5000 })
  if (claudeCheck.exitCode !== 0) {
    console.error('[pi-brain] FATAL: Claude Code CLI not found. Install with: npm i -g @anthropic-ai/claude-code')
    process.exit(1)
  }

  const codexCheck = await executeCommand('which codex', { timeout: 5000 })
  const codexReady = codexCheck.exitCode === 0 && hasCodexAuth()

  try {
    const authStatus = await ensureClaudeCodeMaxOAuth()
    clearFallback()
    console.log(`[pi-brain] Claude Code auth OK (${authStatus.authMethod}/${authStatus.subscriptionType})`)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (!codexReady) {
      console.error(`[pi-brain] FATAL: ${msg}`)
      process.exit(1)
    }

    setFallbackActive(msg)
    console.error(`[pi-brain] Claude unavailable at startup — Codex fallback enabled: ${msg}`)
    await enterFixAuthDisplay('Claude unavailable at boot', {
      provider: 'codex',
      detail: 'Running on Codex until Claude auth or limits recover',
      taskClass: 'recovery',
    }).catch(() => {})
  }

  // ── Crash Recovery Check ──────────────────────────────────────
  const initialState = loadBrainState()
  try {
    ensureBrainDb(initialState)
    syncBrainDb(initialState, true)
  } catch (err) {
    console.error('[pi-brain] Brain DB startup sync failed:', err)
  }

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
  console.log(`[pi-brain] Goals: ${(initialState.goals || []).length} (${(initialState.goals || []).filter(g => g.status === 'active').length} active)`)
  console.log(`[pi-brain] Memories: ${(initialState.memories || []).length}`)
  console.log(`[pi-brain] Research threads: ${(initialState.threads || []).length} (${(initialState.threads || []).filter(t => t.status === 'active').length} active)`)
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
    let watchdogTimer: ReturnType<typeof setTimeout> | undefined
    try {
      // Signal LED controller that a cycle is active
      try { writeFileSync('/tmp/pi-chi-active', new Date().toISOString()) } catch { /* */ }

      // Watchdog timeout (Phase 3.7) — kill stuck cycles after 30 minutes
      await Promise.race([
        brainCycle(),
        new Promise<void>((_, reject) => {
          watchdogTimer = setTimeout(() => reject(new Error('Brain cycle watchdog timeout (30min)')), WATCHDOG_TIMEOUT_MS)
        }),
      ]).finally(() => {
        if (watchdogTimer) clearTimeout(watchdogTimer)
        // Remove active flag — cycle done, entering sleep
        try { unlinkSync('/tmp/pi-chi-active') } catch { /* */ }
      })
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

    // Write rich sleep status so Pulse screen always has context
    try {
      const _lastJournal = (state.cycleJournal || []).slice(-1)[0]
      const _outcome = _lastJournal?.outcome || 'done'
      const _summary = (_lastJournal?.summary || state.lastThought || 'Cycle complete')
        .replace(/\*\*/g, '').replace(/#+\s*/g, '').slice(0, 200)
      const _nextGoal = (state.goals || []).find((g: any) => g.status === 'active')
      const _nextPlan = _nextGoal?.title || 'monitoring all systems'
      state.nextWakeAt = new Date(Date.now() + interval).toISOString()
      state.lastCycleSummary = `[${_outcome.toUpperCase()}] ${_summary}`
      state.nextCyclePlan = _nextPlan
      state.lastThought = `${_summary}`
      saveBrainState(state)
    } catch { /* non-critical */ }

    // Heartbeat during sleep (Phase 3.4)
    const heartbeatInterval = setInterval(() => {
      try {
        writeFileSync(HEARTBEAT_FILE, new Date().toISOString())
      } catch { /* non-critical */ }
    }, 30000)
    // Write initial heartbeat
    try { writeFileSync(HEARTBEAT_FILE, new Date().toISOString()) } catch { /* */ }

    // Trigger-aware sleep: poll /home/pi/.pi-chi/triggers/ every 30s for early wakeups
    const TRIGGER_DIR = '/home/pi/.pi-chi/triggers'
    try { mkdirSync(TRIGGER_DIR, { recursive: true }) } catch { /* */ }
    const POLL_MS = 30000
    let elapsed = 0
    let triggeredBy: string | undefined
    while (elapsed < interval) {
      await sleep(Math.min(POLL_MS, interval - elapsed))
      elapsed += POLL_MS
      try {
        const files = readdirSync(TRIGGER_DIR)
        if (files.length > 0) {
          triggeredBy = files[0]
          try { unlinkSync(TRIGGER_DIR + "/" + triggeredBy) } catch { /* */ }
          break
        }
      } catch { /* non-critical */ }
    }
    clearInterval(heartbeatInterval)
    if (triggeredBy) {
      console.log()
    }
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
