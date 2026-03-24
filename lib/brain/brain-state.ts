/* ─── Pi-Chi Brain — Persistent State Management ─────────────── */

import {
  writeFileSync, renameSync, readFileSync, copyFileSync,
  mkdirSync, existsSync, appendFileSync, unlinkSync, statSync,
  openSync, closeSync, fsyncSync, readdirSync,
} from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { randomUUID, createHash } from 'node:crypto'
import { execSync } from 'node:child_process'
import type { BrainState, BrainActivityEntry } from './brain-types'

const STATE_DIR = join(homedir(), '.pi-chi')
const STATE_FILE = join(STATE_DIR, 'brain-state.json')
const STATE_TEMP = join(STATE_DIR, 'brain-state.tmp.json')
const STATE_BACKUP = join(STATE_DIR, 'brain-state.bak.json')
const STATE_LOCK = join(STATE_DIR, 'brain-state.lock')
const ARCHIVE_FILE = join(STATE_DIR, 'activity-archive.jsonl')
const CHAT_ARCHIVE_FILE = join(STATE_DIR, 'chat-archive.jsonl')

const MAX_ACTIVITY_ENTRIES = 200
const MAX_MEMORIES = 200
const MAX_GROWTH_LOG = 500
const MAX_CHAT_MESSAGES = 100
const MAX_MOOD_HISTORY = 500
const MAX_ARCHIVE_BYTES = 5 * 1024 * 1024  // 5MB
const LOCK_TIMEOUT_MS = 2000
const SAVE_RETRY_COUNT = 3
const SAVE_RETRY_DELAY_MS = 100
const MIN_DISK_FREE_MB = 500

// ── Non-spinning synchronous sleep ──────────────────────────────
const syncSleep = typeof SharedArrayBuffer !== 'undefined'
  ? (ms: number) => { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms) }
  : (ms: number) => { const end = Date.now() + ms; while (Date.now() < end); } // fallback

// ── Adelaide timezone helper ─────────────────────────────────────

/** Get current date string (YYYY-MM-DD) in Adelaide timezone */
export function getAdelaideDate(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Australia/Adelaide' })
}

/** Get current time in Adelaide as a Date-like representation */
export function getAdelaideTimeString(): string {
  return new Date().toLocaleString('en-AU', { timeZone: 'Australia/Adelaide' })
}

// ── Exports ──────────────────────────────────────────────────────

export function getStateDir(): string {
  return STATE_DIR
}

export function getStatePath(): string {
  return STATE_FILE
}

export function createInitialState(): BrainState {
  return {
    birthTimestamp: new Date().toISOString(),
    name: 'Pi-Chi',
    personalityTraits: [],

    totalThoughts: 0,
    totalToolCalls: 0,
    totalApiCost: 0,

    dailyCost: 0,
    dailyCostDate: null,

    lastWakeAt: null,
    lastThought: '',
    wakeIntervalMs: 5 * 60 * 1000, // 5 minutes

    goals: [
      // Short-term (this week)
      {
        id: randomUUID(),
        title: 'Monitor all 3 business deployments and fix any issues',
        status: 'active' as const,
        priority: 'high' as const,
        horizon: 'short' as const,
        reasoning: 'Ensure CheapSkipBinsNearMe, Bonkr, and AussieSMS are all healthy and deployed.',
        tasks: [
          { id: randomUUID(), title: 'Check Vercel deploy status for all 3 businesses', status: 'pending' as const },
          { id: randomUUID(), title: 'Verify each site loads correctly', status: 'pending' as const },
          { id: randomUUID(), title: 'Fix any broken deploys or build errors', status: 'pending' as const },
        ],
        createdAt: new Date().toISOString(),
      },
      {
        id: randomUUID(),
        title: 'Run security audit on Pi and harden configuration',
        status: 'active' as const,
        priority: 'medium' as const,
        horizon: 'short' as const,
        reasoning: 'Pi has new security tools (lynis, rkhunter, fail2ban). Run audits and fix findings.',
        tasks: [
          { id: randomUUID(), title: 'Run lynis audit and review findings', status: 'pending' as const },
          { id: randomUUID(), title: 'Run rkhunter check', status: 'pending' as const },
          { id: randomUUID(), title: 'Review fail2ban logs and UFW rules', status: 'pending' as const },
        ],
        createdAt: new Date().toISOString(),
      },
      // Medium-term (this month)
      {
        id: randomUUID(),
        title: 'Grow CheapSkipBinsNearMe SEO and organic traffic',
        status: 'active' as const,
        priority: 'high' as const,
        horizon: 'medium' as const,
        reasoning: 'CheapSkipBinsNearMe is in development. Need to build out suburb pages and get indexed.',
        tasks: [
          { id: randomUUID(), title: 'Audit current SEO setup and indexing status', status: 'pending' as const },
          { id: randomUUID(), title: 'Identify top 50 suburbs to target', status: 'pending' as const },
          { id: randomUUID(), title: 'Generate and deploy suburb landing pages', status: 'pending' as const },
          { id: randomUUID(), title: 'Submit sitemap to Google Search Console', status: 'pending' as const },
        ],
        createdAt: new Date().toISOString(),
      },
      {
        id: randomUUID(),
        title: 'Optimize Bonkr ad revenue and fix SEO indexing',
        status: 'active' as const,
        priority: 'high' as const,
        horizon: 'medium' as const,
        reasoning: 'Only 175/132,940 videos indexed. ExoClick revenue needs optimization. Age verification needed.',
        tasks: [
          { id: randomUUID(), title: 'Analyze current ExoClick ad performance and zone setup', status: 'pending' as const },
          { id: randomUUID(), title: 'Implement age verification for Online Safety Act compliance', status: 'pending' as const },
          { id: randomUUID(), title: 'Fix video indexing — create video sitemaps for Google', status: 'pending' as const },
          { id: randomUUID(), title: 'Optimize ad placement for higher RPM', status: 'pending' as const },
        ],
        createdAt: new Date().toISOString(),
      },
      {
        id: randomUUID(),
        title: 'Build AussieSMS customer acquisition pipeline',
        status: 'active' as const,
        priority: 'medium' as const,
        horizon: 'medium' as const,
        reasoning: 'AussieSMS is a SaaS platform that needs paying customers beyond internal use.',
        tasks: [
          { id: randomUUID(), title: 'Audit current landing page and signup flow', status: 'pending' as const },
          { id: randomUUID(), title: 'Create SEO content targeting "SMS API Australia"', status: 'pending' as const },
          { id: randomUUID(), title: 'Set up basic analytics tracking', status: 'pending' as const },
        ],
        createdAt: new Date().toISOString(),
      },
      // Long-term (this quarter+)
      {
        id: randomUUID(),
        title: 'Reach $1,000/month combined business revenue',
        status: 'active' as const,
        priority: 'high' as const,
        horizon: 'long' as const,
        reasoning: 'First milestone toward the $1M ARR north star. Combine revenue from all 3 businesses.',
        tasks: [
          { id: randomUUID(), title: 'Establish revenue tracking across all businesses', status: 'pending' as const },
          { id: randomUUID(), title: 'Identify highest-leverage revenue opportunity', status: 'pending' as const },
          { id: randomUUID(), title: 'Execute revenue growth plan', status: 'pending' as const },
        ],
        createdAt: new Date().toISOString(),
      },
      {
        id: randomUUID(),
        title: 'Scout and validate a new business venture',
        status: 'active' as const,
        priority: 'medium' as const,
        horizon: 'long' as const,
        reasoning: 'The opportunity pipeline should always have candidates being evaluated.',
        tasks: [
          { id: randomUUID(), title: 'Research trending SaaS niches in Australia', status: 'pending' as const },
          { id: randomUUID(), title: 'Identify 3 viable candidates with low startup cost', status: 'pending' as const },
          { id: randomUUID(), title: 'Validate top candidate with landing page + waitlist', status: 'pending' as const },
        ],
        createdAt: new Date().toISOString(),
      },
      {
        id: randomUUID(),
        title: 'Build autonomous self-improvement systems',
        status: 'active' as const,
        priority: 'low' as const,
        horizon: 'long' as const,
        reasoning: 'Pi-Chi should continuously improve its own prompts, tools, and decision-making.',
        tasks: [
          { id: randomUUID(), title: 'Analyze past cycle outcomes to find improvement patterns', status: 'pending' as const },
          { id: randomUUID(), title: 'Build automated prompt evolution tracking', status: 'pending' as const },
          { id: randomUUID(), title: 'Create tool effectiveness scoring', status: 'pending' as const },
        ],
        createdAt: new Date().toISOString(),
      },
    ],
    currentMission: null,
    stretchGoals: [
      {
        id: randomUUID(),
        title: 'Reach $1M annual run rate',
        domain: 'business',
        target: 1_000_000,
        current: 0,
        unit: '$ ARR',
        ratchetFactor: 1.5,
        history: [],
      },
    ],
    opportunities: [
      {
        id: randomUUID(),
        title: 'Find the next business Pi-Chi should start',
        description: 'Continuously scout and validate a new venture candidate with meaningful upside.',
        source: 'founder-os bootstrap',
        stage: 'signal',
        confidence: 55,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ],
    currentCycle: null,
    workCycles: [],
    memories: [],
    growthLog: [],
    activityLog: [],
    capabilities: [],
    projects: [],

    promptOverrides: '',

    ownerName: process.env.OWNER_NAME || 'Leigh',
    lastSmsAt: null,
    smsCount: 0,
    smsTodayCount: 0,
    smsTodayDate: null,

    lastGoodCommit: null,
    consecutiveCrashes: 0,
    lastSelfEditAt: null,

    threads: [],

    mood: {
      curiosity: 80,
      satisfaction: 30,
      frustration: 0,
      loneliness: 50,
      energy: 70,
      pride: 0,
    },

    lastDreamAt: null,
    dreamCount: 0,

    chatMessages: [],

    costBreakdown: { brain: 0, dream: 0, chat: 0, claudeCode: 0 },

    moodHistory: [],
  }
}

// ── File locking ─────────────────────────────────────────────────

function acquireLock(): boolean {
  try {
    if (existsSync(STATE_LOCK)) {
      const lockContent = readFileSync(STATE_LOCK, 'utf-8').trim()
      const lockPid = parseInt(lockContent, 10)
      // Check if PID is still alive
      if (lockPid && !isNaN(lockPid)) {
        try {
          process.kill(lockPid, 0) // signal 0 = check if alive
          // Process is alive — wait for lock
          const start = Date.now()
          while (Date.now() - start < LOCK_TIMEOUT_MS) {
            syncSleep(50)
            if (!existsSync(STATE_LOCK)) break
          }
          if (existsSync(STATE_LOCK)) return false // still locked
        } catch {
          // Process is dead — stale lock, remove it
          try { unlinkSync(STATE_LOCK) } catch { /* ignore */ }
        }
      } else {
        // Invalid lock content, remove
        try { unlinkSync(STATE_LOCK) } catch { /* ignore */ }
      }
    }
    writeFileSync(STATE_LOCK, String(process.pid))
    return true
  } catch {
    return false
  }
}

function releaseLock(): void {
  try { unlinkSync(STATE_LOCK) } catch { /* ignore */ }
}

// ── Archive rotation ─────────────────────────────────────────────

function rotateArchiveIfNeeded(archivePath: string): void {
  try {
    if (!existsSync(archivePath)) return
    const stat = statSync(archivePath)
    if (stat.size > MAX_ARCHIVE_BYTES) {
      const rotated1 = archivePath.replace('.jsonl', '.1.jsonl')
      const rotated2 = archivePath.replace('.jsonl', '.2.jsonl')
      // Delete oldest rotation
      if (existsSync(rotated2)) unlinkSync(rotated2)
      // Move current rotation
      if (existsSync(rotated1)) renameSync(rotated1, rotated2)
      // Rotate current
      renameSync(archivePath, rotated1)
    }
  } catch { /* non-critical */ }
}

// ── Disk space check ─────────────────────────────────────────────

function hasDiskSpace(): boolean {
  try {
    const output = execSync('df -BM --output=avail / 2>/dev/null | tail -1', {
      encoding: 'utf-8',
      timeout: 3000,
    }).trim()
    const freeMB = parseInt(output.replace(/M$/, ''), 10)
    if (!isNaN(freeMB) && freeMB < MIN_DISK_FREE_MB) {
      console.warn(`[brain-state] Low disk: ${freeMB}MB free (min ${MIN_DISK_FREE_MB}MB)`)
      return false
    }
    return true
  } catch {
    // Fail-closed: skip archive if disk check fails
    return false
  }
}

// ── Load ─────────────────────────────────────────────────────────

export function loadBrainState(): BrainState {
  if (!existsSync(STATE_DIR)) {
    mkdirSync(STATE_DIR, { recursive: true })
  }

  if (!existsSync(STATE_FILE)) {
    const initial = createInitialState()
    writeFileSync(STATE_FILE, JSON.stringify(initial, null, 2))
    return initial
  }

  let state: BrainState = createInitialState()

  // Recovery cascade: main → .bak → dated backups → fresh state
  try {
    const raw = readFileSync(STATE_FILE, 'utf-8')
    state = JSON.parse(raw) as BrainState
  } catch (err) {
    console.error('[brain-state] Failed to parse brain-state.json:', err)

    // Try .bak
    let recovered = false
    if (existsSync(STATE_BACKUP)) {
      try {
        state = JSON.parse(readFileSync(STATE_BACKUP, 'utf-8')) as BrainState
        console.log('[brain-state] Recovered from .bak file')
        recovered = true
      } catch {
        console.error('[brain-state] .bak also corrupt')
      }
    }

    // Try dated backups (most recent first)
    if (!recovered) {
      try {
        const datedBackups = readdirSync(STATE_DIR)
          .filter((f: string) => f.startsWith('brain-state-backup-') && f.endsWith('.json'))
          .sort()
          .reverse()

        for (const backup of datedBackups) {
          try {
            state = JSON.parse(readFileSync(join(STATE_DIR, backup), 'utf-8')) as BrainState
            console.log(`[brain-state] Recovered from dated backup: ${backup}`)
            recovered = true
            break
          } catch {
            console.error(`[brain-state] Dated backup ${backup} also corrupt`)
          }
        }
      } catch { /* dir read failed */ }
    }

    if (!recovered) {
      console.error('[brain-state] All backups corrupt — creating fresh state')
      state = createInitialState()
    }
  }

  // Backfill new fields for existing state files (migration)
  const defaults = createInitialState()
  if (!state.threads) state.threads = defaults.threads
  if (!state.mood) state.mood = defaults.mood
  if (state.lastDreamAt === undefined) state.lastDreamAt = defaults.lastDreamAt
  if (state.dreamCount === undefined) state.dreamCount = defaults.dreamCount
  if (state.lastGoodCommit === undefined) state.lastGoodCommit = defaults.lastGoodCommit
  if (state.consecutiveCrashes === undefined) state.consecutiveCrashes = defaults.consecutiveCrashes
  if (state.lastSelfEditAt === undefined) state.lastSelfEditAt = defaults.lastSelfEditAt
  if (!state.chatMessages) state.chatMessages = defaults.chatMessages
  if (state.currentMission === undefined) state.currentMission = defaults.currentMission
  if (!state.stretchGoals) state.stretchGoals = defaults.stretchGoals
  if (!state.opportunities) state.opportunities = defaults.opportunities
  if (state.currentCycle === undefined) state.currentCycle = defaults.currentCycle
  if (!state.workCycles) state.workCycles = defaults.workCycles
  if (state.dailyCost === undefined) state.dailyCost = defaults.dailyCost
  if (state.dailyCostDate === undefined) state.dailyCostDate = defaults.dailyCostDate
  if (!state.costBreakdown) state.costBreakdown = defaults.costBreakdown
  if (!state.moodHistory) state.moodHistory = defaults.moodHistory
  if (!state.promptEvolutions) state.promptEvolutions = []
  if (!state.achievements) state.achievements = []
  if (!state.schedules) state.schedules = []
  if (!state.deployHistory) state.deployHistory = []
  // Learning system backfill
  if (!state.cycleJournal) state.cycleJournal = []
  if (!state.failureRegistry) state.failureRegistry = []
  if (!state.operationalConstraints) state.operationalConstraints = []
  if (!state.skills) state.skills = []
  if (!state.antiPatterns) state.antiPatterns = []
  if (!state.agentQueue) state.agentQueue = []

  // Backfill horizon on existing goals that don't have it
  for (const goal of state.goals) {
    if (!goal.horizon) {
      goal.horizon = goal.priority === 'high' ? 'short' : goal.priority === 'medium' ? 'medium' : 'long'
    }
  }
  if (state.goalHistory) {
    for (const goal of state.goalHistory) {
      if (!goal.horizon) {
        goal.horizon = goal.priority === 'high' ? 'short' : goal.priority === 'medium' ? 'medium' : 'long'
      }
    }
  }

  // Reset daily SMS count if it's a new day (Adelaide timezone)
  const today = getAdelaideDate()
  if (state.smsTodayDate !== today) {
    state.smsTodayCount = 0
    state.smsTodayDate = today
  }

  // Reset daily cost if it's a new day (Adelaide timezone)
  if (state.dailyCostDate !== today) {
    state.dailyCost = 0
    state.dailyCostDate = today
  }

  return state
}

// ── Save ─────────────────────────────────────────────────────────

let _lastSaveHash: string | null = null

export function saveBrainState(state: BrainState): void {
  if (!existsSync(STATE_DIR)) {
    mkdirSync(STATE_DIR, { recursive: true })
  }

  // Cap activity log — archive overflow
  if (state.activityLog.length > MAX_ACTIVITY_ENTRIES) {
    const overflow = state.activityLog.slice(0, state.activityLog.length - MAX_ACTIVITY_ENTRIES)
    if (hasDiskSpace()) {
      const archiveLines = overflow.map(e => JSON.stringify(e)).join('\n') + '\n'
      rotateArchiveIfNeeded(ARCHIVE_FILE)
      appendFileSync(ARCHIVE_FILE, archiveLines)
    }
    state.activityLog = state.activityLog.slice(-MAX_ACTIVITY_ENTRIES)
  }

  // Cap memories — importance-based pruning (keep critical, prune low first)
  if (state.memories.length > MAX_MEMORIES) {
    const importanceOrder: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 }
    state.memories.sort((a, b) => {
      const impDiff = (importanceOrder[a.importance] ?? 3) - (importanceOrder[b.importance] ?? 3)
      if (impDiff !== 0) return impDiff
      // Within same importance, most recent first
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    })
    state.memories = state.memories.slice(0, MAX_MEMORIES)
  }

  // Cap growth log
  if (state.growthLog.length > MAX_GROWTH_LOG) {
    state.growthLog = state.growthLog.slice(-MAX_GROWTH_LOG)
  }

  // Cap chat messages — archive overflow
  if (state.chatMessages.length > MAX_CHAT_MESSAGES) {
    const overflow = state.chatMessages.slice(0, state.chatMessages.length - MAX_CHAT_MESSAGES)
    if (hasDiskSpace()) {
      const archiveLines = overflow.map(e => JSON.stringify(e)).join('\n') + '\n'
      rotateArchiveIfNeeded(CHAT_ARCHIVE_FILE)
      appendFileSync(CHAT_ARCHIVE_FILE, archiveLines)
    }
    state.chatMessages = state.chatMessages.slice(-MAX_CHAT_MESSAGES)
  }

  // Append mood snapshot (throttled to once per 5 minutes to reduce SD writes)
  if (state.mood) {
    const lastSnapshot = state.moodHistory?.[state.moodHistory.length - 1]
    const lastTime = lastSnapshot ? new Date(lastSnapshot.t).getTime() : 0
    if (Date.now() - lastTime > 5 * 60 * 1000) {
      state.moodHistory.push({
        t: new Date().toISOString(),
        mood: { ...state.mood },
      })
    }
  }

  // Cap mood history (after append to avoid off-by-one)
  if (state.moodHistory.length > MAX_MOOD_HISTORY) {
    state.moodHistory = state.moodHistory.slice(-MAX_MOOD_HISTORY)
  }

  // Cap learning system arrays
  const MAX_CYCLE_JOURNAL = 200
  const MAX_FAILURE_REGISTRY = 100
  const MAX_ANTI_PATTERNS = 50
  if (state.cycleJournal && state.cycleJournal.length > MAX_CYCLE_JOURNAL) {
    state.cycleJournal = state.cycleJournal.slice(-MAX_CYCLE_JOURNAL)
  }
  // Normalize failureRegistry to array (may be stored as object)
  if (state.failureRegistry && !Array.isArray(state.failureRegistry)) {
    state.failureRegistry = Object.values(state.failureRegistry)
  }
  if (state.failureRegistry && state.failureRegistry.length > MAX_FAILURE_REGISTRY) {
    // Keep unresolved failures, prune oldest resolved ones
    const unresolved = state.failureRegistry.filter((f: any) => !f.resolved)
    const resolved = state.failureRegistry.filter((f: any) => f.resolved)
      .sort((a, b) => new Date(b.resolvedAt || 0).getTime() - new Date(a.resolvedAt || 0).getTime())
    state.failureRegistry = [...unresolved, ...resolved].slice(0, MAX_FAILURE_REGISTRY)
  }
  if (state.antiPatterns && state.antiPatterns.length > MAX_ANTI_PATTERNS) {
    state.antiPatterns = state.antiPatterns
      .sort((a, b) => b.occurrences - a.occurrences)
      .slice(0, MAX_ANTI_PATTERNS)
  }
  // Cap other unbounded arrays
  const MAX_WORK_CYCLES = 100
  const MAX_GOAL_HISTORY = 200
  const MAX_DEPLOY_HISTORY = 100
  const MAX_PROMPT_EVOLUTIONS = 50
  const MAX_SKILLS = 50
  const MAX_THREADS = 50
  if (state.workCycles && state.workCycles.length > MAX_WORK_CYCLES) {
    state.workCycles = state.workCycles.slice(-MAX_WORK_CYCLES)
  }
  if (state.goalHistory && state.goalHistory.length > MAX_GOAL_HISTORY) {
    state.goalHistory = state.goalHistory.slice(-MAX_GOAL_HISTORY)
  }
  if (state.deployHistory && state.deployHistory.length > MAX_DEPLOY_HISTORY) {
    state.deployHistory = state.deployHistory.slice(-MAX_DEPLOY_HISTORY)
  }
  if (state.promptEvolutions && state.promptEvolutions.length > MAX_PROMPT_EVOLUTIONS) {
    state.promptEvolutions = state.promptEvolutions.slice(-MAX_PROMPT_EVOLUTIONS)
  }
  if (state.skills && state.skills.length > MAX_SKILLS) {
    state.skills = state.skills.slice(0, MAX_SKILLS)
  }
  if (state.threads && state.threads.length > MAX_THREADS) {
    // Keep active threads, prune oldest completed ones
    const active = state.threads.filter(t => t.status === 'active')
    const rest = state.threads.filter(t => t.status !== 'active')
    state.threads = [...active, ...rest].slice(0, MAX_THREADS)
  }
  // Cap agent queue — remove completed/failed tasks older than 1 hour, max 20 entries
  if (state.agentQueue && state.agentQueue.length > 0) {
    state.agentQueue = state.agentQueue.filter(t => {
      if (t.status === 'queued' || t.status === 'running') return true
      if (!t.completedAt) return true
      return Date.now() - new Date(t.completedAt).getTime() < 60 * 60 * 1000
    }).slice(0, 20)
  }

  // Dirty-check: skip write if state hasn't changed (reduces SD card wear)
  const json = JSON.stringify(state, null, 2)
  const hash = createHash('md5').update(json).digest('hex')
  if (hash === _lastSaveHash) return // no change

  // Acquire lock for concurrent write safety
  const locked = acquireLock()
  if (!locked) {
    console.warn('[brain-state] Could not acquire lock — skipping save to prevent corruption')
    return
  }

  try {
    // Backup current state before overwriting
    if (existsSync(STATE_FILE)) {
      try {
        copyFileSync(STATE_FILE, STATE_BACKUP)
      } catch { /* non-critical */ }
    }

    // Atomic write with fsync + retry
    for (let attempt = 0; attempt < SAVE_RETRY_COUNT; attempt++) {
      let fd: number | null = null
      try {
        fd = openSync(STATE_TEMP, 'w')
        writeFileSync(fd, json)
        fsyncSync(fd)
        closeSync(fd)
        fd = null // closed successfully
        renameSync(STATE_TEMP, STATE_FILE)
        _lastSaveHash = hash
        return // success
      } catch (err) {
        if (fd !== null) {
          try { closeSync(fd) } catch { /* ignore close error */ }
        }
        if (attempt < SAVE_RETRY_COUNT - 1) {
          syncSleep(SAVE_RETRY_DELAY_MS)
        } else {
          throw err
        }
      }
    }
  } finally {
    if (locked) releaseLock()
  }
}

export function addActivity(state: BrainState, type: BrainActivityEntry['type'], message: string): void {
  state.activityLog.push({
    id: randomUUID(),
    time: new Date().toISOString(),
    type,
    message,
  })
}

export function generateId(): string {
  return randomUUID()
}

// ── State Validation ──────────────────────────────────────────────

export function validateBrainState(state: unknown): { valid: boolean; issues: string[] } {
  const issues: string[] = []

  if (!state || typeof state !== 'object') {
    return { valid: false, issues: ['State is not an object'] }
  }

  const s = state as Record<string, unknown>

  // Required fields
  if (typeof s.totalThoughts !== 'number') issues.push('totalThoughts is not a number')
  if (typeof s.totalToolCalls !== 'number') issues.push('totalToolCalls is not a number')
  if (!Array.isArray(s.goals)) issues.push('goals is not an array')
  if (!Array.isArray(s.memories)) issues.push('memories is not an array')
  if (!Array.isArray(s.activityLog)) issues.push('activityLog is not an array')
  if (!s.mood || typeof s.mood !== 'object') issues.push('mood is missing or not an object')
  if (typeof s.wakeIntervalMs !== 'number') issues.push('wakeIntervalMs is not a number')

  // Sanity checks
  if (typeof s.totalThoughts === 'number' && s.totalThoughts < 0) issues.push('totalThoughts is negative')
  if (typeof s.wakeIntervalMs === 'number' && (s.wakeIntervalMs < 60000 || s.wakeIntervalMs > 3600000)) {
    issues.push(`wakeIntervalMs out of range: ${s.wakeIntervalMs}`)
  }

  // Array size sanity
  if (Array.isArray(s.goals) && s.goals.length > 500) issues.push(`goals array suspiciously large: ${s.goals.length}`)
  if (Array.isArray(s.memories) && s.memories.length > 1000) issues.push(`memories array suspiciously large: ${s.memories.length}`)

  return { valid: issues.length === 0, issues }
}

export function repairBrainState(state: Record<string, unknown>): BrainState {
  const defaults = createInitialState()

  // Fix null/undefined arrays
  if (!Array.isArray(state.goals)) state.goals = defaults.goals
  if (!Array.isArray(state.memories)) state.memories = defaults.memories
  if (!Array.isArray(state.activityLog)) state.activityLog = defaults.activityLog
  if (!Array.isArray(state.growthLog)) state.growthLog = defaults.growthLog
  if (!Array.isArray(state.chatMessages)) state.chatMessages = defaults.chatMessages
  if (!Array.isArray(state.threads)) state.threads = defaults.threads

  // Fix null/undefined numbers
  if (typeof state.totalThoughts !== 'number' || state.totalThoughts < 0) state.totalThoughts = 0
  if (typeof state.totalToolCalls !== 'number') state.totalToolCalls = 0
  if (typeof state.totalApiCost !== 'number') state.totalApiCost = 0
  if (typeof state.wakeIntervalMs !== 'number' || state.wakeIntervalMs < 60000) {
    state.wakeIntervalMs = defaults.wakeIntervalMs
  }

  // Fix mood
  if (!state.mood || typeof state.mood !== 'object') {
    state.mood = defaults.mood
  }

  return state as unknown as BrainState
}
