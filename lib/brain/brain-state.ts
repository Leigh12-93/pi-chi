/* ─── Pi-Chi Brain — Persistent State Management ─────────────── */

import {
  writeFileSync, renameSync, readFileSync, copyFileSync,
  mkdirSync, existsSync, appendFileSync, unlinkSync, statSync,
  openSync, closeSync, fsyncSync,
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

const MAX_ACTIVITY_ENTRIES = 500
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

  let state: BrainState

  // Try loading main file, fall back to backup, then fresh state
  try {
    const raw = readFileSync(STATE_FILE, 'utf-8')
    state = JSON.parse(raw) as BrainState
  } catch (err) {
    console.error('[brain-state] Failed to parse brain-state.json:', err)
    // Try backup
    if (existsSync(STATE_BACKUP)) {
      try {
        const backupRaw = readFileSync(STATE_BACKUP, 'utf-8')
        state = JSON.parse(backupRaw) as BrainState
        console.log('[brain-state] Recovered from backup file')
      } catch {
        console.error('[brain-state] Backup also corrupt — creating fresh state')
        state = createInitialState()
      }
    } else {
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

  // Cap mood history
  if (state.moodHistory.length > MAX_MOOD_HISTORY) {
    state.moodHistory = state.moodHistory.slice(-MAX_MOOD_HISTORY)
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

  // Dirty-check: skip write if state hasn't changed (reduces SD card wear)
  const json = JSON.stringify(state, null, 2)
  const hash = createHash('md5').update(json).digest('hex')
  if (hash === _lastSaveHash) return // no change

  // Acquire lock for concurrent write safety
  const locked = acquireLock()

  try {
    // Backup current state before overwriting
    if (existsSync(STATE_FILE)) {
      try {
        copyFileSync(STATE_FILE, STATE_BACKUP)
      } catch { /* non-critical */ }
    }

    // Atomic write with fsync + retry
    for (let attempt = 0; attempt < SAVE_RETRY_COUNT; attempt++) {
      try {
        const fd = openSync(STATE_TEMP, 'w')
        writeFileSync(fd, json)
        fsyncSync(fd)
        closeSync(fd)
        renameSync(STATE_TEMP, STATE_FILE)
        _lastSaveHash = hash
        return // success
      } catch (err) {
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
